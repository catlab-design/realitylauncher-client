use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;

use sha1::Digest as Sha1Digest;

/// Configuration for batch downloads.
#[derive(Debug, Clone)]
pub struct DownloadConfig {
    /// Max concurrent downloads (default: 8).
    pub concurrency: usize,
    /// Max retries per file (default: 3).
    pub max_retries: u32,
}

impl Default for DownloadConfig {
    fn default() -> Self {
        Self {
            concurrency: 8,
            max_retries: 3,
        }
    }
}

/// A single file to download.
#[derive(Debug, Clone)]
pub struct DownloadItem {
    pub url: String,
    pub dest: PathBuf,
    pub expected_sha1: Option<String>,
    pub hashes: std::collections::HashMap<String, String>,
    pub label: String,
}

impl DownloadItem {
    pub fn new(url: String, dest: PathBuf) -> Self {
        let label = dest
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| url.clone());
        Self {
            url,
            dest,
            expected_sha1: None,
            hashes: std::collections::HashMap::new(),
            label,
        }
    }

    pub fn with_sha1(mut self, sha1: String) -> Self {
        self.expected_sha1 = Some(sha1);
        self
    }

    pub fn with_label(mut self, label: String) -> Self {
        self.label = label;
        self
    }
}

/// Outcome of a single file download attempt.
#[derive(Debug)]
pub enum DownloadOutcome {
    Succeeded(u64),
    FailedPermanent(String),
    FailedRetryable(String),
}

/// Result of a batch download.
#[derive(Debug, Default)]
pub struct BatchResult {
    pub succeeded: u32,
    pub failed: Vec<(String, String)>,
    pub missing_on_server: Vec<(String, String)>,
    pub bytes_downloaded: u64,
}

/// Download a batch of files concurrently.
///
/// `on_file_done` is called after each file completes with (completed_count, total_count, label).
/// Returns a `BatchResult` with per-file outcomes.
pub async fn download_batch(
    items: Vec<DownloadItem>,
    config: &DownloadConfig,
    cancel_flag: Option<&AtomicBool>,
    on_file_done: impl Fn(u32, u32, &str),
) -> BatchResult {
    if items.is_empty() {
        return BatchResult::default();
    }

    let total = items.len() as u32;
    let client = crate::http_client::HTTP_CLIENT.clone();
    let done = Arc::new(AtomicU32::new(0));
    let bytes_dl = Arc::new(AtomicU64::new(0));
    let missing_set: Arc<std::sync::Mutex<Vec<(String, String)>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));
    let failed_set: Arc<std::sync::Mutex<Vec<(String, String)>>> =
        Arc::new(std::sync::Mutex::new(Vec::new()));

    let sem = Arc::new(tokio::sync::Semaphore::new(config.concurrency));
    let mut handles = Vec::with_capacity(items.len());

    for item in &items {
        let client = client.clone();
        let sem = sem.clone();
        let done = done.clone();
        let bytes_dl = bytes_dl.clone();
        let missing_set = missing_set.clone();
        let failed_set = failed_set.clone();
        let item = item.clone();
        let max_retries = config.max_retries;
        let cancel = cancel_flag.map(|f| f.load(Ordering::SeqCst));

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.map_err(|_| "Semaphore closed".to_string())?;

            if cancel.is_some_and(|cancelled| cancelled) {
                done.fetch_add(1, Ordering::Relaxed);
                return Err("Cancelled".to_string());
            }

            match download_file_with_retry(&client, &item, max_retries, None).await {
                Ok(size) => {
                    done.fetch_add(1, Ordering::Relaxed);
                    bytes_dl.fetch_add(size, Ordering::Relaxed);
                    Ok(size)
                }
                Err(e) => {
                    done.fetch_add(1, Ordering::Relaxed);
                    if is_missing_on_server(&e) {
                        missing_set.lock().unwrap().push((item.label, e));
                    } else {
                        failed_set.lock().unwrap().push((item.label, e));
                    }
                    Err("Failed".to_string())
                }
            }
        }));
    }

    // Poll for completion and report progress
    let total_completed = Arc::new(AtomicU32::new(0));
    loop {
        let current = done.load(Ordering::Relaxed);
        let prev = total_completed.swap(current, Ordering::Relaxed);
        if current > prev {
            on_file_done(current, total, "");
        }
        if current >= total {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    // Collect all results
    for handle in handles {
        let _ = handle.await;
    }

    let bytes_total = bytes_dl.load(Ordering::Relaxed);
    let missing: Vec<(String, String)> = missing_set.lock().unwrap().drain(..).collect();
    let failed: Vec<(String, String)> = failed_set.lock().unwrap().drain(..).collect();

    BatchResult {
        succeeded: total - (missing.len() + failed.len()) as u32,
        failed,
        missing_on_server: missing,
        bytes_downloaded: bytes_total,
    }
}

/// Download a single file with retry, hash verification, and atomic write.
pub async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &PathBuf,
    expected_sha1: Option<&str>,
) -> Result<u64, String> {
    let mut item = DownloadItem::new(url.to_string(), dest.clone());
    if let Some(s) = expected_sha1 {
        item.expected_sha1 = Some(s.to_string());
    }
    download_file_with_retry(client, &item, 0, None).await
}

