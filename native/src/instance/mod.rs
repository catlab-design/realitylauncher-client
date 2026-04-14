//! Instance Management Module
//! 
//! Handles:
//! - Instance CRUD operations
//! - File system operations (copy, move, delete)
//! - Mod/resource pack management
//! - Instance metadata

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use walkdir::WalkDir;
use chrono::Utc;
use base64::{engine::general_purpose, Engine as _};

/// Instance loader type
#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[napi(string_enum)]
pub enum LoaderType {
    Vanilla,
    Fabric,
    Forge,
    NeoForge,
    Quilt,
}

impl Default for LoaderType {
    fn default() -> Self {
        LoaderType::Vanilla
    }
}

/// Game instance metadata
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct InstanceMeta {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub banner: Option<String>,
    pub minecraft_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub created_at: String,
    pub last_played_at: Option<String>,
    pub total_play_time: i64,
    pub java_path: Option<String>,
    pub ram_mb: Option<u32>,
    pub java_arguments: Option<String>,
    pub game_directory: String,
    pub modpack_id: Option<String>,
    pub modpack_version_id: Option<String>,
    pub cloud_id: Option<String>,
    pub auto_update: Option<bool>,
    pub locked_mods: Option<Vec<String>>,
}

/// Mod info
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ModInfo {
    pub filename: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub authors: Option<Vec<String>>,
    pub mod_id: Option<String>,
    #[napi(ts_type = "string | null | undefined")]
    pub icon_base64: Option<String>,
    pub enabled: bool,
    pub size: i64,
}

/// Resource pack info
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ResourcePackInfo {
    pub filename: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub pack_format: Option<u32>,
    pub size: i64,
}

/// Directory size info
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct DirectorySizeInfo {
    pub total_bytes: i64,
    pub file_count: u32,
    pub folder_count: u32,
}



/// Get instance directory path
#[napi]
pub fn get_instance_path(base_dir: String, instance_id: String) -> String {
    std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .to_string_lossy()
        .to_string()
}

/// Create instance directory structure
#[napi]
pub fn create_instance_directories(base_dir: String, instance_id: String) -> napi::Result<bool> {
    let base = std::path::PathBuf::from(base_dir).join(&instance_id);
    
    let subdirs = vec![
        "mods",
        "config",
        "saves",
        "resourcepacks",
        "shaderpacks",
        "datapacks",
        "logs",
        "crash-reports",
    ];

    for subdir in subdirs {
        let path = base.join(subdir);
        if let Err(e) = std::fs::create_dir_all(&path) {
            return Err(napi::Error::from_reason(format!("Failed to create {}: {}", subdir, e)));
        }
    }

    Ok(true)
}

/// Save instance metadata
#[napi]
pub fn save_instance_meta(base_dir: String, instance_id: String, meta: InstanceMeta) -> napi::Result<bool> {
    let meta_path = std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .join("instance.json");

    // Ensure directory exists
    if let Some(parent) = meta_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_string_pretty(&meta)
        .map_err(|e| napi::Error::from_reason(format!("JSON serialize error: {}", e)))?;
    
    std::fs::write(&meta_path, json)?;
    Ok(true)
}


/// Load instance metadata
#[napi]
pub fn load_instance_meta(base_dir: String, instance_id: String) -> napi::Result<Option<InstanceMeta>> {
    let meta_path = std::path::PathBuf::from(base_dir.clone())
        .join(&instance_id)
        .join("instance.json");

    if !meta_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&meta_path)?;
    let mut meta: InstanceMeta = serde_json::from_str(&content)
        .map_err(|e| napi::Error::from_reason(format!("JSON parse error: {}", e)))?;
    
    // Load icon from icon.png if icon is not set in metadata
    if meta.icon.is_none() {
        meta.icon = load_instance_icon(&base_dir, &instance_id);
    }
    
    Ok(Some(meta))
}

/// Load instance icon from icon.png file and convert to base64
fn load_instance_icon(base_dir: &str, instance_id: &str) -> Option<String> {
    let icon_path = std::path::PathBuf::from(base_dir)
        .join(instance_id)
        .join("icon.png");

    if !icon_path.exists() {
        return None;
    }

    match std::fs::read(&icon_path) {
        Ok(bytes) => {
            let base64 = general_purpose::STANDARD.encode(&bytes);
            Some(format!("data:image/png;base64,{}", base64))
        }
        Err(_) => None,
    }
}

