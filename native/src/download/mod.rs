//! Download Manager Module

#[cfg(test)]
mod size_guard_tests;
mod packs;

pub use packs::{
    export_modpack_archive,
    inspect_pack_metadata,
    scan_pack_directory,
    ModpackExportRequest,
    ModpackExportResult,
    PackMetadataResult,
    PackScanEntry,
};

#[cfg(test)]
use packs::{export_modpack_archive_sync, scan_pack_directory_sync};


use base64::{engine::general_purpose, Engine as _};
use futures::StreamExt;
use napi_derive::napi;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha1::{Digest as Sha1Digest, Sha1};
use sha2::Sha256;
use std::collections::{HashMap, HashSet};
use std::io::{BufReader, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::UNIX_EPOCH;
use tokio::io::AsyncWriteExt;
use tokio::sync::{RwLock, Semaphore};
use zip::ZipArchive;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct DownloadTask {
    pub url: String,
    pub path: String,
    #[napi(ts_type = "string | null | undefined")]
    pub sha1: Option<String>,
    #[napi(ts_type = "string | null | undefined")]
    pub sha256: Option<String>,
    #[napi(ts_type = "number | null | undefined")]
    pub size: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct DownloadResult {
    pub success: bool,
    pub completed: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct SingleDownloadResult {
    pub success: bool,
    pub path: String,
    pub error: Option<String>,
}

#[napi]
pub async fn download_file(
    url: String,
    path: String,
    sha1: Option<String>,
    sha256: Option<String>,
) -> napi::Result<SingleDownloadResult> {
    match download_file_internal(&url, &path, sha1.as_deref(), sha256.as_deref()).await {
        Ok(_) => Ok(SingleDownloadResult { success: true, path, error: None }),
        Err(e) => Ok(SingleDownloadResult { success: false, path, error: Some(e) }),
    }
}

async fn download_file_internal(
    url: &str,
    path: &str,
    sha1: Option<&str>,
    sha256: Option<&str>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("RealityLauncher/0.2.0")
        .build()
        .map_err(|e| e.to_string())?;

    let file_path = PathBuf::from(path);
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }

    // Check existing file
    if file_path.exists() {
        if let Some(expected) = sha1 {
            if verify_sha1_sync(&file_path, expected) { return Ok(()); }
        } else if let Some(expected) = sha256 {
            if verify_sha256_sync(&file_path, expected) { return Ok(()); }
        }
    }

    // Download with retries
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << attempt))).await;
        }
        match do_download(&client, url, &file_path, sha1, sha256).await {
            Ok(_) => return Ok(()),
            Err(e) if attempt == 2 => return Err(e),
            Err(_) => continue,
        }
    }
    Err("Download failed after retries".to_string())
}

