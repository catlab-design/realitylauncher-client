


use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use once_cell::sync::Lazy;

const API_URL: &str = "https://api.reality.catlabdesign.space";

/// Minisign public key that every update package is signed with. The matching
/// secret key lives only in CI (`MINISIGN_SECRET_KEY`); see `.gitlab-ci.yml`.
///
/// Generate the pair once with `minisign -G -p reality.pub -s reality.key`,
/// keep `reality.key` secret, and paste the *second* line of `reality.pub`
/// (the base64 blob, not the `untrusted comment:` line) here.
///
/// An update whose `.minisig` does not verify against this key is deleted and
/// never installed. Leaving this as the placeholder disables auto-updates
/// (every download is rejected), which is the safe failure direction.
const UPDATE_PUBLIC_KEY: &str = "RWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/// Hosts an update installer (and its detached signature) may be served from.
/// A tampered `/launcher/latest` response can name a download URL, but it can't
/// point the client at a host outside this set.
const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &[
    "cdn.reality.catlabdesign.space",
    "gitlab.com",
];

fn host_is_allowed(url: &str) -> bool {
    // Minimal, dependency-free host extraction: scheme must be https, then the
    // authority runs up to the next '/', '?' or '#'. Any userinfo ('@') or port
    // (':') is stripped before the exact, case-insensitive host comparison.
    let rest = match url.strip_prefix("https://") {
        Some(r) => r,
        None => return false,
    };
    let authority = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("");
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    ALLOWED_DOWNLOAD_HOSTS
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
}

/// Fetches the detached minisign signature that sits next to `installer_url`
/// (same path, `.minisig` appended) and verifies `file_bytes` against the
/// embedded public key. Returns an error on any failure — missing signature,
/// malformed key, or mismatch — so the caller can refuse the installer.
async fn verify_update_signature(installer_url: &str, file_bytes: &[u8]) -> Result<(), String> {
    use minisign_verify::{PublicKey, Signature};

    let public_key = PublicKey::from_base64(UPDATE_PUBLIC_KEY)
        .map_err(|e| format!("Update public key is invalid: {e}"))?;

    let sig_url = format!("{installer_url}.minisig");
    if !host_is_allowed(&sig_url) {
        return Err("Update signature host is not allowed".into());
    }
    let resp = crate::http_client::HTTP_CLIENT
        .clone()
        .get(&sig_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch update signature: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Update signature unavailable (HTTP {})", resp.status()));
    }
    let sig_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read update signature: {e}"))?;

    let signature = Signature::decode(&sig_text)
        .map_err(|e| format!("Update signature is malformed: {e}"))?;
    public_key
        .verify(file_bytes, &signature, false)
        .map_err(|e| format!("Update signature verification failed: {e}"))
}


