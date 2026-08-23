use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use sha1::{Digest as Sha1Digest, Sha1};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const API_URL: &str = "https://api.reality.catlabdesign.space";
const MANIFEST_CACHE_TTL_MS: u64 = 300_000;



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerMod {
    pub filename: String,
    pub url: Option<String>,
    pub size: Option<u64>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerContentPayload {
    pub manifest_revision: Option<String>,
    pub urls_included: Option<bool>,
    pub mods: Option<Vec<ServerMod>>,
    
    
    
    pub modpack_url: Option<String>,
    pub modpack_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedServersResult {
    pub ok: bool,
    pub data: Option<JoinedServersData>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedServersData {
    pub owned: Vec<serde_json::Value>,
    pub member: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleResult {
    pub ok: bool,
    pub error: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressPayload {
    #[serde(rename = "type")]
    pub type_: String,
    pub task: String,
    pub current: Option<u32>,
    pub total: Option<u32>,
    pub percent: Option<u32>,
    pub filename: Option<String>,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedMod {
    pub id: String,
    pub source: String,
    pub file_name: String,
    
    
    #[serde(default)]
    pub path: Option<String>,
    pub download_url: String,
    pub file_size: Option<i64>,
    pub file_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedModsResponse {
    pub mods: Vec<ManagedMod>,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invitation {
    pub id: String,
    pub instance_id: String,
    pub instance_name: String,
    pub instance_icon: Option<String>,
    pub invited_by: String,
    pub inviter_name: Option<String>,
    pub role: String,
    pub message: Option<String>,
    pub status: String,
    pub created_at: String,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    pub id: String,
    pub user_id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub message: Option<String>,
    pub data: Option<String>,
    pub action_url: Option<String>,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSyncResult {
    pub notifications: Vec<NotificationItem>,
    pub invitations: Vec<Invitation>,
}



struct ManifestCacheEntry {
    revision: String,
    cached_at: u64,
    mods: Vec<ServerMod>,
    has_urls: bool,
    modpack_url: Option<String>,
    modpack_type: Option<String>,
}

static MANIFEST_CACHE: Lazy<Mutex<HashMap<String, ManifestCacheEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

struct MetadataCacheEntry {
    etag: String,
    cached_at: u64,
}

static METADATA_CACHE: Lazy<Mutex<HashMap<String, MetadataCacheEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));



fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn get_api_token() -> Result<String, String> {
    crate::auth::get_session()
        .account
        .and_then(|s| s.api_token)
        .ok_or_else(|| "Not logged in".to_string())
}

fn client() -> reqwest::Client {
    crate::http_client::HTTP_CLIENT.clone()
}

/// Send an authenticated cloud-API request. On a 401 the session's API token
/// is force-refreshed once (Microsoft chain re-mints it via the backend) and
/// the request is rebuilt and retried with the fresh token — a 401 is always
/// pre-execution on the server, so the retry can never duplicate work.
async fn send_authed(
    build: impl Fn(&str) -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    let resp = build(&get_api_token()?)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if resp.status() != reqwest::StatusCode::UNAUTHORIZED {
        return Ok(resp);
    }
    let refreshed = crate::auth::refresh_api_token().await?;
    build(&refreshed)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))
}

fn normalize_hash(hash_str: &str) -> Option<(String, String)> {
    let mut value = hash_str.trim().to_string();
    if value.is_empty() {
        return None;
    }
    let lower = value.to_lowercase();

    if lower.starts_with("sha256:") || lower.starts_with("sha-256:") {
        let prefix_len = if lower.starts_with("sha-256:") { 8 } else { 7 };
        value = value[prefix_len..].trim().to_string();
    } else if lower.starts_with("sha1:") || lower.starts_with("sha-1:") {
        let prefix_len = if lower.starts_with("sha-1:") { 6 } else { 5 };
        value = value[prefix_len..].trim().to_string();
    }

    if value.starts_with("0x") || value.starts_with("0X") {
        value = value[2..].trim().to_string();
    }

    if value.chars().all(|c| c.is_ascii_hexdigit()) {
        if value.len() == 64 {
            return Some(("sha256".into(), value.to_lowercase()));
        }
        if value.len() == 40 {
            return Some(("sha1".into(), value.to_lowercase()));
        }
    }

    let normalized = value.replace('-', "+").replace('_', "/");
    let padded = if normalized.len() % 4 != 0 {
        let pad = 4 - (normalized.len() % 4);
        format!("{}{}", normalized, "=".repeat(pad))
    } else {
        normalized
    };
    if let Ok(decoded) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &padded)
    {
        if decoded.len() == 32 {
            return Some(("sha256".into(), hex::encode(decoded)));
        }
        if decoded.len() == 20 {
            return Some(("sha1".into(), hex::encode(decoded)));
        }
    }

    None
}

fn compute_sha1(path: &Path) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| format!("Read error: {}", e))?;
    let mut hasher = Sha1::new();
    hasher.update(&data);
    Ok(hex::encode(hasher.finalize()))
}

fn compute_sha256(path: &Path) -> Result<String, String> {
    let data = fs::read(path).map_err(|e| format!("Read error: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Ok(hex::encode(hasher.finalize()))
}

fn verify_file_hash(path: &Path, expected_hash: &str) -> Result<bool, String> {
    let normalized = normalize_hash(expected_hash);
    let (algo, expected_hex) = match normalized {
        Some(h) => h,
        None => {
            if expected_hash.len() == 40 {
                ("sha1".into(), expected_hash.to_lowercase())
            } else if expected_hash.len() == 64 {
                ("sha256".into(), expected_hash.to_lowercase())
            } else {
                return Err(format!("Unknown hash format: {}", expected_hash));
            }
        }
    };

    let actual = match algo.as_str() {
        "sha1" => compute_sha1(path)?,
        "sha256" => compute_sha256(path)?,
        _ => return Err(format!("Unknown algorithm: {}", algo)),
    };

    Ok(actual == expected_hex)
}




fn safe_join(base: &Path, rel: &str) -> Option<std::path::PathBuf> {
    use std::path::Component;
    let normalized = rel.replace('\\', "/");
    let mut out = base.to_path_buf();
    for comp in Path::new(&normalized).components() {
        match comp {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if out == base {
        None
    } else {
        Some(out)
    }
}

fn normalize_mods(mods: Option<Vec<ServerMod>>) -> Vec<ServerMod> {
    let Some(entries) = mods else { return vec![] };
    let mut seen: HashMap<String, ServerMod> = HashMap::new();
    for m in entries {
        if m.filename.is_empty() || m.filename.ends_with(".keep") {
            continue;
        }
        seen.entry(m.filename.clone()).or_insert(ServerMod {
            filename: m.filename,
            url: if m.url.as_ref().map_or(false, |u| !u.is_empty()) {
                m.url
            } else {
                None
            },
            size: m.size.filter(|s| *s > 0),
            hash: m
                .hash
                .filter(|h| !h.trim().is_empty())
                .map(|h| h.trim().to_string()),
        });
    }
    seen.into_values().collect()
}

fn is_fresh_instance(dir: &Path) -> bool {
    let allowed_files = ["instance.json"];
    let allowed_dirs = [
        "mods",
        "config",
        "saves",
        "resourcepacks",
        "shaderpacks",
        "datapacks",
        "logs",
        "crash-reports",
    ];

    if !dir.exists() {
        return true;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return true;
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        if ft.is_dir() {
            if !allowed_dirs.contains(&name.as_str()) {
                return false;
            }
            if let Ok(child_entries) = fs::read_dir(entry.path()) {
                if child_entries.count() > 0 {
                    return false;
                }
            }
        } else if ft.is_file() {
            if !allowed_files.contains(&name.as_str()) {
                return false;
            }
        }
    }

    true
}

fn map_invitations(data: serde_json::Value) -> Vec<Invitation> {
    data.get("invitations")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|inv| {
                    let invitation_obj = inv.get("invitation").unwrap_or(inv);
                    let instance_obj = inv.get("instance").unwrap_or(inv);

                    Invitation {
                        id: invitation_obj
                            .get("id")
                            .or_else(|| inv.get("id"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        instance_id: instance_obj
                            .get("id")
                            .or_else(|| inv.get("instanceId"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        instance_name: instance_obj
                            .get("name")
                            .or_else(|| inv.get("instanceName"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        instance_icon: instance_obj
                            .get("iconUrl")
                            .or_else(|| inv.get("instanceIcon"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        invited_by: invitation_obj
                            .get("invitedBy")
                            .or_else(|| inv.get("invitedBy"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        inviter_name: inv
                            .get("inviter")
                            .and_then(|v| v.get("catidUsername").or_else(|| v.get("username")))
                            .or_else(|| inv.get("inviterName"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        role: invitation_obj
                            .get("role")
                            .or_else(|| inv.get("role"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("member")
                            .to_string(),
                        message: invitation_obj
                            .get("message")
                            .or_else(|| inv.get("message"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        status: invitation_obj
                            .get("status")
                            .or_else(|| inv.get("status"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("pending")
                            .to_string(),
                        created_at: invitation_obj
                            .get("createdAt")
                            .or_else(|| inv.get("createdAt"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}



async fn fetch_server_content(
    cloud_id: &str,
    auth_token: &str,
    manifest_only: bool,
) -> Result<(ServerContentPayload, bool), String> {
    let manifest_cache_key = cloud_id.to_string();
    let (_cache_valid, cached_revision) = {
        let cache = MANIFEST_CACHE.lock().unwrap();
        let entry = cache.get(&manifest_cache_key);
        let valid = entry
            .map(|e| now_ms() - e.cached_at < MANIFEST_CACHE_TTL_MS)
            .unwrap_or(false);
        let rev = entry.filter(|_| valid).map(|e| e.revision.clone());
        (valid, rev)
    };

    let endpoint = if manifest_only {
        format!("{}/instances/{}/content?manifest=1", API_URL, cloud_id)
    } else {
        format!("{}/instances/{}/content", API_URL, cloud_id)
    };

    let mut effective_token = auth_token.to_string();

    let mut build_req = |token: &str| {
        let mut req = client()
            .get(&endpoint)
            .header("Authorization", format!("Bearer {}", token));
        if let Some(ref rev) = cached_revision {
            req = req.header("If-None-Match", format!("\"{}\"", rev));
        }
        req
    };

    let mut resp = build_req(&effective_token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(fresh) = crate::auth::refresh_api_token().await {
            effective_token = fresh;
            resp = build_req(&effective_token)
                .send()
                .await
                .map_err(|e| format!("Network error: {}", e))?;
        }
    }

    if resp.status() == 304 {
        let cache = MANIFEST_CACHE.lock().unwrap();
        if let Some(entry) = cache.get(&manifest_cache_key) {
            
            
            
            if !manifest_only && !entry.has_urls {
                
            } else {
                return Ok((
                    ServerContentPayload {
                        manifest_revision: Some(entry.revision.clone()),
                        urls_included: Some(!manifest_only),
                        mods: Some(entry.mods.clone()),
                        modpack_url: entry.modpack_url.clone(),
                        modpack_type: entry.modpack_type.clone(),
                    },
                    true,
                ));
            }
        }
    }

    
    
    
    
    if resp.status() == 304 {
        let req = build_req(&effective_token);
        let fresh_resp = req
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;
        if !fresh_resp.status().is_success() {
            let status = fresh_resp.status();
            let text = fresh_resp.text().await.unwrap_or_default();
            return Err(format!(
                "Failed to fetch content: HTTP {} - {}",
                status, text
            ));
        }
        let data: ServerContentPayload = fresh_resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse content: {}", e))?;
        let normalized = normalize_mods(data.mods.clone());
        if let Some(ref rev) = data.manifest_revision {
            MANIFEST_CACHE.lock().unwrap().insert(
                manifest_cache_key,
                ManifestCacheEntry {
                    revision: rev.clone(),
                    cached_at: now_ms(),
                    mods: normalized,
                    has_urls: !manifest_only,
                    modpack_url: data.modpack_url.clone(),
                    modpack_type: data.modpack_type.clone(),
                },
            );
        }
        return Ok((data, false));
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to fetch content: HTTP {} - {}",
            status, text
        ));
    }

    let data: ServerContentPayload = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse content: {}", e))?;

    let normalized = normalize_mods(data.mods.clone());

    if let Some(ref rev) = data.manifest_revision {
        MANIFEST_CACHE.lock().unwrap().insert(
            manifest_cache_key,
            ManifestCacheEntry {
                revision: rev.clone(),
                cached_at: now_ms(),
                mods: normalized,
                has_urls: !manifest_only,
                modpack_url: data.modpack_url.clone(),
                modpack_type: data.modpack_type.clone(),
            },
        );
    }

    Ok((data, false))
}

async fn fetch_instance_metadata(
    cloud_id: &str,
    auth_token: &str,
) -> Result<(serde_json::Value, Option<String>), String> {
    let metadata_cache_key = cloud_id.to_string();
    let cached_etag = {
        let cache = METADATA_CACHE.lock().unwrap();
        cache
            .get(&metadata_cache_key)
            .filter(|e| now_ms() - e.cached_at < MANIFEST_CACHE_TTL_MS)
            .map(|e| e.etag.clone())
    };

    let build_req = |token: &str| {
        let mut req = client()
            .get(format!("{}/instances/{}", API_URL, cloud_id))
            .header("Authorization", format!("Bearer {}", token));
        if let Some(ref etag) = cached_etag {
            req = req.header("If-None-Match", etag.clone());
        }
        req
    };

    let mut resp = build_req(auth_token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(fresh) = crate::auth::refresh_api_token().await {
            resp = build_req(&fresh)
                .send()
                .await
                .map_err(|e| format!("Network error: {}", e))?;
        }
    }

    if resp.status() == 304 {
        return Ok((serde_json::Value::Null, None));
    }

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let new_etag = resp
        .headers()
        .get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Some(ref etag) = new_etag {
        METADATA_CACHE.lock().unwrap().insert(
            metadata_cache_key,
            MetadataCacheEntry {
                etag: etag.clone(),
                cached_at: now_ms(),
            },
        );
    } else {
        METADATA_CACHE.lock().unwrap().remove(&metadata_cache_key);
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse metadata: {}", e))?;

    Ok((data, new_etag))
}







async fn fetch_managed_mods(cloud_id: &str, auth_token: &str) -> Result<Vec<ManagedMod>, String> {
    let url = format!("{}/instances/{}/modpack/mods", API_URL, cloud_id);
    let mut resp = client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        if let Ok(fresh) = crate::auth::refresh_api_token().await {
            resp = client()
                .get(&url)
                .header("Authorization", format!("Bearer {}", fresh))
                .send()
                .await
                .map_err(|e| format!("Network error: {}", e))?;
        }
    }

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let data: ManagedModsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse managed mods: {}", e))?;

    Ok(data.mods)
}




fn cleanup_unmanaged_mods(instance_dir: &str, keep: &std::collections::HashSet<String>) {
    // Deletes files from the instance dir — never run while a migration or
    // other exclusive op is in flight.
    let Some(_guard) = crate::op_guard::OperationGuard::try_shared() else {
        return;
    };
    let mods_dir = Path::new(instance_dir).join("mods");
    if !mods_dir.exists() {
        return;
    }

    
    
    let locked: Vec<String> = crate::instances::instances_list_sync()
        .into_iter()
        .find(|i| i.game_directory == instance_dir)
        .and_then(|i| i.locked_mods)
        .unwrap_or_default();

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".jar") && !name.ends_with(".jar.disabled") {
                continue;
            }
            let real_name = name.replace(".jar.disabled", ".jar");
            if locked.contains(&name) || locked.contains(&real_name) {
                continue;
            }
            if !keep.contains(&name) && !keep.contains(&real_name) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

async fn sync_managed_mods(
    app_handle: &tauri::AppHandle,
    instance_dir: &str,
    managed_mods: Vec<ManagedMod>,
    cancel: &crate::op_guard::CancelToken,
) -> Result<Vec<(String, String)>, String> {
    emit_sync_progress(app_handle, "sync-start", "", None, None, None, None);

    let dir = Path::new(instance_dir);
    let mods_dir = dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| format!("Dir error: {}", e))?;

    let mut failed: Vec<(String, String)> = Vec::new();

    
    
    
    let managed_filenames: std::collections::HashSet<String> = managed_mods
        .iter()
        .filter(|m| {
            m.path
                .as_deref()
                .map_or(true, |p| p.replace('\\', "/").starts_with("mods/"))
        })
        .map(|m| m.file_name.clone())
        .collect();

    // Build download items for files that need updating
    let mut items: Vec<crate::download::DownloadItem> = Vec::new();
    for m in &managed_mods {
        let file_path = match m.path.as_deref().filter(|p| !p.is_empty()) {
            Some(p) => {
                let Some(joined) = safe_join(dir, p) else {
                    failed.push((m.file_name.clone(), "Path traversal blocked".into()));
                    continue;
                };
                if let Some(parent) = joined.parent() {
                    fs::create_dir_all(parent).ok();
                }
                joined
            }
            None => mods_dir.join(&m.file_name),
        };

        let needs_download = if file_path.exists() {
            if let Some(ref hash) = m.file_hash {
                let hash_ok = verify_file_hash(&file_path, hash).unwrap_or(false);
                let size_ok = m
                    .file_size
                    .map(|fs| {
                        file_path
                            .metadata()
                            .map(|meta| meta.len() as i64 == fs)
                            .unwrap_or(false)
                    })
                    .unwrap_or(true);
                !hash_ok || !size_ok
            } else if let Some(fs) = m.file_size {
                if fs > 0 {
                    file_path
                        .metadata()
                        .map(|meta| meta.len() as i64 != fs)
                        .unwrap_or(true)
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            true
        };

        if !needs_download {
            continue;
        }

        items.push(
            crate::download::DownloadItem::new(m.download_url.clone(), file_path)
                .with_label(m.file_name.clone()),
        );
    }

    // Download all needed files concurrently
    if !items.is_empty() {
        let config = crate::download::DownloadConfig {
            concurrency: crate::config::get_max_concurrent_downloads(),
            max_retries: 3,
        };
        let result = crate::download::download_batch(
            items,
            &config,
            Some(cancel.flag_arc()),
            |current, total, _label| {
                let pct = if total > 0 {
                    (current * 100) / total
                } else {
                    100
                };
                emit_sync_progress(
                    app_handle,
                    "sync-download",
                    "",
                    Some(current),
                    Some(total),
                    Some(pct),
                    None,
                );
            },
        )
        .await;

        for (label, err) in result.failed {
            log::error!("[Cloud Sync] Failed to download {}: {}", label, err);
            failed.push((label, err));
        }
        for (label, err) in result.missing_on_server {
            log::warn!("[Cloud Sync] Missing on server {}: {}", label, err);
            failed.push((label, err));
        }
    }

    emit_sync_progress(
        app_handle,
        "sync-clean",
        "Cleaning up extra mods...",
        None,
        None,
        None,
        None,
    );
    cleanup_unmanaged_mods(instance_dir, &managed_filenames);

    emit_sync_progress(
        app_handle,
        "sync-complete",
        "Sync complete",
        None,
        None,
        Some(100),
        None,
    );

    Ok(failed)
}



fn emit_sync_progress(
    app_handle: &tauri::AppHandle,
    type_: &str,
    task: &str,
    current: Option<u32>,
    total: Option<u32>,
    percent: Option<u32>,
    filename: Option<&str>,
) {
    let payload = SyncProgressPayload {
        type_: type_.to_string(),
        task: task.to_string(),
        current,
        total,
        percent,
        filename: filename.map(|s| s.to_string()),
    };
    let _ = app_handle.emit("install-progress", payload);
}

fn emit_instances_updated(app_handle: &tauri::AppHandle) {
    let _ = app_handle.emit("instances-updated", serde_json::json!({}));
}







pub async fn sync_instance_for_launch(
    app_handle: &tauri::AppHandle,
    instance: &crate::instances::GameInstance,
) -> Result<Vec<(String, String)>, String> {
    let Some(cloud_id) = instance.cloud_id.as_deref() else {
        return Ok(Vec::new());
    };
    // Per-operation cancel token: a Cancel pressed during this sync aborts it
    // (and any other op running at that moment), but starting a new op never
    // wipes an in-flight cancel, and this fresh token is immune to cancels
    // issued before it was created.
    let cancel = crate::op_guard::CancelToken::new();
    let api_token = get_api_token()?;
    sync_server_mods(
        app_handle,
        &instance.game_directory,
        cloud_id,
        &api_token,
        &cancel,
    )
    .await
}




#[tauri::command]
pub async fn instance_check_integrity(app_handle: tauri::AppHandle, id: String) -> SimpleResult {
    let _guard = match crate::op_guard::OperationGuard::try_shared() {
        Some(g) => g,
        None => {
            return SimpleResult {
                ok: false,
                error: Some(
                    "A folder migration or another operation is in progress. Try again when it finishes.".to_string(),
                ),
                message: None,
            }
        }
    };

    let instance = match crate::instances::instances_get(id) {
        Some(i) => i,
        None => {
            return SimpleResult {
                ok: false,
                error: Some("Instance not found".to_string()),
                message: None,
            }
        }
    };

    if instance.cloud_id.is_none() {
        return SimpleResult {
            ok: true,
            error: None,
            message: Some("Local instance — nothing to verify".to_string()),
        };
    }

    match sync_instance_for_launch(&app_handle, &instance).await {
        Ok(failed) => {
            emit_instances_updated(&app_handle);
            if failed.is_empty() {
                SimpleResult {
                    ok: true,
                    error: None,
                    message: Some("Sync complete".to_string()),
                }
            } else {
                let preview = failed
                    .iter()
                    .take(5)
                    .map(|(f, _)| f.clone())
                    .collect::<Vec<_>>()
                    .join(", ");
                SimpleResult {
                    ok: false,
                    error: Some(format!(
                        "{} file(s) failed to download: {preview}{}",
                        failed.len(),
                        if failed.len() > 5 { ", …" } else { "" }
                    )),
                    message: None,
                }
            }
        }
        Err(e) => SimpleResult {
            ok: false,
            error: Some(e),
            message: None,
        },
    }
}

async fn sync_server_mods(
    app_handle: &tauri::AppHandle,
    instance_dir: &str,
    cloud_id: &str,
    auth_token: &str,
    cancel: &crate::op_guard::CancelToken,
) -> Result<Vec<(String, String)>, String> {
    // NOTE: cancellation is scoped to the entry command's per-operation token
    // (instances_cloud_install / sync_instance_for_launch)
    // / sync_instance_for_launch), NOT here — the UI shows Cancel optimistically
    // the instant the user clicks, so resetting this deep in the flow would wipe
    // a Cancel that already arrived (pressing Cancel immediately did nothing).
    emit_sync_progress(app_handle, "sync-start", "", None, None, None, None);

    let (manifest_data, _manifest_not_modified) =
        fetch_server_content(cloud_id, auth_token, true).await?;

    
    if let Ok((metadata, _)) = fetch_instance_metadata(cloud_id, auth_token).await {
        if metadata
            .get("id")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.is_empty())
        {
            let _ = import_cloud_instance(metadata, cloud_id).await;
        }
    }

    
    
    
    
    
    if let Some(url) = manifest_data.modpack_url.as_deref() {
        emit_sync_progress(app_handle, "sync-download", "", None, None, None, None);
        match crate::modpack::install_mrpack_url_into_dir(
            app_handle,
            url,
            Path::new(instance_dir),
            cancel.flag(),
        )
        .await
        {
            Ok(report) => {
                emit_sync_progress(
                    app_handle,
                    "sync-clean",
                    "Cleaning up extra mods...",
                    None,
                    None,
                    None,
                    None,
                );
                let keep: std::collections::HashSet<String> =
                    report.pack_mod_files.into_iter().collect();
                cleanup_unmanaged_mods(instance_dir, &keep);
                emit_sync_progress(
                    app_handle,
                    "sync-complete",
                    "Sync complete",
                    None,
                    None,
                    Some(100),
                    None,
                );
                return Ok(report.failed);
            }
            Err(e) if e == crate::modpack::CANCELLED_SENTINEL => {
                
                
                
                return Err(e);
            }
            Err(e) => {
                log::warn!(
                    "[Cloud Sync] .mrpack fast path failed ({e}) — falling back to per-file sync"
                );
            }
        }
    }

    
    match fetch_managed_mods(cloud_id, auth_token).await {
        Ok(managed_mods) if !managed_mods.is_empty() => {
            return sync_managed_mods(app_handle, instance_dir, managed_mods, cancel).await;
        }
        _ => {}
    }

    let mut server_mods = normalize_mods(manifest_data.mods);
    let dir = Path::new(instance_dir);
    let is_fresh = is_fresh_instance(dir);

    if !is_fresh {
        server_mods.retain(|m| {
            m.filename
                .replace('\\', "/")
                .to_lowercase()
                .starts_with("mods/")
        });
    }

    emit_sync_progress(app_handle, "sync-check", "", None, None, None, None);

    

    let mut queue: Vec<ServerMod> = Vec::new();
    let instance_path = Path::new(instance_dir);

    for m in &server_mods {
        
        
        
        
        
        let Some(file_path) = safe_join(instance_path, &m.filename) else {
            continue;
        };

        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).ok();
        }

        if file_path.exists() {
            let size_ok = m.size.map_or(true, |size| {
                file_path
                    .metadata()
                    .map(|m| m.len() == size)
                    .unwrap_or(false)
            });
            let hash_ok = size_ok
                && m.hash
                    .as_ref()
                    .map_or(true, |h| verify_file_hash(&file_path, h).unwrap_or(false));
            if hash_ok {
                continue;
            }
        }

        queue.push(m.clone());
    }

    
    if queue.iter().any(|m| m.url.is_none()) {
        let (full_data, _) = fetch_server_content(cloud_id, auth_token, false).await?;
        let full_mods = normalize_mods(full_data.mods);
        let by_filename: HashMap<&str, &ServerMod> =
            full_mods.iter().map(|m| (m.filename.as_str(), m)).collect();

        for qm in &mut queue {
            if qm.url.is_some() {
                continue;
            }
            if let Some(full) = by_filename.get(qm.filename.as_str()) {
                qm.url.clone_from(&full.url);
                if qm.size.is_none() {
                    qm.size = full.size;
                }
                if qm.hash.is_none() {
                    qm.hash.clone_from(&full.hash);
                }
            }
        }
    }

    let still_missing = queue.iter().filter(|m| m.url.is_none()).count();
    if still_missing > 0 {
        log::warn!(
            "[Cloud Sync] {} file(s) still have no URL after full content fetch",
            still_missing
        );
    }

    

    // Build download items from the queue
    let mut items: Vec<crate::download::DownloadItem> = Vec::new();
    let mut failed: Vec<(String, String)> = Vec::new();
    let mut no_url_count = 0u32;

    for m in &queue {
        let url = match m.url.as_ref() {
            Some(u) => u.clone(),
            None => {
                log::warn!("[Cloud Sync] No URL for {}", m.filename);
                failed.push((m.filename.clone(), "No URL".into()));
                no_url_count += 1;
                continue;
            }
        };

        let Some(file_path) = safe_join(instance_path, &m.filename) else {
            failed.push((m.filename.clone(), "Path traversal blocked".into()));
            no_url_count += 1;
            continue;
        };

        items.push(
            crate::download::DownloadItem::new(url, file_path)
                .with_label(m.filename.clone()),
        );
    }

    let total_items = items.len() as u32;
    if !items.is_empty() {
        let config = crate::download::DownloadConfig {
            concurrency: crate::config::get_max_concurrent_downloads(),
            max_retries: 3,
        };
        let result = crate::download::download_batch(
            items,
            &config,
            Some(cancel.flag_arc()),
            |current, total, _label| {
                let pct = if total > 0 {
                    (current * 100) / total
                } else {
                    100
                };
                emit_sync_progress(
                    app_handle,
                    "sync-download",
                    "",
                    Some(current),
                    Some(total),
                    Some(pct),
                    None,
                );
            },
        )
        .await;

        for (label, err) in result.failed {
            log::error!("[Cloud Sync] Download failed {}: {}", label, err);
            failed.push((label, err));
        }
        for (label, err) in result.missing_on_server {
            log::warn!(
                "[Cloud Sync] Skipping {} — not on server (server-side): {}",
                label, err
            );
            failed.push((label, err));
        }
    }

    let missing_count = failed.len() as u32 - no_url_count;
    if missing_count > 0 {
        log::warn!(
            "[Cloud Sync] {} file(s) missing on server, skipped",
            missing_count
        );
    }

    let real_attempts = total_items;
    if real_attempts > 0 && failed.len() as u32 == real_attempts {
        let reason = failed.first().map(|(_, r)| r.as_str()).unwrap_or("unknown");
        return Err(format!(
            "Sync failed: could not download any of {} file(s) ({})",
            failed.len(),
            reason
        ));
    }

    

    if !is_fresh {
        emit_sync_progress(
            app_handle,
            "sync-clean",
            "Cleaning up extra mods...",
            None,
            None,
            None,
            None,
        );

        let keep: std::collections::HashSet<String> = server_mods
            .iter()
            .map(|m| m.filename.replace('\\', "/"))
            .filter_map(|f| f.strip_prefix("mods/").map(|rest| rest.to_string()))
            .collect();
        cleanup_unmanaged_mods(instance_dir, &keep);
    }

    emit_sync_progress(
        app_handle,
        "sync-complete",
        "Sync complete",
        None,
        None,
        Some(100),
        None,
    );
    
    Ok(failed)
}

async fn import_cloud_instance(
    data: serde_json::Value,
    cloud_id: &str,
) -> Result<crate::instances::GameInstance, String> {
    let name = data
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Cloud Instance");
    let mc_version = data
        .get("minecraftVersion")
        .or_else(|| data.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or("1.21");
    let loader_str = data
        .get("loaderType")
        .or_else(|| data.get("loader"))
        .and_then(|v| v.as_str())
        .unwrap_or("vanilla");
    let loader_version = data.get("loaderVersion").and_then(|v| v.as_str());
    let icon_url = data
        .get("iconUrl")
        .or_else(|| data.get("icon"))
        .and_then(|v| v.as_str());
    let banner_url = data.get("bannerUrl").and_then(|v| v.as_str());

    let loader = match loader_str.to_lowercase().as_str() {
        "fabric" => crate::instances::LoaderType::Fabric,
        "forge" => crate::instances::LoaderType::Forge,
        "neoforge" => crate::instances::LoaderType::Neoforge,
        "quilt" => crate::instances::LoaderType::Quilt,
        _ => crate::instances::LoaderType::Vanilla,
    };

    
    
    
    
    
    let mut matches: Vec<crate::instances::GameInstance> = crate::instances::instances_list_sync()
        .into_iter()
        .filter(|i| i.cloud_id.as_deref() == Some(cloud_id))
        .collect();
    matches.sort_by_key(|i| {
        fs::read_dir(Path::new(&i.game_directory).join("mods"))
            .map(|entries| entries.flatten().count())
            .unwrap_or(0)
    });
    
    let existing = matches.pop();
    for dupe in matches {
        // .await required — a bare call drops the async future unrun, leaving
        // duplicate instances behind instead of pruning them.
        let _ = crate::instances::instances_delete(dupe.id).await;
    }

    let instance_id = match existing {
        Some(inst) => inst.id,
        None => {
            let options = crate::instances::CreateInstanceOptions {
                name: name.to_string(),
                minecraft_version: mc_version.to_string(),
                loader: Some(loader),
                loader_version: loader_version.map(|s| s.to_string()),
                icon: icon_url.map(|s| s.to_string()),
            };
            crate::instances::instances_create(options)?.id
        }
    };

    
    
    
    
    if let Some(icon) = icon_url {
        let dir = crate::instances::get_instance_dir(&instance_id);
        if let Ok(resp) = client().get(icon).send().await {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    let _ = fs::create_dir_all(&dir);
                    let _ = fs::write(dir.join("icon.png"), &bytes);
                }
            }
        }
    }

    let mut updates = serde_json::json!({
        "cloudId": cloud_id,
    });
    if let Some(icon) = icon_url {
        updates["icon"] = serde_json::json!(icon);
    }
    if let Some(banner) = banner_url {
        updates["banner"] = serde_json::json!(banner);
    }

    crate::instances::instances_update(instance_id, updates)?
        .ok_or_else(|| "Failed to update instance".to_string())
}



#[tauri::command]
pub async fn instances_get_joined_servers(_app_handle: tauri::AppHandle) -> JoinedServersResult {
    let resp = match send_authed(|token| {
        client()
            .get(format!("{}/instances", API_URL))
            .header("Authorization", format!("Bearer {token}"))
    })
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return JoinedServersResult {
                ok: false,
                data: None,
                error: Some(format!("Network error: {}", e)),
            }
        }
    };

    if resp.status() == 401 {
        return JoinedServersResult {
            ok: false,
            data: None,
            error: Some("INVALID_TOKEN: Session expired, please login again".to_string()),
        };
    }

    if !resp.status().is_success() {
        return JoinedServersResult {
            ok: false,
            data: None,
            error: Some(format!("HTTP {}", resp.status())),
        };
    }

    let data: serde_json::Value = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return JoinedServersResult {
                ok: false,
                data: None,
                error: Some(format!("Parse error: {}", e)),
            }
        }
    };

    JoinedServersResult {
        ok: true,
        data: Some(JoinedServersData {
            owned: data
                .get("owned")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default(),
            member: data
                .get("member")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default(),
        }),
        error: None,
    }
}

#[tauri::command]
pub async fn instance_join(app_handle: tauri::AppHandle, key: String) -> SimpleResult {
    let formatted_key = key.trim().to_uppercase();
    let body = serde_json::json!({ "key": formatted_key });

    let resp = match send_authed(|token| {
        client()
            .post(format!("{}/instances/join", API_URL))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .json(&body)
    })
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Network error: {}", e)),
                message: None,
            }
        }
    };

    let status = resp.status();
    let data: serde_json::Value = match resp.json().await {
        Ok(d) => d,
        Err(_) => serde_json::json!({}),
    };

    if status.is_success() {
        let message = data
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Joined successfully")
            .to_string();

        if let Some(instance_data) = data.get("instance") {
            let cloud_id = instance_data
                .get("id")
                .or_else(|| instance_data.get("storagePath"))
                .and_then(|v| v.as_str())
                .unwrap_or(&formatted_key);
            let _ = import_cloud_instance(instance_data.clone(), cloud_id).await;
            emit_instances_updated(&app_handle);
        }

        SimpleResult {
            ok: true,
            error: None,
            message: Some(message),
        }
    } else {
        let error_msg = data
            .get("error")
            .and_then(|v| v.as_str())
            .or_else(|| data.get("message").and_then(|v| v.as_str()))
            .unwrap_or("Failed to join instance")
            .to_string();
        SimpleResult {
            ok: false,
            error: Some(error_msg),
            message: None,
        }
    }
}



#[tauri::command]
pub async fn instance_join_public(instance_id: String) -> SimpleResult {
    let resp = match send_authed(|token| {
        client()
            .post(format!("{}/instances/{}/join", API_URL, instance_id))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Network error: {}", e)),
                message: None,
            }
        }
    };

    let status = resp.status();
    let data: serde_json::Value = resp.json().await.unwrap_or_else(|_| serde_json::json!({}));

    if status.is_success() {
        SimpleResult {
            ok: true,
            error: None,
            message: data
                .get("message")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        }
    } else {
        let error_msg = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Failed to join instance")
            .to_string();
        SimpleResult {
            ok: false,
            error: Some(error_msg),
            message: None,
        }
    }
}

#[tauri::command]
pub async fn instance_leave(instance_id: String) -> SimpleResult {
    let resp = match send_authed(|token| {
        client()
            .post(format!("{}/instances/{}/leave", API_URL, instance_id))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Network error: {}", e)),
                message: None,
            }
        }
    };

    let status = resp.status();
    if status.is_success() {
        SimpleResult {
            ok: true,
            error: None,
            message: None,
        }
    } else {
        let data: serde_json::Value = resp.json().await.unwrap_or(serde_json::json!({}));
        let error_msg = data
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Failed to leave instance")
            .to_string();
        SimpleResult {
            ok: false,
            error: Some(error_msg),
            message: None,
        }
    }
}

#[tauri::command]
pub async fn instances_cloud_install(app_handle: tauri::AppHandle, id: String) -> SimpleResult {
    let _guard = match crate::op_guard::OperationGuard::try_shared() {
        Some(g) => g,
        None => {
            return SimpleResult {
                ok: false,
                error: Some(
                    "Another operation (install or folder migration) is in progress. Try again when it finishes.".to_string(),
                ),
                message: None,
            }
        }
    };

    let api_token = match get_api_token() {
        Ok(t) => t,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(e),
                message: None,
            }
        }
    };
    let cancel = crate::op_guard::CancelToken::new();

    let resp = match send_authed(|token| {
        client()
            .get(format!("{}/instances", API_URL))
            .header("Authorization", format!("Bearer {token}"))
    })
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Network error: {}", e)),
                message: None,
            }
        }
    };

    let data: serde_json::Value = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Parse error: {}", e)),
                message: None,
            }
        }
    };

    let owned_empty: Vec<serde_json::Value> = vec![];
    let member_empty: Vec<serde_json::Value> = vec![];
    let all_instances: Vec<&serde_json::Value> = data
        .get("owned")
        .and_then(|v| v.as_array())
        .unwrap_or(&owned_empty)
        .iter()
        .chain(
            data.get("member")
                .and_then(|v| v.as_array())
                .unwrap_or(&member_empty)
                .iter(),
        )
        .collect();

    let target = all_instances
        .iter()
        .find(|i| {
            i.get("storagePath").and_then(|v| v.as_str()) == Some(&id)
                || i.get("id").and_then(|v| v.as_str()) == Some(&id)
        })
        .copied();

    let target = match target {
        Some(t) => t,
        None => {
            return SimpleResult {
                ok: false,
                error: Some("Cloud instance not found in your list".to_string()),
                message: None,
            }
        }
    };

    let cloud_id = target
        .get("id")
        .or_else(|| target.get("storagePath"))
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();

    let existed_before = crate::instances::instances_list_sync()
        .iter()
        .any(|i| i.cloud_id.as_deref() == Some(&cloud_id));

    let instance = match import_cloud_instance((*target).clone(), &cloud_id).await {
        Ok(inst) => inst,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(e),
                message: None,
            }
        }
    };

    emit_instances_updated(&app_handle);

    match sync_server_mods(
        &app_handle,
        &instance.game_directory,
        &cloud_id,
        &api_token,
        &cancel,
    )
    .await
    {
        Ok(failed) if failed.is_empty() => {
            emit_instances_updated(&app_handle);
            SimpleResult {
                ok: true,
                error: None,
                message: Some("Install complete".to_string()),
            }
        }
        Ok(failed) => {
            emit_instances_updated(&app_handle);
            let preview = failed
                .iter()
                .take(5)
                .map(|(f, _)| f.clone())
                .collect::<Vec<_>>()
                .join(", ");
            SimpleResult {
                ok: false,
                error: Some(format!(
                    "{} file(s) failed to download — the modpack is incomplete: {preview}{}",
                    failed.len(),
                    if failed.len() > 5 { ", …" } else { "" }
                )),
                message: None,
            }
        }
        Err(e) => {
            
            
            
            
            if !existed_before {
                // Must .await — instances_delete is async; without it the
                // future is dropped unrun and the instance survives, so a
                // cancelled install still shows as "installed".
                let _ = crate::instances::instances_delete(instance.id.clone()).await;
            }
            emit_instances_updated(&app_handle);
            SimpleResult {
                ok: false,
                error: Some(e),
                message: None,
            }
        }
    }
}

#[tauri::command]
pub async fn instances_cloud_sync(app_handle: tauri::AppHandle) -> SimpleResult {
    let _guard = match crate::op_guard::OperationGuard::try_shared() {
        Some(g) => g,
        None => {
            return SimpleResult {
                ok: false,
                error: Some(
                    "Another operation (install or folder migration) is in progress. Try again when it finishes.".to_string(),
                ),
                message: None,
            }
        }
    };
    let resp = match send_authed(|token| {
        client()
            .get(format!("{}/instances", API_URL))
            .header("Authorization", format!("Bearer {token}"))
    })
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Network error: {}", e)),
                message: None,
            }
        }
    };

    let data: serde_json::Value = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(format!("Parse error: {}", e)),
                message: None,
            }
        }
    };

    let owned_empty: Vec<serde_json::Value> = vec![];
    let member_empty: Vec<serde_json::Value> = vec![];
    let all_instances: Vec<&serde_json::Value> = data
        .get("owned")
        .and_then(|v| v.as_array())
        .unwrap_or(&owned_empty)
        .iter()
        .chain(
            data.get("member")
                .and_then(|v| v.as_array())
                .unwrap_or(&member_empty)
                .iter(),
        )
        .collect();

    let local_instances = crate::instances::instances_list_sync();

    for target in &all_instances {
        let cloud_id = target
            .get("id")
            .or_else(|| target.get("storagePath"))
            .and_then(|v| v.as_str());

        let cloud_id = match cloud_id {
            Some(c) => c.to_string(),
            None => continue,
        };

        let exists = local_instances
            .iter()
            .any(|i| i.cloud_id.as_deref() == Some(&cloud_id));

        if exists {
            let _ = import_cloud_instance((*target).clone(), &cloud_id).await;
        }
    }

    emit_instances_updated(&app_handle);

    SimpleResult {
        ok: true,
        error: None,
        message: None,
    }
}