/// List all instances with optional pagination
#[napi]
pub async fn list_instances(base_dir: String, offset: Option<u32>, limit: Option<u32>) -> napi::Result<Vec<InstanceMeta>> {
    println!("[Rust Core] list_instances called with base_dir: '{}'", base_dir);
    let base = std::path::PathBuf::from(&base_dir);
    let instances = Vec::new();

    if !base.exists() {
        println!("[Rust Core] base_dir does not exist: {:?}", base);
        return Ok(instances);
    }

    println!("[Rust Core] Reading directory: {:?}", base);
    let mut entries = tokio::fs::read_dir(&base).await?;
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.unwrap_or(u32::MAX) as usize;

    let mut found_instances = Vec::new();
    while let Some(entry) = entries.next_entry().await? {
        let file_name = entry.file_name().to_string_lossy().to_string();
        // println!("[Rust Core] Found entry: {}", file_name);

        if entry.file_type().await?.is_dir() {
            let instance_id = file_name;
            // Load meta using synchronous version for simplicity inside loop, or make it async too
            // Since it's a single small file, sync read within async function is okay but async is better.
            let meta_path = base.join(&instance_id).join("instance.json");
            if meta_path.exists() {
                // println!("[Rust Core] Found instance.json for {}", instance_id);
                if let Ok(content) = tokio::fs::read_to_string(&meta_path).await {
                    if let Ok(mut meta) = serde_json::from_str::<InstanceMeta>(&content) {
                        // Load icon from icon.png if icon is not set in metadata
                        if meta.icon.is_none() {
                            meta.icon = load_instance_icon(&base_dir, &instance_id);
                        }
                        found_instances.push(meta);
                    } else {
                        println!("[Rust Core] Failed to parse instance.json for {}", instance_id);
                    }
                }
            } else {
                // println!("[Rust Core] No instance.json for {}", instance_id);
            }
        }
    }

    println!("[Rust Core] Found {} valid instances", found_instances.len());

    // Sort by last played (most recent first)
    found_instances.sort_by(|a, b| {
        let a_time = a.last_played_at.as_deref().unwrap_or("");
        let b_time = b.last_played_at.as_deref().unwrap_or("");
        b_time.cmp(a_time)
    });

    // Apply pagination
    let paginated = found_instances
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    Ok(paginated)
}

/// Delete instance directory
#[napi]
pub async fn delete_instance(base_dir: String, instance_id: String) -> napi::Result<bool> {
    let path = std::path::PathBuf::from(base_dir).join(&instance_id);
    
    if !path.exists() {
        return Ok(true);
    }

    tokio::fs::remove_dir_all(&path).await?;
    Ok(true)
}

/// Copy instance
#[napi]
pub async fn copy_instance(base_dir: String, source_id: String, dest_id: String, new_name: String) -> napi::Result<bool> {
    let base = std::path::PathBuf::from(&base_dir);
    let source_path = base.join(&source_id);
    let dest_path = base.join(&dest_id);

    if !source_path.exists() {
        return Err(napi::Error::from_reason("Source instance not found"));
    }

    if dest_path.exists() {
        return Err(napi::Error::from_reason("Destination already exists"));
    }

    // Copy directory recursively
    copy_dir_recursive(&source_path, &dest_path).await?;

    // Update metadata
    if let Ok(Some(mut meta)) = load_instance_meta(base_dir.clone(), dest_id.clone()) {
        meta.id = dest_id.clone();
        meta.name = new_name;
        meta.created_at = Utc::now().to_rfc3339();
        meta.last_played_at = None;
        meta.total_play_time = 0;
        save_instance_meta(base_dir, dest_id, meta)?;
    }

    Ok(true)
}

async fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> napi::Result<()> {
    tokio::fs::create_dir_all(dst).await?;

    let mut entries = tokio::fs::read_dir(src).await?;
    
    while let Some(entry) = entries.next_entry().await? {
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if entry.file_type().await?.is_dir() {
            Box::pin(copy_dir_recursive(&src_path, &dst_path)).await?;
        } else {
            tokio::fs::copy(&src_path, &dst_path).await?;
        }
    }

    Ok(())
}

/// Get directory size
#[napi]
pub fn get_directory_size(path: String) -> napi::Result<DirectorySizeInfo> {
    let path = PathBuf::from(&path);
    
    if !path.exists() {
        return Ok(DirectorySizeInfo {
            total_bytes: 0,
            file_count: 0,
            folder_count: 0,
        });
    }

    let mut total_bytes: i64 = 0;
    let mut file_count: u32 = 0;
    let mut folder_count: u32 = 0;

    for entry in WalkDir::new(&path).into_iter().flatten() {
        if entry.file_type().is_file() {
            file_count += 1;
            if let Ok(meta) = entry.metadata() {
                total_bytes += meta.len() as i64;
            }
        } else if entry.file_type().is_dir() {
            folder_count += 1;
        }
    }

    Ok(DirectorySizeInfo {
        total_bytes,
        file_count,
        folder_count,
    })
}

