//! Pack v2 sync (realitylauncher-api `lib/pack-v2.ts`).
//!
//! A v2 pack is a published manifest (`GET /instances/:id/pack/manifest`)
//! listing CDN mods and the pack's own files. Each file has a URL and, when it
//! sits inside an uploaded archive ("layer"), that archive's id and entry
//! name. When most of a layer is needed (first install) the archive is
//! downloaded once and unpacked; a few changed files are fetched one by one.
//!
//! What was installed is remembered in `.reality/pack-state.json`, so later
//! syncs only touch what the pack changed: a config a player edited stays as
//! they left it until the pack ships a new version of that file. Mods are
//! always kept exactly as the pack lists them.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use serde::{Deserialize, Serialize};

use crate::cloud::{cleanup_unmanaged_mods, compute_sha1, compute_sha256, emit_sync_progress, safe_join};
use crate::modpack::CANCELLED_SENTINEL;

const API_URL: &str = "https://api.reality.catlabdesign.space";
const STATE_FILE: &str = ".reality/pack-state.json";
/// Download the whole layer once this share of its bytes is needed...
const LAYER_BYTES_SHARE: f64 = 0.6;
/// ...or this many of its files.
const LAYER_FILE_COUNT: usize = 300;

#[derive(Deserialize)]
struct Manifest {
    version: u64,
    #[serde(default)]
    mods: Vec<ModEntry>,
    #[serde(default)]
    files: Vec<FileEntry>,
    #[serde(default)]
    layers: Vec<LayerEntry>,
}

#[derive(Deserialize)]
struct ModEntry {
    path: String,
    url: String,
    #[serde(default)]
    size: u64,
    sha1: Option<String>,
    #[serde(default = "side_both")]
    side: String,
}

#[derive(Deserialize)]
struct FileEntry {
    path: String,
    url: String,
    #[serde(default)]
    size: u64,
    crc32: Option<u32>,
    sha256: Option<String>,
    layer: String,
    entry: Option<String>,
    #[serde(default = "side_both")]
    side: String,
}

#[derive(Deserialize)]
struct LayerEntry {
    id: String,
    kind: String,
    size: u64,
    url: Option<String>,
}

fn side_both() -> String {
    "both".into()
}

#[derive(Serialize, Deserialize, Default)]
struct State {
    version: u64,
    entries: HashMap<String, StateEntry>,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
struct StateEntry {
    size: u64,
    hash: String,
}

/// One file the instance should contain.
#[derive(Clone)]
struct Want {
    path: String,
    dest: PathBuf,
    url: String,
    size: u64,
    /// Identity of the pack's copy: "sha1:…", "crc32:…", "sha256:…" or "size:…".
    hash: String,
    /// Mods must match exactly; other files keep local edits until the pack changes them.
    enforce: bool,
    sha1: Option<String>,
    sha256: Option<String>,
    crc32: Option<u32>,
    layer: Option<String>,
    entry: Option<String>,
}

pub enum Outcome {
    /// The instance has no v2 pack; use the older sync paths.
    NotV2,
    /// Synced; files that could not be installed, as (path, reason).
    Synced(Vec<(String, String)>),
}

fn is_mod_path(path: &str) -> bool {
    let p = path.replace('\\', "/");
    p.starts_with("mods/") && p.ends_with(".jar")
}

fn wants_from(manifest: &Manifest, dir: &Path) -> (Vec<Want>, Vec<(String, String)>) {
    let mut wants = Vec::new();
    let mut rejected = Vec::new();
    for m in manifest.mods.iter().filter(|m| m.side != "server") {
        let Some(dest) = safe_join(dir, &m.path) else {
            rejected.push((m.path.clone(), "Unsafe path".into()));
            continue;
        };
        let hash = match &m.sha1 {
            Some(s) => format!("sha1:{}", s.to_lowercase()),
            None => format!("size:{}:{}", m.size, m.url),
        };
        wants.push(Want {
            path: m.path.clone(),
            dest,
            url: m.url.clone(),
            size: m.size,
            hash,
            enforce: true,
            sha1: m.sha1.clone(),
            sha256: None,
            crc32: None,
            layer: None,
            entry: None,
        });
    }
    for f in manifest.files.iter().filter(|f| f.side != "server") {
        let Some(dest) = safe_join(dir, &f.path) else {
            rejected.push((f.path.clone(), "Unsafe path".into()));
            continue;
        };
        let hash = match (f.crc32, &f.sha256) {
            (Some(c), _) => format!("crc32:{c:08x}:{}", f.size),
            (None, Some(s)) => format!("sha256:{}", s.to_lowercase()),
            _ => format!("size:{}:{}", f.size, f.url),
        };
        wants.push(Want {
            path: f.path.clone(),
            dest,
            url: f.url.clone(),
            size: f.size,
            hash,
            enforce: is_mod_path(&f.path),
            sha1: None,
            sha256: f.sha256.clone(),
            crc32: f.crc32,
            layer: Some(f.layer.clone()),
            entry: f.entry.clone(),
        });
    }
    (wants, rejected)
}

fn file_crc32(path: &Path) -> Result<u32, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = crc32fast::Hasher::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize())
}

