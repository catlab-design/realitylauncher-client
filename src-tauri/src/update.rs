


use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use once_cell::sync::Lazy;

const API_URL: &str = "https://api.reality.catlabdesign.space";


static DOWNLOADED_INSTALLER: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));
static DOWNLOADED_VERSION: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

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
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "windows"
    }
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

    let filename = url
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("reality-launcher-update");
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

/// Launch the downloaded installer and quit so it can replace the app.
#[tauri::command]
pub fn install_update(app: tauri::AppHandle) -> serde_json::Value {
    let path = match DOWNLOADED_INSTALLER.lock().unwrap().clone() {
        Some(p) => p,
        None => return serde_json::json!({ "ok": false, "error": "No update downloaded" }),
    };
    if !path.exists() {
        return serde_json::json!({ "ok": false, "error": "Downloaded installer missing" });
    }
    backup_data_for_update();
    if let Err(e) = open_installer(&path) {
        return serde_json::json!({ "ok": false, "error": e });
    }
    app.exit(0);
    serde_json::json!({ "ok": true })
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

fn open_installer(path: &Path) -> Result<(), String> {
    let target = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &target]);
        // Suppress the cmd console flash (CREATE_NO_WINDOW).
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
        c
    };
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
}