async fn download_file_with_retry(
    client: &reqwest::Client,
    item: &DownloadItem,
    max_retries: u32,
    cancel_flag: Option<&AtomicBool>,
) -> Result<u64, String> {
    let mut last_err = String::new();

    for attempt in 1..=max_retries.max(1) {
        if cancel_flag.is_some_and(|f| f.load(Ordering::SeqCst)) {
            return Err("Cancelled".into());
        }

        match download_file_once(client, item).await {
            Ok(size) => return Ok(size),
            Err(e) => {
                last_err = e;
                if is_permanent_http(&last_err) {
                    return Err(last_err);
                }
                if attempt < max_retries.max(1) {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        attempt as u64 * 1000 + 500,
                    ))
                    .await;
                }
            }
        }
    }

    Err(last_err)
}

fn select_hash_algo(
    expected_sha1: Option<&str>,
    hashes: &std::collections::HashMap<String, String>,
) -> Option<(HashVariant, String)> {
    if let Some(sha1) = expected_sha1 {
        return Some((HashVariant::Sha1, sha1.to_string()));
    }
    if let Some(sha1) = hashes.get("sha1") {
        return Some((HashVariant::Sha1, sha1.clone()));
    }
    if let Some(sha256) = hashes.get("sha256") {
        return Some((HashVariant::Sha256, sha256.clone()));
    }
    if let Some(sha512) = hashes.get("sha512") {
        return Some((HashVariant::Sha512, sha512.clone()));
    }
    None
}

enum HashVariant {
    Sha1,
    Sha256,
    Sha512,
}

async fn download_file_once(
    client: &reqwest::Client,
    item: &DownloadItem,
) -> Result<u64, String> {
    if let Some(parent) = item.dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Dir error: {e}"))?;
    }

    let tmp_path = item.dest.with_extension("tmp");

    let resp = client
        .get(&item.url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| format!("HTTP_STATUS:0 Network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(200).collect();
        return Err(format!("HTTP_STATUS:{} {}", status.as_u16(), snippet));
    }

    let hash_info = select_hash_algo(item.expected_sha1.as_deref(), &item.hashes);
    let is_jar = item.url.ends_with(".jar") || item.dest.to_string_lossy().ends_with(".jar");

    let mut file =
        std::fs::File::create(&tmp_path).map_err(|e| format!("Create error: {e}"))?;
    let mut stream = resp.bytes_stream();
    let mut size: u64 = 0;

    use futures_util::StreamExt;

    match hash_info {
        Some((HashVariant::Sha1, ref expected)) => {
            let mut hasher = sha1::Sha1::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("HTTP_STATUS:0 Read error: {e}"))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Write error: {e}"))?;
                size += chunk.len() as u64;
                hasher.update(&chunk);
            }
            let actual = hex::encode(hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("SHA1 mismatch: expected {expected}, got {actual}"));
            }
        }
        Some((HashVariant::Sha256, ref expected)) => {
            let mut hasher = sha2::Sha256::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("HTTP_STATUS:0 Read error: {e}"))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Write error: {e}"))?;
                size += chunk.len() as u64;
                hasher.update(&chunk);
            }
            let actual = hex::encode(hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("sha256 mismatch: expected {expected}, got {actual}"));
            }
        }
        Some((HashVariant::Sha512, ref expected)) => {
            let mut hasher = sha2::Sha512::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("HTTP_STATUS:0 Read error: {e}"))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Write error: {e}"))?;
                size += chunk.len() as u64;
                hasher.update(&chunk);
            }
            let actual = hex::encode(hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(format!("sha512 mismatch: expected {expected}, got {actual}"));
            }
        }
        None => {
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("HTTP_STATUS:0 Read error: {e}"))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Write error: {e}"))?;
                size += chunk.len() as u64;
            }
        }
    }

    drop(file);

    if is_jar {
        let f = std::fs::File::open(&tmp_path).map_err(|e| format!("Open error: {e}"))?;
        if zip::ZipArchive::new(f).is_err() {
            let _ = std::fs::remove_file(&tmp_path);
            return Err("Not a valid ZIP/JAR archive".into());
        }
    }

    if item.dest.exists() {
        std::fs::remove_file(&item.dest).ok();
    }
    std::fs::rename(&tmp_path, &item.dest).map_err(|e| format!("Rename error: {e}"))?;

    Ok(size)
}

fn is_permanent_http(err: &str) -> bool {
    if let Some(s) = err.strip_prefix("HTTP_STATUS:") {
        if let Ok(status) = s.split(' ').next().unwrap_or("").parse::<u16>() {
            return matches!(status, 400 | 401 | 403 | 404 | 410);
        }
    }
    false
}

fn is_missing_on_server(err: &str) -> bool {
    if let Some(s) = err.strip_prefix("HTTP_STATUS:") {
        if let Ok(status) = s.split(' ').next().unwrap_or("").parse::<u16>() {
            return matches!(status, 404 | 410);
        }
    }
    false
}