static DOWNLOADED_INSTALLER: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));
static DOWNLOADED_VERSION: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
/// Set by the frontend once an auto-update is downloaded but deferred (game running / "later"):
/// the installer then runs silently when the launcher exits.
static INSTALL_ON_EXIT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestReleasePayload {
    pub version: String,
    pub release_date: Option<String>,
    pub changelog: Option<String>,
    pub downloads: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestVersionResult {
    pub ok: bool,
    pub current: String,
    pub latest: Option<String>,
    pub update_available: Option<bool>,
    pub release_date: Option<String>,
    pub changelog: Option<String>,
    pub download_url: Option<String>,
    pub error: Option<String>,
}



fn compare_versions(a: &str, b: &str) -> i32 {
    let parse = |v: &str| -> Vec<u32> {
        v.trim()
            .strip_prefix('v')
            .unwrap_or(v)
            .split(&['-', '+'][..])
            .next()
            .unwrap_or("")
            .split('.')
            .map(|n| n.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let pa = parse(a);
    let pb = parse(b);
    let len = std::cmp::max(pa.len(), pb.len());
    for i in 0..len {
        let da = pa.get(i).copied().unwrap_or(0);
        let db = pb.get(i).copied().unwrap_or(0);
        if da > db {
            return 1;
        }
        if da < db {
            return -1;
        }
    }
    0
}

fn get_platform_key() -> &'static str {
    if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "windows"
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
pub async fn check_latest_version(app: tauri::AppHandle) -> LatestVersionResult {
    let current = app.package_info().version.to_string();
    let url = format!("{}/launcher/latest", API_URL);

    let client = crate::http_client::HTTP_CLIENT.clone();
    match client.get(&url).send().await {
        Ok(response) => {
            if !response.status().is_success() {
                return LatestVersionResult {
                    ok: false,
                    current,
                    latest: None,
                    update_available: None,
                    release_date: None,
                    changelog: None,
                    download_url: None,
                    error: Some(format!("HTTP {}", response.status())),
                };
            }

            match response.json::<LatestReleasePayload>().await {
                Ok(data) => {
                    let latest = data.version.trim().to_string();
                    let update_available = compare_versions(&latest, &current) > 0;
                    let download_url = data
                        .downloads
                        .as_ref()
                        .and_then(|d| d.get(get_platform_key()).cloned());

                    // Push-style events for the Electron-era listeners
                    // (UpdateTab/LauncherApp register onUpdateAvailable etc.);
                    // the returned result stays the primary channel.
                    {
                        use tauri::Emitter;
                        if update_available {
                            let _ = app.emit(
                                "update-available",
                                serde_json::json!({
                                    "version": latest.clone(),
                                    "releaseDate": data.release_date.clone(),
                                }),
                            );
                        } else {
                            let _ = app.emit("update-not-available", serde_json::json!({}));
                        }
                    }

                    LatestVersionResult {
                        ok: true,
                        current,
                        latest: Some(latest),
                        update_available: Some(update_available),
                        release_date: data.release_date,
                        changelog: data.changelog,
                        download_url,
                        error: None,
                    }
                }
                Err(e) => {
                    use tauri::Emitter;
                    let _ = app.emit(
                        "update-error",
                        serde_json::json!({ "message": format!("Failed to parse response: {}", e) }),
                    );
                    LatestVersionResult {
                        ok: false,
                        current,
                        latest: None,
                        update_available: None,
                        release_date: None,
                        changelog: None,
                        download_url: None,
                        error: Some(format!("Failed to parse response: {}", e)),
                    }
                }
            }
        }
        Err(e) => {
            use tauri::Emitter;
            let _ = app.emit(
                "update-error",
                serde_json::json!({ "message": format!("Failed to connect to API: {}", e) }),
            );
            LatestVersionResult {
                ok: false,
                current,
                latest: None,
                update_available: None,
                release_date: None,
                changelog: None,
                download_url: None,
                error: Some(format!("Failed to connect to API: {}", e)),
            }
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateDownloadProgress {
    percent: u32,
    downloaded: u64,
    total: u64,
}

async fn fetch_latest_release() -> Result<LatestReleasePayload, String> {
    let resp = crate::http_client::HTTP_CLIENT.clone()
        .get(format!("{}/launcher/latest", API_URL))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json::<LatestReleasePayload>()
        .await
        .map_err(|e| e.to_string())
}

/// Resets the in-flight flag when a `download_update` call returns, on every path.
struct InFlightGuard;

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

/// Download the OS-appropriate installer to a temp file, emitting
/// `update-progress`. The path is stashed for `install_update`.
///
/// Writes to a `.tmp` sibling and only renames it onto the final path once the
/// stream completes without error, so a dropped connection can't leave a
/// truncated file mistaken for a successful download. A single in-flight
/// download is enforced so overlapping calls (e.g. auto-update firing while
/// the user also clicks "Download") can't write the same file concurrently.
#[tauri::command]
pub async fn download_update(app: tauri::AppHandle) -> serde_json::Value {
    use futures_util::StreamExt;
    use std::io::Write;
    use tauri::Emitter;

    if DOWNLOAD_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return serde_json::json!({ "ok": true, "alreadyInProgress": true });
    }
    let _guard = InFlightGuard;

    let payload = match fetch_latest_release().await {
        Ok(p) => p,
        Err(e) => return serde_json::json!({ "ok": false, "error": e }),
    };

    // A prior call already fetched this exact version and the file is still on
    // disk (e.g. the user re-opened Settings > Update, re-triggering a check) —
    // re-announce it instead of re-downloading the whole installer.
    {
        let already_downloaded = DOWNLOADED_VERSION.lock().unwrap().as_deref() == Some(payload.version.as_str());
        let existing_path = DOWNLOADED_INSTALLER.lock().unwrap().clone();
        if already_downloaded {
            if let Some(path) = existing_path {
                if path.exists() {
                    #[derive(Serialize, Clone)]
                    #[serde(rename_all = "camelCase")]
                    struct UpdateDownloadedPayload {
                        version: String,
                        release_date: Option<String>,
                    }
                    let _ = app.emit(
                        "update-downloaded",
                        UpdateDownloadedPayload {
                            version: payload.version.clone(),
                            release_date: payload.release_date.clone(),
                        },
                    );
                    return serde_json::json!({ "ok": true, "path": path.to_string_lossy(), "alreadyDownloaded": true });
                }
            }
        }
    }

    let url = match payload
        .downloads
        .as_ref()
        .and_then(|d| d.get(get_platform_key()).cloned())
    {
        Some(u) => u,
        None => {
            return serde_json::json!({ "ok": false, "error": "No download available for this platform" })
        }
    };

    if !host_is_allowed(&url) {
        return serde_json::json!({ "ok": false, "error": "Update download host is not allowed" });
    }

    let raw_filename = url
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("reality-launcher-update");
    let filename = percent_decode(raw_filename);
    let dest = std::env::temp_dir().join(format!("reality-update-{filename}"));
    let tmp_path = dest.with_extension("tmp");
    if tmp_path.exists() {
        let _ = std::fs::remove_file(&tmp_path);
    }

    let resp = match crate::http_client::HTTP_CLIENT.clone().get(&url).send().await {
        Ok(r) => r,
        Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }),
    };
    if !resp.status().is_success() {
        return serde_json::json!({ "ok": false, "error": format!("HTTP {}", resp.status()) });
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = match std::fs::File::create(&tmp_path) {
        Ok(f) => f,
        Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }),
    };
    let mut downloaded: u64 = 0;
    let mut last_percent = 0u32;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                let _ = std::fs::remove_file(&tmp_path);
                return serde_json::json!({ "ok": false, "error": e.to_string() });
            }
        };
        if let Err(e) = file.write_all(&chunk) {
            let _ = std::fs::remove_file(&tmp_path);
            return serde_json::json!({ "ok": false, "error": e.to_string() });
        }
        downloaded += chunk.len() as u64;
        if total > 0 {
            let percent = ((downloaded * 100) / total) as u32;
            if percent >= last_percent + 2 || percent == 100 {
                last_percent = percent;
                let _ = app.emit(
                    "update-progress",
                    UpdateDownloadProgress {
                        percent,
                        downloaded,
                        total,
                    },
                );
            }
        }
    }
    drop(file);

    // Verify the downloaded bytes against the embedded minisign key before the
    // file is ever renamed to its final name or stashed for install. A failure
    // here (bad/absent signature, tampered bytes) deletes the temp file and
    // aborts, so neither `install_update` nor the silent on-exit path can run an
    // unverified installer.
    match std::fs::read(&tmp_path) {
        Ok(bytes) => {
            if let Err(e) = verify_update_signature(&url, &bytes).await {
                let _ = std::fs::remove_file(&tmp_path);
                return serde_json::json!({ "ok": false, "error": e });
            }
        }
        Err(e) => {
            let _ = std::fs::remove_file(&tmp_path);
            return serde_json::json!({ "ok": false, "error": e.to_string() });
        }
    }

    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }
    if let Err(e) = std::fs::rename(&tmp_path, &dest) {
        let _ = std::fs::remove_file(&tmp_path);
        return serde_json::json!({ "ok": false, "error": e.to_string() });
    }

    *DOWNLOADED_INSTALLER.lock().unwrap() = Some(dest.clone());
    *DOWNLOADED_VERSION.lock().unwrap() = Some(payload.version.clone());

    #[derive(Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct UpdateDownloadedPayload {
        version: String,
        release_date: Option<String>,
    }
    let _ = app.emit(
        "update-downloaded",
        UpdateDownloadedPayload {
            version: payload.version,
            release_date: payload.release_date,
        },
    );

    serde_json::json!({ "ok": true, "path": dest.to_string_lossy() })
}

