use crate::auth::get_session;
use crate::config::get_minecraft_dir;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const CATSKINC_DEFAULT_URL: &str = "https://storage-api.catskin.space";
const API_URL: &str = "https://api.reality.catlabdesign.space";
const PROFILE_CACHE_TTL_MS: u64 = 600_000;
const PROFILE_CACHE_FILE: &str = "minecraft-profile-cache.json";

static PROFILE_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, ProfileCacheEntry>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Serialize, Deserialize)]
struct ProfileCacheEntry {
    fetched_at: u64,
    profile: serde_json::Value,
}

fn profile_cache_path() -> PathBuf {
    crate::config::default_launcher_dir().join(PROFILE_CACHE_FILE)
}

fn load_profile_cache() -> HashMap<String, ProfileCacheEntry> {
    let path = profile_cache_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(cache) = serde_json::from_str(&content) {
                return cache;
            }
        }
    }
    HashMap::new()
}

fn save_profile_cache(cache: &HashMap<String, ProfileCacheEntry>) {
    if let Ok(json) = serde_json::to_string(cache) {
        let path = profile_cache_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&path, json);
    }
}

fn get_cached_profile(key: &str) -> Option<serde_json::Value> {
    let mut cache = PROFILE_CACHE.lock().ok()?;
    if cache.is_empty() {
        *cache = load_profile_cache();
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    if let Some(entry) = cache.get(key) {
        if now - entry.fetched_at < PROFILE_CACHE_TTL_MS {
            return Some(entry.profile.clone());
        }
        cache.remove(key);
        save_profile_cache(&cache);
    }
    None
}

fn set_cached_profile(key: String, profile: serde_json::Value) {
    let mut cache = PROFILE_CACHE.lock().unwrap();
    if cache.is_empty() {
        *cache = load_profile_cache();
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    cache.insert(
        key,
        ProfileCacheEntry {
            fetched_at: now,
            profile,
        },
    );
    save_profile_cache(&cache);
}

fn delete_cached_profile(key: &str) {
    let mut cache = PROFILE_CACHE.lock().unwrap();
    if cache.is_empty() {
        *cache = load_profile_cache();
    }
    cache.remove(key);
    save_profile_cache(&cache);
}

fn catskinc_base_url(game_directory: Option<String>) -> String {
    let base_dir =
        game_directory.unwrap_or_else(|| get_minecraft_dir().to_string_lossy().to_string());
    let config_path = PathBuf::from(&base_dir)
        .join("config")
        .join("catskinc.json");

    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(ip) = parsed.get("catskinCloudIp").and_then(|v| v.as_str()) {
                    let ip = ip.trim().to_string();
                    if !ip.is_empty() {
                        if ip.starts_with("http://") || ip.starts_with("https://") {
                            return ip;
                        }
                        if ip.starts_with("localhost") || ip.starts_with("127.0.0.1") {
                            return format!("http://{}", ip);
                        }
                        return format!("https://{}", ip);
                    }
                }
            }
        }
    }
    CATSKINC_DEFAULT_URL.to_string()
}

fn format_minecraft_uuid(uuid: &str) -> String {
    let cleaned: String = uuid
        .trim()
        .to_lowercase()
        .chars()
        .filter(|&c| c != '-')
        .collect();
    if cleaned.len() == 32 {
        format!(
            "{}-{}-{}-{}-{}",
            &cleaned[0..8],
            &cleaned[8..12],
            &cleaned[12..16],
            &cleaned[16..20],
            &cleaned[20..]
        )
    } else {
        uuid.to_string()
    }
}

fn generate_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let hash = Sha256::digest(nanos.to_string().as_bytes());
    let b = &hash[..16];
    format!("{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15])
}

fn generate_server_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let hash = Sha256::digest(format!("server-{}", nanos).as_bytes());
    hex::encode(&hash[..20])
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

fn parse_png_data_url(data_url: &str) -> Option<Vec<u8>> {
    let prefix = "data:image/png;base64,";
    if let Some(b64) = data_url.strip_prefix(prefix) {
        base64::engine::general_purpose::STANDARD.decode(b64).ok()
    } else {
        None
    }
}