fn local_matches(w: &Want) -> bool {
    if let Some(s) = &w.sha1 {
        return compute_sha1(&w.dest).map(|h| h.eq_ignore_ascii_case(s)).unwrap_or(false);
    }
    if let Some(c) = w.crc32 {
        return file_crc32(&w.dest).map(|h| h == c).unwrap_or(false);
    }
    if let Some(s) = &w.sha256 {
        return compute_sha256(&w.dest).map(|h| h.eq_ignore_ascii_case(s)).unwrap_or(false);
    }
    true // nothing to compare beyond the size, which already matched
}

/// Whether `w` has to be (re)installed, given what the last sync recorded for it.
fn needs_update(w: &Want, prev: Option<&StateEntry>) -> bool {
    let meta = match fs::metadata(&w.dest) {
        Ok(m) if m.is_file() => m,
        _ => return true,
    };
    let same_pack_copy = prev.is_some_and(|p| p.hash == w.hash);
    // The pack hasn't changed this file since we installed it: whatever is
    // there now is the player's own edit.
    if same_pack_copy && !w.enforce {
        return false;
    }
    if w.size > 0 && meta.len() != w.size {
        return true;
    }
    // We wrote exactly this copy last time and the size still fits: skip
    // rehashing every jar on every launch.
    if same_pack_copy {
        return false;
    }
    !local_matches(w)
}