/// List mods in instance
#[napi]
pub fn list_instance_mods(base_dir: String, instance_id: String) -> napi::Result<Vec<ModInfo>> {
    let mods_path = std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .join("mods");

    if !mods_path.exists() {
        return Ok(Vec::new());
    }

    let mut mods = Vec::new();
    let entries = std::fs::read_dir(&mods_path)?;

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = entry.file_name().to_string_lossy().to_string();
        
        // Skip non-jar files and disabled mods
        let is_jar = filename.ends_with(".jar");
        let is_disabled = filename.ends_with(".jar.disabled");
        
        if !is_jar && !is_disabled {
            continue;
        }

        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
        let enabled = !is_disabled;

        // Try to read mod info from jar
        let mod_info = if is_jar || is_disabled {
            read_mod_info(&path).unwrap_or_default()
        } else {
            Default::default()
        };

        mods.push(ModInfo {
            filename,
            name: mod_info.name,
            version: mod_info.version,
            description: mod_info.description,
            authors: mod_info.authors,
            mod_id: mod_info.mod_id,
            icon_base64: mod_info.icon_base64,
            enabled,
            size,
        });
    }

    // Sort by name
    mods.sort_by(|a, b| {
        let a_name = a.name.as_deref().unwrap_or(&a.filename);
        let b_name = b.name.as_deref().unwrap_or(&b.filename);
        a_name.to_lowercase().cmp(&b_name.to_lowercase())
    });

    Ok(mods)
}

#[derive(Default)]
struct ParsedModInfo {
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    authors: Option<Vec<String>>,
    mod_id: Option<String>,
    icon_base64: Option<String>,
}

fn read_icon_from_archive(archive: &mut zip::ZipArchive<std::fs::File>, icon_path: &str) -> Option<String> {
    let normalized = icon_path.replace('\\', "/");
    if normalized.is_empty() {
        return None;
    }

    let candidates = if normalized.starts_with('/') {
        vec![normalized.trim_start_matches('/').to_string()]
    } else {
        vec![normalized.clone(), format!("/{normalized}")]
    };

    for candidate in candidates {
        if let Ok(mut icon_file) = archive.by_name(&candidate) {
            let mut bytes = Vec::new();
            if std::io::Read::read_to_end(&mut icon_file, &mut bytes).is_ok() && !bytes.is_empty() {
                return Some(general_purpose::STANDARD.encode(bytes));
            }
        }
    }

    None
}

fn pick_fabric_icon_path(json: &serde_json::Value) -> Option<String> {
    if let Some(icon) = json.get("icon") {
        if let Some(path) = icon.as_str() {
            return Some(path.to_string());
        }
        if let Some(map) = icon.as_object() {
            let best = map
                .iter()
                .filter_map(|(k, v)| {
                    let size = k.parse::<u32>().ok()?;
                    let value = v.as_str()?;
                    Some((size, value.to_string()))
                })
                .max_by_key(|(size, _)| *size)
                .map(|(_, path)| path);
            if best.is_some() {
                return best;
            }
        }
    }
    None
}