async fn do_download(
    client: &reqwest::Client,
    url: &str,
    path: &PathBuf,
    sha1: Option<&str>,
    sha256: Option<&str>,
) -> Result<(), String> {
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let temp_path = path.with_extension("tmp");
    let mut file = tokio::fs::File::create(&temp_path).await.map_err(|e| e.to_string())?;
    
    let mut stream = response.bytes_stream();
    let mut sha1_hasher = sha1.map(|_| Sha1::new());
    let mut sha256_hasher = sha256.map(|_| Sha256::new());

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        if let Some(ref mut h) = sha1_hasher { h.update(&chunk); }
        if let Some(ref mut h) = sha256_hasher { h.update(&chunk); }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // Verify
    if let (Some(expected), Some(hasher)) = (sha1, sha1_hasher) {
        let actual = hex::encode(hasher.finalize());
        if actual.to_lowercase() != expected.to_lowercase() {
            let _ = tokio::fs::remove_file(&temp_path).await;
            return Err(format!("SHA1 mismatch"));
        }
    }
    if let (Some(expected), Some(hasher)) = (sha256, sha256_hasher) {
        let actual = hex::encode(hasher.finalize());
        if actual.to_lowercase() != expected.to_lowercase() {
            let _ = tokio::fs::remove_file(&temp_path).await;
            return Err(format!("SHA256 mismatch"));
        }
    }

    tokio::fs::rename(&temp_path, path).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn verify_sha1_sync(path: &PathBuf, expected: &str) -> bool {
    calculate_sha1_hex_sync(path)
        .map(|actual| actual.eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn verify_sha256_sync(path: &PathBuf, expected: &str) -> bool {
    calculate_sha256_hex_sync(path)
        .map(|actual| actual.eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn calculate_sha1_hex_sync(path: &PathBuf) -> Option<String> {
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return None,
    };
    let mut reader = BufReader::new(file);
    let mut hasher = Sha1::new();
    let mut buf = [0u8; 64 * 1024];

    loop {
        let read = match reader.read(&mut buf) {
            Ok(read) => read,
            Err(_) => return None,
        };
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }

    Some(hex::encode(hasher.finalize()))
}

fn calculate_sha256_hex_sync(path: &PathBuf) -> Option<String> {
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return None,
    };
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];

    loop {
        let read = match reader.read(&mut buf) {
            Ok(read) => read,
            Err(_) => return None,
        };
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }

    Some(hex::encode(hasher.finalize()))
}

#[derive(Clone, Debug)]
enum NormalizedExpectedHash {
    Sha1(String),
    Sha256(String),
}

impl NormalizedExpectedHash {
    fn hex(&self) -> &str {
        match self {
            Self::Sha1(value) => value,
            Self::Sha256(value) => value,
        }
    }

    fn algorithm_name(&self) -> &'static str {
        match self {
            Self::Sha1(_) => "sha1",
            Self::Sha256(_) => "sha256",
        }
    }
}

fn decode_base64_hash(value: &str) -> Option<Vec<u8>> {
    let inputs = [
        general_purpose::STANDARD.decode(value).ok(),
        general_purpose::STANDARD_NO_PAD.decode(value).ok(),
        general_purpose::URL_SAFE.decode(value).ok(),
        general_purpose::URL_SAFE_NO_PAD.decode(value).ok(),
    ];
    for decoded in inputs.into_iter().flatten() {
        if !decoded.is_empty() {
            return Some(decoded);
        }
    }
    None
}

fn normalize_expected_hash(expected: &str) -> Option<NormalizedExpectedHash> {
    let mut value = expected.trim();
    if value.is_empty() {
        return None;
    }

    let lower = value.to_ascii_lowercase();
    if lower.starts_with("sha256:") {
        value = value[7..].trim();
    } else if lower.starts_with("sha-256:") {
        value = value[8..].trim();
    } else if lower.starts_with("sha1:") {
        value = value[5..].trim();
    } else if lower.starts_with("sha-1:") {
        value = value[6..].trim();
    }

    if value.starts_with("0x") || value.starts_with("0X") {
        value = value[2..].trim();
    }

    if value.chars().all(|ch| ch.is_ascii_hexdigit()) {
        let canonical = value.to_ascii_lowercase();
        return match canonical.len() {
            40 => Some(NormalizedExpectedHash::Sha1(canonical)),
            64 => Some(NormalizedExpectedHash::Sha256(canonical)),
            _ => None,
        };
    }

    let decoded = decode_base64_hash(value)?;
    match decoded.len() {
        20 => Some(NormalizedExpectedHash::Sha1(hex::encode(decoded))),
        32 => Some(NormalizedExpectedHash::Sha256(hex::encode(decoded))),
        _ => None,
    }
}

fn verify_known_hash_sync(path: &PathBuf, expected: &str) -> bool {
    match normalize_expected_hash(expected) {
        Some(NormalizedExpectedHash::Sha1(value)) => verify_sha1_sync(path, &value),
        Some(NormalizedExpectedHash::Sha256(value)) => verify_sha256_sync(path, &value),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn write_temp_test_file(content: &[u8]) -> PathBuf {
        let mut path = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        path.push(format!("mlauncher_hash_test_{nonce}.bin"));
        std::fs::write(&path, content).expect("failed to write temp file");
        path
    }

    #[test]
    fn verify_known_hash_sync_accepts_sha256_with_prefix() {
        let payload = b"hello-modpack";
        let path = write_temp_test_file(payload);

        let expected_hex = {
            let mut hasher = Sha256::new();
            hasher.update(payload);
            hex::encode(hasher.finalize())
        };

        let with_prefix = format!("sha256:{expected_hex}");
        assert!(verify_known_hash_sync(&path, &with_prefix));
        let with_0x = format!("0x{expected_hex}");
        assert!(verify_known_hash_sync(&path, &with_0x));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn verify_known_hash_sync_accepts_sha256_base64() {
        let payload = b"hello-modpack";
        let path = write_temp_test_file(payload);

        let digest = {
            let mut hasher = Sha256::new();
            hasher.update(payload);
            hasher.finalize().to_vec()
        };
        let expected_base64 = general_purpose::STANDARD.encode(digest);

        assert!(verify_known_hash_sync(&path, &expected_base64));

        let _ = std::fs::remove_file(path);
    }
}

#[napi]
pub async fn download_files(tasks: Vec<DownloadTask>, max_concurrent: Option<u32>) -> napi::Result<DownloadResult> {
    let max_concurrent = max_concurrent.unwrap_or(10) as usize;
    let semaphore = Arc::new(Semaphore::new(max_concurrent));
    let completed = Arc::new(RwLock::new(0u32));
    let failed = Arc::new(RwLock::new(0u32));
    let errors = Arc::new(RwLock::new(Vec::new()));

    let mut handles = Vec::new();
    for task in tasks {
        let sem = semaphore.clone();
        let completed = completed.clone();
        let failed = failed.clone();
        let errors = errors.clone();

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            match download_file_internal(&task.url, &task.path, task.sha1.as_deref(), task.sha256.as_deref()).await {
                Ok(_) => { *completed.write().await += 1; }
                Err(e) => {
                    *failed.write().await += 1;
                    errors.write().await.push(format!("{}: {}", task.path, e));
                }
            }
        }));
    }

    for handle in handles { let _ = handle.await; }

    let success = *failed.read().await == 0;
    let completed_count = *completed.read().await;
    let failed_count = *failed.read().await;
    let error_list = errors.read().await.clone();

    Ok(DownloadResult {
        success,
        completed: completed_count,
        failed: failed_count,
        errors: error_list,
    })
}