#[tauri::command]
pub async fn cloud_instance_sync_managed(app_handle: tauri::AppHandle, id: String) -> SimpleResult {
    let _guard = match crate::op_guard::OperationGuard::try_shared() {
        Some(g) => g,
        None => {
            return SimpleResult {
                ok: false,
                error: Some(
                    "Another operation (install or folder migration) is in progress. Try again when it finishes.".to_string(),
                ),
                message: None,
            }
        }
    };
    let api_token = match get_api_token() {
        Ok(t) => t,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(e),
                message: None,
            }
        }
    };

    let instance = match crate::instances::instances_get(id.clone()) {
        Some(i) => i,
        None => {
            return SimpleResult {
                ok: false,
                error: Some("Instance not found".to_string()),
                message: None,
            }
        }
    };

    let cloud_id = match instance.cloud_id.as_deref() {
        Some(c) => c.to_string(),
        None => {
            return SimpleResult {
                ok: false,
                error: Some("Not a cloud instance".to_string()),
                message: None,
            }
        }
    };

    let managed_mods = match fetch_managed_mods(&cloud_id, &api_token).await {
        Ok(mods) => mods,
        Err(e) => {
            return SimpleResult {
                ok: false,
                error: Some(e),
                message: None,
            }
        }
    };

    if managed_mods.is_empty() {
        return SimpleResult {
            ok: true,
            error: None,
            message: Some("No managed mods".to_string()),
        };
    }

    let cancel = crate::op_guard::CancelToken::new();
    match sync_managed_mods(&app_handle, &instance.game_directory, managed_mods, &cancel).await {
        Ok(failed) if failed.is_empty() => {
            emit_instances_updated(&app_handle);
            SimpleResult {
                ok: true,
                error: None,
                message: Some("Sync complete".to_string()),
            }
        }
        Ok(failed) => {
            emit_instances_updated(&app_handle);
            let preview = failed
                .iter()
                .take(5)
                .map(|(f, _)| f.clone())
                .collect::<Vec<_>>()
                .join(", ");
            SimpleResult {
                ok: false,
                error: Some(format!(
                    "{} file(s) failed: {}{}",
                    failed.len(),
                    preview,
                    if failed.len() > 5 { ", …" } else { "" }
                )),
                message: None,
            }
        }
        Err(e) => SimpleResult {
            ok: false,
            error: Some(e),
            message: None,
        },
    }
}



