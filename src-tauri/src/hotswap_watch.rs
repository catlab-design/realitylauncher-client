//! Hotswap while the game runs: the pack manifest poll loop, the result
//! watcher and the crash lock.
//!
//! The loop only reads the public manifest endpoint and stages files; it never
//! touches the game. Every failure backs off and is logged once per state
//! change.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::Notify;

use crate::hotswap::Tier;
use crate::hotswap_channel::{read_json, write_json, AgentState, Apply, HotswapResult, Offer, Outcome, Status, SCHEMA};
use crate::hotswap_telemetry::{self as tele, TelemetryCtx};
use crate::pack_v2::Manifest;

pub const POLL_BASE: Duration = Duration::from_secs(60);
pub const POLL_MAX: Duration = Duration::from_secs(600);

/// Session dir of each instance whose game is running with hotswap.
static SESSIONS: std::sync::Mutex<Option<std::collections::HashMap<String, PathBuf>>> = std::sync::Mutex::new(None);

pub(crate) fn register_session(instance_id: &str, session_dir: &Path) {
    let mut guard = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    guard.get_or_insert_with(Default::default).insert(instance_id.to_string(), session_dir.to_path_buf());
}

pub(crate) fn unregister_session(instance_id: &str) {
    let mut guard = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(map) = guard.as_mut() {
        map.remove(instance_id);
    }
}

/// Write `apply.json` for `version`, but only while `offer.json` is that
/// version and not revoked. Anything else is `"revoked"`.
pub(crate) fn apply_in_session(session_dir: &Path, version: u64) -> Result<(), String> {
    match read_json::<Offer>(session_dir, "offer.json") {
        Some(offer) if !offer.revoked && offer.version == version => {
            write_json(session_dir, "apply.json", &Apply { schema: SCHEMA, version })
        }
        _ => Err("revoked".to_string()),
    }
}

pub(crate) fn apply_for_instance(instance_id: &str, version: u64) -> Result<(), String> {
    let session = {
        let guard = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().and_then(|m| m.get(instance_id).cloned())
    };
    apply_in_session(&session.ok_or_else(|| "no-session".to_string())?, version)
}

/// The player clicked Apply on a pending pack update.
#[tauri::command]
pub fn hotswap_apply(instance_id: String, version: u64) -> Result<(), String> {
    apply_for_instance(&instance_id, version)
}

/// The agent's own state for a session (`status.json`): `idle`, `ready`,
/// `applying` or `busy-in-world`. Independent of the tab-badge status file.
pub(crate) fn agent_state_in_session(session_dir: &Path) -> Option<String> {
    let status = read_json::<Status>(session_dir, "status.json")?;
    Some(
        match status.state {
            AgentState::Idle => "idle",
            AgentState::Ready => "ready",
            AgentState::Applying => "applying",
            AgentState::BusyInWorld => "busy-in-world",
            AgentState::Unknown => return None,
        }
        .to_string(),
    )
}

/// What the hotswap agent of this instance's running game is doing, or `None`
/// without a session or before it reports.
#[tauri::command]
pub fn hotswap_agent_state(instance_id: String) -> Option<String> {
    let session = {
        let guard = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().and_then(|m| m.get(&instance_id).cloned())
    }?;
    agent_state_in_session(&session)
}

const CRASH_LOCK_FILE: &str = "crash-lock.json";

