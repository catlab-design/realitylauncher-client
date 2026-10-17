use crate::auth::get_session;
use crate::config::get_minecraft_dir;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const CATSKINC_DEFAULT_HOST: &str = "storage-skin.catlabdesign.space";
const CATSKINC_DEFAULT_URL: &str = "https://storage-skin.catlabdesign.space";
const CATSKINC_PROTOCOL_VERSION: &str = "2";
const CATSKINC_USER_AGENT: &str = "catskinc/ServerApiClient";
const CATSKINC_EMPTY_SHA256: &str =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const CATSKINC_TIMEOUT: Duration = Duration::from_secs(15);
const CATSKINC_MAX_IMAGE_BYTES: usize = 256 * 1024 * 1024;
const CATSKINC_MAX_SKIN_SIZE: u32 = 8192;
const CATSKINC_SESSION_REFRESH_MARGIN_MS: u64 = 60_000;
const CATSKINC_SESSION_DEFAULT_TTL_MS: u64 = 1_800_000;
const CATSKINC_DOWNLOAD_SIGNATURE_TTL_SECS: u64 = 300;
const API_URL: &str = "https://api.reality.catlabdesign.space";
const PROFILE_CACHE_TTL_MS: u64 = 600_000;
const PROFILE_CACHE_FILE: &str = "minecraft-profile-cache.json";

static PROFILE_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, ProfileCacheEntry>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

static CATSKINC_SESSION_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, (String, u64)>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

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

struct CatskincRuntime {
    base_url: String,
    signing_key: Option<String>,
}

fn catskinc_config_path(game_directory: Option<String>) -> PathBuf {
    let base_dir =
        game_directory.unwrap_or_else(|| get_minecraft_dir().to_string_lossy().to_string());
    PathBuf::from(&base_dir)
        .join("config")
        .join("catskinc.json")
}

fn read_catskinc_config(game_directory: Option<String>) -> Option<serde_json::Value> {
    let content = fs::read_to_string(catskinc_config_path(game_directory)).ok()?;
    serde_json::from_str::<serde_json::Value>(&content).ok()
}

fn normalize_catskinc_base_url(raw: &str) -> String {
    let ip = raw.trim();
    if ip.is_empty() {
        return CATSKINC_DEFAULT_URL.to_string();
    }
    let url = if ip.starts_with("http://") || ip.starts_with("https://") {
        ip.to_string()
    } else if ip.starts_with("localhost") || ip.starts_with("127.0.0.1") {
        format!("http://{}", ip)
    } else {
        format!("https://{}", ip)
    };
    let url = url.trim_end_matches('/').to_string();
    if reqwest::Url::parse(&url).is_err() {
        return CATSKINC_DEFAULT_URL.to_string();
    }
    url
}