/// Install the downloaded update and quit so it can replace the app.
/// `auto`: no clicks needed (Windows installer in passive mode) and the launcher reopens when done.
/// macOS / Linux always swap the app in place and reopen it.
#[tauri::command]
pub fn install_update(app: tauri::AppHandle, auto: Option<bool>) -> serde_json::Value {
    let path = match DOWNLOADED_INSTALLER.lock().unwrap().clone() {
        Some(p) => p,
        None => return serde_json::json!({ "ok": false, "error": "No update downloaded" }),
    };
    if !path.exists() {
        return serde_json::json!({ "ok": false, "error": "Downloaded installer missing" });
    }
    backup_data_for_update();
    let auto = auto.unwrap_or(false);
    if let Err(e) = apply_update(&path, auto, auto || !cfg!(target_os = "windows")) {
        return serde_json::json!({ "ok": false, "error": e });
    }
    // Already handled here; don't start a second installer from the exit hook.
    INSTALL_ON_EXIT.store(false, Ordering::SeqCst);
    app.exit(0);
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn set_install_update_on_exit(enabled: bool) {
    INSTALL_ON_EXIT.store(enabled, Ordering::SeqCst);
}

/// Called from the app's exit hook: installs a deferred auto-update without asking
/// (no relaunch, the user chose to close).
pub fn run_pending_install_on_exit() {
    if !INSTALL_ON_EXIT.swap(false, Ordering::SeqCst) || cfg!(debug_assertions) {
        return;
    }
    let Some(path) = DOWNLOADED_INSTALLER.lock().unwrap().clone() else { return };
    if !path.exists() {
        return;
    }
    backup_data_for_update();
    if let Err(e) = apply_update(&path, true, false) {
        log::error!("[Update] Failed to install update on exit: {e}");
    }
}

fn backup_data_for_update() {
    let dir = crate::config::default_launcher_dir();
    for name in ["config.json", "session.json"] {
        let source = dir.join(name);
        if source.exists() {
            let dest = crate::fs_utils::pre_update_backup_path(&source);
            if let Err(e) = fs::copy(&source, &dest) {
                log::error!("[Update] Failed to back up {name} before update: {e}");
            }
        }
    }
}

/// Starts replacing the app with the downloaded package.
/// - Windows: NSIS installer; `passive` = progress bar only, `relaunch` = reopen when done.
/// - macOS: after this process exits, copies the .app out of the dmg over the running bundle.
/// - Linux: swaps the running AppImage file for the new one.
/// When the app can't replace itself (deb/rpm install, read-only location), the package is
/// opened for the user instead.
fn apply_update(path: &Path, passive: bool, relaunch: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut args: Vec<&str> = Vec::new();
        if passive {
            args.extend(["/P", "/UPDATE"]);
            if relaunch {
                args.push("/R");
            }
        }
        open_installer(path, &args)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = passive;
        #[cfg(target_os = "macos")]
        let result = self_update_dmg(path, relaunch);
        #[cfg(not(target_os = "macos"))]
        let result = self_update_appimage(path, relaunch);
        result.or_else(|e| {
            log::warn!("[Update] Self-update not possible ({e}); opening the package instead");
            open_installer(path, &[])
        })
    }
}