pub fn hotswap_root(instance_dir: &Path) -> PathBuf {
    instance_dir.join(".reality").join("hotswap")
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CrashLock {
    pack_version: u64,
}

/// Delay before the next poll: the base after a success, doubled (up to the
/// cap) after a failure.
pub fn next_delay(prev: Duration, ok: bool) -> Duration {
    if ok {
        POLL_BASE
    } else {
        (prev * 2).min(POLL_MAX)
    }
}

/// True while hotswap is locked off for `pack_version` after a crash. A lock
/// for another pack version is stale and is removed.
pub fn crash_locked(instance_dir: &Path, pack_version: u64) -> bool {
    let root = hotswap_root(instance_dir);
    match read_json::<CrashLock>(&root, CRASH_LOCK_FILE) {
        Some(lock) if lock.pack_version == pack_version => true,
        Some(_) => {
            let _ = std::fs::remove_file(root.join(CRASH_LOCK_FILE));
            false
        }
        None => false,
    }
}

/// Lock hotswap if the session's last result is `applied` and no `healthy`
/// followed (the game died or was killed within the health window). True when
/// a lock for that pack version was newly written.
pub fn update_crash_lock(instance_dir: &Path, session_dir: &Path) -> Option<u64> {
    let last = read_json::<HotswapResult>(session_dir, "result.json")?;
    if last.outcome != Outcome::Applied {
        return None;
    }
    let root = hotswap_root(instance_dir);
    if read_json::<CrashLock>(&root, CRASH_LOCK_FILE).is_some_and(|l| l.pack_version == last.version) {
        return None;
    }
    let lock = CrashLock { pack_version: last.version };
    match write_json(&root, CRASH_LOCK_FILE, &lock) {
        Ok(()) => Some(last.version),
        Err(e) => {
            log::warn!("[Hotswap] could not write crash lock: {e}");
            None
        }
    }
}

/// The newest session directory, if any.
pub fn latest_session(instance_dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(hotswap_root(instance_dir))
        .ok()?
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| Some((e.file_name().to_string_lossy().parse::<u128>().ok()?, e.path())))
        .max_by_key(|(ms, _)| *ms)
        .map(|(_, path)| path)
}