fn non_blank(value: Option<&str>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn catskinc_runtime(game_directory: Option<String>) -> CatskincRuntime {
    let config = read_catskinc_config(game_directory);
    let base_url = config
        .as_ref()
        .and_then(|c| c.get("catskinCloudIp"))
        .and_then(|v| v.as_str())
        .map(normalize_catskinc_base_url)
        .unwrap_or_else(|| CATSKINC_DEFAULT_URL.to_string());
    let signing_key = non_blank(std::env::var("CATSKINC_REQUEST_SIGNING_KEY").ok().as_deref())
        .or_else(|| {
            non_blank(
                config
                    .as_ref()
                    .and_then(|c| c.get("requestSigningKey"))
                    .and_then(|v| v.as_str()),
            )
        });
    CatskincRuntime {
        base_url,
        signing_key,
    }
}

fn catskinc_join(base_url: &str, path: &str) -> String {
    if path.starts_with("http://") || path.starts_with("https://") {
        return path.to_string();
    }
    if path.is_empty() {
        return format!("{}/", base_url);
    }
    if path.starts_with('/') {
        format!("{}{}", base_url, path)
    } else {
        format!("{}/{}", base_url, path)
    }
}

fn url_host_port(url: &reqwest::Url) -> String {
    format!(
        "{}:{}",
        url.host_str().unwrap_or("").to_lowercase(),
        url.port_or_known_default().unwrap_or(0)
    )
}

fn enforce_catskinc_transport(url: &reqwest::Url) -> Result<(), String> {
    if url.scheme() == "http" {
        let host = url.host_str().unwrap_or("").to_lowercase();
        let is_local = matches!(host.as_str(), "localhost" | "127.0.0.1" | "::1" | "[::1]");
        if !is_local {
            return Err("Insecure HTTP is blocked for non-localhost CatSkinC servers.".to_string());
        }
    }
    Ok(())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    const BLOCK: usize = 64;
    let mut block_key = if key.len() > BLOCK {
        Sha256::digest(key).to_vec()
    } else {
        key.to_vec()
    };
    block_key.resize(BLOCK, 0);
    let ipad: Vec<u8> = block_key.iter().map(|b| b ^ 0x36).collect();
    let opad: Vec<u8> = block_key.iter().map(|b| b ^ 0x5c).collect();
    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(data);
    let inner_hash = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(inner_hash);
    outer.finalize().to_vec()
}

fn decode_signing_key(raw: &str) -> Result<Vec<u8>, String> {
    let value = raw.trim();
    let bytes = if let Some(hex_value) = value.strip_prefix("hex:") {
        hex::decode(hex_value.trim()).map_err(|_| "Invalid hex CatSkinC signing key".to_string())?
    } else if let Some(b64_value) = value.strip_prefix("b64:") {
        base64::engine::general_purpose::STANDARD
            .decode(b64_value.trim())
            .map_err(|_| "Invalid base64 CatSkinC signing key".to_string())?
    } else {
        value.as_bytes().to_vec()
    };
    if bytes.len() < 16 {
        return Err("CatSkinC request signing key is too short".to_string());
    }
    Ok(bytes)
}

fn sign_catskinc_payload(payload: &str, raw_key: &str) -> Result<String, String> {
    let key = decode_signing_key(raw_key)?;
    Ok(hex::encode(hmac_sha256(&key, payload.as_bytes())))
}

fn catskinc_api_request(
    rt: &CatskincRuntime,
    method: reqwest::Method,
    path: &str,
    content_type: Option<&str>,
    body_hash: &str,
) -> Result<reqwest::RequestBuilder, String> {
    let url = reqwest::Url::parse(&catskinc_join(&rt.base_url, path))
        .map_err(|e| format!("Invalid CatSkinC URL: {e}"))?;
    enforce_catskinc_transport(&url)?;

    let mut request = crate::http_client::HTTP_CLIENT
        .clone()
        .request(method.clone(), url.clone())
        .timeout(CATSKINC_TIMEOUT)
        .header("User-Agent", CATSKINC_USER_AGENT)
        .header("x-catskinc-request-id", generate_id())
        .header("x-catskinc-protocol", CATSKINC_PROTOCOL_VERSION)
        .header("x-catskinc-content-sha256", body_hash);
    if let Some(ct) = content_type {
        request = request.header("Content-Type", ct);
    }

    if let Some(key) = rt.signing_key.as_deref() {
        let timestamp = (now_millis() / 1000).to_string();
        let nonce = format!(
            "{}{:x}",
            generate_id().replace('-', ""),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let mut target = url.path().to_string();
        if target.is_empty() {
            target = "/".to_string();
        }
        if let Some(query) = url.query().filter(|q| !q.is_empty()) {
            target = format!("{}?{}", target, query);
        }
        let payload = format!(
            "{}\n{}\n{}\n{}\n{}",
            method.as_str(),
            target,
            timestamp,
            nonce,
            body_hash
        );
        let signature = sign_catskinc_payload(&payload, key)?;
        request = request
            .header("x-catskinc-timestamp", timestamp)
            .header("x-catskinc-nonce", nonce)
            .header("x-catskinc-signature", signature);
    }

    Ok(request)
}

fn json_string(data: &serde_json::Value, key: &str) -> Option<String> {
    match data.get(key)? {
        serde_json::Value::Null => None,
        serde_json::Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
    .filter(|s| !s.trim().is_empty())
}

fn json_bool(data: &serde_json::Value, key: &str, default: bool) -> bool {
    match data.get(key) {
        Some(serde_json::Value::Bool(b)) => *b,
        Some(serde_json::Value::Number(n)) => n.as_i64().map(|v| v != 0).unwrap_or(default),
        Some(serde_json::Value::String(s)) => match s.as_str() {
            "1" => true,
            "0" => false,
            v if v.eq_ignore_ascii_case("true") => true,
            v if v.eq_ignore_ascii_case("false") => false,
            _ => default,
        },
        _ => default,
    }
}

fn catskinc_error_message(body: &str, status: u16) -> String {
    if status == 426 {
        return "CLIENT_UPDATE_REQUIRED: the CatSkinC server requires a newer client protocol."
            .to_string();
    }
    let parsed: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    if let Some(message) = json_string(&parsed, "error")
        .or_else(|| json_string(&parsed, "message"))
        .or_else(|| json_string(&parsed, "detail"))
    {
        return message;
    }
    let trimmed = body.trim();
    if trimmed.is_empty() || trimmed.starts_with("<!DOCTYPE") || trimmed.starts_with("<html") {
        return format!("HTTP {status}");
    }
    trimmed.chars().take(300).collect()
}

fn catskinc_failure(error: impl Into<String>) -> crate::cloud::SimpleResult {
    crate::cloud::SimpleResult {
        ok: false,
        error: Some(error.into()),
        message: None,
    }
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];
    if bytes.len() < 24 || bytes[..8] != SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    Some((width, height))
}

fn is_valid_catskinc_skin_size(width: u32, height: u32) -> bool {
    width == height
        && width.is_power_of_two()
        && (64..=CATSKINC_MAX_SKIN_SIZE).contains(&width)
}

fn is_valid_catskinc_overlay_size(width: u32, height: u32) -> bool {
    (8..=CATSKINC_MAX_SKIN_SIZE).contains(&width) && (8..=CATSKINC_MAX_SKIN_SIZE).contains(&height)
}

fn normalize_clear_mode(mode: &str) -> Option<&'static str> {
    match mode.trim().to_lowercase().as_str() {
        "all" => Some("all"),
        "skin" => Some("skin"),
        "mouth" => Some("mouth"),
        _ => None,
    }
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
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let hash = Sha256::digest(format!("{}-{}", nanos, counter).as_bytes());
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

fn sign_catskinc_download_url(rt: &CatskincRuntime, full_url: &str, url: &reqwest::Url) -> String {
    let Some(key) = rt.signing_key.as_deref() else {
        return full_url.to_string();
    };
    let Some(relative) = url.path().strip_prefix("/public/") else {
        return full_url.to_string();
    };
    if relative.is_empty() {
        return full_url.to_string();
    }
    let exp = now_millis() / 1000 + CATSKINC_DOWNLOAD_SIGNATURE_TTL_SECS;
    match sign_catskinc_payload(&format!("{}\n{}", relative, exp), key) {
        Ok(sig) => {
            let separator = if url.query().is_none() { "?" } else { "&" };
            format!("{}{}exp={}&sig={}", full_url, separator, exp, sig)
        }
        Err(_) => full_url.to_string(),
    }
}

async fn fetch_catskinc_asset(rt: &CatskincRuntime, url_or_path: &str) -> Option<String> {
    let full_url = catskinc_join(&rt.base_url, url_or_path);
    let url = reqwest::Url::parse(&full_url).ok()?;
    let api_url = reqwest::Url::parse(&rt.base_url).ok()?;
    if url_host_port(&url) != url_host_port(&api_url) {
        return None;
    }
    enforce_catskinc_transport(&url).ok()?;
    let download_url = sign_catskinc_download_url(rt, &full_url, &url);

    let resp = crate::http_client::HTTP_CLIENT
        .clone()
        .get(download_url)
        .header("User-Agent", CATSKINC_USER_AGENT)
        .header("x-catskinc-request-id", generate_id())
        .header("x-catskinc-protocol", CATSKINC_PROTOCOL_VERSION)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let expected_hash = resp
        .headers()
        .get("X-CatSkin-Sha256")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty());
    let bytes = resp.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > CATSKINC_MAX_IMAGE_BYTES {
        return None;
    }
    if let Some(expected) = expected_hash {
        if expected != sha256_hex(&bytes) {
            return None;
        }
    }
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

    let resp = crate::http_client::HTTP_CLIENT.clone()
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
    rt: &CatskincRuntime,
    username: &str,
    uuid: &str,
    server_id: &str,
) -> Result<(String, u64), String> {
    let auth_payload = json!({
        "username": username,
        "uuid": uuid,
        "server_id": server_id,
    });
    let auth_body = serde_json::to_vec(&auth_payload).map_err(|e| e.to_string())?;
    let auth_hash = sha256_hex(&auth_body);

    let resp = catskinc_api_request(
        rt,
        reqwest::Method::POST,
        "/auth/session",
        Some("application/json; charset=utf-8"),
        &auth_hash,
    )?
    .body(auth_body)
    .send()
    .await
    .map_err(|e| format!("CatSkinC auth request failed: {e}"))?;

    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(format!(
            "CatSkinC session authentication failed ({status}): {}",
            catskinc_error_message(&text, status)
        ));
    }

    let data: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    let token = json_string(&data, "session_token")
        .ok_or_else(|| "Failed to retrieve session token from CatSkinC.".to_string())?;
    let expires_at = data.get("expires_at").and_then(|v| v.as_u64()).unwrap_or(0);
    let expires_at_ms = if expires_at > 0 {
        expires_at * 1000
    } else {
        now_millis() + CATSKINC_SESSION_DEFAULT_TTL_MS
    };
    Ok((token, expires_at_ms))
}