fn build_multipart_body(
    boundary: &str,
    fields: Vec<(&str, Vec<u8>)>,
    files: Vec<(&str, &str, &str, Vec<u8>)>,
) -> Vec<u8> {
    let mut body = Vec::new();
    let b = boundary.as_bytes();
    for (name, value) in fields {
        body.extend_from_slice(b"--");
        body.extend_from_slice(b);
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{}\"\r\n", name).as_bytes(),
        );
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(&value);
        body.extend_from_slice(b"\r\n");
    }
    for (name, filename, mime, data) in files {
        body.extend_from_slice(b"--");
        body.extend_from_slice(b);
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(
            format!(
                "Content-Disposition: form-data; name=\"{}\"; filename=\"{}\"\r\n",
                name, filename
            )
            .as_bytes(),
        );
        body.extend_from_slice(format!("Content-Type: {}\r\n", mime).as_bytes());
        body.extend_from_slice(b"\r\n");
        body.extend_from_slice(&data);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(b"--");
    body.extend_from_slice(b);
    body.extend_from_slice(b"--\r\n");
    body
}

async fn fetch_url_as_data_url(url: &str) -> Option<String> {
    let resp = reqwest::Client::new()
        .get(url)
        .header("x-catskinc-protocol", "2")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:image/png;base64,{}", b64))
}

async fn mojang_join_server(uuid: &str, access_token: &str) -> Result<String, String> {
    let server_id = generate_server_id();
    let body = json!({
        "accessToken": access_token,
        "selectedProfile": uuid,
        "serverId": server_id,
    });

    let resp = reqwest::Client::new()
        .post("https://sessionserver.mojang.com/session/minecraft/join")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Mojang joinServer request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Mojang joinServer verification failed ({status}): {text}"
        ));
    }

    Ok(server_id)
}

async fn catskinc_auth_session(
    base_url: &str,
    username: &str,
    uuid: &str,
    server_id: &str,
) -> Result<String, String> {
    let auth_payload = json!({
        "username": username,
        "uuid": uuid,
        "server_id": server_id,
    });
    let auth_body = serde_json::to_vec(&auth_payload).map_err(|e| e.to_string())?;
    let auth_hash = sha256_hex(&auth_body);
    let request_id = generate_id();

    let resp = reqwest::Client::new()
        .post(format!("{}/auth/session", base_url))
        .header("Content-Type", "application/json; charset=utf-8")
        .header("x-catskinc-protocol", "2")
        .header("x-catskinc-request-id", &request_id)
        .header("x-catskinc-content-sha256", &auth_hash)
        .body(auth_body)
        .send()
        .await
        .map_err(|e| format!("CatSkinC auth request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "CatSkinC session authentication failed ({status}): {text}"
        ));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    data.get("session_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to retrieve session token from CatSkinC.".to_string())
}

fn compute_upload_content_hash(
    uuid: &str,
    slim: bool,
    skin_bytes: &[u8],
    mouth_open_bytes: Option<&[u8]>,
) -> String {
    let mouth_data = mouth_open_bytes.unwrap_or(&[]);
    let mut all = Vec::new();
    append_hash_field(&mut all, "uuid", uuid.as_bytes());
    append_hash_field(&mut all, "slim", if slim { b"true" } else { b"false" });
    append_hash_field(&mut all, "file", skin_bytes);
    append_hash_field(&mut all, "mouth_open", mouth_data);
    append_hash_field(&mut all, "mouth_close", &[]);
    hex::encode(Sha256::digest(&all))
}

fn append_hash_field(output: &mut Vec<u8>, name: &str, value: &[u8]) {
    output.extend_from_slice(name.as_bytes());
    output.push(b':');
    output.extend_from_slice(value.len().to_string().as_bytes());
    output.push(b'\n');
    output.extend_from_slice(value);
    output.push(b'\n');
}