/// Remove every session directory under `<instance>/.reality/hotswap/` except
/// `keep`. The crash lock file is not a directory and stays.
pub fn prune_sessions(instance_dir: &Path, keep: &Path) {
    let Ok(read) = std::fs::read_dir(hotswap_root(instance_dir)) else { return };
    for entry in read.flatten() {
        let path = entry.path();
        if path != keep && path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

/// New session directory name: milliseconds since the epoch, so names sort by age.
pub fn new_session_dir(instance_dir: &Path) -> PathBuf {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    hotswap_root(instance_dir).join(ms.to_string())
}

/// What a manifest poll returned.
pub(crate) enum FetchOutcome {
    NotModified,
    Manifest(Manifest, Option<String>),
}

/// Everything the poll loop needs from the outside world.
#[allow(async_fn_in_trait)]
pub(crate) trait Backend {
    async fn fetch(&mut self, etag: Option<&str>) -> Result<FetchOutcome, String>;
    async fn stage(&mut self, manifest: &Manifest) -> Result<Offer, String>;
    /// Wait `d`; false means the game stopped and the loop must end.
    async fn sleep(&mut self, d: Duration) -> bool;
    fn emit(&mut self, event: &str, payload: serde_json::Value);
    fn log(&mut self, message: &str);
    /// A hotswap telemetry event (never carries paths).
    fn telemetry(&mut self, _event: &'static str, _data: serde_json::Value) {}
}

pub(crate) struct WatchState {
    pub ctx: TelemetryCtx,
    pub instance_id: String,
    pub session_dir: PathBuf,
    pub current_version: u64,
}

fn live_and_restart(offer: &Offer) -> (usize, usize) {
    let live = offer.changes.iter().filter(|c| c.tier == Tier::Zero).count();
    (live, offer.changes.len() - live)
}

/// Poll the manifest until `sleep` says stop. Waits 60 s, doubling after each
/// failure up to 600 s, and 60 s again after a success.
pub(crate) async fn run_poll_loop<B: Backend>(state: &WatchState, be: &mut B) {
    let mut delay = POLL_BASE;
    let mut etag: Option<String> = None;
    let mut offered = state.current_version;
    let mut revoked = false;
    let mut failing = false;

    while be.sleep(delay).await {
        let outcome = poll_once(state, be, etag.as_deref(), &mut offered, &mut revoked).await;
        let ok = match outcome {
            Ok(new_etag) => {
                if let Some(e) = new_etag {
                    etag = Some(e);
                }
                true
            }
            Err(e) => {
                if !failing {
                    be.log(&format!("Hotswap: pack manifest unreachable ({e}); backing off"));
                }
                false
            }
        };
        if ok && failing {
            be.log("Hotswap: pack manifest poll recovered");
        }
        failing = !ok;
        delay = next_delay(delay, ok);
    }
}

/// One poll. `Ok(Some(etag))` carries the validator to send next time.
async fn poll_once<B: Backend>(
    state: &WatchState,
    be: &mut B,
    etag: Option<&str>,
    offered: &mut u64,
    revoked: &mut bool,
) -> Result<Option<String>, String> {
    let (manifest, new_etag) = match be.fetch(etag).await? {
        FetchOutcome::NotModified => return Ok(None),
        FetchOutcome::Manifest(m, e) => (m, e),
    };

    if !manifest.experimental.hotswap {
        if !*revoked {
            let offer = Offer { schema: SCHEMA, version: manifest.version, revoked: true, changes: vec![], staging: String::new() };
            write_json(&state.session_dir, "offer.json", &offer)?;
            be.emit(
                "hotswap-offer",
                serde_json::json!({
                    "instanceId": state.instance_id,
                    "version": manifest.version,
                    "liveCount": 0,
                    "restartCount": 0,
                    "revoked": true,
                }),
            );
            *revoked = true;
        }
        return Ok(new_etag);
    }
    *revoked = false;

    if manifest.version > *offered {
        let offer = be.stage(&manifest).await?;
        *offered = manifest.version;
        if !offer.changes.is_empty() {
            write_json(&state.session_dir, "offer.json", &offer)?;
            let (live, restart) = live_and_restart(&offer);
            be.telemetry("hotswap_offer", tele::offer_payload(&state.ctx, offer.version, live, restart));
            be.emit(
                "hotswap-offer",
                serde_json::json!({
                    "instanceId": state.instance_id,
                    "version": offer.version,
                    "liveCount": live,
                    "restartCount": restart,
                }),
            );
        }
    }
    Ok(new_etag)
}

/// A changed `result.json`, or `None` while it is missing or unchanged.
pub fn take_result_change(session_dir: &Path, last: &mut Option<HotswapResult>) -> Option<HotswapResult> {
    let now = read_json::<HotswapResult>(session_dir, "result.json")?;
    if last.as_ref() == Some(&now) {
        return None;
    }
    *last = Some(now.clone());
    Some(now)
}

struct LiveBackend {
    cloud_id: String,
    instance_dir: PathBuf,
    enabled: Vec<Tier>,
    app: tauri::AppHandle,
    stopped: Arc<AtomicBool>,
    wake: Arc<Notify>,
}

impl Backend for LiveBackend {
    async fn fetch(&mut self, etag: Option<&str>) -> Result<FetchOutcome, String> {
        Ok(match crate::pack_v2::fetch_manifest_if_changed(&self.cloud_id, etag).await? {
            None => FetchOutcome::NotModified,
            Some((m, e)) => FetchOutcome::Manifest(m, e),
        })
    }

    async fn stage(&mut self, manifest: &Manifest) -> Result<Offer, String> {
        crate::hotswap_staging::stage(&self.cloud_id, &self.instance_dir, manifest, &self.enabled).await
    }

    async fn sleep(&mut self, d: Duration) -> bool {
        if self.stopped.load(Ordering::SeqCst) {
            return false;
        }
        let woken = self.wake.notified();
        tokio::pin!(woken);
        // Register before re-checking the flag so a stop in between is not lost.
        woken.as_mut().enable();
        if self.stopped.load(Ordering::SeqCst) {
            return false;
        }
        tokio::select! {
            _ = tokio::time::sleep(d) => {}
            _ = woken => {}
        }
        !self.stopped.load(Ordering::SeqCst)
    }

    fn emit(&mut self, event: &str, payload: serde_json::Value) {
        let _ = self.app.emit(event, payload);
    }

    fn log(&mut self, message: &str) {
        crate::launch_log::info(message);
    }

    fn telemetry(&mut self, event: &'static str, data: serde_json::Value) {
        tele::send(event, data);
    }
}

/// Starts the manifest poll and the result watcher for one running game.
/// `instance_id` is the local instance id (what `game-stopped` carries).
pub fn spawn_hotswap_watch(
    app: tauri::AppHandle,
    cloud_id: String,
    instance_id: String,
    instance_dir: PathBuf,
    session_dir: PathBuf,
    enabled: Vec<Tier>,
    current_version: u64,
    ctx: TelemetryCtx,
) -> WatchHandle {
    let stopped = Arc::new(AtomicBool::new(false));
    let wake = Arc::new(Notify::new());
    let handle = WatchHandle { stopped: stopped.clone(), wake: wake.clone(), instance_id: instance_id.clone() };
    register_session(&instance_id, &session_dir);

    let state = WatchState { ctx: ctx.clone(), instance_id: instance_id.clone(), session_dir: session_dir.clone(), current_version };
    let mut backend = LiveBackend {
        cloud_id,
        instance_dir,
        enabled,
        app: app.clone(),
        stopped: stopped.clone(),
        wake: wake.clone(),
    };
    tauri::async_runtime::spawn(async move {
        run_poll_loop(&state, &mut backend).await;
    });

    tauri::async_runtime::spawn(async move {
        let mut last = None;
        while !stopped.load(Ordering::SeqCst) {
            if let Some(result) = take_result_change(&session_dir, &mut last) {
                for (event, data) in tele::events_for_result(&ctx, &result) {
                    tele::send(event, data);
                }
                let mut payload = serde_json::to_value(&result).unwrap_or_default();
                if let Some(map) = payload.as_object_mut() {
                    map.insert("instanceId".into(), instance_id.clone().into());
                }
                let _ = app.emit("hotswap-result", payload);
            }
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(1)) => {}
                _ = wake.notified() => {}
            }
        }
    });
    handle
}

#[derive(Clone)]
pub struct WatchHandle {
    stopped: Arc<AtomicBool>,
    wake: Arc<Notify>,
    instance_id: String,
}

impl WatchHandle {
    pub fn stop(&self) {
        unregister_session(&self.instance_id);
        self.stopped.store(true, Ordering::SeqCst);
        self.wake.notify_waiters();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hotswap_channel::{ChangeAction, OfferChange};
    use std::collections::VecDeque;
    use std::fs;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("rl-hotswap-watch-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn secs(d: Duration) -> u64 {
        d.as_secs()
    }

    fn result(version: u64, outcome: Outcome) -> HotswapResult {
        HotswapResult { schema: 1, version, outcome, applied: vec![], restart: vec![], error: None }
    }

    #[test]
    fn crash_lock_set_when_applied_without_healthy() {
        let inst = tmpdir("lock-set");
        let session = new_session_dir(&inst);
        write_json(&session, "result.json", &result(6, Outcome::Applied)).unwrap();
        assert!(!crash_locked(&inst, 6));
        assert_eq!(update_crash_lock(&inst, &session), Some(6));
        assert!(crash_locked(&inst, 6));
        assert_eq!(update_crash_lock(&inst, &session), None, "an existing lock is not reported twice");

        // A healthy result afterwards never sets a lock.
        let inst = tmpdir("lock-healthy");
        let session = new_session_dir(&inst);
        write_json(&session, "result.json", &result(6, Outcome::Healthy)).unwrap();
        update_crash_lock(&inst, &session);
        assert!(!crash_locked(&inst, 6));

        // Neither does a failed or refused swap, or no result at all.
        for outcome in [Outcome::Failed, Outcome::Refused, Outcome::Restart] {
            let inst = tmpdir("lock-other");
            let session = new_session_dir(&inst);
            write_json(&session, "result.json", &result(6, outcome)).unwrap();
            update_crash_lock(&inst, &session);
            assert!(!crash_locked(&inst, 6));
        }
        let inst = tmpdir("lock-none");
        update_crash_lock(&inst, &inst.join("nope"));
        assert!(!crash_locked(&inst, 0));
    }

    #[test]
    fn crash_lock_cleared_when_pack_version_changes() {
        let inst = tmpdir("lock-clear");
        let session = new_session_dir(&inst);
        write_json(&session, "result.json", &result(6, Outcome::Applied)).unwrap();
        update_crash_lock(&inst, &session);
        assert!(crash_locked(&inst, 6));
        assert!(!crash_locked(&inst, 7));
        // The stale lock is gone, so going back to the old version stays unlocked.
        assert!(!hotswap_root(&inst).join(CRASH_LOCK_FILE).exists());
        assert!(!crash_locked(&inst, 6));
    }

    #[test]
    fn prune_keeps_current_session_and_lock() {
        let inst = tmpdir("prune");
        let old = hotswap_root(&inst).join("100");
        let cur = hotswap_root(&inst).join("200");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&cur).unwrap();
        fs::write(hotswap_root(&inst).join(CRASH_LOCK_FILE), b"{\"packVersion\":1}").unwrap();
        prune_sessions(&inst, &cur);
        assert!(!old.exists());
        assert!(cur.exists());
        assert!(hotswap_root(&inst).join(CRASH_LOCK_FILE).exists());
    }

    #[test]
    fn latest_session_is_the_newest_directory() {
        let inst = tmpdir("latest");
        assert!(latest_session(&inst).is_none());
        for name in ["99", "1000", "250"] {
            fs::create_dir_all(hotswap_root(&inst).join(name)).unwrap();
        }
        fs::write(hotswap_root(&inst).join("9999"), b"").unwrap();
        assert_eq!(latest_session(&inst), Some(hotswap_root(&inst).join("1000")));
    }

    #[test]
    fn delays_double_cap_and_reset() {
        let mut d = POLL_BASE;
        let mut seen = vec![secs(d)];
        for _ in 0..6 {
            d = next_delay(d, false);
            seen.push(secs(d));
        }
        assert_eq!(seen, [60, 120, 240, 480, 600, 600, 600]);
        assert_eq!(secs(next_delay(d, true)), 60);
    }

    /// Scripted world for the loop: fetch results are popped in order; the
    /// loop ends once the script is empty.
    struct Fake {
        fetches: VecDeque<Result<FetchOutcome, String>>,
        etags_seen: Vec<Option<String>>,
        sleeps: Vec<u64>,
        events: Vec<(String, serde_json::Value)>,
        logs: Vec<String>,
        staged: Vec<u64>,
        stage_changes: Vec<OfferChange>,
        telemetry: Vec<(String, serde_json::Value)>,
    }

    impl Fake {
        fn new(fetches: Vec<Result<FetchOutcome, String>>) -> Self {
            Fake {
                fetches: fetches.into(),
                etags_seen: vec![],
                sleeps: vec![],
                events: vec![],
                logs: vec![],
                staged: vec![],
                stage_changes: vec![],
                telemetry: vec![],
            }
        }
    }

    impl Backend for Fake {
        async fn fetch(&mut self, etag: Option<&str>) -> Result<FetchOutcome, String> {
            self.etags_seen.push(etag.map(str::to_string));
            self.fetches.pop_front().unwrap()
        }
        async fn stage(&mut self, m: &Manifest) -> Result<Offer, String> {
            self.staged.push(m.version);
            Ok(Offer {
                schema: SCHEMA,
                version: m.version,
                revoked: false,
                changes: self.stage_changes.clone(),
                staging: String::new(),
            })
        }
        async fn sleep(&mut self, d: Duration) -> bool {
            if self.fetches.is_empty() {
                return false;
            }
            self.sleeps.push(d.as_secs());
            true
        }
        fn emit(&mut self, event: &str, payload: serde_json::Value) {
            self.events.push((event.into(), payload));
        }
        fn log(&mut self, message: &str) {
            self.logs.push(message.into());
        }
        fn telemetry(&mut self, event: &'static str, data: serde_json::Value) {
            self.telemetry.push((event.into(), data));
        }
    }

    fn manifest(version: u64, hotswap: bool) -> Manifest {
        serde_json::from_value(serde_json::json!({"version": version, "experimental": {"hotswap": hotswap}})).unwrap()
    }

    fn run<T>(f: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread().build().unwrap().block_on(f)
    }

    fn state(tag: &str, current: u64) -> WatchState {
        WatchState { ctx: TelemetryCtx::new("fabric", "1.21.1"), instance_id: "inst".into(), session_dir: tmpdir(tag), current_version: current }
    }

    fn change(tier: Tier, path: &str) -> OfferChange {
        OfferChange { path: path.into(), tier, sha256: String::new(), action: ChangeAction::Update }
    }

    #[test]
    fn poll_backs_off_on_errors() {
        let st = state("backoff", 5);
        let mut fake = Fake::new(vec![
            Err("down".into()),
            Err("down".into()),
            Err("502".into()),
            Ok(FetchOutcome::NotModified),
            Ok(FetchOutcome::NotModified),
        ]);
        run(run_poll_loop(&st, &mut fake));
        // Waits before each of the five polls: 60, then doubled per error
        // (120, 240, 480), and the first success resets to 60.
        assert_eq!(fake.sleeps, [60, 120, 240, 480, 60]);
        // One log line per state change, not one per failed poll.
        assert_eq!(fake.logs.iter().filter(|l| l.contains("unreachable")).count(), 1);
        assert_eq!(fake.logs.iter().filter(|l| l.contains("recovered")).count(), 1);
        assert!(fake.events.is_empty());
    }

    #[test]
    fn newer_version_is_staged_offered_and_announced() {
        let st = state("offer", 5);
        let mut fake = Fake::new(vec![
            Ok(FetchOutcome::Manifest(manifest(6, true), Some("\"e6\"".into()))),
            Ok(FetchOutcome::NotModified),
        ]);
        fake.stage_changes = vec![change(Tier::Zero, "config/a.toml"), change(Tier::Three, "mods/x.jar"), change(Tier::Zero, "a.png")];
        run(run_poll_loop(&st, &mut fake));
        assert_eq!(fake.staged, [6]);
        assert_eq!(fake.etags_seen, [None, Some("\"e6\"".to_string())]);
        let offer: Offer = read_json(&st.session_dir, "offer.json").unwrap();
        assert_eq!(offer.version, 6);
        assert!(!offer.revoked);
        assert_eq!(fake.events.len(), 1);
        assert_eq!(fake.events[0].0, "hotswap-offer");
        assert_eq!(
            fake.events[0].1,
            serde_json::json!({"instanceId": "inst", "version": 6, "liveCount": 2, "restartCount": 1})
        );
        assert_eq!(fake.telemetry.len(), 1);
        assert_eq!(fake.telemetry[0].0, "hotswap_offer");
        assert_eq!(fake.telemetry[0].1["loader"], "fabric");
        assert_eq!(fake.telemetry[0].1["liveCount"], 2);
    }

    #[test]
    fn same_or_older_version_is_not_offered() {
        let st = state("same", 5);
        let mut fake = Fake::new(vec![
            Ok(FetchOutcome::Manifest(manifest(5, true), None)),
            Ok(FetchOutcome::Manifest(manifest(4, true), None)),
        ]);
        run(run_poll_loop(&st, &mut fake));
        assert!(fake.staged.is_empty());
        assert!(read_json::<Offer>(&st.session_dir, "offer.json").is_none());
    }

    #[test]
    fn hotswap_turned_off_writes_revoked_offer_once() {
        let st = state("revoke", 5);
        let mut fake = Fake::new(vec![
            Ok(FetchOutcome::Manifest(manifest(6, false), Some("\"a\"".into()))),
            Ok(FetchOutcome::Manifest(manifest(7, false), Some("\"b\"".into()))),
        ]);
        run(run_poll_loop(&st, &mut fake));
        assert!(fake.staged.is_empty());
        let offer: Offer = read_json(&st.session_dir, "offer.json").unwrap();
        assert!(offer.revoked);
        let offers = fake.events.iter().filter(|(e, _)| e == "hotswap-offer").count();
        assert_eq!(offers, 1);
    }

    #[test]
    fn failed_staging_is_retried_next_poll() {
        struct FailOnce(Fake, bool);
        impl Backend for FailOnce {
            async fn fetch(&mut self, e: Option<&str>) -> Result<FetchOutcome, String> {
                self.0.fetch(e).await
            }
            async fn stage(&mut self, m: &Manifest) -> Result<Offer, String> {
                if !self.1 {
                    self.1 = true;
                    return Err("disk full".into());
                }
                self.0.stage(m).await
            }
            async fn sleep(&mut self, d: Duration) -> bool {
                self.0.sleep(d).await
            }
            fn emit(&mut self, e: &str, p: serde_json::Value) {
                self.0.emit(e, p)
            }
            fn log(&mut self, m: &str) {
                self.0.log(m)
            }
        }
        let st = state("retry", 5);
        let fake = Fake::new(vec![
            Ok(FetchOutcome::Manifest(manifest(6, true), Some("\"e\"".into()))),
            Ok(FetchOutcome::Manifest(manifest(6, true), Some("\"e\"".into()))),
        ]);
        let mut be = FailOnce(fake, false);
        run(run_poll_loop(&st, &mut be));
        // The failed attempt did not store the etag, and the delay doubled.
        assert_eq!(be.0.etags_seen, [None, None]);
        assert_eq!(be.0.sleeps, [60, 120]);
        assert_eq!(be.0.staged, [6]);
    }

    #[test]
    fn result_change_is_reported_once() {
        let d = tmpdir("result");
        let mut last = None;
        assert!(take_result_change(&d, &mut last).is_none());
        write_json(&d, "result.json", &result(6, Outcome::Applied)).unwrap();
        assert_eq!(take_result_change(&d, &mut last).unwrap().outcome, Outcome::Applied);
        assert!(take_result_change(&d, &mut last).is_none());
        write_json(&d, "result.json", &result(6, Outcome::Healthy)).unwrap();
        assert_eq!(take_result_change(&d, &mut last).unwrap().outcome, Outcome::Healthy);
    }

    fn offer_file(session: &Path, version: u64, revoked: bool) {
        let offer = Offer { schema: SCHEMA, version, revoked, changes: vec![], staging: String::new() };
        write_json(session, "offer.json", &offer).unwrap();
    }

    #[test]
    fn apply_writes_apply_json_for_the_current_offer() {
        let session = tmpdir("apply-ok");
        offer_file(&session, 6, false);
        apply_in_session(&session, 6).unwrap();
        let apply: crate::hotswap_channel::Apply = read_json(&session, "apply.json").unwrap();
        assert_eq!((apply.schema, apply.version), (1, 6));
    }

    #[test]
    fn apply_after_revoke_is_refused() {
        let session = tmpdir("apply-revoked");
        offer_file(&session, 6, true);
        assert_eq!(apply_in_session(&session, 6), Err("revoked".to_string()));
        assert!(read_json::<crate::hotswap_channel::Apply>(&session, "apply.json").is_none());
    }

    #[test]
    fn apply_wrong_version_is_refused() {
        let session = tmpdir("apply-wrong");
        offer_file(&session, 7, false);
        assert_eq!(apply_in_session(&session, 6), Err("revoked".to_string()));
        assert!(read_json::<crate::hotswap_channel::Apply>(&session, "apply.json").is_none());
        // No offer at all is the same refusal.
        let empty = tmpdir("apply-none");
        assert_eq!(apply_in_session(&empty, 6), Err("revoked".to_string()));
    }

    #[test]
    fn agent_state_comes_from_status_json_not_the_badge_file() {
        let session = tmpdir("agent-state");
        assert_eq!(agent_state_in_session(&session), None);
        for (raw, want) in [("idle", "idle"), ("ready", "ready"), ("applying", "applying"), ("busy-in-world", "busy-in-world")] {
            std::fs::write(session.join("status.json"), format!(r#"{{"schema":1,"state":"{raw}"}}"#)).unwrap();
            assert_eq!(agent_state_in_session(&session).as_deref(), Some(want));
        }
        std::fs::write(session.join("status.json"), r#"{"schema":1,"state":"warp"}"#).unwrap();
        assert_eq!(agent_state_in_session(&session), None);
    }

    #[test]
    fn apply_without_a_running_session_says_no_session() {
        assert_eq!(apply_for_instance("never-registered", 6), Err("no-session".to_string()));
        let session = tmpdir("apply-registry");
        offer_file(&session, 6, false);
        register_session("reg-inst", &session);
        assert!(apply_for_instance("reg-inst", 6).is_ok());
        unregister_session("reg-inst");
        assert_eq!(apply_for_instance("reg-inst", 6), Err("no-session".to_string()));
    }
}