/// Read mod info from jar file
fn read_mod_info(path: &PathBuf) -> Option<ParsedModInfo> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    // Try fabric.mod.json first
    if let Some(content) = (|| {
        let mut file = archive.by_name("fabric.mod.json").ok()?;
        let mut content = String::new();
        std::io::Read::read_to_string(&mut file, &mut content).ok()?;
        Some(content)
    })() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let name = json.get("name").and_then(|v| v.as_str()).map(String::from);
            let version = json.get("version").and_then(|v| v.as_str()).map(String::from);
            let description = json.get("description").and_then(|v| v.as_str()).map(String::from);
            let mod_id = json.get("id").and_then(|v| v.as_str()).map(String::from);
            let icon_base64 = pick_fabric_icon_path(&json)
                .and_then(|icon_path| read_icon_from_archive(&mut archive, &icon_path));
            
            let authors = json.get("authors").and_then(|v| {
                v.as_array().map(|arr| {
                    arr.iter()
                        .filter_map(|a| {
                            a.as_str().map(String::from)
                                .or_else(|| a.get("name").and_then(|n| n.as_str()).map(String::from))
                        })
                        .collect()
                })
            });

            return Some(ParsedModInfo {
                name,
                version,
                description,
                authors,
                mod_id,
                icon_base64,
            });
        }
    }

    // Try mods.toml (Forge/NeoForge)
    if let Some(content) = (|| {
        let mut file = archive.by_name("META-INF/mods.toml").ok()?;
        let mut content = String::new();
        std::io::Read::read_to_string(&mut file, &mut content).ok()?;
        Some(content)
    })() {
        // Simple TOML parsing for common fields
        let name = extract_toml_value(&content, "displayName");
        let version = extract_toml_value(&content, "version");
        let description = extract_toml_value(&content, "description");
        let mod_id = extract_toml_value(&content, "modId");
        let authors = extract_toml_value(&content, "authors").map(|a| vec![a]);
        let icon_base64 = extract_toml_value(&content, "logoFile")
            .and_then(|logo_file| read_icon_from_archive(&mut archive, &logo_file));

        if name.is_some() || mod_id.is_some() {
            return Some(ParsedModInfo {
                name,
                version,
                description,
                authors,
                mod_id,
                icon_base64,
            });
        }
    }

    // Try mcmod.info (old Forge)
    if let Some(content) = (|| {
        let mut file = archive.by_name("mcmod.info").ok()?;
        let mut content = String::new();
        std::io::Read::read_to_string(&mut file, &mut content).ok()?;
        Some(content)
    })() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let first = json.as_array().and_then(|arr| arr.first()).or(Some(&json));
            
            if let Some(obj) = first {
                let name = obj.get("name").and_then(|v| v.as_str()).map(String::from);
                let version = obj.get("version").and_then(|v| v.as_str()).map(String::from);
                let description = obj.get("description").and_then(|v| v.as_str()).map(String::from);
                let mod_id = obj.get("modid").and_then(|v| v.as_str()).map(String::from);
                let icon_base64 = obj
                    .get("logoFile")
                    .and_then(|v| v.as_str())
                    .and_then(|logo| read_icon_from_archive(&mut archive, logo));
                let authors = obj.get("authorList").and_then(|v| {
                    v.as_array().map(|arr| {
                        arr.iter().filter_map(|a| a.as_str().map(String::from)).collect()
                    })
                });

                return Some(ParsedModInfo {
                    name,
                    version,
                    description,
                    authors,
                    mod_id,
                    icon_base64,
                });
            }
        }
    }

    None
}

