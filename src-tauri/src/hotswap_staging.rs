//! Experimental hotswap: stage pack updates while the game runs, apply them at
//! the next launch.
//!
//! `stage` downloads only the files that changed into
//! `<instance>/.reality/staging/<version>/` and writes `plan.json` last, so a
//! staging dir without it is partial. It never touches anything outside
//! `staging/`. `apply_staged` runs at launch before `pack_v2::sync`: it checks
//! every staged file against the plan's sha256, moves the files into place and
//! updates `pack-state.json`; on any doubt it throws the staging dir away and
//! lets the normal sync do the work.

// Wired into launch and the poll loop by later hotswap tasks.
#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
use std::fs;
use std::future::Future;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::cloud::{honor_disabled, load_managed_mods, safe_join, should_remove_mod};
use crate::hotswap::{change_kind, classify, Tier};
use crate::hotswap_channel::{read_json, write_json, ChangeAction, Offer, OfferChange, SCHEMA};
use crate::pack_v2::{load_state, needs_update, save_state, wants_from, Manifest, StateEntry, Want};

const STAGING_DIR: &str = ".reality/staging";
const PLAN_FILE: &str = "plan.json";
/// Per-path state entries to record once the files are in place.
const STATE_FILE: &str = "state-entries.json";

fn staging_root(instance_dir: &Path) -> PathBuf {
    instance_dir.join(STAGING_DIR)
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn sha256_file(path: &Path) -> Option<String> {
    fs::read(path).ok().map(|b| sha256_hex(&b))
}

fn norm(path: &str) -> String {
    path.replace('\\', "/")
}

/// Mods the instance marks as locked, without any `.disabled` suffix.
fn locked_mods(instance_dir: &Path) -> Vec<String> {
    let dir = instance_dir.to_string_lossy();
    crate::instances::instances_list_sync()
        .into_iter()
        .find(|i| i.game_directory == dir)
        .and_then(|i| i.locked_mods)
        .unwrap_or_default()
        .into_iter()
        .map(|n| n.strip_suffix(".disabled").map(str::to_string).unwrap_or(n))
        .collect()
}

/// Delete every `staging/<n>` except `keep`.
fn remove_other_staging(instance_dir: &Path, keep: Option<u64>) {
    let Ok(entries) = fs::read_dir(staging_root(instance_dir)) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if keep.is_some() && name.parse::<u64>().ok() == keep {
            continue;
        }
        let _ = fs::remove_dir_all(e.path());
    }
}

/// Top-level mod jars the previous sync installed that the new pack no longer
/// ships. Player-installed and locked mods are never listed.
fn removals(instance_dir: &Path, wants: &[Want], locked: &[String]) -> Vec<String> {
    let Some(previous) = load_managed_mods(instance_dir) else { return Vec::new() };
    let keep: HashSet<String> = wants
        .iter()
        .filter_map(|w| norm(&w.path).strip_prefix("mods/").map(str::to_string))
        .filter(|n| !n.contains('/'))
        .collect();
    let mut out: Vec<String> = previous
        .iter()
        .filter(|name| should_remove_mod(name, &keep, locked, Some(&previous), |_| false))
        .filter(|name| {
            let p = instance_dir.join("mods").join(name.as_str());
            p.is_file() || p.with_extension("jar.disabled").is_file()
        })
        .map(|n| format!("mods/{n}"))
        .collect();
    out.sort();
    out
}