#[napi]
pub async fn verify_file_hash(path: String, sha1: Option<String>, sha256: Option<String>) -> napi::Result<bool> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() { return Ok(false); }
    if let Some(expected) = sha1 { return Ok(verify_sha1_sync(&file_path, &expected)); }
    if let Some(expected) = sha256 { return Ok(verify_sha256_sync(&file_path, &expected)); }
    Ok(true)
}

#[napi]
pub async fn calculate_sha1(path: String) -> napi::Result<Option<String>> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() { return Ok(None); }
    Ok(tokio::fs::read(&file_path).await.ok().map(|data| {
        let mut hasher = Sha1::new();
        hasher.update(&data);
        hex::encode(hasher.finalize())
    }))
}

#[napi]
pub async fn calculate_sha256(path: String) -> napi::Result<Option<String>> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() { return Ok(None); }
    Ok(tokio::fs::read(&file_path).await.ok().map(|data| {
        let mut hasher = Sha256::new();
        hasher.update(&data);
        hex::encode(hasher.finalize())
    }))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct HashCheckTask {
    pub file_path: String,
    #[napi(ts_type = "string | null | undefined")]
    pub expected_sha1: Option<String>,
    #[napi(ts_type = "string | null | undefined")]
    pub expected_sha256: Option<String>,
    #[napi(ts_type = "string | null | undefined")]
    pub expected_sha512: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct HashCheckResult {
    pub file_path: String,
    pub is_valid: bool,
}

fn verify_multiple_file_hashes_sync(tasks: Vec<HashCheckTask>) -> Vec<HashCheckResult> {
    use rayon::prelude::*;

    tasks.into_par_iter().map(|task| {
        let path = PathBuf::from(&task.file_path);

        let expected_hash = task
            .expected_sha256
            .or(task.expected_sha512)
            .or(task.expected_sha1);

        let is_valid = if !path.exists() {
            false
        } else if let Some(expected) = expected_hash {
            verify_known_hash_sync(&path, &expected)
        } else {
            true // No hash provided = consider valid
        };

        HashCheckResult {
            file_path: task.file_path,
            is_valid,
        }
    }).collect()
}

#[napi]
pub async fn verify_multiple_file_hashes(tasks: Vec<HashCheckTask>) -> napi::Result<Vec<HashCheckResult>> {
    tokio::task::spawn_blocking(move || verify_multiple_file_hashes_sync(tasks))
        .await
        .map_err(|err| {
            napi::Error::from_reason(format!("Hash verification worker failed: {err}"))
        })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ServerModEntry {
    pub filename: String,
    pub url: String,
    #[napi(ts_type = "number | null | undefined")]
    pub size: Option<i64>,
    #[napi(ts_type = "string | null | undefined")]
    pub hash: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ServerSyncPlanResult {
    pub download_queue: Vec<ServerModEntry>,
    pub inspected: u32,
    pub queued: u32,
    pub skipped_unsafe: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct CleanupExtraModsResult {
    pub scanned: u32,
    pub deleted: u32,
    pub kept_locked: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct FastModListSyncSnapshot {
    pub manifest_revision: String,
    pub server_mods_signature: String,
    pub locked_mods_signature: String,
    pub local_mods_signature: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct FastModListSyncCheckResult {
    pub can_skip: bool,
    pub snapshot: FastModListSyncSnapshot,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct PostInstallModpackFilesResult {
    pub moved_resourcepacks: u32,
    pub removed_duplicates: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct NativeModConflict {
    pub conflict_type: String,
    pub file1: String,
    #[napi(ts_type = "string | null | undefined")]
    pub file2: Option<String>,
    pub reason: String,
}


#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
struct SyncHashCacheEntry {
    expected_hash: String,
    size: u64,
    modified_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct SyncHashCache {
    entries: HashMap<String, SyncHashCacheEntry>,
}

fn sync_hash_cache_path(root: &Path) -> PathBuf {
    root.join(".ml_sync_hash_cache_v1.json")
}

fn file_modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn load_sync_hash_cache(root: &Path) -> SyncHashCache {
    let cache_path = sync_hash_cache_path(root);
    let bytes = match std::fs::read(&cache_path) {
        Ok(bytes) => bytes,
        Err(_) => return SyncHashCache::default(),
    };

    serde_json::from_slice::<SyncHashCache>(&bytes).unwrap_or_default()
}

fn save_sync_hash_cache(root: &Path, cache: &SyncHashCache) {
    let cache_path = sync_hash_cache_path(root);
    if let Some(parent) = cache_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let payload = match serde_json::to_vec(cache) {
        Ok(payload) => payload,
        Err(_) => return,
    };

    let tmp_path = cache_path.with_extension("tmp");
    if std::fs::write(&tmp_path, payload).is_ok() {
        if std::fs::rename(&tmp_path, &cache_path).is_err() {
            let _ = std::fs::remove_file(&cache_path);
            let _ = std::fs::rename(&tmp_path, &cache_path);
        }
        let _ = std::fs::remove_file(&tmp_path);
    }
}

fn fast_mod_list_snapshot_path(root: &Path) -> PathBuf {
    root.join(".ml_fast_mod_list_sync_v1.json")
}

fn load_fast_mod_list_snapshot(root: &Path) -> Option<FastModListSyncSnapshot> {
    let cache_path = fast_mod_list_snapshot_path(root);
    let bytes = std::fs::read(&cache_path).ok()?;
    serde_json::from_slice::<FastModListSyncSnapshot>(&bytes).ok()
}

fn save_fast_mod_list_snapshot(root: &Path, snapshot: &FastModListSyncSnapshot) -> bool {
    let cache_path = fast_mod_list_snapshot_path(root);
    if let Some(parent) = cache_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let payload = match serde_json::to_vec(snapshot) {
        Ok(payload) => payload,
        Err(_) => return false,
    };

    let tmp_path = cache_path.with_extension("tmp");
    if std::fs::write(&tmp_path, payload).is_ok() {
        if std::fs::rename(&tmp_path, &cache_path).is_err() {
            let _ = std::fs::remove_file(&cache_path);
            let _ = std::fs::rename(&tmp_path, &cache_path);
        }
        let _ = std::fs::remove_file(&tmp_path);
        return true;
    }

    false
}

fn normalize_server_mod_list_entry(value: &str) -> Option<String> {
    let normalized = value.replace('\\', "/").trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    if !is_safe_relative_path(&normalized) {
        return None;
    }
    if !normalized.starts_with("mods/") {
        return None;
    }

    let normalized = if normalized.ends_with(".jar.disabled") {
        normalized[..normalized.len().saturating_sub(".disabled".len())].to_string()
    } else {
        normalized
    };

    if normalized.ends_with(".jar") {
        Some(normalized)
    } else {
        None
    }
}

fn normalize_locked_mod_list_entry(value: &str) -> Option<String> {
    let normalized = value.replace('\\', "/").trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    let normalized = normalized.trim_start_matches('/').to_string();
    let normalized = if normalized.starts_with("mods/") {
        normalized
    } else {
        format!("mods/{normalized}")
    };

    let normalized = if normalized.ends_with(".jar.disabled") {
        normalized[..normalized.len().saturating_sub(".disabled".len())].to_string()
    } else {
        normalized
    };

    if normalized.ends_with(".jar") {
        Some(normalized)
    } else {
        None
    }
}

fn build_signature_from_entries(entries: Vec<String>) -> String {
    let mut values: Vec<String> = entries;
    values.sort();
    values.dedup();
    values.join("|")
}

fn build_server_mods_list_signature(server_filenames: Vec<String>) -> String {
    build_signature_from_entries(
        server_filenames
            .into_iter()
            .filter_map(|value| normalize_server_mod_list_entry(&value))
            .collect(),
    )
}

fn build_locked_mods_list_signature(locked_mods: Vec<String>) -> String {
    build_signature_from_entries(
        locked_mods
            .into_iter()
            .filter_map(|value| normalize_locked_mod_list_entry(&value))
            .collect(),
    )
}

fn build_local_mods_list_signature(game_dir: &Path) -> String {
    let mods_dir = game_dir.join("mods");
    if !mods_dir.exists() {
        return String::new();
    }

    let entries = std::fs::read_dir(&mods_dir)
        .ok()
        .into_iter()
        .flat_map(|iter| iter.flatten())
        .filter_map(|entry| entry.file_name().to_str().map(|name| name.to_string()))
        .filter_map(|file_name| normalize_locked_mod_list_entry(&file_name))
        .collect::<Vec<String>>();

    build_signature_from_entries(entries)
}

fn build_fast_mod_list_snapshot(
    game_dir: &Path,
    manifest_revision: String,
    server_filenames: Vec<String>,
    locked_mods: Vec<String>,
) -> FastModListSyncSnapshot {
    FastModListSyncSnapshot {
        manifest_revision,
        server_mods_signature: build_server_mods_list_signature(server_filenames),
        locked_mods_signature: build_locked_mods_list_signature(locked_mods),
        local_mods_signature: build_local_mods_list_signature(game_dir),
    }
}

fn is_safe_relative_path(value: &str) -> bool {
    let p = Path::new(value);
    if p.is_absolute() {
        return false;
    }
    for comp in p.components() {
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return false,
            _ => {}
        }
    }
    true
}

fn is_valid_zip_file_sync(path: &PathBuf) -> bool {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    ZipArchive::new(file).is_ok()
}

fn shader_version_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?im)^\s*version\s*[=:]\s*(.+)\s*$").unwrap())
}

pub(crate) fn parse_shader_version(content: &str) -> Option<String> {
    shader_version_re()
        .captures(content)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().trim().to_string()))
}

pub(crate) fn parse_pack_format(content: &str) -> Option<u32> {
    let json = serde_json::from_str::<serde_json::Value>(content).ok()?;
    json.get("pack")?
        .get("pack_format")?
        .as_u64()
        .map(|v| v as u32)
}

fn normalize_mod_name_for_dedupe(file_name: &str) -> String {
    static VERSION_RE: OnceLock<Regex> = OnceLock::new();
    static LOADER_RE: OnceLock<Regex> = OnceLock::new();
    static SEP_RE: OnceLock<Regex> = OnceLock::new();

    let mut name = file_name.to_lowercase();
    if let Some(stripped) = name.strip_suffix(".jar") {
        name = stripped.to_string();
    }

    let version_re = VERSION_RE.get_or_init(|| {
        Regex::new(r"[-_+](\d+\.?\d*\.?\d*|v?\d+)([-_.+][a-z0-9]+)*$").unwrap()
    });
    name = version_re.replace(&name, "").to_string();

    let loader_re = LOADER_RE.get_or_init(|| {
        Regex::new(
            r"[-_](fabric|forge|neoforge|quilt|mc\d+[\.\d]*|minecraft|universal|client|server)[-_]?",
        )
        .unwrap()
    });
    name = loader_re.replace_all(&name, "-").to_string();

    let sep_re = SEP_RE.get_or_init(|| Regex::new(r"[-_]+").unwrap());
    name = sep_re.replace_all(&name, "-").to_string();

    name.trim_matches('-').to_string()
}

fn plan_server_sync_downloads_sync(game_dir: String, mods: Vec<ServerModEntry>) -> ServerSyncPlanResult {
    let root = PathBuf::from(game_dir);
    let mut download_queue = Vec::new();
    let mut inspected = 0u32;
    let mut skipped_unsafe = 0u32;
    let mut hash_cache = load_sync_hash_cache(&root);
    let mut cache_dirty = false;
    let mut mismatch_debug_logged = 0u32;

    let valid_paths: HashSet<String> = mods
        .iter()
        .map(|mod_entry| mod_entry.filename.replace('\\', "/"))
        .collect();
    let cache_before_prune = hash_cache.entries.len();
    hash_cache
        .entries
        .retain(|relative_path, _| valid_paths.contains(relative_path));
    if hash_cache.entries.len() != cache_before_prune {
        cache_dirty = true;
    }

    for mod_entry in mods {
        inspected += 1;
        let normalized_filename = mod_entry.filename.replace('\\', "/");
        if !is_safe_relative_path(&normalized_filename) {
            skipped_unsafe += 1;
            continue;
        }

        let file_path = root.join(&normalized_filename);
        if let Some(parent) = file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let metadata = match std::fs::metadata(&file_path) {
            Ok(meta) => meta,
            Err(_) => {
                if hash_cache.entries.remove(&normalized_filename).is_some() {
                    cache_dirty = true;
                }
                download_queue.push(mod_entry);
                continue;
            }
        };

        let is_jar = file_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("jar"))
            .unwrap_or(false);

        let file_size = metadata.len();
        let modified_ms = file_modified_ms(&metadata);

        if let Some(expected_size) = mod_entry.size {
            if file_size as i64 != expected_size {
                if hash_cache.entries.remove(&normalized_filename).is_some() {
                    cache_dirty = true;
                }
                download_queue.push(mod_entry);
                continue;
            }
        }

        if let Some(expected_hash_raw) = mod_entry.hash.as_deref() {
            let expected_hash_raw = expected_hash_raw.trim();
            let normalized_hash = normalize_expected_hash(expected_hash_raw);
            let expected_hash_for_cache = normalized_hash
                .as_ref()
                .map(|value| value.hex().to_string())
                .unwrap_or_else(|| expected_hash_raw.to_ascii_lowercase());

            let cache_hit_valid = hash_cache
                .entries
                .get(&normalized_filename)
                .map(|entry| {
                    entry.expected_hash == expected_hash_for_cache
                        && entry.size == file_size
                        && entry.modified_ms == modified_ms
                })
                .unwrap_or(false);
            if cache_hit_valid {
                // Cache hit means this exact file+hash was already validated previously.
                continue;
            }

            if !verify_known_hash_sync(&file_path, expected_hash_raw) {
                if mismatch_debug_logged < 3 {
                    if let Some(expected) = normalized_hash.as_ref() {
                        let actual = match expected {
                            NormalizedExpectedHash::Sha1(_) => calculate_sha1_hex_sync(&file_path),
                            NormalizedExpectedHash::Sha256(_) => calculate_sha256_hex_sync(&file_path),
                        }
                        .unwrap_or_else(|| "<unavailable>".to_string());

                        println!(
                            "[Rust Sync Debug] Hash mismatch file={} algo={} expected={} actual={} bytes={}",
                            normalized_filename,
                            expected.algorithm_name(),
                            expected.hex(),
                            actual,
                            file_size
                        );
                    } else {
                        println!(
                            "[Rust Sync Debug] Unsupported hash format file={} rawHash={} bytes={}",
                            normalized_filename, expected_hash_raw, file_size
                        );
                    }
                    mismatch_debug_logged += 1;
                }
                if hash_cache.entries.remove(&normalized_filename).is_some() {
                    cache_dirty = true;
                }
                download_queue.push(mod_entry);
                continue;
            }

            let new_entry = SyncHashCacheEntry {
                expected_hash: expected_hash_for_cache,
                size: file_size,
                modified_ms,
            };
            let changed = hash_cache
                .entries
                .get(&normalized_filename)
                .map(|entry| entry != &new_entry)
                .unwrap_or(true);
            if changed {
                hash_cache.entries.insert(normalized_filename, new_entry);
                cache_dirty = true;
            }
            continue;
        }

        // No server hash: fallback checks.
        if hash_cache.entries.remove(&normalized_filename).is_some() {
            cache_dirty = true;
        }
        if is_jar && !is_valid_zip_file_sync(&file_path) {
            download_queue.push(mod_entry);
            continue;
        }
    }

    if cache_dirty {
        save_sync_hash_cache(&root, &hash_cache);
    }

    ServerSyncPlanResult {
        queued: download_queue.len() as u32,
        download_queue,
        inspected,
        skipped_unsafe,
    }
}

#[napi]
pub async fn plan_server_sync_downloads(
    game_dir: String,
    mods: Vec<ServerModEntry>,
) -> napi::Result<ServerSyncPlanResult> {
    tokio::task::spawn_blocking(move || plan_server_sync_downloads_sync(game_dir, mods))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Sync planner worker failed: {err}")))
}

fn cleanup_extra_mods_sync(
    game_dir: String,
    server_filenames: Vec<String>,
    locked_mods: Option<Vec<String>>,
) -> CleanupExtraModsResult {
    let mods_dir = PathBuf::from(game_dir).join("mods");
    if !mods_dir.exists() {
        return CleanupExtraModsResult {
            scanned: 0,
            deleted: 0,
            kept_locked: 0,
        };
    }

    let server_paths: HashSet<String> = server_filenames
        .into_iter()
        .map(|value| value.replace('\\', "/"))
        .collect();
    let locked: HashSet<String> = locked_mods.unwrap_or_default().into_iter().collect();

    let mut scanned = 0u32;
    let mut deleted = 0u32;
    let mut kept_locked = 0u32;

    let entries = match std::fs::read_dir(&mods_dir) {
        Ok(entries) => entries,
        Err(_) => {
            return CleanupExtraModsResult {
                scanned: 0,
                deleted: 0,
                kept_locked: 0,
            }
        }
    };

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !(file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled")) {
            continue;
        }

        scanned += 1;

        let relative_path = format!("mods/{file_name}");
        let real_name = file_name.replace(".jar.disabled", ".jar");
        let real_relative_path = format!("mods/{real_name}");
        let is_server_file =
            server_paths.contains(&relative_path) || server_paths.contains(&real_relative_path);
        if is_server_file {
            continue;
        }

        if locked.contains(&file_name) || locked.contains(&real_name) {
            kept_locked += 1;
            continue;
        }

        if std::fs::remove_file(entry.path()).is_ok() {
            deleted += 1;
        }
    }

    CleanupExtraModsResult {
        scanned,
        deleted,
        kept_locked,
    }
}

#[napi]
pub async fn cleanup_extra_mods(
    game_dir: String,
    server_filenames: Vec<String>,
    locked_mods: Option<Vec<String>>,
) -> napi::Result<CleanupExtraModsResult> {
    tokio::task::spawn_blocking(move || cleanup_extra_mods_sync(game_dir, server_filenames, locked_mods))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Cleanup worker failed: {err}")))
}

fn check_fast_mod_list_sync_sync(
    game_dir: String,
    manifest_revision: String,
    server_filenames: Vec<String>,
    locked_mods: Option<Vec<String>>,
) -> FastModListSyncCheckResult {
    let root = PathBuf::from(game_dir);
    let snapshot = build_fast_mod_list_snapshot(
        &root,
        manifest_revision,
        server_filenames,
        locked_mods.unwrap_or_default(),
    );

    if snapshot.manifest_revision.is_empty() {
        return FastModListSyncCheckResult {
            can_skip: false,
            snapshot,
        };
    }

    let previous = load_fast_mod_list_snapshot(&root);
    let can_skip = previous
        .as_ref()
        .map(|prev| {
            prev.manifest_revision == snapshot.manifest_revision
                && prev.server_mods_signature == snapshot.server_mods_signature
                && prev.locked_mods_signature == snapshot.locked_mods_signature
                && prev.local_mods_signature == snapshot.local_mods_signature
        })
        .unwrap_or(false);

    FastModListSyncCheckResult { can_skip, snapshot }
}

#[napi]
pub async fn check_fast_mod_list_sync(
    game_dir: String,
    manifest_revision: String,
    server_filenames: Vec<String>,
    locked_mods: Option<Vec<String>>,
) -> napi::Result<FastModListSyncCheckResult> {
    tokio::task::spawn_blocking(move || {
        check_fast_mod_list_sync_sync(
            game_dir,
            manifest_revision,
            server_filenames,
            locked_mods,
        )
    })
    .await
    .map_err(|err| napi::Error::from_reason(format!("Fast list check worker failed: {err}")))
}

fn save_fast_mod_list_sync_snapshot_sync(
    game_dir: String,
    snapshot: FastModListSyncSnapshot,
) -> bool {
    let root = PathBuf::from(game_dir);
    save_fast_mod_list_snapshot(&root, &snapshot)
}

#[napi]
pub async fn save_fast_mod_list_sync_snapshot(
    game_dir: String,
    snapshot: FastModListSyncSnapshot,
) -> napi::Result<bool> {
    tokio::task::spawn_blocking(move || save_fast_mod_list_sync_snapshot_sync(game_dir, snapshot))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Fast list save worker failed: {err}")))
}

fn post_install_modpack_files_sync(game_dir: String) -> PostInstallModpackFilesResult {
    let mods_dir = PathBuf::from(&game_dir).join("mods");
    if !mods_dir.exists() {
        return PostInstallModpackFilesResult {
            moved_resourcepacks: 0,
            removed_duplicates: 0,
        };
    }

    let resourcepacks_dir = PathBuf::from(&game_dir).join("resourcepacks");
    let mut moved_resourcepacks = 0u32;
    let mut removed_duplicates = 0u32;

    let zip_files: Vec<PathBuf> = std::fs::read_dir(&mods_dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.ends_with(".zip"))
                .unwrap_or(false)
        })
        .collect();

    if !zip_files.is_empty() {
        let _ = std::fs::create_dir_all(&resourcepacks_dir);
        for src_path in zip_files {
            let file_name = match src_path.file_name() {
                Some(name) => name.to_owned(),
                None => continue,
            };
            let dest_path = resourcepacks_dir.join(file_name);
            if dest_path.exists() {
                let _ = std::fs::remove_file(&dest_path);
            }
            if std::fs::rename(&src_path, &dest_path).is_ok() {
                moved_resourcepacks += 1;
            }
        }
    }

    let mut mod_map: HashMap<String, (PathBuf, u64)> = HashMap::new();
    let jar_files: Vec<PathBuf> = std::fs::read_dir(&mods_dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.ends_with(".jar"))
                .unwrap_or(false)
        })
        .collect();

    for file_path in jar_files {
        let file_name = match file_path.file_name().and_then(|name| name.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let size = std::fs::metadata(&file_path).map(|meta| meta.len()).unwrap_or(0);
        let key = normalize_mod_name_for_dedupe(&file_name);
        if key.is_empty() {
            continue;
        }

        if let Some((existing_path, existing_size)) = mod_map.get(&key).cloned() {
            if size > existing_size {
                if std::fs::remove_file(&existing_path).is_ok() {
                    removed_duplicates += 1;
                }
                mod_map.insert(key, (file_path, size));
            } else if std::fs::remove_file(&file_path).is_ok() {
                removed_duplicates += 1;
            }
        } else {
            mod_map.insert(key, (file_path, size));
        }
    }

    PostInstallModpackFilesResult {
        moved_resourcepacks,
        removed_duplicates,
    }
}