#[tauri::command]
pub async fn invitations_fetch() -> Result<Vec<Invitation>, String> {
    let resp = send_authed(|token| {
        client()
            .get(format!("{}/invitations", API_URL))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(map_invitations(data))
}

#[tauri::command]
pub async fn invitations_accept(invitation_id: String) -> Result<bool, String> {
    let resp = send_authed(|token| {
        client()
            .put(format!("{}/invitations/{}/accept", API_URL, invitation_id))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    .map_err(|e| format!("Network error: {}", e))?;

    Ok(resp.status().is_success())
}

#[tauri::command]
pub async fn invitations_reject(invitation_id: String) -> Result<bool, String> {
    let resp = send_authed(|token| {
        client()
            .put(format!("{}/invitations/{}/reject", API_URL, invitation_id))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    .map_err(|e| format!("Network error: {}", e))?;

    Ok(resp.status().is_success())
}



#[tauri::command]
pub async fn notifications_fetch_announcements() -> Result<Vec<serde_json::Value>, String> {
    let resp = client()
        .get(format!("{}/announcements", API_URL))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .unwrap_or(serde_json::Value::Array(vec![]));
    Ok(data.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn notifications_fetch_user() -> Result<Vec<serde_json::Value>, String> {
    if get_api_token().is_err() {
        return Ok(vec![]);
    }

    let resp = send_authed(|token| {
        client()
            .get(format!("{}/announcements/notifications", API_URL))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {token}"))
    })
    .await
    .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .unwrap_or(serde_json::Value::Array(vec![]));
    Ok(data.as_array().cloned().unwrap_or_default())
}

#[tauri::command]
pub async fn notifications_sync() -> Result<NotificationSyncResult, String> {
    if get_api_token().is_err() {
        return Ok(NotificationSyncResult {
            notifications: vec![],
            invitations: vec![],
        });
    }

    let resp = match send_authed(|token| {
        client()
            .get(format!("{}/announcements/notifications", API_URL))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {token}"))
    })
    .await
    {
        Ok(r) => r,
        Err(_) => {
            return Ok(NotificationSyncResult {
                notifications: vec![],
                invitations: vec![],
            })
        }
    };

    if !resp.status().is_success() {
        return Ok(NotificationSyncResult {
            notifications: vec![],
            invitations: vec![],
        });
    }

    let data: serde_json::Value = resp.json().await.unwrap_or(serde_json::json!({}));

    let notifications: Vec<NotificationItem> = data
        .get("notifications")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .map(|n| NotificationItem {
                    id: n
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    user_id: n
                        .get("userId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    type_: n
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    title: n
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    message: n
                        .get("message")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    data: n
                        .get("data")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    action_url: n
                        .get("actionUrl")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    is_read: n.get("isRead").and_then(|v| v.as_bool()).unwrap_or(false),
                    created_at: n
                        .get("createdAt")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    let invitations = map_invitations(data);

    Ok(NotificationSyncResult {
        notifications,
        invitations,
    })
}

#[tauri::command]
pub async fn notifications_mark_read(notification_id: String) -> Result<bool, String> {
    let resp = send_authed(|token| {
        client()
            .put(format!(
                "{}/announcements/notifications/{}/read",
                API_URL, notification_id
            ))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    .map_err(|e| format!("Network error: {}", e))?;

    Ok(resp.status().is_success())
}

#[tauri::command]
pub async fn notifications_delete(notification_id: String) -> Result<bool, String> {
    let resp = send_authed(|token| {
        client()
            .delete(format!(
                "{}/announcements/notifications/{}",
                API_URL, notification_id
            ))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
    })
    .await
    .map_err(|e| format!("Network error: {}", e))?;

    Ok(resp.status().is_success())
}
