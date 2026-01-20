//! Download Manager Module

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Semaphore, RwLock};
use tokio::io::AsyncWriteExt;
use futures::StreamExt;
use sha1::{Sha1, Digest as Sha1Digest};
use sha2::Sha256;

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
    std::fs::read(path).ok().map(|data| {
        let mut hasher = Sha1::new();
        hasher.update(&data);
        hex::encode(hasher.finalize()).to_lowercase() == expected.to_lowercase()
    }).unwrap_or(false)
}

fn verify_sha256_sync(path: &PathBuf, expected: &str) -> bool {
    std::fs::read(path).ok().map(|data| {
        let mut hasher = Sha256::new();
        hasher.update(&data);
        hex::encode(hasher.finalize()).to_lowercase() == expected.to_lowercase()
    }).unwrap_or(false)
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