fn load_state(dir: &Path) -> State {
    fs::read(dir.join(STATE_FILE))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_state(dir: &Path, state: &State) -> Result<(), String> {
    let path = dir.join(STATE_FILE);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec(state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Which zip layers are worth downloading whole for the files still needed.
fn layers_to_bulk_download<'a>(needed: &[Want], layers: &'a [LayerEntry]) -> Vec<&'a LayerEntry> {
    let mut bytes: HashMap<&str, u64> = HashMap::new();
    let mut count: HashMap<&str, usize> = HashMap::new();
    for w in needed {
        if let (Some(layer), Some(_)) = (&w.layer, &w.entry) {
            *bytes.entry(layer.as_str()).or_default() += w.size;
            *count.entry(layer.as_str()).or_default() += 1;
        }
    }
    layers
        .iter()
        .filter(|l| l.kind == "zip" && l.url.is_some())
        .filter(|l| {
            let b = bytes.get(l.id.as_str()).copied().unwrap_or(0);
            let n = count.get(l.id.as_str()).copied().unwrap_or(0);
            n > 0 && (b as f64 >= l.size as f64 * LAYER_BYTES_SHARE || n >= LAYER_FILE_COUNT)
        })
        .collect()
}

/// Write `reader` to `dest` through a temp file so a half-written file never
/// replaces a good one.
fn write_atomic(dest: &Path, reader: &mut impl Read) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = dest.with_file_name(format!(
        ".{}.reality-part",
        dest.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
    ));
    {
        let mut out = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        std::io::copy(reader, &mut out).map_err(|e| {
            let _ = fs::remove_file(&tmp);
            e.to_string()
        })?;
        out.flush().map_err(|e| e.to_string())?;
    }
    if dest.exists() {
        let _ = fs::remove_file(dest);
    }
    fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

/// Unpack the given entries out of a downloaded layer. The zip reader checks
/// each entry's CRC as it reads, so a bad copy fails here.
fn extract_from_layer(zip_path: &Path, wants: &[Want]) -> Vec<(String, Result<(), String>)> {
    let opened = fs::File::open(zip_path)
        .map_err(|e| e.to_string())
        .and_then(|f| zip::ZipArchive::new(f).map_err(|e| e.to_string()));
    let mut archive = match opened {
        Ok(a) => a,
        Err(e) => return wants.iter().map(|w| (w.path.clone(), Err(e.clone()))).collect(),
    };
    wants
        .iter()
        .map(|w| {
            let entry = w.entry.as_deref().unwrap_or_default();
            let result = archive
                .by_name(entry)
                .map_err(|e| format!("{entry}: {e}"))
                .and_then(|mut file| write_atomic(&w.dest, &mut file));
            (w.path.clone(), result)
        })
        .collect()
}

async fn download_layer(
    app: &tauri::AppHandle,
    url: &str,
    size: u64,
    dest: &Path,
    cancel: &crate::op_guard::CancelToken,
) -> Result<(), String> {
    use futures_util::StreamExt;
    let resp = crate::http_client::HTTP_CLIENT
        .get(url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(size).max(1);
    let mut out = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut done: u64 = 0;
    let mut last_pct = u32::MAX;
    while let Some(chunk) = stream.next().await {
        if cancel.flag().load(Ordering::SeqCst) {
            return Err(CANCELLED_SENTINEL.to_string());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        out.write_all(&chunk).map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        let pct = ((done * 100) / total).min(100) as u32;
        if pct != last_pct {
            last_pct = pct;
            emit_sync_progress(app, "sync-download", "Downloading pack files", None, None, Some(pct), None);
        }
    }
    out.flush().map_err(|e| e.to_string())
}

async fn fetch_manifest(cloud_id: &str) -> Result<Option<Manifest>, String> {
    let url = format!("{API_URL}/instances/{cloud_id}/pack/manifest");
    let resp = crate::http_client::HTTP_CLIENT
        .get(&url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("Pack manifest: HTTP {}", resp.status()));
    }
    resp.json::<Manifest>().await.map(Some).map_err(|e| format!("Bad pack manifest: {e}"))
}

/// Bring `dir` in line with the instance's published v2 pack.
pub async fn sync(
    app: &tauri::AppHandle,
    dir: &Path,
    cloud_id: &str,
    cancel: &crate::op_guard::CancelToken,
) -> Result<Outcome, String> {
    let Some(manifest) = fetch_manifest(cloud_id).await? else {
        return Ok(Outcome::NotV2);
    };
    emit_sync_progress(app, "sync-check", "Checking files", None, None, None, None);
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    let (wants, mut failed) = wants_from(&manifest, dir);
    let old_state = load_state(dir);

    // Hashing can take a while on big packs; keep it off the async runtime.
    let needed: Vec<Want> = {
        let wants = wants.clone();
        let entries = old_state.entries.clone();
        tokio::task::spawn_blocking(move || {
            wants.into_iter().filter(|w| needs_update(w, entries.get(&w.path))).collect()
        })
        .await
        .map_err(|e| e.to_string())?
    };
    log::info!("[Pack v2] v{}: {} of {} files need updating", manifest.version, needed.len(), wants.len());

    let mut errors: HashMap<String, String> = HashMap::new();

    // 1. Layers most of whose files are needed: one download, then unpack.
    let bulk = layers_to_bulk_download(&needed, &manifest.layers);
    let bulk_ids: HashSet<&str> = bulk.iter().map(|l| l.id.as_str()).collect();
    let temp_dir = std::env::temp_dir().join("mlauncher-modpacks");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    for layer in &bulk {
        let from_layer: Vec<Want> = needed
            .iter()
            .filter(|w| w.layer.as_deref() == Some(layer.id.as_str()) && w.entry.is_some())
            .cloned()
            .collect();
        let zip_path = temp_dir.join(format!("layer-{}.zip", layer.id));
        let downloaded = download_layer(app, layer.url.as_deref().unwrap_or_default(), layer.size, &zip_path, cancel).await;
        match downloaded {
            Err(e) if e == CANCELLED_SENTINEL => {
                let _ = fs::remove_file(&zip_path);
                return Err(e);
            }
            Err(e) => {
                for w in &from_layer {
                    errors.insert(w.path.clone(), e.clone());
                }
            }
            Ok(()) => {
                emit_sync_progress(app, "sync-extract", "Unpacking pack files", None, None, None, None);
                let path = zip_path.clone();
                let results = tokio::task::spawn_blocking(move || extract_from_layer(&path, &from_layer))
                    .await
                    .map_err(|e| e.to_string())?;
                for (path, r) in results {
                    if let Err(e) = r {
                        errors.insert(path, e);
                    }
                }
            }
        }
        let _ = fs::remove_file(&zip_path);
    }
    if cancel.flag().load(Ordering::SeqCst) {
        return Err(CANCELLED_SENTINEL.to_string());
    }

    // 2. Everything else one by one: mods from their CDNs, stray pack files.
    let singles: Vec<&Want> = needed
        .iter()
        .filter(|w| !w.layer.as_deref().is_some_and(|l| bulk_ids.contains(l)) || w.entry.is_none())
        .collect();
    if !singles.is_empty() {
        let items: Vec<crate::download::DownloadItem> = singles
            .iter()
            .map(|w| {
                if let Some(parent) = w.dest.parent() {
                    fs::create_dir_all(parent).ok();
                }
                let mut item = crate::download::DownloadItem::new(w.url.clone(), w.dest.clone()).with_label(w.path.clone());
                if let Some(s) = &w.sha1 {
                    item = item.with_sha1(s.clone());
                } else if let Some(s) = &w.sha256 {
                    item.hashes.insert("sha256".into(), s.clone());
                }
                item
            })
            .collect();
        let config = crate::download::DownloadConfig {
            concurrency: crate::config::get_max_concurrent_downloads(),
            max_retries: 3,
        };
        let result = crate::download::download_batch(items, &config, Some(cancel.flag_arc()), |current, total, _| {
            let pct = if total > 0 { (current * 100) / total } else { 100 };
            emit_sync_progress(app, "sync-download", "", Some(current), Some(total), Some(pct), None);
        })
        .await;
        if cancel.flag().load(Ordering::SeqCst) {
            return Err(CANCELLED_SENTINEL.to_string());
        }
        for (label, e) in result.failed.into_iter().chain(result.missing_on_server) {
            errors.insert(label, e);
        }
        // Pack files carry a CRC instead of a SHA; check those here.
        for w in singles.iter().filter(|w| w.sha1.is_none() && w.sha256.is_none()) {
            if let (Some(c), false) = (w.crc32, errors.contains_key(&w.path)) {
                if file_crc32(&w.dest).map(|h| h != c).unwrap_or(true) {
                    let _ = fs::remove_file(&w.dest);
                    errors.insert(w.path.clone(), "Checksum mismatch".into());
                }
            }
        }
    }

    // 3. Remove what earlier versions installed and this one no longer has.
    emit_sync_progress(app, "sync-clean", "Cleaning up extra mods...", None, None, None, None);
    let wanted: HashSet<&str> = wants.iter().map(|w| w.path.as_str()).collect();
    for path in old_state.entries.keys().filter(|p| !wanted.contains(p.as_str())) {
        // Top-level mods are handled by cleanup_unmanaged_mods (it honours locked mods).
        if is_mod_path(path) && !path.trim_start_matches("mods/").contains('/') {
            continue;
        }
        if let Some(p) = safe_join(dir, path) {
            if p.is_file() {
                let _ = fs::remove_file(p);
            }
        }
    }
    let keep_mods: HashSet<String> = wants
        .iter()
        .filter_map(|w| w.path.replace('\\', "/").strip_prefix("mods/").map(str::to_string))
        .filter(|name| !name.contains('/'))
        .collect();
    cleanup_unmanaged_mods(&dir.to_string_lossy(), &keep_mods);

    // 4. Remember what is installed now; failures are left out so they retry.
    let state = State {
        version: manifest.version,
        entries: wants
            .iter()
            .filter(|w| !errors.contains_key(&w.path))
            .map(|w| (w.path.clone(), StateEntry { size: w.size, hash: w.hash.clone() }))
            .collect(),
    };
    if let Err(e) = save_state(dir, &state) {
        log::warn!("[Pack v2] could not save pack state: {e}");
    }

    failed.extend(errors);
    emit_sync_progress(app, "sync-complete", "Sync complete", None, None, Some(100), None);
    Ok(Outcome::Synced(failed))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pack-v2-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn want(dir: &Path, path: &str, body: &[u8], enforce: bool) -> Want {
        let crc = crc32fast::hash(body);
        Want {
            path: path.into(),
            dest: dir.join(path),
            url: String::new(),
            size: body.len() as u64,
            hash: format!("crc32:{crc:08x}:{}", body.len()),
            enforce,
            sha1: None,
            sha256: None,
            crc32: Some(crc),
            layer: Some("L".into()),
            entry: Some(format!("overrides/{path}")),
        }
    }

    #[test]
    fn missing_or_different_files_need_update() {
        let dir = temp_dir("needs");
        let w = want(&dir, "config/a.toml", b"a=1", false);
        assert!(needs_update(&w, None), "missing file");
        fs::create_dir_all(dir.join("config")).unwrap();
        fs::write(dir.join("config/a.toml"), b"a=2").unwrap();
        assert!(needs_update(&w, None), "same size, different content");
        fs::write(dir.join("config/a.toml"), b"a=1").unwrap();
        assert!(!needs_update(&w, None), "identical content");
    }

    #[test]
    fn player_edits_survive_until_the_pack_changes_the_file() {
        let dir = temp_dir("edits");
        let shipped = want(&dir, "options.txt", b"fov:70", false);
        let prev = StateEntry { size: shipped.size, hash: shipped.hash.clone() };
        fs::write(dir.join("options.txt"), b"fov:110 and more").unwrap();
        assert!(!needs_update(&shipped, Some(&prev)), "pack unchanged: keep the player's file");
        let next = want(&dir, "options.txt", b"fov:80", false);
        assert!(needs_update(&next, Some(&prev)), "pack shipped a new copy");
    }

    #[test]
    fn mods_are_always_enforced() {
        let dir = temp_dir("mods");
        let w = want(&dir, "mods/a.jar", b"jar", true);
        let prev = StateEntry { size: w.size, hash: w.hash.clone() };
        fs::create_dir_all(dir.join("mods")).unwrap();
        fs::write(dir.join("mods/a.jar"), b"tampered jar").unwrap();
        assert!(needs_update(&w, Some(&prev)));
    }

    #[test]
    fn bulk_download_only_when_most_of_a_layer_is_needed() {
        let dir = temp_dir("bulk");
        let layers = vec![
            LayerEntry { id: "L".into(), kind: "zip".into(), size: 100, url: Some("u".into()) },
            LayerEntry { id: "B".into(), kind: "blob".into(), size: 5, url: Some("u".into()) },
        ];
        let mut small = want(&dir, "config/a.toml", &[0u8; 10], false);
        assert!(layers_to_bulk_download(&[small.clone()], &layers).is_empty());
        small.size = 70;
        assert_eq!(layers_to_bulk_download(&[small], &layers).len(), 1);
    }

    #[test]
    fn extracts_entries_and_rejects_bad_names() {
        let dir = temp_dir("extract");
        let zip_path = dir.join("layer.zip");
        {
            let mut zw = zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
            let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
            zw.start_file("overrides/config/a.toml", opts).unwrap();
            zw.write_all(b"a=1").unwrap();
            zw.finish().unwrap();
        }
        let out = dir.join("inst");
        let good = want(&out, "config/a.toml", b"a=1", false);
        let mut bad = want(&out, "config/b.toml", b"b", false);
        bad.entry = Some("overrides/config/missing.toml".into());
        let results = extract_from_layer(&zip_path, &[good, bad]);
        assert!(results[0].1.is_ok());
        assert!(results[1].1.is_err());
        assert_eq!(fs::read(out.join("config/a.toml")).unwrap(), b"a=1");
    }

    #[test]
    fn server_only_entries_are_skipped_and_paths_checked() {
        let dir = temp_dir("wants");
        let manifest: Manifest = serde_json::from_value(serde_json::json!({
            "version": 3,
            "mods": [
                { "path": "mods/client.jar", "url": "https://x/c.jar", "size": 1, "sha1": "AB", "side": "both" },
                { "path": "mods/server.jar", "url": "https://x/s.jar", "size": 1, "side": "server" }
            ],
            "files": [
                { "path": "../evil.txt", "url": "https://x/e", "size": 1, "layer": "L" },
                { "path": "config/a.toml", "url": "https://x/a", "size": 3, "crc32": 7, "layer": "L", "entry": "overrides/config/a.toml" }
            ],
            "layers": []
        }))
        .unwrap();
        let (wants, rejected) = wants_from(&manifest, &dir);
        assert_eq!(wants.iter().map(|w| w.path.as_str()).collect::<Vec<_>>(), vec!["mods/client.jar", "config/a.toml"]);
        assert_eq!(wants[0].hash, "sha1:ab");
        assert!(wants[0].enforce && !wants[1].enforce);
        assert_eq!(rejected.len(), 1);
    }
}
