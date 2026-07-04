


use crate::config::get_minecraft_dir;
use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LoaderType {
    Vanilla,
    Fabric,
    Forge,
    Neoforge,
    Quilt,
}

impl Default for LoaderType {
    fn default() -> Self {
        Self::Vanilla
    }
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInstance {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub minecraft_version: String,
    pub loader: LoaderType,
    pub loader_version: Option<String>,
    pub created_at: String,
    pub last_played_at: Option<String>,
    pub total_play_time: u32, 
    pub java_path: Option<String>,
    #[serde(rename = "ramMB")]
    pub ram_mb: Option<u32>,
    pub java_arguments: Option<String>,
    pub game_directory: String,
    pub modpack_id: Option<String>,
    pub modpack_version_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_update: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub banner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked_mods: Option<Vec<String>>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceOptions {
    pub name: String,
    pub minecraft_version: String,
    pub loader: Option<LoaderType>,
    pub loader_version: Option<String>,
    pub icon: Option<String>,
}


pub(crate) static INSTANCES: Lazy<Mutex<Vec<GameInstance>>> =
    Lazy::new(|| Mutex::new(load_instances_from_disk()));


pub fn get_instances_dir() -> PathBuf {
    get_minecraft_dir().join("instances")
}


pub fn get_instance_dir(id: &str) -> PathBuf {
    get_instances_dir().join(id)
}



fn detect_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x47, 0x49, 0x46]) {
        "image/gif"
    } else {
        "image/png"
    }
}

fn load_instances_from_disk() -> Vec<GameInstance> {
    let instances_dir = get_instances_dir();

    if !instances_dir.exists() {
        if let Err(e) = fs::create_dir_all(&instances_dir) {
            eprintln!("[Instances] Failed to create instances dir: {}", e);
        }
        return Vec::new();
    }

    let mut instances = Vec::new();

    let Ok(entries) = fs::read_dir(&instances_dir) else {
        return instances;
    };
    for entry in entries.flatten() {
        if !entry.path().is_dir() {
            continue;
        }
        let meta_path = entry.path().join("instance.json");
        if !meta_path.exists() {
            continue;
        }
        let Ok(content) = fs::read_to_string(&meta_path) else {
            continue;
        };
        let Ok(mut instance) = serde_json::from_str::<GameInstance>(&content) else {
            continue;
        };
        instance.game_directory = entry.path().to_string_lossy().to_string();
        instance.id = entry.file_name().to_string_lossy().to_string();

        let icon_path = entry.path().join("icon.png");
        if icon_path.exists() && instance.icon.as_ref().map_or(true, |i| i.is_empty()) {
            if let Ok(icon_data) = fs::read(&icon_path) {
                let mime = detect_image_mime(&icon_data);
                let base64 = base64::engine::general_purpose::STANDARD.encode(&icon_data);
                instance.icon = Some(format!("data:{};base64,{}", mime, base64));
            }
        }

        instances.push(instance);
    }

    println!("[Instances] Loaded {} instances", instances.len());
    instances
}

fn save_instance(instance: &GameInstance) -> Result<(), String> {
    let instance_dir = get_instance_dir(&instance.id);
    fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;

  
    let mut save_data = instance.clone();
    if let Some(ref icon) = save_data.icon {
        if icon.starts_with("data:") || icon.starts_with("file://") {
            save_data.icon = None;
        }
    }

    let meta_path = instance_dir.join("instance.json");
    let content = serde_json::to_string_pretty(&save_data).map_err(|e| e.to_string())?;
    fs::write(&meta_path, content).map_err(|e| e.to_string())?;

    Ok(())
}