async fn fetch_minecraft_profile(access_token: &str) -> Result<serde_json::Value, String> {
    let resp = reqwest::Client::new()
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Minecraft profile request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Minecraft profile error ({status}): {text}"));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let skins = data
        .get("skins")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let active_skin = skins
        .iter()
        .find(|s| s.get("state").and_then(|v| v.as_str()) == Some("ACTIVE"))
        .or_else(|| skins.first());

    let variant = active_skin
        .and_then(|s| s.get("variant").and_then(|v| v.as_str()))
        .unwrap_or("CLASSIC")
        .to_lowercase();

    Ok(json!({
        "id": data.get("id"),
        "name": data.get("name"),
        "skins": skins,
        "capes": data.get("capes").unwrap_or(&json!([])),
        "activeSkin": active_skin,
        "skinUrl": active_skin.and_then(|s| s.get("url")).and_then(|v| v.as_str()).map(|s| s.to_string()),
        "variant": variant,
    }))
}

fn map_profile(profile_data: &serde_json::Value) -> serde_json::Value {
    let skins = profile_data
        .get("skins")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let active_skin = skins
        .iter()
        .find(|s| s.get("state").and_then(|v| v.as_str()) == Some("ACTIVE"))
        .or_else(|| skins.first());

    json!({
        "id": profile_data.get("id"),
        "name": profile_data.get("name"),
        "skins": skins,
        "capes": profile_data.get("capes").unwrap_or(&json!([])),
        "activeSkin": active_skin,
        "skinUrl": active_skin.and_then(|s| s.get("url")).and_then(|v| v.as_str()),
        "variant": active_skin.and_then(|s| s.get("variant")).and_then(|v| v.as_str()).map(|v| v.to_lowercase()).unwrap_or_else(|| "classic".to_string()),
    })
}

#[tauri::command]
pub async fn catskinc_get_config(
    game_directory: Option<String>,
) -> Result<serde_json::Value, String> {
    let base_dir =
        game_directory.unwrap_or_else(|| get_minecraft_dir().to_string_lossy().to_string());
    let config_path = PathBuf::from(&base_dir)
        .join("config")
        .join("catskinc.json");

    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(content) => {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    let ip = parsed
                        .get("catskinCloudIp")
                        .and_then(|v| v.as_str())
                        .unwrap_or("storage-api.catskin.space");
                    return Ok(json!({ "ok": true, "configured": true, "ip": ip }));
                }
                Ok(json!({ "ok": true, "configured": false, "ip": "storage-api.catskin.space" }))
            }
            Err(_) => {
                Ok(json!({ "ok": false, "configured": false, "ip": "storage-api.catskin.space" }))
            }
        }
    } else {
        Ok(json!({ "ok": true, "configured": false, "ip": "storage-api.catskin.space" }))
    }
}

#[tauri::command]
pub async fn catskinc_save_config(
    ip: String,
    game_directory: Option<String>,
) -> Result<crate::cloud::SimpleResult, String> {
    let base_dir =
        game_directory.unwrap_or_else(|| get_minecraft_dir().to_string_lossy().to_string());
    let config_dir = PathBuf::from(&base_dir).join("config");
    let config_path = config_dir.join("catskinc.json");

    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let mut existing = if config_path.exists() {
        fs::read_to_string(&config_path)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .unwrap_or_else(|| json!({}))
    } else {
        json!({})
    };

    if let Some(obj) = existing.as_object_mut() {
        obj.insert("catskinCloudIp".to_string(), json!(ip.trim()));
    }

    let content = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;
    
    
    Ok(crate::cloud::SimpleResult { ok: true, error: None, message: None })
}