#[napi]
pub async fn post_install_modpack_files(game_dir: String) -> napi::Result<PostInstallModpackFilesResult> {
    tokio::task::spawn_blocking(move || post_install_modpack_files_sync(game_dir))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Post-install worker failed: {err}")))
}

fn detect_mod_conflicts_sync(mods_dir: String) -> Vec<NativeModConflict> {
    let mods_path = PathBuf::from(mods_dir);
    if !mods_path.exists() {
        return Vec::new();
    }

    let files: Vec<String> = std::fs::read_dir(&mods_path)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".jar") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    let mut conflicts = Vec::new();
    let mut mod_names: HashMap<String, Vec<String>> = HashMap::new();
    let version_split_re = Regex::new(r"^(.+?)[-_]\d").unwrap();

    for file in &files {
        let lower = file.to_lowercase();
        let mod_name = version_split_re
            .captures(&lower)
            .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
            .unwrap_or(lower);
        mod_names.entry(mod_name).or_default().push(file.clone());
    }

    for (name, file_list) in mod_names {
        if file_list.len() > 1 {
            conflicts.push(NativeModConflict {
                conflict_type: "duplicate_mod".to_string(),
                file1: file_list[0].clone(),
                file2: file_list.get(1).cloned(),
                reason: format!(
                    "Found multiple versions of \"{name}\": {}",
                    file_list.join(", ")
                ),
            });
        }
    }

    let lib_patterns = vec![
        ("ASM", Regex::new(r"asm[-_]?\d").unwrap()),
        ("Guava", Regex::new(r"guava[-_]?\d").unwrap()),
        ("Gson", Regex::new(r"gson[-_]?\d").unwrap()),
    ];

    for (lib_name, pattern) in lib_patterns {
        let matches: Vec<String> = files
            .iter()
            .filter(|file| pattern.is_match(&file.to_lowercase()))
            .cloned()
            .collect();
        if matches.len() > 1 {
            conflicts.push(NativeModConflict {
                conflict_type: "library_conflict".to_string(),
                file1: matches[0].clone(),
                file2: matches.get(1).cloned(),
                reason: format!("Found duplicate \"{lib_name}\" libraries that may conflict."),
            });
        }
    }

    conflicts
}

