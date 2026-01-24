//! Instance Management Module
//! 
//! Handles:
//! - Instance CRUD operations
//! - File system operations (copy, move, delete)
//! - Mod/resource pack management
//! - Instance metadata

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use walkdir::WalkDir;
use chrono::Utc;

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
    let meta_path = std::path::PathBuf::from(base_dir)
        .join(&instance_id)
        .join("instance.json");

    if !meta_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&meta_path)?;
    let meta: InstanceMeta = serde_json::from_str(&content)
        .map_err(|e| napi::Error::from_reason(format!("JSON parse error: {}", e)))?;
    
    Ok(Some(meta))
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
                        // Load icon if exists
                        let icon_path = base.join(&instance_id).join("icon.png");
                        if icon_path.exists() {
                            if let Ok(data) = tokio::fs::read(icon_path).await {
                                use base64::{Engine as _, engine::general_purpose};
                                let b64 = general_purpose::STANDARD.encode(data);
                                meta.icon = Some(format!("data:image/png;base64,{}", b64));
                            }
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
            name: mod_info.0,
            version: mod_info.1,
            description: mod_info.2,
            authors: mod_info.3,
            mod_id: mod_info.4,
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

/// Read mod info from jar file
fn read_mod_info(path: &PathBuf) -> Option<(Option<String>, Option<String>, Option<String>, Option<Vec<String>>, Option<String>)> {
    let file = std::fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    // Try fabric.mod.json first
    if let Ok(mut file) = archive.by_name("fabric.mod.json") {
        let mut content = String::new();
        std::io::Read::read_to_string(&mut file, &mut content).ok()?;
        
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let name = json.get("name").and_then(|v| v.as_str()).map(String::from);
            let version = json.get("version").and_then(|v| v.as_str()).map(String::from);
            let description = json.get("description").and_then(|v| v.as_str()).map(String::from);
            let mod_id = json.get("id").and_then(|v| v.as_str()).map(String::from);
            
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

            return Some((name, version, description, authors, mod_id));
        }
    }

    // Try mods.toml (Forge/NeoForge)
    if let Ok(mut file) = archive.by_name("META-INF/mods.toml") {
        let mut content = String::new();
        std::io::Read::read_to_string(&mut file, &mut content).ok()?;
        
        // Simple TOML parsing for common fields
        let name = extract_toml_value(&content, "displayName");
        let version = extract_toml_value(&content, "version");
        let description = extract_toml_value(&content, "description");
        let mod_id = extract_toml_value(&content, "modId");
        let authors = extract_toml_value(&content, "authors").map(|a| vec![a]);

        if name.is_some() || mod_id.is_some() {
            return Some((name, version, description, authors, mod_id));
        }
    }

    // Try mcmod.info (old Forge)
    if let Ok(mut file) = archive.by_name("mcmod.info") {
        let mut content = String::new();
        std::io::Read::read_to_string(&mut file, &mut content).ok()?;
        
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let first = json.as_array().and_then(|arr| arr.first()).or(Some(&json));
            
            if let Some(obj) = first {
                let name = obj.get("name").and_then(|v| v.as_str()).map(String::from);
                let version = obj.get("version").and_then(|v| v.as_str()).map(String::from);
                let description = obj.get("description").and_then(|v| v.as_str()).map(String::from);
                let mod_id = obj.get("modid").and_then(|v| v.as_str()).map(String::from);
                let authors = obj.get("authorList").and_then(|v| {
                    v.as_array().map(|arr| {
                        arr.iter().filter_map(|a| a.as_str().map(String::from)).collect()
                    })
                });

                return Some((name, version, description, authors, mod_id));
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