fn extract_toml_value(content: &str, key: &str) -> Option<String> {
    let pattern = format!(r#"{}[ \t]*=[ \t]*"([^"]*)""#, key);
    let re = regex::Regex::new(&pattern).ok()?;
    re.captures(content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

/// Toggle mod enabled/disabled
#[napi]
pub fn toggle_mod(base_dir: String, instance_id: String, filename: String, enabled: bool) -> napi::Result<bool> {
    let mods_path = std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .join("mods");

    let current_name = if enabled {
        format!("{}.disabled", filename.trim_end_matches(".disabled"))
    } else {
        filename.trim_end_matches(".disabled").to_string()
    };

    let new_name = if enabled {
        filename.trim_end_matches(".disabled").to_string()
    } else {
        format!("{}.disabled", filename.trim_end_matches(".disabled"))
    };

    let current_path = mods_path.join(&current_name);
    let new_path = mods_path.join(&new_name);

    if current_path.exists() {
        std::fs::rename(&current_path, &new_path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Delete mod from instance
#[napi]
pub fn delete_mod(base_dir: String, instance_id: String, filename: String) -> napi::Result<bool> {
    let mod_path = std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .join("mods")
        .join(&filename);

    if mod_path.exists() {
        std::fs::remove_file(&mod_path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// List resource packs in instance
#[napi]
pub fn list_instance_resourcepacks(base_dir: String, instance_id: String) -> napi::Result<Vec<ResourcePackInfo>> {
    let packs_path = std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .join("resourcepacks");

    if !packs_path.exists() {
        return Ok(Vec::new());
    }

    let mut packs = Vec::new();
    let entries = std::fs::read_dir(&packs_path)?;

    for entry in entries.flatten() {
        let path = entry.path();
        let filename = entry.file_name().to_string_lossy().to_string();
        
        // Accept .zip files and directories
        let is_zip = filename.ends_with(".zip");
        let is_dir = path.is_dir();
        
        if !is_zip && !is_dir {
            continue;
        }

        let size = if is_dir {
            get_directory_size(path.to_string_lossy().to_string())
                .map(|s| s.total_bytes)
                .unwrap_or(0)
        } else {
            entry.metadata().map(|m| m.len() as i64).unwrap_or(0)
        };

        let pack_info = read_resourcepack_info(&path);

        packs.push(ResourcePackInfo {
            filename,
            name: pack_info.0,
            description: pack_info.1,
            pack_format: pack_info.2,
            size,
        });
    }

    packs.sort_by(|a, b| {
        let a_name = a.name.as_deref().unwrap_or(&a.filename);
        let b_name = b.name.as_deref().unwrap_or(&b.filename);
        a_name.to_lowercase().cmp(&b_name.to_lowercase())
    });

    Ok(packs)
}

fn read_resourcepack_info(path: &PathBuf) -> (Option<String>, Option<String>, Option<u32>) {
    let pack_mcmeta = if path.is_dir() {
        let mcmeta_path = path.join("pack.mcmeta");
        std::fs::read_to_string(mcmeta_path).ok()
    } else {
        // Read from zip file
        let file = match std::fs::File::open(path) {
            Ok(f) => f,
            Err(_) => return (None, None, None),
        };
        let mut archive = match zip::ZipArchive::new(file) {
            Ok(a) => a,
            Err(_) => return (None, None, None),
        };
        let mut zip_file = match archive.by_name("pack.mcmeta") {
            Ok(f) => f,
            Err(_) => return (None, None, None),
        };
        let mut content = String::new();
        if std::io::Read::read_to_string(&mut zip_file, &mut content).is_err() {
            return (None, None, None);
        }
        Some(content)
    };

    if let Some(content) = pack_mcmeta {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(pack) = json.get("pack") {
                let description = pack.get("description")
                    .and_then(|v| v.as_str().map(String::from).or_else(|| {
                        // Handle JSON text component
                        serde_json::to_string(v).ok()
                    }));
                let pack_format = pack.get("pack_format").and_then(|v| v.as_u64()).map(|v| v as u32);
                
                return (None, description, pack_format);
            }
        }
    }

    (None, None, None)
}

fn read_log_tail_sync(
    file_path: &str,
    max_lines: usize,
    max_bytes: usize,
) -> Result<String, std::io::Error> {
    if max_lines == 0 || max_bytes == 0 {
        return Ok(String::new());
    }

    let mut file = std::fs::File::open(file_path)?;
    let file_size = file.metadata()?.len();
    if file_size == 0 {
        return Ok(String::new());
    }

    let bytes_to_read = std::cmp::min(file_size, max_bytes as u64);
    let start = file_size.saturating_sub(bytes_to_read);
    file.seek(SeekFrom::Start(start))?;

    let mut buffer = vec![0u8; bytes_to_read as usize];
    file.read_exact(&mut buffer)?;

    let mut content = String::from_utf8_lossy(&buffer).into_owned();
    if start > 0 {
        if let Some(first_break) = content.find('\n') {
            content = content[(first_break + 1)..].to_string();
        } else {
            return Ok(String::new());
        }
    }

    if content.is_empty() {
        return Ok(String::new());
    }

    let lines: Vec<&str> = content.lines().collect();
    if lines.len() <= max_lines {
        return Ok(lines.join("\n"));
    }

    Ok(lines[lines.len() - max_lines..].join("\n"))
}

#[napi]
pub fn read_log_tail(
    file_path: String,
    max_lines: Option<u32>,
    max_bytes: Option<u32>,
) -> napi::Result<String> {
    let line_limit = max_lines.unwrap_or(500).max(1) as usize;
    let byte_limit = max_bytes.unwrap_or(1024 * 1024).max(1024) as usize;

    match read_log_tail_sync(&file_path, line_limit, byte_limit) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(napi::Error::from_reason(format!(
            "Failed to read log tail: {error}"
        ))),
    }
}

#[cfg(test)]
mod log_tail_tests {
    use super::read_log_tail_sync;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn write_temp_log(content: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        path.push(format!("mlauncher_log_tail_test_{nonce}.log"));
        std::fs::write(&path, content).expect("failed to write temp log");
        path
    }

    #[test]
    fn read_log_tail_sync_returns_last_lines() {
        let log_path = write_temp_log("line1\nline2\nline3\nline4\n");
        let result = read_log_tail_sync(&log_path.to_string_lossy(), 2, 4096)
            .expect("tail read should succeed");
        assert_eq!(result, "line3\nline4");
        let _ = std::fs::remove_file(log_path);
    }

    #[test]
    fn read_log_tail_sync_trims_partial_first_line() {
        let log_path = write_temp_log("first-line\nsecond-line\nthird-line\n");
        let result = read_log_tail_sync(&log_path.to_string_lossy(), 10, 14)
            .expect("tail read should succeed");
        assert_eq!(result, "third-line");
        let _ = std::fs::remove_file(log_path);
    }
}