/// Planning and writing, with the download step injected so it can be tested
/// without a network. `fetch(want, dest)` must leave the file at `dest`.
async fn stage_with<F, Fut>(
    instance_dir: &Path,
    manifest: &Manifest,
    enabled: &[Tier],
    locked: &[String],
    fetch: F,
) -> Result<Offer, String>
where
    F: Fn(Want, PathBuf) -> Fut,
    Fut: Future<Output = Result<(), String>>,
{
    let version = manifest.version;
    let (wants, _rejected) = wants_from(manifest, instance_dir);
    let state = load_state(instance_dir);
    let needed: Vec<Want> = wants.iter().filter(|w| needs_update(w, state.entries.get(&w.path))).cloned().collect();
    let gone = removals(instance_dir, &wants, locked);

    // A newer pack supersedes anything staged earlier, and a retry of the same
    // version starts clean.
    remove_other_staging(instance_dir, None);
    let dir = staging_root(instance_dir).join(version.to_string());

    let mut changes = Vec::new();
    let mut entries: HashMap<String, StateEntry> = HashMap::new();
    for w in &needed {
        let dest = safe_join(&dir, &w.path).ok_or_else(|| format!("Unsafe path: {}", w.path))?;
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let fetched = match fetch(w.clone(), dest.clone()).await {
            Ok(()) => verify_staged(w, &dest),
            Err(e) => Err(e),
        };
        if let Err(e) = fetched {
            let _ = fs::remove_dir_all(&dir);
            return Err(format!("{}: {e}", w.path));
        }
        let bytes = fs::read(&dest).map_err(|e| format!("{}: {e}", w.path))?;
        let present = w.dest.is_file();
        let tier = classify(change_kind(&w.path, present, true), enabled, false);
        changes.push(OfferChange {
            path: w.path.clone(),
            tier,
            sha256: sha256_hex(&bytes),
            action: if present { ChangeAction::Update } else { ChangeAction::Add },
        });
        let size = if w.size > 0 { w.size } else { bytes.len() as u64 };
        entries.insert(w.path.clone(), StateEntry { size, hash: w.hash.clone() });
    }
    for path in gone {
        let tier = classify(change_kind(&path, true, false), enabled, false);
        changes.push(OfferChange { path, tier, sha256: String::new(), action: ChangeAction::Remove });
    }

    let offer = Offer {
        schema: SCHEMA,
        version,
        revoked: false,
        changes,
        staging: dir.to_string_lossy().to_string(),
    };
    if !offer.changes.is_empty() {
        write_json(&dir, STATE_FILE, &entries)?;
        // Last: its presence means every file above is complete.
        write_json(&dir, PLAN_FILE, &offer)?;
    }
    Ok(offer)
}

/// Check a downloaded file against everything the manifest states for it: the
/// size (when given) and each of sha1 (mods), sha256 and crc32 (files).
fn verify_staged(w: &Want, path: &Path) -> Result<(), String> {
    let len = fs::metadata(path).map_err(|e| e.to_string())?.len();
    if w.size > 0 && len != w.size {
        return Err(format!("Size mismatch (expected {}, got {len})", w.size));
    }
    if let Some(s) = &w.sha1 {
        if !crate::cloud::compute_sha1(path).map(|h| h.eq_ignore_ascii_case(s)).unwrap_or(false) {
            return Err("SHA-1 mismatch".into());
        }
    }
    if let Some(s) = &w.sha256 {
        if !crate::cloud::compute_sha256(path).map(|h| h.eq_ignore_ascii_case(s)).unwrap_or(false) {
            return Err("SHA-256 mismatch".into());
        }
    }
    if let Some(c) = w.crc32 {
        if crate::pack_v2::file_crc32(path).map(|h| h != c).unwrap_or(true) {
            return Err("CRC-32 mismatch".into());
        }
    }
    Ok(())
}