fn sanitize_name(name: &str) -> String {
    name.chars()
        .filter(|c| !['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(c))
        .collect::<String>()
        .trim()
        .chars()
        .take(100)
        .collect()
}


fn generate_unique_id(name: &str, existing: &[GameInstance]) -> String {
    let base = sanitize_name(name);

    if !existing.iter().any(|i| i.id == base) {
        return base;
    }

    let mut counter = 1;
    loop {
        let candidate = format!("{}-{}", base, counter);
        if !existing.iter().any(|i| i.id == candidate) {
            return candidate;
        }
        counter += 1;
    }
}


pub fn instances_list_sync() -> Vec<GameInstance> {
    let mut instances = INSTANCES.lock().unwrap();
    *instances = load_instances_from_disk();
    instances.clone()
}

#[tauri::command]
pub async fn instances_list() -> Vec<GameInstance> {
    tokio::task::spawn_blocking(|| {
        instances_list_sync()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn instances_get(id: String) -> Option<GameInstance> {
    let instances = INSTANCES.lock().unwrap();
    instances.iter().find(|i| i.id == id).cloned()
}


pub fn mark_played(id: &str) {
    if let Ok(mut instances) = INSTANCES.lock() {
        if let Some(instance) = instances.iter_mut().find(|i| i.id == id) {
            instance.last_played_at = Some(chrono::Utc::now().to_rfc3339());
            let _ = save_instance(instance);
        }
    }
}

#[tauri::command]
pub fn instances_create(options: CreateInstanceOptions) -> Result<GameInstance, String> {
    let mut instances = INSTANCES.lock().map_err(|e| e.to_string())?;

    let id = generate_unique_id(&options.name, &instances);
    let game_directory = get_instance_dir(&id).to_string_lossy().to_string();

    let instance = GameInstance {
        id: id.clone(),
        name: options.name,
        icon: options.icon,
        minecraft_version: options.minecraft_version,
        loader: options.loader.unwrap_or_default(),
        loader_version: options.loader_version,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_played_at: None,
        total_play_time: 0,
        java_path: None,
        ram_mb: None,
        java_arguments: None,
        game_directory,
        modpack_id: None,
        modpack_version_id: None,
        cloud_id: None,
        auto_update: None,
        banner: None,
        locked_mods: None,
    };

    let instance_dir = get_instance_dir(&id);
    for subdir in ["mods", "config", "saves", "resourcepacks", "shaderpacks"] {
        fs::create_dir_all(instance_dir.join(subdir)).map_err(|e| e.to_string())?;
    }

    save_instance(&instance)?;
    instances.push(instance.clone());

    println!("[Instances] Created: {} ({})", instance.name, instance.id);
    Ok(instance)
}

#[tauri::command]
pub fn instances_update(
    id: String,
    updates: serde_json::Value,
) -> Result<Option<GameInstance>, String> {
    let mut instances = INSTANCES.lock().map_err(|e| e.to_string())?;

    if let Some(instance) = instances.iter_mut().find(|i| i.id == id) {
        if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
            instance.name = name.to_string();
        }
        if let Some(loader) = updates.get("loader").and_then(|v| v.as_str()) {
            instance.loader = match loader {
                "vanilla" => LoaderType::Vanilla,
                "fabric" => LoaderType::Fabric,
                "forge" => LoaderType::Forge,
                "neoforge" => LoaderType::Neoforge,
                "quilt" => LoaderType::Quilt,
                _ => instance.loader.clone(),
            };
        }
        if let Some(version) = updates.get("minecraftVersion").and_then(|v| v.as_str()) {
            instance.minecraft_version = version.to_string();
        }
        if let Some(cloud_id) = updates.get("cloudId").and_then(|v| v.as_str()) {
            instance.cloud_id = Some(cloud_id.to_string());
        }
        if let Some(banner) = updates.get("banner") {
            if banner.is_null() {
                instance.banner = None;
            } else if let Some(s) = banner.as_str() {
                instance.banner = Some(s.to_string());
            }
        }
        if let Some(icon) = updates.get("icon").and_then(|v| v.as_str()) {
            instance.icon = Some(icon.to_string());
        }
        if let Some(auto_update) = updates.get("autoUpdate").and_then(|v| v.as_bool()) {
            instance.auto_update = Some(auto_update);
        }
        if let Some(mods) = updates.get("lockedMods").and_then(|v| v.as_array()) {
            instance.locked_mods = Some(
                mods.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect(),
            );
        }
        if let Some(ver) = updates.get("loaderVersion").and_then(|v| v.as_str()) {
            instance.loader_version = Some(ver.to_string());
        }
        if let Some(path) = updates.get("javaPath").and_then(|v| v.as_str()) {
            instance.java_path = Some(path.to_string());
        }
        if let Some(args) = updates.get("javaArguments").and_then(|v| v.as_str()) {
            instance.java_arguments = Some(args.to_string());
        }
        if let Some(mb) = updates.get("ramMB").and_then(|v| v.as_u64()) {
            instance.ram_mb = Some(mb as u32);
        }

        save_instance(instance)?;
        return Ok(Some(instance.clone()));
    }

    Ok(None)
}

#[tauri::command]
pub async fn instances_delete(id: String) -> Result<bool, String> {
    let existed = {
        let mut instances = INSTANCES.lock().map_err(|e| e.to_string())?;
        match instances.iter().position(|i| i.id == id) {
            Some(pos) => {
                let instance = instances.remove(pos);
                println!("[Instances] Deleted: {} ({})", instance.name, id);
                true
            }
            None => false,
        }
    };

    if !existed {
        return Ok(false);
    }

    let dir = get_instance_dir(&id);
    if dir.exists() {
        tauri::async_runtime::spawn_blocking(move || fs::remove_dir_all(&dir))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    }

    Ok(true)
}

#[tauri::command]
pub fn instances_duplicate(id: String) -> Result<Option<GameInstance>, String> {
    let instances = INSTANCES.lock().map_err(|e| e.to_string())?;

    let source = instances.iter().find(|i| i.id == id).cloned();
    drop(instances);

    if let Some(source) = source {
        let new_instance = instances_create(CreateInstanceOptions {
            name: format!("{} (Copy)", source.name),
            minecraft_version: source.minecraft_version,
            loader: Some(source.loader),
            loader_version: source.loader_version,
            icon: source.icon,
        })?;

        let source_dir = get_instance_dir(&id);
        let dest_dir = get_instance_dir(&new_instance.id);

        for dir in ["mods", "config", "resourcepacks", "shaderpacks", "saves"] {
            let src = source_dir.join(dir);
            let dst = dest_dir.join(dir);
            if src.exists() {
                copy_dir_recursive(&src, &dst).ok();
            }
        }

        for file in ["options.txt", "servers.dat"] {
            let src = source_dir.join(file);
            let dst = dest_dir.join(file);
            if src.exists() {
                fs::copy(&src, &dst).ok();
            }
        }

        return Ok(Some(new_instance));
    }

    Ok(None)
}

#[tauri::command]
pub fn instances_set_icon(id: String, icon_data: String) -> crate::cloud::SimpleResult {
    let icon_path = get_instance_dir(&id).join("icon.png");

    let result: Result<(), String> = (|| {
        if icon_data.starts_with("data:image") {
            let base64_data = icon_data.split(',').nth(1).ok_or("Invalid icon data")?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(base64_data)
                .map_err(|e| e.to_string())?;
            fs::write(&icon_path, bytes).map_err(|e| e.to_string())?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => crate::cloud::SimpleResult {
            ok: true,
            error: None,
            message: None,
        },
        Err(e) => crate::cloud::SimpleResult {
            ok: false,
            error: Some(e),
            message: None,
        },
    }
}

/// Copy directory recursively
pub(crate) fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