fn catskinc_session_cache_key(rt: &CatskincRuntime, uuid: &str) -> String {
    format!("{}|{}", rt.base_url, uuid)
}

fn invalidate_catskinc_session(rt: &CatskincRuntime, uuid: &str) {
    if let Ok(mut cache) = CATSKINC_SESSION_CACHE.lock() {
        cache.remove(&catskinc_session_cache_key(rt, uuid));
    }
}

async fn catskinc_session_token(
    rt: &CatskincRuntime,
    session_uuid: &str,
    username: &str,
    formatted_uuid: &str,
    access_token: &str,
) -> Result<String, String> {
    let cache_key = catskinc_session_cache_key(rt, formatted_uuid);
    if let Ok(cache) = CATSKINC_SESSION_CACHE.lock() {
        if let Some((token, expires_at_ms)) = cache.get(&cache_key) {
            if now_millis() + CATSKINC_SESSION_REFRESH_MARGIN_MS < *expires_at_ms {
                return Ok(token.clone());
            }
        }
    }

    let server_id = mojang_join_server(session_uuid, access_token).await?;
    let (token, expires_at_ms) =
        catskinc_auth_session(rt, username, formatted_uuid, &server_id).await?;
    if let Ok(mut cache) = CATSKINC_SESSION_CACHE.lock() {
        cache.insert(cache_key, (token.clone(), expires_at_ms));
    }
    Ok(token)
}