/// Runs `script` with /bin/sh once this launcher process has exited; `args` become $1, $2, ...
/// (passed as arguments, never spliced into the script, so paths with spaces/quotes are safe).
#[cfg_attr(target_os = "windows", allow(dead_code))]
fn spawn_after_exit(script: &str, args: &[&str]) -> Result<(), String> {
    use std::process::Stdio;
    let pid = std::process::id().to_string();
    let full = format!("while kill -0 \"$1\" 2>/dev/null; do sleep 0.3; done\nshift\n{script}");
    std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(full)
        .arg("reality-update")
        .arg(&pid)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(target_os = "windows", allow(dead_code))]
fn dir_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".reality-write-test-{}", std::process::id()));
    match fs::File::create(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Linux: the AppImage is the whole app, so updating = replacing that one file.
/// Renaming over a running AppImage is safe (the running process keeps the old inode).
#[cfg_attr(target_os = "windows", allow(dead_code))]
fn self_update_appimage(new_file: &Path, relaunch: bool) -> Result<(), String> {
    let is_appimage = new_file
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("appimage"));
    if !is_appimage {
        return Err("Downloaded package is not an AppImage".into());
    }
    let target = std::env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .ok_or("Not running from an AppImage")?;
    let dir = target.parent().ok_or("AppImage has no parent directory")?;
    if !dir_writable(dir) {
        return Err(format!("No write access to {}", dir.display()));
    }
    let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("Reality-Launcher.AppImage");
    // Stage next to the target so the final rename is atomic (same filesystem).
    let staged = dir.join(format!(".{name}.update"));
    fs::copy(new_file, &staged).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) = fs::set_permissions(&staged, fs::Permissions::from_mode(0o755)) {
            let _ = fs::remove_file(&staged);
            return Err(e.to_string());
        }
    }
    if let Err(e) = fs::rename(&staged, &target) {
        let _ = fs::remove_file(&staged);
        return Err(e.to_string());
    }
    if relaunch {
        spawn_after_exit("exec \"$1\" >/dev/null 2>&1", &[&target.to_string_lossy()])?;
    }
    Ok(())
}