#[tauri::command]
pub async fn catskinc_get_selected_skin(
    game_directory: Option<String>,
) -> Result<serde_json::Value, String> {
    let session = get_session()
        .account
        .ok_or_else(|| "Not logged in".to_string())?;
    let base_url = catskinc_base_url(game_directory);
    let formatted_uuid = format_minecraft_uuid(&session.uuid);
    let request_id = generate_id();
    let empty_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    let resp = reqwest::Client::new()
        .get(format!("{}/selected?uuid={}", base_url, formatted_uuid))
        .header("User-Agent", "catskinc/ServerApiClient")
        .header("x-catskinc-protocol", "2")
        .header("x-catskinc-request-id", &request_id)
        .header("x-catskinc-content-sha256", empty_hash)
        .send()
        .await
        .map_err(|e| format!("Failed to query CatSkinC server: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Ok(
            json!({ "ok": false, "error": format!("Failed to fetch selected skin from CatSkinC ({status})") }),
        );
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let mut skin_url = data
        .get("url")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if skin_url.as_deref() == Some("")
        || skin_url.as_deref() == Some("/public/system/updateyurmod.png")
    {
        skin_url = None;
    }
    if let Some(ref url) = skin_url {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            skin_url = Some(format!("{}{}", base_url, url));
        }
    }

    let mut mouth_url = data
        .get("mouth_open_url")
        .or_else(|| data.get("mouthOpenUrl"))
        .or_else(|| data.get("mouth_url"))
        .or_else(|| data.get("mouthUrl"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if mouth_url.as_deref() == Some("") {
        mouth_url = None;
    }
    if let Some(ref url) = mouth_url {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            mouth_url = Some(format!("{}{}", base_url, url));
        }
    }

    let skin_data_url = if let Some(ref url) = skin_url {
        fetch_url_as_data_url(url).await
    } else {
        None
    };

    let mouth_data_url = if let Some(ref url) = mouth_url {
        fetch_url_as_data_url(url).await
    } else {
        None
    };

    let slim = data.get("slim").and_then(|v| v.as_bool()).unwrap_or(false);

    Ok(json!({
        "ok": true,
        "url": skin_data_url,
        "mouthUrl": mouth_data_url,
        "slim": slim,
    }))
}

#[tauri::command]
pub async fn catskinc_upload_skin(
    data_url: String,
    slim: bool,
    mouth_open_data_url: Option<String>,
    game_directory: Option<String>,
) -> Result<crate::cloud::SimpleResult, String> {
    let session = get_session()
        .account
        .ok_or_else(|| "Not logged in".to_string())?;
    if session.auth_type != "microsoft" {
        return Err("Microsoft account is required to authenticate with CatSkinC.".to_string());
    }

    let skin_bytes = parse_png_data_url(&data_url)
        .ok_or_else(|| "Invalid skin image format. Only PNG is supported.".to_string())?;

    let mouth_bytes = mouth_open_data_url
        .as_ref()
        .and_then(|url| parse_png_data_url(url));

    let access_token = session
        .access_token
        .as_deref()
        .ok_or_else(|| "Microsoft access token not found.".to_string())?;
    let server_id = mojang_join_server(&session.uuid, access_token).await?;

    let base_url = catskinc_base_url(game_directory);
    let formatted_uuid = format_minecraft_uuid(&session.uuid);
    let session_token =
        catskinc_auth_session(&base_url, &session.username, &formatted_uuid, &server_id).await?;

    let boundary = generate_id();
    let fields = vec![
        ("uuid", formatted_uuid.as_bytes().to_vec()),
        ("slim", slim.to_string().into_bytes()),
    ];
    let mut files = vec![("file", "skin.png", "image/png", skin_bytes.clone())];
    if let Some(ref mouth) = mouth_bytes {
        files.push(("mouth_open", "mouth-open.png", "image/png", mouth.clone()));
        files.push(("mouth", "mouth-open.png", "image/png", mouth.clone()));
    }

    let body = build_multipart_body(&boundary, fields, files);
    let canonical_hash =
        compute_upload_content_hash(&formatted_uuid, slim, &skin_bytes, mouth_bytes.as_deref());
    let upload_request_id = generate_id();

    let resp = reqwest::Client::new()
        .post(format!("{}/upload", base_url))
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={}", boundary),
        )
        .header("x-catskinc-protocol", "2")
        .header("x-catskinc-request-id", &upload_request_id)
        .header("x-catskinc-session", &session_token)
        .header("x-catskinc-content-sha256", &canonical_hash)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Skin upload to CatSkinC failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("Skin upload to CatSkinC failed ({status})"));
    }

    
    Ok(crate::cloud::SimpleResult { ok: true, error: None, message: None })
}

