use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

const API_URL: &str = "https://api.reality.catlabdesign.space";






static INSTALL_CANCELLED: AtomicBool = AtomicBool::new(false);



pub(crate) const CANCELLED_SENTINEL: &str = "Cancelled";

pub(crate) fn reset_cancel_flag() {
    INSTALL_CANCELLED.store(false, Ordering::SeqCst);
}

pub(crate) fn is_cancelled() -> bool {
    INSTALL_CANCELLED.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn modpack_cancel_install() -> crate::cloud::SimpleResult {
    INSTALL_CANCELLED.store(true, Ordering::SeqCst);
    crate::cloud::SimpleResult {
        ok: true,
        error: None,
        message: None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackFile {
    pub path: String,
    pub downloads: Vec<String>,
    pub file_size: u64,
    pub hashes: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackIndex {
    pub format_version: i32,
    pub game: String,
    pub version_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub files: Vec<ModpackFile>,
    pub dependencies: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfModLoader {
    pub id: String,
    pub primary: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfMinecraft {
    pub version: String,
    pub mod_loaders: Option<Vec<CfModLoader>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfFileEntry {
    // CurseForge's manifest.json uses uppercase `projectID`/`fileID`, which the
    // struct's camelCase rule (projectId/fileId) does NOT match — deserializing
    // failed with "missing field projectId". Pin the real CF keys explicitly.
    #[serde(rename = "projectID")]
    pub project_id: i32,
    #[serde(rename = "fileID")]
    pub file_id: i32,
    pub required: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfManifest {
    pub minecraft: CfMinecraft,
    pub manifest_type: String,
    pub manifest_version: i32,
    pub name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub files: Vec<CfFileEntry>,
    pub overrides: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackInstallResult {
    pub ok: bool,
    pub instance_id: Option<String>,
    
    
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instance: Option<crate::instances::GameInstance>,
    pub name: Option<String>,
    pub error: Option<String>,
    
    
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub failed_files: Vec<String>,
}

impl ModpackInstallResult {
    fn fail(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(error.into()),
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreInstallResult {
    pub ok: bool,
    pub name: String,
    pub version: String,
    pub loaders: Vec<String>,
    pub files_count: u32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: &'static str, // "directory" | "file" — matches FileSelectionTree.tsx's FileNode
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancesListFilesResult {
    pub ok: bool,
    pub files: Option<Vec<FileTreeNode>>,
    pub error: Option<String>,
}




const EXPORT_TREE_SKIP_DIRS: &[&str] = &[
    "saves", "logs", "crash-reports", "screenshots", ".mixin.out", ".fabric",
    "versions", "libraries", "natives", "assets", "essential",
];
const EXPORT_TREE_MAX_DEPTH: u32 = 10;
const EXPORT_TREE_MAX_ENTRIES: usize = 5000;

fn build_file_tree(
    dir: &std::path::Path,
    relative_prefix: &str,
    depth: u32,
    budget: &mut usize,
) -> Vec<FileTreeNode> {
    let mut entries = Vec::new();
    if depth > EXPORT_TREE_MAX_DEPTH || *budget == 0 {
        return entries;
    }

    let Ok(read_dir) = fs::read_dir(dir) else { return entries };
    for entry in read_dir.flatten() {
        if *budget == 0 {
            break;
        }
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }
        let is_dir = path.is_dir();
        if is_dir && EXPORT_TREE_SKIP_DIRS.contains(&file_name.as_str()) {
            continue;
        }

        let relative = if relative_prefix.is_empty() {
            file_name.clone()
        } else {
            format!("{relative_prefix}/{file_name}")
        };

        *budget -= 1;
        if is_dir {
            let children = build_file_tree(&path, &relative, depth + 1, budget);
            entries.push(FileTreeNode {
                name: file_name,
                path: relative,
                node_type: "directory",
                size: None,
                children: Some(children),
            });
        } else {
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            entries.push(FileTreeNode {
                name: file_name,
                path: relative,
                node_type: "file",
                size: Some(size),
                children: None,
            });
        }
    }

    entries.sort_by(|a, b| {
        (b.node_type == "directory")
            .cmp(&(a.node_type == "directory"))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

#[tauri::command]
pub async fn modpack_install(app: tauri::AppHandle, file_path: String) -> ModpackInstallResult {
    reset_cancel_flag();
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return ModpackInstallResult::fail("File not found".to_string());
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "mrpack" => install_mrpack(&app, &file_path).await,
        "zip" => install_cf_modpack(&app, &file_path).await,
        _ => ModpackInstallResult::fail(format!("Unsupported modpack format: .{ext}")),
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    stage: String,
    message: String,
    percent: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    current: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total: Option<u32>,
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, message: &str, percent: u32) {
    emit_progress_counted(app, stage, message, percent, None, None);
}




fn emit_progress_counted(
    app: &tauri::AppHandle,
    stage: &str,
    message: &str,
    percent: u32,
    current: Option<u32>,
    total: Option<u32>,
) {
    use tauri::Emitter;
    let _ = app.emit(
        "modpack-install-progress",
        InstallProgress {
            stage: stage.to_string(),
            message: message.to_string(),
            percent,
            current,
            total,
        },
    );
}




fn verify_hashes(
    bytes: &[u8],
    hashes: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    if let Some(expected) = hashes.get("sha1") {
        use sha1::{Digest, Sha1};
        let got = hex::encode(Sha1::digest(bytes));
        if !got.eq_ignore_ascii_case(expected) {
            return Err(format!("sha1 mismatch (expected {expected}, got {got})"));
        }
    } else if let Some(expected) = hashes.get("sha256") {
        use sha2::{Digest, Sha256};
        let got = hex::encode(Sha256::digest(bytes));
        if !got.eq_ignore_ascii_case(expected) {
            return Err("sha256 mismatch".to_string());
        }
    } else if let Some(expected) = hashes.get("sha512") {
        use sha2::{Digest, Sha512};
        let got = hex::encode(Sha512::digest(bytes));
        if !got.eq_ignore_ascii_case(expected) {
            return Err("sha512 mismatch".to_string());
        }
    }
    Ok(())
}




fn local_file_matches(target: &std::path::Path, mod_file: &ModpackFile) -> bool {
    let Ok(meta) = target.metadata() else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    if mod_file.file_size > 0 && meta.len() != mod_file.file_size {
        return false;
    }
    if mod_file.hashes.is_empty() {
        
        return mod_file.file_size > 0;
    }
    let Ok(bytes) = fs::read(target) else {
        return false;
    };
    verify_hashes(&bytes, &mod_file.hashes).is_ok()
}

async fn download_mrpack_file(
    client: &reqwest::Client,
    mod_file: &ModpackFile,
    instance_dir: &std::path::Path,
) -> Result<(), String> {
    let target = safe_instance_path(instance_dir, &mod_file.path).ok_or("Unsafe file path")?;
    if local_file_matches(&target, mod_file) {
        return Ok(());
    }

    let url = mod_file
        .downloads
        .iter()
        .find(|u| u.starts_with("http"))
        .ok_or("No download URL")?;
    let resp = client
        .get(url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    verify_hashes(&bytes, &mod_file.hashes)?;

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&target, &bytes).map_err(|e| e.to_string())
}


fn parse_mrpack_index(archive: &mut zip::ZipArchive<fs::File>) -> Result<MrpackIndex, String> {
    let mut entry = archive
        .by_name("modrinth.index.json")
        .map_err(|_| "Missing modrinth.index.json".to_string())?;
    let mut content = String::new();
    entry
        .read_to_string(&mut content)
        .map_err(|_| "Failed to read modrinth.index.json".to_string())?;
    serde_json::from_str::<MrpackIndex>(&content).map_err(|e| e.to_string())
}









async fn apply_mrpack_to_dir(
    app: &tauri::AppHandle,
    archive: &mut zip::ZipArchive<fs::File>,
    index: &MrpackIndex,
    target_dir: &std::path::Path,
) -> Vec<(String, String)> {
    use futures_util::StreamExt;
    use std::sync::atomic::{AtomicUsize, Ordering};

    let client = reqwest::Client::new();
    let total = index.files.len();
    let done = AtomicUsize::new(0);
    let target_dir_owned = target_dir.to_path_buf();

    
    
    
    
    
    
    
    
    
    let failed: Vec<(String, String)> = futures_util::stream::iter(index.files.clone())
        .map(|mod_file| {
            let client = client.clone();
            let target_dir = target_dir_owned.clone();
            let done = &done;
            async move {
                let label = mod_file
                    .path
                    .rsplit('/')
                    .next()
                    .unwrap_or(&mod_file.path)
                    .to_string();
                if is_cancelled() {
                    return None;
                }
                let result = download_mrpack_file(&client, &mod_file, &target_dir).await;
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                let percent = if total > 0 { ((n * 90) / total) as u32 } else { 0 };
                emit_progress_counted(
                    app,
                    "downloading",
                    &format!("({n}/{total}) {label}"),
                    percent,
                    Some(n as u32),
                    Some(total as u32),
                );
                match result {
                    Ok(()) => None,
                    Err(e) => {
                        eprintln!("[Modpack] Skipping {label}: {e}");
                        Some((label, e))
                    }
                }
            }
        })
        .buffer_unordered(6)
        .filter_map(|x| async move { x })
        .collect()
        .await;

    if is_cancelled() {
        emit_progress(app, "cancelled", "ยกเลิกการติดตั้ง", 0);
        return failed;
    }

    
    
    emit_progress(app, "extracting", "Applying overrides...", 95);
    extract_zip_folder(archive, "overrides", target_dir).ok();
    extract_zip_folder(archive, "client-overrides", target_dir).ok();

    failed
}




pub struct MrpackApplyReport {
    pub failed: Vec<(String, String)>,
    pub pack_mod_files: Vec<String>,
}





pub async fn install_mrpack_url_into_dir(
    app: &tauri::AppHandle,
    url: &str,
    target_dir: &std::path::Path,
) -> Result<MrpackApplyReport, String> {
    // Cancel flag is reset by the caller's entry command, not here — this runs
    // deep in the sync flow, well after the UI exposed the Cancel button, so a
    // reset here would clobber a Cancel the user already pressed.
    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    // Stream the (potentially large, fully-embedded) server .mrpack in chunks
    // so Cancel is honored mid-download — reading it as one blob left cancel
    // dead until the whole pack finished downloading.
    let mut bytes: Vec<u8> = Vec::with_capacity(resp.content_length().unwrap_or(0) as usize);
    {
        use futures_util::StreamExt;
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if is_cancelled() {
                return Err(CANCELLED_SENTINEL.to_string());
            }
            let chunk = chunk.map_err(|e| e.to_string())?;
            bytes.extend_from_slice(&chunk);
        }
    }

    let temp_dir = std::env::temp_dir().join("mlauncher-modpacks");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let temp_path = temp_dir.join(format!("server-{}.mrpack", now_ms()));
    fs::write(&temp_path, &bytes).map_err(|e| e.to_string())?;

    let file = fs::File::open(&temp_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let index = parse_mrpack_index(&mut archive)?;

    
    
    let mut pack_mod_files: Vec<String> = index
        .files
        .iter()
        .filter_map(|f| {
            let path = f.path.replace('\\', "/");
            path.strip_prefix("mods/").map(|rest| rest.to_string())
        })
        .filter(|name| !name.contains('/'))
        .collect();
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().replace('\\', "/");
            for prefix in ["overrides/mods/", "client-overrides/mods/"] {
                if let Some(rest) = name.strip_prefix(prefix) {
                    if !rest.is_empty() && !rest.contains('/') {
                        pack_mod_files.push(rest.to_string());
                    }
                }
            }
        }
    }

    fs::create_dir_all(target_dir).ok();
    let failed = apply_mrpack_to_dir(app, &mut archive, &index, target_dir).await;

    fs::remove_file(&temp_path).ok();

    if is_cancelled() {
        return Err(CANCELLED_SENTINEL.to_string());
    }

    Ok(MrpackApplyReport {
        failed,
        pack_mod_files,
    })
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

async fn install_mrpack(app: &tauri::AppHandle, file_path: &str) -> ModpackInstallResult {
    let run = || -> Result<_, String> {
        let file = fs::File::open(file_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let index = parse_mrpack_index(&mut archive)?;
        Ok((archive, index))
    };

    let (mut archive, index) = match run() {
        Ok(res) => res,
        Err(e) => return ModpackInstallResult::fail(e),
    };

    let game_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .unwrap_or_else(|| index.version_id.clone());
    let loader = if index.dependencies.contains_key("fabric-loader") {
        crate::instances::LoaderType::Fabric
    } else if index.dependencies.contains_key("quilt-loader") {
        crate::instances::LoaderType::Quilt
    } else if index.dependencies.contains_key("forge") {
        crate::instances::LoaderType::Forge
    } else {
        crate::instances::LoaderType::Vanilla
    };
    let loader_version = match loader {
        crate::instances::LoaderType::Fabric => index.dependencies.get("fabric-loader").cloned(),
        crate::instances::LoaderType::Quilt => index.dependencies.get("quilt-loader").cloned(),
        crate::instances::LoaderType::Forge => index.dependencies.get("forge").cloned(),
        _ => None,
    };
    let name = index.name.clone();

    let instance =
        match crate::instances::instances_create(crate::instances::CreateInstanceOptions {
            name: name.clone(),
            minecraft_version: game_version,
            loader: Some(loader),
            loader_version,
            icon: None,
        }) {
            Ok(i) => i,
            Err(e) => return ModpackInstallResult::fail(e),
        };

    let instance_dir = crate::instances::get_instance_dir(&instance.id);
    let total = index.files.len();
    let failed = apply_mrpack_to_dir(app, &mut archive, &index, &instance_dir).await;

    if is_cancelled() {
        
        
        
        let _ = crate::instances::instances_delete(instance.id.clone()).await;
        return ModpackInstallResult::fail(CANCELLED_SENTINEL);
    }

    
    
    if total > 0 && failed.len() == total {
        return ModpackInstallResult {
            ok: false,
            instance_id: Some(instance.id.clone()),
            instance: Some(instance),
            name: Some(name),
            error: Some(format!("All {total} mod downloads failed")),
            failed_files: failed.into_iter().map(|(f, _)| f).collect(),
        };
    }

    let message = if failed.is_empty() {
        "เสร็จสิ้น".to_string()
    } else {
        format!("เสร็จสิ้น ({} ไฟล์โหลดไม่สำเร็จ)", failed.len())
    };
    emit_progress(app, "creating", &message, 100);

    ModpackInstallResult {
        ok: true,
        instance_id: Some(instance.id.clone()),
        instance: Some(instance),
        name: Some(name),
        error: None,
        failed_files: failed.into_iter().map(|(f, _)| f).collect(),
    }
}

async fn install_cf_modpack(app: &tauri::AppHandle, file_path: &str) -> ModpackInstallResult {
    let run = || -> Result<_, String> {
        let file = fs::File::open(file_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let manifest = {
            let mut entry = archive
                .by_name("manifest.json")
                .map_err(|_| "Missing manifest.json".to_string())?;
            let mut content = String::new();
            entry
                .read_to_string(&mut content)
                .map_err(|_| "Failed to read manifest.json".to_string())?;
            serde_json::from_str::<CfManifest>(&content).map_err(|e| e.to_string())?
        };
        Ok((archive, manifest))
    };

    let (mut archive, manifest) = match run() {
        Ok(res) => res,
        Err(e) => return ModpackInstallResult::fail(e),
    };

    let game_version = manifest.minecraft.version.clone();
    let loader = manifest
        .minecraft
        .mod_loaders
        .as_ref()
        .and_then(|loaders| {
            loaders.first().map(|l| {
                if l.id.starts_with("forge") {
                    crate::instances::LoaderType::Forge
                } else if l.id.starts_with("fabric") {
                    crate::instances::LoaderType::Fabric
                } else {
                    crate::instances::LoaderType::Vanilla
                }
            })
        })
        .unwrap_or(crate::instances::LoaderType::Vanilla);
    let loader_version = manifest.minecraft.mod_loaders.as_ref().and_then(|loaders| {
        loaders
            .first()
            .and_then(|l| l.id.split('-').nth(1).map(|s| s.to_string()))
    });
    let name = manifest.name.clone();

    let instance =
        match crate::instances::instances_create(crate::instances::CreateInstanceOptions {
            name: name.clone(),
            minecraft_version: game_version,
            loader: Some(loader),
            loader_version,
            icon: None,
        }) {
            Ok(i) => i,
            Err(e) => return ModpackInstallResult::fail(e),
        };

    let instance_dir = crate::instances::get_instance_dir(&instance.id);

    let client = reqwest::Client::new();
    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).ok();
    let total = manifest.files.len();
    let mut failed: Vec<String> = Vec::new();

    for (i, file_entry) in manifest.files.iter().enumerate() {
        if is_cancelled() {
            break;
        }
        let percent = if total > 0 {
            ((i * 90) / total) as u32
        } else {
            0
        };
        emit_progress_counted(
            app,
            "downloading",
            &format!("({}/{}) mods", i + 1, total),
            percent,
            Some((i + 1) as u32),
            Some(total as u32),
        );

        let filename = format!("{}_{}.jar", file_entry.project_id, file_entry.file_id);
        if let Err(e) = download_cf_file(
            &client,
            file_entry.project_id,
            file_entry.file_id,
            &mods_dir.join(&filename),
        )
        .await
        {
            eprintln!(
                "[Modpack] Skipping CF {}/{}: {e}",
                file_entry.project_id, file_entry.file_id
            );
            failed.push(filename);
        }
    }

    if is_cancelled() {
        let _ = crate::instances::instances_delete(instance.id.clone()).await;
        emit_progress(app, "cancelled", "ยกเลิกการติดตั้ง", 0);
        return ModpackInstallResult::fail(CANCELLED_SENTINEL);
    }

    if total > 0 && failed.len() == total {
        return ModpackInstallResult {
            ok: false,
            instance_id: Some(instance.id.clone()),
            instance: Some(instance),
            name: Some(name),
            error: Some(format!("All {total} mod downloads failed")),
            failed_files: failed,
        };
    }

    
    
    emit_progress(app, "extracting", "Applying overrides...", 95);
    if let Some(overrides) = &manifest.overrides {
        extract_zip_folder(&mut archive, overrides, &instance_dir).ok();
    }

    let message = if failed.is_empty() {
        "เสร็จสิ้น".to_string()
    } else {
        format!("เสร็จสิ้น ({} ไฟล์โหลดไม่สำเร็จ)", failed.len())
    };
    emit_progress(app, "creating", &message, 100);

    ModpackInstallResult {
        ok: true,
        instance_id: Some(instance.id.clone()),
        instance: Some(instance),
        name: Some(name),
        error: None,
        failed_files: failed,
    }
}

#[tauri::command]
pub async fn modpack_install_from_modrinth(
    app: tauri::AppHandle,
    version_id: String,
) -> ModpackInstallResult {
    reset_cancel_flag();
    let client = reqwest::Client::new();
    let url = format!("https://api.modrinth.com/v2/version/{version_id}");

    let resp = match client
        .get(&url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    };

    if !resp.status().is_success() {
        return ModpackInstallResult::fail(format!("API error: {}", resp.status()));
    }

    let version_data: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    };

    let files = match version_data["files"].as_array() {
        Some(f) => f,
        None => return ModpackInstallResult::fail("No files found".to_string()),
    };

    let mrpack_file = files
        .iter()
        .find(|f| {
            f.get("filename")
                .and_then(|n| n.as_str())
                .map(|n| n.ends_with(".mrpack"))
                .unwrap_or(false)
        })
        .or_else(|| files.first());

    let mrpack = match mrpack_file {
        Some(f) => f,
        None => return ModpackInstallResult::fail("No downloadable file found".to_string()),
    };

    let download_url = match mrpack["url"].as_str() {
        Some(u) => u.to_string(),
        None => return ModpackInstallResult::fail("No download URL".to_string()),
    };

    let filename = match mrpack["filename"].as_str() {
        Some(n) => n.to_string(),
        None => "modpack.mrpack".to_string(),
    };

    let temp_dir = std::env::temp_dir().join("mlauncher-modpacks");
    fs::create_dir_all(&temp_dir).ok();
    let temp_path = temp_dir.join(&filename);

    let resp = match client
        .get(&download_url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    };

    match resp.bytes().await {
        Ok(bytes) => {
            if let Err(e) = fs::write(&temp_path, &bytes) {
                return ModpackInstallResult::fail(e.to_string());
            }
        }
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    }

    let result = install_mrpack(&app, &temp_path.to_string_lossy()).await;
    fs::remove_file(&temp_path).ok();

    if result.ok {
        if let Some(ref inst_id) = result.instance_id {
            if let Some(proj_id) = version_data.get("project_id").and_then(|v| v.as_str()) {
                fetch_and_set_assets(inst_id, "modrinth", proj_id).await;
            }
        }
    }

    result
}

#[tauri::command]
pub async fn modpack_install_from_curseforge(
    app: tauri::AppHandle,
    project_id: i32,
    file_id: i32,
) -> ModpackInstallResult {
    reset_cancel_flag();
    let client = reqwest::Client::new();

    let download_url = format!("{API_URL}/curseforge/download/{project_id}/{file_id}");
    let resp = match client
        .get(&download_url)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    };

    if !resp.status().is_success() {
        return ModpackInstallResult::fail(format!("API error: {}", resp.status()));
    }

    let data: serde_json::Value = match resp.json().await {
        Ok(d) => d,
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    };

    let actual_url = match data.get("data").and_then(|d| d.as_str()) {
        Some(u) => u.to_string(),
        None => return ModpackInstallResult::fail("No download URL".to_string()),
    };

    let temp_dir = std::env::temp_dir().join("mlauncher-modpacks");
    fs::create_dir_all(&temp_dir).ok();
    let temp_path = temp_dir.join(format!("cf_modpack_{project_id}_{file_id}.zip"));

    let resp = match client.get(&actual_url).send().await {
        Ok(r) => r,
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    };

    match resp.bytes().await {
        Ok(bytes) => {
            if let Err(e) = fs::write(&temp_path, &bytes) {
                return ModpackInstallResult::fail(e.to_string());
            }
        }
        Err(e) => return ModpackInstallResult::fail(e.to_string()),
    }

    let result = install_cf_modpack(&app, &temp_path.to_string_lossy()).await;
    fs::remove_file(&temp_path).ok();

    if result.ok {
        if let Some(ref inst_id) = result.instance_id {
            fetch_and_set_assets(inst_id, "curseforge", &project_id.to_string()).await;
        }
    }

    result
}

async fn download_cf_file(
    client: &reqwest::Client,
    project_id: i32,
    file_id: i32,
    target: &std::path::Path,
) -> Result<(), String> {
    let url = format!("{API_URL}/curseforge/download/{project_id}/{file_id}");
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let download_url = data
        .get("data")
        .and_then(|d| d.as_str())
        .ok_or("No download URL")?;

    let file_resp = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !file_resp.status().is_success() {
        return Err(format!("HTTP {}", file_resp.status()));
    }
    let bytes = file_resp.bytes().await.map_err(|e| e.to_string())?;
    fs::write(target, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn instances_pre_install(file_path: String) -> PreInstallResult {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return PreInstallResult {
            ok: false,
            name: String::new(),
            version: String::new(),
            loaders: Vec::new(),
            files_count: 0,
            error: Some("File not found".to_string()),
        };
    }

    let file = match fs::File::open(&file_path) {
        Ok(f) => f,
        Err(e) => {
            return PreInstallResult {
                ok: false,
                name: String::new(),
                version: String::new(),
                loaders: Vec::new(),
                files_count: 0,
                error: Some(e.to_string()),
            }
        }
    };

    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(e) => {
            return PreInstallResult {
                ok: false,
                name: String::new(),
                version: String::new(),
                loaders: Vec::new(),
                files_count: 0,
                error: Some(e.to_string()),
            }
        }
    };

    if let Ok(mut entry) = archive.by_name("modrinth.index.json") {
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_ok() {
            if let Ok(index) = serde_json::from_str::<MrpackIndex>(&content) {
                let mut loaders = Vec::new();
                for key in index.dependencies.keys() {
                    if key != "minecraft" {
                        loaders.push(key.clone());
                    }
                }
                return PreInstallResult {
                    ok: true,
                    name: index.name,
                    version: index.version_id,
                    loaders,
                    files_count: index.files.len() as u32,
                    error: None,
                };
            }
        }
    }

    if let Ok(mut entry) = archive.by_name("manifest.json") {
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_ok() {
            if let Ok(manifest) = serde_json::from_str::<CfManifest>(&content) {
                let loaders = manifest
                    .minecraft
                    .mod_loaders
                    .unwrap_or_default()
                    .into_iter()
                    .map(|l| l.id)
                    .collect();
                return PreInstallResult {
                    ok: true,
                    name: manifest.name,
                    version: manifest.minecraft.version,
                    loaders,
                    files_count: manifest.files.len() as u32,
                    error: None,
                };
            }
        }
    }

    PreInstallResult {
        ok: false,
        name: String::new(),
        version: String::new(),
        loaders: Vec::new(),
        files_count: 0,
        error: Some("Invalid modpack: no modrinth.index.json or manifest.json found".to_string()),
    }
}






#[tauri::command]
pub fn instances_list_files(
    instance_id: String,
    sub_path: Option<String>,
) -> InstancesListFilesResult {
    let instance_dir = crate::instances::get_instance_dir(&instance_id);

    let target_dir = match sub_path.as_deref() {
        Some(sp) => instance_dir.join(sp),
        None => instance_dir,
    };

    if !target_dir.exists() || !target_dir.is_dir() {
        return InstancesListFilesResult { ok: true, files: Some(Vec::new()), error: None };
    }

    let mut budget = EXPORT_TREE_MAX_ENTRIES;
    let prefix = sub_path.as_deref().unwrap_or("").trim_end_matches('/');
    let files = build_file_tree(&target_dir, prefix, 0, &mut budget);
    InstancesListFilesResult { ok: true, files: Some(files), error: None }
}



fn safe_instance_path(base: &std::path::Path, rel: &str) -> Option<PathBuf> {
    use std::path::Component;
    let normalized = rel.replace('\\', "/");
    let mut out = base.to_path_buf();
    for comp in std::path::Path::new(&normalized).components() {
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

fn extract_zip_folder<T: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<T>,
    folder: &str,
    target: &std::path::Path,
) -> Result<(), String> {
    let prefix = format!("{}/", folder.trim_end_matches('/'));

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();

        if !name.starts_with(&prefix) {
            continue;
        }

        let relative = name.strip_prefix(&prefix).unwrap_or(&name).to_string();
        if relative.is_empty() {
            continue;
        }

        let target_path = match safe_instance_path(target, &relative) {
            Some(p) => p,
            None => continue,
        };

        if entry.is_dir() {
            fs::create_dir_all(&target_path).ok();
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).ok();
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
            fs::write(&target_path, &bytes).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

async fn fetch_and_set_assets(instance_id: &str, source: &str, project_id: &str) {
    let client = reqwest::Client::new();
    let instance_dir = crate::instances::get_instance_dir(instance_id);
    let mut icon_url: Option<String> = None;
    let mut banner_url: Option<String> = None;

    if source == "modrinth" {
        let url = format!("https://api.modrinth.com/v2/project/{project_id}");
        if let Ok(resp) = client
            .get(&url)
            .header("User-Agent", "RealityLauncher/2.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(project) = resp.json::<serde_json::Value>().await {
                    icon_url = project
                        .get("icon_url")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    if let Some(gallery) = project.get("gallery").and_then(|v| v.as_array()) {
                        banner_url = gallery
                            .iter()
                            .find(|item| {
                                item.get("featured")
                                    .and_then(|f| f.as_bool())
                                    .unwrap_or(false)
                            })
                            .or_else(|| gallery.first())
                            .and_then(|item| item.get("raw_url").or_else(|| item.get("url")))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                    }
                    if banner_url.is_none() {
                        banner_url = icon_url.clone();
                    }
                }
            }
        }
    } else if source == "curseforge" {
        let url = format!("{}/curseforge/project/{}", API_URL, project_id);
        if let Ok(resp) = client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(res_val) = resp.json::<serde_json::Value>().await {
                    let project = res_val.get("data").unwrap_or(&res_val);
                    icon_url = project
                        .get("logo")
                        .and_then(|l| l.get("url"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    if let Some(screenshots) = project.get("screenshots").and_then(|s| s.as_array())
                    {
                        banner_url = screenshots
                            .first()
                            .and_then(|s| s.get("url").or_else(|| s.get("thumbnailUrl")))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                    }
                    if banner_url.is_none() {
                        banner_url = icon_url.clone();
                    }
                }
            }
        }
    }

    if let Some(ref icon) = icon_url {
        if let Ok(resp) = client
            .get(icon)
            .header("User-Agent", "RealityLauncher/2.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    let _ = fs::write(instance_dir.join("icon.png"), &bytes);
                }
            }
        }
    }

    if let Some(ref banner) = banner_url {
        if let Ok(resp) = client
            .get(banner)
            .header("User-Agent", "RealityLauncher/2.0")
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(bytes) = resp.bytes().await {
                    use base64::Engine;
                    let base64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    let mime = if banner.ends_with(".jpg") || banner.ends_with(".jpeg") {
                        "image/jpeg"
                    } else if banner.ends_with(".gif") {
                        "image/gif"
                    } else if banner.ends_with(".webp") {
                        "image/webp"
                    } else {
                        "image/png"
                    };
                    let data_url = format!("data:{mime};base64,{base64_str}");

                    if let Ok(mut instances) = crate::instances::INSTANCES.lock() {
                        if let Some(instance) = instances.iter_mut().find(|i| i.id == instance_id) {
                            instance.banner = Some(data_url);
                            let meta_path = instance_dir.join("instance.json");
                            let mut save_data = instance.clone();
                            save_data.icon = None;
                            if let Ok(content) = serde_json::to_string_pretty(&save_data) {
                                let _ = fs::write(&meta_path, content);
                            }
                        }
                    }
                }
            }
        }
    }
}