async fn catskinc_select_skin(
    rt: &CatskincRuntime,
    uuid: &str,
    session_token: &str,
    skin: &str,
    slim: bool,
) -> Result<(), String> {
    let body = serde_json::to_vec(&json!({
        "uuid": uuid,
        "skin": skin,
        "slim": slim,
    }))
    .map_err(|e| e.to_string())?;
    let hash = sha256_hex(&body);

    let resp = catskinc_api_request(
        rt,
        reqwest::Method::POST,
        "/select",
        Some("application/json; charset=utf-8"),
        &hash,
    )?
    .header("x-catskinc-session", session_token)
    .body(body)
    .send()
    .await
    .map_err(|e| format!("Select request failed: {e}"))?;

    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if status == 401 {
        invalidate_catskinc_session(rt, uuid);
        return Err("Session token invalid or expired. Please try again.".to_string());
    }
    if status == 403 {
        return Err("Session UUID mismatch.".to_string());
    }
    if !(200..300).contains(&status) {
        return Err(catskinc_error_message(&text, status));
    }
    Ok(())
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
    let resp = crate::http_client::HTTP_CLIENT.clone()
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
    let config_path = catskinc_config_path(game_directory);

    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(content) => {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                    let ip = non_blank(parsed.get("catskinCloudIp").and_then(|v| v.as_str()))
                        .unwrap_or_else(|| CATSKINC_DEFAULT_HOST.to_string());
                    return Ok(json!({ "ok": true, "configured": true, "ip": ip }));
                }
                Ok(json!({ "ok": true, "configured": false, "ip": CATSKINC_DEFAULT_HOST }))
            }
            Err(_) => {
                Ok(json!({ "ok": false, "configured": false, "ip": CATSKINC_DEFAULT_HOST }))
            }
        }
    } else {
        Ok(json!({ "ok": true, "configured": false, "ip": CATSKINC_DEFAULT_HOST }))
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
    let rt = catskinc_runtime(game_directory);
    let formatted_uuid = format_minecraft_uuid(&session.uuid);

    let resp = catskinc_api_request(
        &rt,
        reqwest::Method::GET,
        &format!("/selected?uuid={}", formatted_uuid),
        None,
        CATSKINC_EMPTY_SHA256,
    )?
    .send()
    .await
    .map_err(|e| format!("Failed to query CatSkinC server: {e}"))?;

    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return Ok(json!({
            "ok": false,
            "error": format!(
                "Failed to fetch selected skin from CatSkinC ({status}): {}",
                catskinc_error_message(&text, status)
            ),
        }));
    }

    let data: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();

    let skin_url = json_string(&data, "url")
        .or_else(|| {
            json_string(&data, "id").map(|id| {
                let id = id.strip_suffix(".png").unwrap_or(&id).to_string();
                format!("/public/{}/skin.png", id)
            })
        })
        .filter(|url| !url.ends_with("/public/system/updateyurmod.png"));

    let mouth_url = json_string(&data, "mouth_open_url")
        .or_else(|| json_string(&data, "mouthOpenUrl"))
        .or_else(|| json_string(&data, "mouth_url"))
        .or_else(|| json_string(&data, "mouthUrl"));

    let skin_data_url = match skin_url {
        Some(ref url) => fetch_catskinc_asset(&rt, url).await,
        None => None,
    };

    let mouth_data_url = match (&skin_data_url, mouth_url) {
        (Some(_), Some(ref url)) => fetch_catskinc_asset(&rt, url).await,
        _ => None,
    };

    let slim = json_bool(&data, "slim", false);

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

    let mouth_bytes = match mouth_open_data_url.as_deref().filter(|url| !url.is_empty()) {
        Some(url) => Some(parse_png_data_url(url).ok_or_else(|| {
            "Invalid mouth-open image format. Only PNG is supported.".to_string()
        })?),
        None => None,
    };

    if skin_bytes.len() > CATSKINC_MAX_IMAGE_BYTES
        || mouth_bytes.as_ref().map_or(false, |m| m.len() > CATSKINC_MAX_IMAGE_BYTES)
    {
        return Ok(catskinc_failure("Image file is too large (max 256 MB)."));
    }
    let (skin_w, skin_h) = png_dimensions(&skin_bytes)
        .ok_or_else(|| "Invalid skin image format. Only PNG is supported.".to_string())?;
    if !is_valid_catskinc_skin_size(skin_w, skin_h) {
        return Ok(catskinc_failure(format!(
            "Invalid skin size {skin_w}x{skin_h}. CatSkinC skins must be square, a power of two, and between 64 and 8192 pixels."
        )));
    }
    if let Some(ref mouth) = mouth_bytes {
        let (mouth_w, mouth_h) = png_dimensions(mouth).ok_or_else(|| {
            "Invalid mouth-open image format. Only PNG is supported.".to_string()
        })?;
        if !is_valid_catskinc_overlay_size(mouth_w, mouth_h) {
            return Ok(catskinc_failure(format!(
                "Invalid mouth-open size {mouth_w}x{mouth_h}. It must be between 8 and 8192 pixels."
            )));
        }
        if mouth_w != skin_w || mouth_h != skin_h {
            return Ok(catskinc_failure(format!(
                "Mouth-open image ({mouth_w}x{mouth_h}) must match the skin size ({skin_w}x{skin_h})."
            )));
        }
    }

    let access_token = session
        .access_token
        .as_deref()
        .ok_or_else(|| "Microsoft access token not found.".to_string())?;

    let rt = catskinc_runtime(game_directory);
    let formatted_uuid = format_minecraft_uuid(&session.uuid);
    let session_token = match catskinc_session_token(
        &rt,
        &session.uuid,
        &session.username,
        &formatted_uuid,
        access_token,
    )
    .await
    {
        Ok(token) => token,
        Err(e) => return Ok(catskinc_failure(e)),
    };

    let boundary = format!("----CatSkinC-{}", generate_id().replace('-', ""));
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
    let content_type = format!("multipart/form-data; boundary={}", boundary);

    let resp = match catskinc_api_request(
        &rt,
        reqwest::Method::POST,
        "/upload",
        Some(&content_type),
        &canonical_hash,
    ) {
        Ok(req) => req,
        Err(e) => return Ok(catskinc_failure(e)),
    }
    .timeout(Duration::from_secs(300))
    .header("x-catskinc-session", &session_token)
    .body(body)
    .send()
    .await
    .map_err(|e| format!("Skin upload to CatSkinC failed: {e}"))?;

    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if status == 401 {
        invalidate_catskinc_session(&rt, &formatted_uuid);
        return Ok(catskinc_failure(format!(
            "Session token invalid or expired. Please try again. ({})",
            catskinc_error_message(&text, status)
        )));
    }
    if status == 403 {
        return Ok(catskinc_failure(format!(
            "Session UUID mismatch. ({})",
            catskinc_error_message(&text, status)
        )));
    }
    if !(200..300).contains(&status) {
        return Ok(catskinc_failure(catskinc_error_message(&text, status)));
    }

    let data: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    let skin_id = json_string(&data, "id")
        .or_else(|| json_string(&data, "url"))
        .unwrap_or_else(|| {
            let trimmed = text.trim();
            if trimmed.is_empty() { "ok".to_string() } else { trimmed.to_string() }
        });

    if let Err(e) =
        catskinc_select_skin(&rt, &formatted_uuid, &session_token, &skin_id, slim).await
    {
        return Ok(catskinc_failure(format!(
            "Skin uploaded but could not be selected: {e}"
        )));
    }

    Ok(crate::cloud::SimpleResult { ok: true, error: None, message: Some(skin_id) })
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

    let Some(clear_mode) = normalize_clear_mode(&mode) else {
        return Ok(catskinc_failure("Invalid clear request"));
    };

    let access_token = session
        .access_token
        .as_deref()
        .ok_or_else(|| "Microsoft access token not found.".to_string())?;

    let rt = catskinc_runtime(game_directory);
    let formatted_uuid = format_minecraft_uuid(&session.uuid);
    let session_token = match catskinc_session_token(
        &rt,
        &session.uuid,
        &session.username,
        &formatted_uuid,
        access_token,
    )
    .await
    {
        Ok(token) => token,
        Err(e) => return Ok(catskinc_failure(e)),
    };

    let select_body = json!({
        "uuid": formatted_uuid,
        "clear": clear_mode,
    });
    let select_body_bytes = serde_json::to_vec(&select_body).map_err(|e| e.to_string())?;
    let select_hash = sha256_hex(&select_body_bytes);

    let resp = match catskinc_api_request(
        &rt,
        reqwest::Method::POST,
        "/select",
        Some("application/json; charset=utf-8"),
        &select_hash,
    ) {
        Ok(req) => req,
        Err(e) => return Ok(catskinc_failure(e)),
    }
    .header("x-catskinc-session", &session_token)
    .body(select_body_bytes)
    .send()
    .await
    .map_err(|e| format!("Clear operation failed: {e}"))?;

    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    if status == 401 {
        invalidate_catskinc_session(&rt, &formatted_uuid);
        return Ok(catskinc_failure(
            "Session token invalid or expired. Please try again.",
        ));
    }
    if status == 403 {
        return Ok(catskinc_failure("Session UUID mismatch."));
    }
    if !(200..300).contains(&status) {
        return Ok(catskinc_failure(catskinc_error_message(&text, status)));
    }

    let data: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    if data.get("cleared").is_none() && data.get("changed").is_none() {
        return Ok(catskinc_failure(
            "CatSkinC server does not support the Clear action yet.",
        ));
    }
    let changed = json_bool(&data, "changed", true);
    let cleared = json_string(&data, "cleared").unwrap_or_else(|| clear_mode.to_string());

    Ok(crate::cloud::SimpleResult {
        ok: true,
        error: None,
        message: Some(if changed { cleared } else { "unchanged".to_string() }),
    })
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

        let profile_resp = crate::http_client::HTTP_CLIENT.clone()
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

        let upload_resp = crate::http_client::HTTP_CLIENT.clone()
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

        let profile_resp = crate::http_client::HTTP_CLIENT.clone()
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

        let upload_resp = crate::http_client::HTTP_CLIENT.clone()
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

    let resp = crate::http_client::HTTP_CLIENT.clone()
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