/// Download one pack file to `dest`; `stage_with` verifies it against the manifest.
async fn download_file(w: Want, dest: PathBuf) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;
    let resp = crate::http_client::HTTP_CLIENT
        .get(&w.url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        out.write_all(&chunk.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    Ok(())
}

/// Stage the changed files of `manifest` for the next launch (see module docs).
pub(crate) async fn stage(cloud_id: &str, instance_dir: &Path, manifest: &Manifest, enabled: &[Tier]) -> Result<Offer, String> {
    let locked = locked_mods(instance_dir);
    let offer = stage_with(instance_dir, manifest, enabled, &locked, download_file).await?;
    log::info!("[Hotswap] staged v{} for {cloud_id}: {} changes", offer.version, offer.changes.len());
    Ok(offer)
}

/// Move staged files into place. `Ok(None)` means nothing was applied and the
/// normal sync should run.
pub fn apply_staged(instance_dir: &Path) -> Result<Option<u64>, String> {
    apply_staged_with(instance_dir, &locked_mods(instance_dir))
}

fn apply_staged_with(instance_dir: &Path, locked: &[String]) -> Result<Option<u64>, String> {
    let root = staging_root(instance_dir);
    let Ok(read) = fs::read_dir(&root) else { return Ok(None) };
    let mut versions: Vec<u64> = read
        .flatten()
        .filter_map(|e| e.file_name().to_string_lossy().parse::<u64>().ok())
        .collect();
    versions.sort_unstable();
    let Some(&newest) = versions.last() else {
        remove_other_staging(instance_dir, None);
        return Ok(None);
    };
    let dir = root.join(newest.to_string());
    remove_other_staging(instance_dir, Some(newest));

    let discard = |why: &str| {
        log::warn!("[Hotswap] discarding staged v{newest}: {why}");
        let _ = fs::remove_dir_all(&dir);
        Ok(None)
    };

    let Some(plan) = read_json::<Offer>(&dir, PLAN_FILE) else { return discard("no plan.json") };
    let Some(entries) = read_json::<HashMap<String, StateEntry>>(&dir, STATE_FILE) else {
        return discard("no state entries");
    };
    if plan.version != newest {
        return discard("plan version mismatch");
    }

    // Verify everything before touching the instance.
    let mut moves: Vec<(PathBuf, PathBuf)> = Vec::new();
    let mut deletes: Vec<(String, PathBuf)> = Vec::new();
    for c in &plan.changes {
        let Some(dest) = safe_join(instance_dir, &c.path) else { return discard("unsafe path") };
        match c.action {
            ChangeAction::Add | ChangeAction::Update => {
                let Some(src) = safe_join(&dir, &c.path) else { return discard("unsafe path") };
                if sha256_file(&src).as_deref() != Some(c.sha256.as_str()) {
                    return discard(&format!("{} is missing or does not match", c.path));
                }
                moves.push((src, honor_disabled(dest)));
            }
            ChangeAction::Remove => deletes.push((norm(&c.path), dest)),
            ChangeAction::Unknown => return discard("unknown action"),
        }
    }

    for (src, dest) in &moves {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if dest.exists() {
            let _ = fs::remove_file(dest);
        }
        if fs::rename(src, dest).is_err() {
            fs::copy(src, dest).map_err(|e| format!("{}: {e}", dest.display()))?;
        }
    }

    // Removals: only what the last sync installed, never locked mods.
    let previous = load_managed_mods(instance_dir);
    let mut removed_paths = Vec::new();
    for (path, dest) in &deletes {
        let name = path.strip_prefix("mods/").unwrap_or("");
        let allowed = !name.is_empty()
            && !name.contains('/')
            && should_remove_mod(name, &HashSet::new(), locked, previous.as_ref(), |_| true)
            && previous.as_ref().is_some_and(|p| p.contains(name));
        if allowed {
            let _ = fs::remove_file(dest);
            let mut disabled = dest.clone().into_os_string();
            disabled.push(".disabled");
            let _ = fs::remove_file(PathBuf::from(disabled));
            removed_paths.push(path.clone());
        }
    }

    let mut state = load_state(instance_dir);
    state.version = newest;
    for c in &plan.changes {
        if let Some(e) = entries.get(&c.path) {
            state.entries.insert(c.path.clone(), e.clone());
        }
    }
    for p in &removed_paths {
        state.entries.remove(p);
    }
    save_state(instance_dir, &state)?;
    // The record of what the pack installed follows the new file set.
    if let Some(mut prev) = previous {
        for p in &removed_paths {
            if let Some(n) = p.strip_prefix("mods/") {
                prev.remove(n);
            }
        }
        for c in &plan.changes {
            if matches!(c.action, ChangeAction::Add | ChangeAction::Update) {
                if let Some(n) = norm(&c.path).strip_prefix("mods/").filter(|n| !n.contains('/')) {
                    prev.insert(n.to_string());
                }
            }
        }
        let mut sorted: Vec<&String> = prev.iter().collect();
        sorted.sort();
        if let Ok(json) = serde_json::to_vec_pretty(&sorted) {
            let _ = fs::write(instance_dir.join(crate::cloud::MANAGED_MODS_FILE), json);
        }
    }
    let _ = fs::remove_dir_all(&dir);
    Ok(Some(newest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("rl-hotswap-stage-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn sha1_hex(b: &[u8]) -> String {
        use sha1::Digest as _;
        hex::encode(sha1::Sha1::digest(b))
    }

    /// Manifest with the given mods: (path, bytes).
    fn manifest(version: u64, mods: &[(&str, &[u8])]) -> Manifest {
        let mods: Vec<serde_json::Value> = mods
            .iter()
            .map(|(p, b)| {
                serde_json::json!({"path": p, "url": format!("https://x/{p}"), "size": b.len(), "sha1": sha1_hex(b)})
            })
            .collect();
        serde_json::from_value(serde_json::json!({"version": version, "mods": mods})).unwrap()
    }

    fn fetcher(
        bodies: HashMap<String, Vec<u8>>,
        log: Arc<Mutex<Vec<String>>>,
    ) -> impl Fn(Want, PathBuf) -> std::future::Ready<Result<(), String>> {
        move |w, dest| {
            log.lock().unwrap().push(w.path.clone());
            let r = match bodies.get(&w.path) {
                Some(b) => fs::write(&dest, b).map_err(|e| e.to_string()),
                None => Err("no fixture".into()),
            };
            std::future::ready(r)
        }
    }

    fn bodies(m: &[(&str, &[u8])]) -> HashMap<String, Vec<u8>> {
        m.iter().map(|(p, b)| (p.to_string(), b.to_vec())).collect()
    }

    fn put(dir: &Path, rel: &str, body: &[u8]) {
        let p = dir.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, body).unwrap();
    }

    fn run<T>(f: impl Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread().build().unwrap().block_on(f)
    }

    const ALL: [Tier; 4] = [Tier::Zero, Tier::One, Tier::Two, Tier::Three];

    #[test]
    fn manifest_without_experimental_parses() {
        let m: Manifest = serde_json::from_str(r#"{"version": 3}"#).unwrap();
        assert!(!m.experimental.hotswap);
        let m: Manifest = serde_json::from_str(r#"{"version": 3, "experimental": {"hotswap": true}}"#).unwrap();
        assert!(m.experimental.hotswap);
    }

    #[test]
    fn stages_only_changed_files() {
        let d = tmpdir("changed");
        put(&d, "mods/same.jar", b"same");
        put(&d, "mods/old.jar", b"old");
        let m = manifest(7, &[("mods/same.jar", b"same"), ("mods/old.jar", b"new"), ("mods/fresh.jar", b"fresh")]);
        let log = Arc::new(Mutex::new(Vec::new()));
        let f = fetcher(bodies(&[("mods/old.jar", b"new"), ("mods/fresh.jar", b"fresh")]), log.clone());
        let offer = run(stage_with(&d, &m, &ALL, &[], f)).unwrap();
        let mut fetched = log.lock().unwrap().clone();
        fetched.sort();
        assert_eq!(fetched, vec!["mods/fresh.jar", "mods/old.jar"]);
        assert_eq!(offer.version, 7);
        assert_eq!(offer.changes.len(), 2);
        let old = offer.changes.iter().find(|c| c.path == "mods/old.jar").unwrap();
        assert_eq!(old.action, ChangeAction::Update);
        assert_eq!(old.sha256, sha256_hex(b"new"));
        assert_eq!(offer.changes.iter().find(|c| c.path == "mods/fresh.jar").unwrap().action, ChangeAction::Add);
        assert!(d.join(".reality/staging/7/plan.json").is_file());
        assert!(!d.join(".reality/staging/7/mods/same.jar").exists());
        // Nothing outside staging/ was touched.
        assert_eq!(fs::read(d.join("mods/old.jar")).unwrap(), b"old");
        assert!(!d.join("mods/fresh.jar").exists());
    }

    #[test]
    fn newer_version_supersedes_staging() {
        let d = tmpdir("supersede");
        let log = Arc::new(Mutex::new(Vec::new()));
        for (v, body) in [(6u64, &b"v6"[..]), (7, &b"v7"[..])] {
            let m = manifest(v, &[("mods/a.jar", body)]);
            let f = fetcher(bodies(&[("mods/a.jar", body)]), log.clone());
            run(stage_with(&d, &m, &ALL, &[], f)).unwrap();
        }
        let mut names: Vec<String> = fs::read_dir(d.join(".reality/staging"))
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        assert_eq!(names, vec!["7"]);
    }

    #[test]
    fn player_and_locked_mods_untouched() {
        let d = tmpdir("player");
        put(&d, "mods/pack-old.jar", b"p");
        put(&d, "mods/locked.jar", b"l");
        put(&d, "mods/player.jar", b"mine");
        put(&d, "mods/kept.jar", b"k");
        put(
            &d,
            ".reality/managed-mods.json",
            br#"["pack-old.jar","locked.jar","kept.jar"]"#,
        );
        let m = manifest(7, &[("mods/kept.jar", b"k"), ("mods/new.jar", b"n")]);
        let locked = vec!["locked.jar".to_string()];
        let log = Arc::new(Mutex::new(Vec::new()));
        let f = fetcher(bodies(&[("mods/new.jar", b"n")]), log);
        let offer = run(stage_with(&d, &m, &ALL, &locked, f)).unwrap();
        let removed: Vec<&str> = offer
            .changes
            .iter()
            .filter(|c| c.action == ChangeAction::Remove)
            .map(|c| c.path.as_str())
            .collect();
        assert_eq!(removed, vec!["mods/pack-old.jar"]);
        let plan: Offer = read_json(&d.join(".reality/staging/7"), "plan.json").unwrap();
        assert!(plan.changes.iter().all(|c| c.path != "mods/player.jar" && c.path != "mods/locked.jar"));

        assert_eq!(apply_staged_with(&d, &locked).unwrap(), Some(7));
        assert!(d.join("mods/player.jar").is_file());
        assert!(d.join("mods/locked.jar").is_file());
        assert!(!d.join("mods/pack-old.jar").exists());
        assert!(d.join("mods/new.jar").is_file());
    }

    #[test]
    fn apply_never_removes_a_locked_or_player_mod_even_if_plan_says_so() {
        let d = tmpdir("forged");
        put(&d, "mods/locked.jar", b"l");
        put(&d, "mods/player.jar", b"p");
        put(&d, ".reality/managed-mods.json", br#"["locked.jar"]"#);
        let plan = Offer {
            schema: 1,
            version: 7,
            revoked: false,
            changes: ["mods/locked.jar", "mods/player.jar"]
                .iter()
                .map(|p| OfferChange { path: p.to_string(), tier: Tier::Three, sha256: String::new(), action: ChangeAction::Remove })
                .collect(),
            staging: String::new(),
        };
        let sd = d.join(".reality/staging/7");
        write_json(&sd, "plan.json", &plan).unwrap();
        write_json(&sd, "state-entries.json", &HashMap::<String, StateEntry>::new()).unwrap();
        assert_eq!(apply_staged_with(&d, &["locked.jar".into()]).unwrap(), Some(7));
        assert!(d.join("mods/locked.jar").is_file());
        assert!(d.join("mods/player.jar").is_file());
    }

    #[test]
    fn partial_staging_is_discarded() {
        let d = tmpdir("partial");
        let m = manifest(7, &[("mods/a.jar", b"aaaa"), ("config/b.toml", b"bbbb")]);
        let log = Arc::new(Mutex::new(Vec::new()));
        let f = fetcher(bodies(&[("mods/a.jar", b"aaaa"), ("config/b.toml", b"bbbb")]), log);
        run(stage_with(&d, &m, &ALL, &[], f)).unwrap();
        let sd = d.join(".reality/staging/7");
        fs::write(sd.join("mods/a.jar"), b"aa").unwrap(); // truncated
        assert_eq!(apply_staged_with(&d, &[]).unwrap(), None);
        assert!(!sd.exists());
        assert!(!d.join("mods/a.jar").exists());

        // No plan.json at all: also partial.
        put(&d, ".reality/staging/8/mods/x.jar", b"x");
        assert_eq!(apply_staged_with(&d, &[]).unwrap(), None);
        assert!(!d.join(".reality/staging/8").exists());
    }

    #[test]
    fn failed_download_leaves_no_plan() {
        let d = tmpdir("fail");
        let m = manifest(7, &[("mods/a.jar", b"a")]);
        let f = fetcher(HashMap::new(), Arc::new(Mutex::new(Vec::new())));
        assert!(run(stage_with(&d, &m, &ALL, &[], f)).is_err());
        assert!(!d.join(".reality/staging/7/plan.json").exists());
    }

    #[test]
    fn apply_staged_moves_and_updates_state() {
        let d = tmpdir("apply");
        put(&d, "mods/old.jar", b"old");
        let m = manifest(7, &[("mods/old.jar", b"new"), ("config/c.toml", b"cfg")]);
        let log = Arc::new(Mutex::new(Vec::new()));
        let f = fetcher(bodies(&[("mods/old.jar", b"new"), ("config/c.toml", b"cfg")]), log);
        run(stage_with(&d, &m, &ALL, &[], f)).unwrap();
        assert_eq!(apply_staged_with(&d, &[]).unwrap(), Some(7));
        assert_eq!(fs::read(d.join("mods/old.jar")).unwrap(), b"new");
        assert_eq!(fs::read(d.join("config/c.toml")).unwrap(), b"cfg");
        let st = load_state(&d);
        assert_eq!(st.version, 7);
        assert!(st.entries.contains_key("mods/old.jar"));
        assert!(!d.join(".reality/staging/7").exists());
        // The normal sync would now see mods/old.jar as up to date.
        let (wants, _) = wants_from(&m, &d);
        let w = wants.iter().find(|w| w.path == "mods/old.jar").unwrap();
        assert!(!needs_update(w, st.entries.get("mods/old.jar")));
    }

    fn staged_fails(m: Manifest, served: &[(&str, &[u8])]) -> PathBuf {
        let d = tmpdir(&format!("verify-{}", m.version));
        let f = fetcher(bodies(served), Arc::new(Mutex::new(Vec::new())));
        let err = run(stage_with(&d, &m, &ALL, &[], f)).unwrap_err();
        assert!(err.contains("mismatch"), "{err}");
        assert!(!d.join(format!(".reality/staging/{}/plan.json", m.version)).exists());
        d
    }

    #[test]
    fn size_mismatch_fails_the_stage() {
        // Right sha1 for the manifest entry, but the served body has another length.
        let m: Manifest = serde_json::from_value(serde_json::json!({
            "version": 11,
            "mods": [{"path": "mods/a.jar", "url": "https://x/a", "size": 99, "sha1": sha1_hex(b"abc")}]
        }))
        .unwrap();
        staged_fails(m, &[("mods/a.jar", b"abc")]);
        // A file entry with only a size is checked as well.
        let m: Manifest = serde_json::from_value(serde_json::json!({
            "version": 12,
            "files": [{"path": "config/a.toml", "url": "https://x/a", "size": 2, "layer": "L"}]
        }))
        .unwrap();
        staged_fails(m, &[("config/a.toml", b"abc")]);
    }

    #[test]
    fn file_entry_hash_mismatch_fails_the_stage() {
        let good = b"hello";
        let crc = crc32fast::hash(good);
        let m: Manifest = serde_json::from_value(serde_json::json!({
            "version": 13,
            "files": [{"path": "config/a.toml", "url": "https://x/a", "size": 5, "crc32": crc, "layer": "L"}]
        }))
        .unwrap();
        staged_fails(m, &[("config/a.toml", b"HELLO")]);
        let m: Manifest = serde_json::from_value(serde_json::json!({
            "version": 14,
            "files": [{"path": "config/a.toml", "url": "https://x/a", "size": 5, "sha256": sha256_hex(good), "layer": "L"}]
        }))
        .unwrap();
        staged_fails(m, &[("config/a.toml", b"HELLO")]);
    }

    #[test]
    fn file_entry_with_matching_size_and_hashes_stages() {
        let body = b"hello";
        let m: Manifest = serde_json::from_value(serde_json::json!({
            "version": 15,
            "files": [{"path": "config/a.toml", "url": "https://x/a", "size": 5, "crc32": crc32fast::hash(body),
                       "sha256": sha256_hex(body), "layer": "L"}]
        }))
        .unwrap();
        let d = tmpdir("verify-ok");
        let f = fetcher(bodies(&[("config/a.toml", body)]), Arc::new(Mutex::new(Vec::new())));
        run(stage_with(&d, &m, &ALL, &[], f)).unwrap();
        assert!(d.join(".reality/staging/15/plan.json").is_file());
    }
}