#[napi]
pub fn detect_mod_conflicts_native(mods_dir: String) -> napi::Result<Vec<NativeModConflict>> {
    Ok(detect_mod_conflicts_sync(mods_dir))
}


#[cfg(test)]
mod native_migration_tests {
    use super::*;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::write::FileOptions;
    use zip::ZipWriter;

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        path.push(format!("{prefix}_{nonce}"));
        std::fs::create_dir_all(&path).expect("failed to create temp dir");
        path
    }

    fn write_zip_file(path: &Path, files: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).expect("failed to create zip");
        let mut zip = ZipWriter::new(file);
        let options = FileOptions::default();
        for (name, data) in files {
            zip.start_file(*name, options)
                .expect("failed to start zip file entry");
            zip.write_all(data).expect("failed to write zip entry");
        }
        zip.finish().expect("failed to finalize zip");
    }

    #[test]
    fn scan_pack_directory_sync_reads_resourcepack_metadata() {
        let root = unique_temp_dir("ml_scan_pack_test");
        let pack_path = root.join("FancyPack.zip");
        let pack_icon = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'];
        write_zip_file(
            &pack_path,
            &[
                ("pack.png", &pack_icon),
                (
                    "pack.mcmeta",
                    br#"{"pack":{"pack_format":15,"description":"Demo pack"}}"#,
                ),
            ],
        );

        let entries = scan_pack_directory_sync(
            root.to_string_lossy().to_string(),
            "resource".to_string(),
        );

        assert_eq!(entries.len(), 1);
        let first = &entries[0];
        assert_eq!(first.filename, "FancyPack.zip");
        assert_eq!(first.display_name, "FancyPack");
        assert!(first.enabled);
        assert!(first.icon_base64.is_some());
        assert_eq!(first.pack_format, Some(15));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn export_modpack_archive_sync_writes_mrpack_overrides() {
        let root = unique_temp_dir("ml_export_test");
        let instance_dir = root.join("instance");
        std::fs::create_dir_all(instance_dir.join("config")).expect("create config");
        std::fs::create_dir_all(instance_dir.join("mods")).expect("create mods");
        std::fs::write(instance_dir.join("config").join("demo.txt"), b"hello").expect("write cfg");
        std::fs::write(instance_dir.join("mods").join("demo.jar"), b"jarbytes").expect("write mod");

        let output_path = root.join("pack.mrpack");
        let result = export_modpack_archive_sync(ModpackExportRequest {
            instance_dir: instance_dir.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            format: "mrpack".to_string(),
            included_paths: vec!["config".to_string(), "mods/demo.jar".to_string()],
            name: "Test Pack".to_string(),
            version: "1.0.0".to_string(),
            description: Some("demo".to_string()),
            minecraft_version: "1.20.1".to_string(),
            loader: "fabric".to_string(),
            loader_version: Some("0.15.0".to_string()),
        })
        .expect("export failed");

        assert!(result.success);
        assert!(output_path.exists());

        let file = std::fs::File::open(&output_path).expect("open archive");
        let mut archive = ZipArchive::new(file).expect("read archive");

        assert!(archive.by_name("modrinth.index.json").is_ok());
        assert!(archive.by_name("overrides/config/demo.txt").is_ok());
        assert!(archive.by_name("overrides/mods/demo.jar").is_ok());

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn fast_mod_list_sync_check_can_skip_after_snapshot_saved() {
        let root = unique_temp_dir("ml_fast_mod_sync_test");
        let mods_dir = root.join("mods");
        std::fs::create_dir_all(&mods_dir).expect("create mods dir");
        std::fs::write(mods_dir.join("a.jar"), b"jar-a").expect("write a.jar");
        std::fs::write(mods_dir.join("b.jar.disabled"), b"jar-b").expect("write b.jar.disabled");

        let first = check_fast_mod_list_sync_sync(
            root.to_string_lossy().to_string(),
            "rev-1".to_string(),
            vec!["mods/a.jar".to_string(), "mods/b.jar".to_string()],
            Some(vec![]),
        );
        assert!(!first.can_skip);
        assert!(!first.snapshot.local_mods_signature.is_empty());

        assert!(save_fast_mod_list_sync_snapshot_sync(
            root.to_string_lossy().to_string(),
            first.snapshot.clone(),
        ));

        let second = check_fast_mod_list_sync_sync(
            root.to_string_lossy().to_string(),
            "rev-1".to_string(),
            vec!["mods/a.jar".to_string(), "mods/b.jar".to_string()],
            Some(vec![]),
        );
        assert!(second.can_skip);

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn fast_mod_list_sync_check_detects_local_list_changes() {
        let root = unique_temp_dir("ml_fast_mod_sync_change_test");
        let mods_dir = root.join("mods");
        std::fs::create_dir_all(&mods_dir).expect("create mods dir");
        std::fs::write(mods_dir.join("a.jar"), b"jar-a").expect("write a.jar");

        let initial = check_fast_mod_list_sync_sync(
            root.to_string_lossy().to_string(),
            "rev-1".to_string(),
            vec!["mods/a.jar".to_string()],
            Some(vec![]),
        );
        assert!(save_fast_mod_list_sync_snapshot_sync(
            root.to_string_lossy().to_string(),
            initial.snapshot.clone(),
        ));

        std::fs::write(mods_dir.join("c.jar"), b"jar-c").expect("write c.jar");

        let changed = check_fast_mod_list_sync_sync(
            root.to_string_lossy().to_string(),
            "rev-1".to_string(),
            vec!["mods/a.jar".to_string()],
            Some(vec![]),
        );
        assert!(!changed.can_skip);

        let _ = std::fs::remove_dir_all(root);
    }
}