#[tauri::command]
pub async fn catskinc_clear_assets(
    mode: String,
    game_directory: Option<String>,
) -> Result<crate::cloud::SimpleResult, String> {
    let session = get_session()
        .account
        .ok_or_else(|| "Not logged in".to_string())?;
    if session.auth_type != "microsoft" {
        return Err("Microsoft account is required to authenticate with CatSkinC.".to_string());
    }

    let access_token = session
        .access_token
        .as_deref()
        .ok_or_else(|| "Microsoft access token not found.".to_string())?;
    let server_id = mojang_join_server(&session.uuid, access_token).await?;

    let base_url = catskinc_base_url(game_directory);
    let formatted_uuid = format_minecraft_uuid(&session.uuid);
    let session_token =
        catskinc_auth_session(&base_url, &session.username, &formatted_uuid, &server_id).await?;

    let select_body = json!({
        "uuid": formatted_uuid,
        "clear": mode,
    });
    let select_body_bytes = serde_json::to_vec(&select_body).map_err(|e| e.to_string())?;
    let select_hash = sha256_hex(&select_body_bytes);
    let select_request_id = generate_id();

    let resp = reqwest::Client::new()
        .post(format!("{}/select", base_url))
        .header("Content-Type", "application/json; charset=utf-8")
        .header("x-catskinc-protocol", "2")
        .header("x-catskinc-request-id", &select_request_id)
        .header("x-catskinc-session", &session_token)
        .header("x-catskinc-content-sha256", &select_hash)
        .body(select_body_bytes)
        .send()
        .await
        .map_err(|e| format!("Clear operation failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("Clear operation failed ({status})"));
    }

    
    
    Ok(crate::cloud::SimpleResult { ok: true, error: None, message: None })
}

#[tauri::command]
pub async fn minecraft_get_profile(
    force_refresh: Option<bool>,
) -> Result<serde_json::Value, String> {
    let session = get_session()
        .account
        .ok_or_else(|| "Not logged in".to_string())?;
    let force = force_refresh.unwrap_or(false);

    if session.auth_type == "microsoft" {
        let cache_key = format!("microsoft:{}", session.uuid);
        if !force {
            if let Some(cached) = get_cached_profile(&cache_key) {
                return Ok(json!({ "ok": true, "profile": cached }));
            }
        }

        let access_token = session
            .access_token
            .as_deref()
            .ok_or_else(|| "Microsoft access token not found.")?;
        let profile = fetch_minecraft_profile(access_token).await?;
        set_cached_profile(cache_key, profile.clone());
        return Ok(json!({ "ok": true, "profile": profile }));
    }

    if session.auth_type == "catid" {
        let api_token = session
            .api_token
            .as_deref()
            .ok_or_else(|| "API token not found.")?;
        let uuid_part = session.uuid.rsplit('-').next().unwrap_or("");

        let profile_resp = reqwest::Client::new()
            .get(format!("{}/profile/{}", API_URL, uuid_part))
            .header("Authorization", format!("Bearer {}", api_token))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch profile: {e}"))?;

        if !profile_resp.status().is_success() {
            return Err(format!(
                "Failed to fetch profile ({})",
                profile_resp.status()
            ));
        }

        let result: serde_json::Value = profile_resp.json().await.map_err(|e| e.to_string())?;
        if result.get("ok").and_then(|v| v.as_bool()) != Some(true) {
            return Err("Invalid profile data from server.".to_string());
        }

        if let Some(profile_data) = result.get("profile") {
            let profile = map_profile(profile_data);
            return Ok(json!({ "ok": true, "profile": profile }));
        }

        return Err("Invalid profile data from server.".to_string());
    }

    Err("Microsoft account is required.".to_string())
}

#[tauri::command]
pub async fn minecraft_upload_skin(
    data_url: String,
    variant: String,
    file_name: Option<String>,
) -> Result<serde_json::Value, String> {
    let session = get_session()
        .account
        .ok_or_else(|| "Not logged in".to_string())?;
    let skin_bytes = parse_png_data_url(&data_url)
        .ok_or_else(|| "Invalid skin file. Please use PNG format.".to_string())?;

    if session.auth_type == "catid" {
        let api_token = session
            .api_token
            .as_deref()
            .ok_or_else(|| "API token not found.")?;
        let boundary = generate_id();

        let fields = vec![("variant", variant.as_bytes().to_vec())];
        let files = vec![(
            "file",
            file_name.as_deref().unwrap_or("skin.png"),
            "image/png",
            skin_bytes,
        )];
        let body = build_multipart_body(&boundary, fields, files);

        let upload_resp = reqwest::Client::new()
            .post(format!("{}/profile/skin", API_URL))
            .header("Authorization", format!("Bearer {}", api_token))
            .header(
                "Content-Type",
                format!("multipart/form-data; boundary={}", boundary),
            )
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Skin upload failed: {e}"))?;

        if !upload_resp.status().is_success() {
            let status = upload_resp.status();
            return Err(format!("Skin upload failed ({status})"));
        }

        let result: serde_json::Value = upload_resp.json().await.map_err(|e| e.to_string())?;
        if result.get("ok").and_then(|v| v.as_bool()) != Some(true) {
            return Err("Failed to parse upload result from server.".to_string());
        }

        let uuid_part = session.uuid.rsplit('-').next().unwrap_or("");
        let cache_key = format!("catid-ms-{}", uuid_part);
        delete_cached_profile(&cache_key);

        let profile_resp = reqwest::Client::new()
            .get(format!("{}/profile/{}", API_URL, uuid_part))
            .header("Authorization", format!("Bearer {}", api_token))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch updated profile: {e}"))?;

        if !profile_resp.status().is_success() {
            return Err(format!(
                "Failed to fetch updated profile ({})",
                profile_resp.status()
            ));
        }

        let updated_result: serde_json::Value =
            profile_resp.json().await.map_err(|e| e.to_string())?;
        if let Some(profile_data) = updated_result.get("profile") {
            let profile = map_profile(profile_data);
            set_cached_profile(cache_key, profile.clone());
            return Ok(json!({
                "ok": true,
                "profile": profile,
                "message": "Skin updated successfully.",
            }));
        }

        return Err("Failed to parse upload result from server.".to_string());
    }

    if session.auth_type == "microsoft" {
        let access_token = session
            .access_token
            .as_deref()
            .ok_or_else(|| "Microsoft access token not found.")?;
        let boundary = generate_id();

        let fields = vec![(
            "variant",
            if variant == "slim" {
                b"slim".to_vec()
            } else {
                b"classic".to_vec()
            },
        )];
        let files = vec![(
            "file",
            file_name.as_deref().unwrap_or("skin.png"),
            "image/png",
            skin_bytes,
        )];
        let body = build_multipart_body(&boundary, fields, files);

        let upload_resp = reqwest::Client::new()
            .post("https://api.minecraftservices.com/minecraft/profile/skins")
            .header("Authorization", format!("Bearer {}", access_token))
            .header(
                "Content-Type",
                format!("multipart/form-data; boundary={}", boundary),
            )
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Skin upload failed: {e}"))?;

        if !upload_resp.status().is_success() {
            let status = upload_resp.status();
            return Err(format!("Skin upload failed ({status})"));
        }

        let profile = fetch_minecraft_profile(access_token).await?;
        let cache_key = format!("microsoft:{}", session.uuid);
        set_cached_profile(cache_key, profile.clone());

        return Ok(json!({
            "ok": true,
            "profile": profile,
            "message": "Skin updated successfully.",
        }));
    }

    Err("Microsoft account is required.".to_string())
}

#[tauri::command]
pub async fn auth_update_avatar_source(
    avatar_source: String,
) -> Result<crate::auth::AuthCommandResult, String> {
    let session = get_session()
        .account
        .ok_or_else(|| "Not logged in".to_string())?;
    let api_token = if session.auth_type == "catid" {
        session.access_token.as_deref()
    } else {
        session.api_token.as_deref()
    }
    .ok_or_else(|| "CatID account connection required".to_string())?;

    let resp = reqwest::Client::new()
        .put(format!("{}/auth/session/profile", API_URL))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_token))
        .json(&json!({ "avatarSource": avatar_source }))
        .send()
        .await
        .map_err(|e| format!("Failed to update avatar source: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Failed to update avatar source ({})",
            resp.status()
        ));
    }

    
    
    
    
    
    let data: serde_json::Value = resp.json().await.unwrap_or_default();
    let user = data.get("user");
    crate::auth::update_session_avatar(
        user.and_then(|u| u.get("avatarUrl"))
            .and_then(|v| v.as_str())
            .map(String::from),
        user.and_then(|u| u.get("avatarSource"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .or(Some(avatar_source)),
    );
    Ok(get_session())
}