/// macOS: mount the dmg, swap the .app bundle (old one kept until the copy succeeds),
/// unmount, reopen. Runs after exit so the running bundle isn't modified underneath us.
#[cfg_attr(target_os = "windows", allow(dead_code))]
fn self_update_dmg(dmg: &Path, relaunch: bool) -> Result<(), String> {
    let app = std::env::current_exe()
        .ok()
        .and_then(|exe| {
            exe.ancestors()
                .find(|p| p.extension().is_some_and(|e| e == "app"))
                .map(Path::to_path_buf)
        })
        .ok_or("Not running from an .app bundle")?;
    let parent = app.parent().ok_or(".app bundle has no parent directory")?;
    if !dir_writable(parent) {
        return Err(format!("No write access to {}", parent.display()));
    }
    const SCRIPT: &str = r#"DMG="$1"; APP="$2"; RELAUNCH="$3"
MNT=$(mktemp -d "${TMPDIR:-/tmp}/reality-update.XXXXXX") || exit 1
if ! hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$MNT" "$DMG"; then
  rmdir "$MNT"; open "$DMG"; exit 1
fi
SRC=$(ls -d "$MNT"/*.app 2>/dev/null | head -n 1)
if [ -n "$SRC" ]; then
  rm -rf "$APP.old"
  if mv "$APP" "$APP.old"; then
    if ditto "$SRC" "$APP"; then rm -rf "$APP.old"; else rm -rf "$APP"; mv "$APP.old" "$APP"; fi
  fi
fi
hdiutil detach -quiet "$MNT"; rmdir "$MNT" 2>/dev/null
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
if [ "$RELAUNCH" = 1 ]; then open "$APP"; fi
exit 0"#;
    spawn_after_exit(
        SCRIPT,
        &[&dmg.to_string_lossy(), &app.to_string_lossy(), if relaunch { "1" } else { "0" }],
    )
}

fn open_installer(path: &Path, args: &[&str]) -> Result<(), String> {
    let target = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &target]);
        // NSIS options: /P passive, /R relaunch after install, /UPDATE keep shortcuts.
        c.args(args);
        // Suppress the cmd console flash (CREATE_NO_WINDOW).
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let _ = args;
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&target);
        c
    };
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&target);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_versions() {
        assert_eq!(compare_versions("3.3.2", "3.3.1"), 1);
        assert_eq!(compare_versions("3.3.2", "3.3.2"), 0);
        assert_eq!(compare_versions("3.3.2", "3.4.0"), -1);
        assert_eq!(compare_versions("3.3.2-beta.1", "3.3.2"), 0);
        assert_eq!(compare_versions("v3.3.2", "3.3.2"), 0);
        assert_eq!(compare_versions("3.3", "3.3.1"), -1);
    }

    #[test]
    fn test_host_is_allowed() {
        assert!(host_is_allowed("https://cdn.reality.catlabdesign.space/client/4.1.0/app.AppImage"));
        assert!(host_is_allowed("https://CDN.Reality.CatLabDesign.Space/x"));
        assert!(host_is_allowed("https://gitlab.com/api/v4/x"));
        // Wrong scheme, wrong host, look-alike host, and embedded-userinfo tricks.
        assert!(!host_is_allowed("http://cdn.reality.catlabdesign.space/x"));
        assert!(!host_is_allowed("https://evil.com/x"));
        assert!(!host_is_allowed("https://cdn.reality.catlabdesign.space.evil.com/x"));
        assert!(!host_is_allowed("https://cdn.reality.catlabdesign.space@evil.com/x"));
        assert!(!host_is_allowed("ftp://cdn.reality.catlabdesign.space/x"));
        assert!(!host_is_allowed("not a url"));
    }

    #[test]
    fn test_percent_decode() {
        assert_eq!(percent_decode("Reality%20Launcher_4.1.0_aarch64.dmg"), "Reality Launcher_4.1.0_aarch64.dmg");
        assert_eq!(percent_decode("plain-name.exe"), "plain-name.exe");
        assert_eq!(percent_decode("100%25ok"), "100%ok");
        assert_eq!(percent_decode("bad%zz"), "bad%zz");
        assert_eq!(percent_decode("trailing%"), "trailing%");
        assert_eq!(percent_decode("%"), "%");
    }
}
