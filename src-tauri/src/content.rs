


use crate::instances::get_instance_dir;
use serde::{Deserialize, Serialize};
use std::fs;


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModItem {
    pub file_name: String,
    pub name: String,
    pub enabled: bool,
    pub size: u64,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackItem {
    pub file_name: String,
    pub name: String,
    pub size: u64,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShaderItem {
    pub file_name: String,
    pub name: String,
    pub size: u64,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatapackItem {
    pub file_name: String,
    pub name: String,
    pub size: u64,
}

#[tauri::command]
pub fn instance_get_mods(instance_id: String) -> Vec<ModItem> {
    let mods_dir = get_instance_dir(&instance_id).join("mods");
    let mut mods = Vec::new();

    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if path.is_file() {
                let enabled = !file_name.ends_with(".disabled");
                let display_name = file_name
                    .trim_end_matches(".disabled")
                    .trim_end_matches(".jar")
                    .to_string();

                let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

                mods.push(ModItem {
                    file_name: file_name.clone(),
                    name: display_name,
                    enabled,
                    size,
                });
            }
        }
    }

    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    mods
}






#[tauri::command]
pub fn instance_toggle_mod(instance_id: String, filename: String) -> ToggleResult {
    toggle_result(get_instance_dir(&instance_id).join("mods"), filename)
}

#[tauri::command]
pub fn instance_delete_mod(instance_id: String, mod_file_name: String) -> Result<bool, String> {
    let instance_dir = get_instance_dir(&instance_id);
    let mod_path = instance_dir.join("mods").join(&mod_file_name);

    if mod_path.exists() {
        fs::remove_file(&mod_path).map_err(|e| e.to_string())?;
        crate::mod_meta::delete_content_link(&instance_dir, "mod", &mod_file_name);
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
pub fn instance_get_resource_packs(instance_id: String) -> Vec<ResourcePackItem> {
    let dir = get_instance_dir(&instance_id).join("resourcepacks");
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if path.is_file() || path.is_dir() {
                let name = file_name.trim_end_matches(".zip").to_string();
                let size = if path.is_file() {
                    fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                } else {
                    0
                };

                items.push(ResourcePackItem {
                    file_name,
                    name,
                    size,
                });
            }
        }
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    items
}

#[tauri::command]
pub fn instance_get_shaders(instance_id: String) -> Vec<ShaderItem> {
    let dir = get_instance_dir(&instance_id).join("shaderpacks");
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if path.is_file() || path.is_dir() {
                let name = file_name.trim_end_matches(".zip").to_string();
                let size = if path.is_file() {
                    fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                } else {
                    0
                };

                items.push(ShaderItem {
                    file_name,
                    name,
                    size,
                });
            }
        }
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    items
}

#[tauri::command]
pub fn instance_get_datapacks(instance_id: String) -> Vec<DatapackItem> {
    let saves_dir = get_instance_dir(&instance_id).join("saves");
    let mut items = Vec::new();

    if let Ok(world_entries) = fs::read_dir(&saves_dir) {
        for world_entry in world_entries.flatten() {
            if world_entry.path().is_dir() {
                let datapacks_dir = world_entry.path().join("datapacks");
                if let Ok(dp_entries) = fs::read_dir(&datapacks_dir) {
                    for entry in dp_entries.flatten() {
                        let path = entry.path();
                        let file_name = entry.file_name().to_string_lossy().to_string();

                        if path.is_file() || path.is_dir() {
                            let name = file_name.trim_end_matches(".zip").to_string();
                            let size = if path.is_file() {
                                fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                            } else {
                                0
                            };

                            if !items
                                .iter()
                                .any(|i: &DatapackItem| i.file_name == file_name)
                            {
                                items.push(DatapackItem {
                                    file_name,
                                    name,
                                    size,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    items
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallContentResult {
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn instance_install_content(
    instance_id: String,
    content_type: String,
    project_id: String,
    version_id: String,
) -> InstallContentResult {
    println!(
        "[Content] Installing {} {} to instance {}",
        content_type, project_id, instance_id
    );

    let client = crate::http_client::HTTP_CLIENT.clone();
    let url = format!("https://api.modrinth.com/v2/version/{}", version_id);

    let response = match client
        .get(&url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return InstallContentResult {
                ok: false,
                error: Some(e.to_string()),
            }
        }
    };

    let version_data: serde_json::Value = match response.json().await {
        Ok(v) => v,
        Err(e) => {
            return InstallContentResult {
                ok: false,
                error: Some(e.to_string()),
            }
        }
    };

    let files = match version_data["files"].as_array() {
        Some(f) => f,
        None => {
            return InstallContentResult {
                ok: false,
                error: Some("No files found".to_string()),
            }
        }
    };
    let file = match files.first() {
        Some(f) => f,
        None => {
            return InstallContentResult {
                ok: false,
                error: Some("No files found".to_string()),
            }
        }
    };
    let download_url = match file["url"].as_str() {
        Some(u) => u,
        None => {
            return InstallContentResult {
                ok: false,
                error: Some("No download URL".to_string()),
            }
        }
    };
    let filename = match file["filename"].as_str() {
        Some(f) => f,
        None => {
            return InstallContentResult {
                ok: false,
                error: Some("No filename".to_string()),
            }
        }
    };

    let target_dir = match content_type.as_str() {
        "mod" => get_instance_dir(&instance_id).join("mods"),
        "resourcepack" => get_instance_dir(&instance_id).join("resourcepacks"),
        "shader" => get_instance_dir(&instance_id).join("shaderpacks"),
        _ => {
            return InstallContentResult {
                ok: false,
                error: Some("Unknown content type".to_string()),
            }
        }
    };

    match fs::create_dir_all(&target_dir) {
        Ok(_) => {}
        Err(e) => {
            return InstallContentResult {
                ok: false,
                error: Some(e.to_string()),
            }
        }
    }

    let file_response = match client.get(download_url).send().await {
        Ok(r) => r,
        Err(e) => {
            return InstallContentResult {
                ok: false,
                error: Some(e.to_string()),
            }
        }
    };

    let bytes = match file_response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return InstallContentResult {
                ok: false,
                error: Some(e.to_string()),
            }
        }
    };
    let target_path = target_dir.join(filename);

    match fs::write(&target_path, bytes) {
        Ok(_) => {}
        Err(e) => {
            return InstallContentResult {
                ok: false,
                error: Some(e.to_string()),
            }
        }
    }

    println!("[Content] Installed {} to {:?}", filename, target_path);

    InstallContentResult {
        ok: true,
        error: None,
    }
}

const API_URL: &str = "https://api.reality.catlabdesign.space";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListResult {
    pub ok: bool,
    pub items: Vec<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub ok: bool,
    pub filepath: Option<String>,
    pub filename: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone)]
struct ModListCacheEntry {
    mtime_ms: String,
    mods: Vec<serde_json::Value>,
    has_uncached: bool,
}

static MOD_LIST_CACHE: once_cell::sync::Lazy<
    std::sync::Mutex<std::collections::HashMap<String, ModListCacheEntry>>,
> = once_cell::sync::Lazy::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

pub fn clear_mod_list_cache() {
    if let Ok(mut cache) = MOD_LIST_CACHE.lock() {
        cache.clear();
    }
}

fn infer_version_from_filename(filename: &str) -> Option<String> {
    use once_cell::sync::Lazy;
    static RE: Lazy<regex::Regex> = Lazy::new(|| {
        regex::Regex::new(r"(?:^|[\s._+\-)\]])v?(\d+(?:\.\d+){1,3}(?:[-._]?(?:alpha|beta|rc|pre|snapshot)\d*)?)").unwrap()
    });
    let normalized = filename
        .trim_end_matches(".disabled")
        .trim_end_matches(".jar")
        .trim_end_matches(".zip");
    let mut last_ver: Option<String> = None;
    for cap in RE.captures_iter(normalized) {
        if let Some(m) = cap.get(1) {
            last_ver = Some(m.as_str().to_string());
        }
    }
    last_ver
}

#[tauri::command]
pub async fn instance_list_mods(app: tauri::AppHandle, instance_id: String) -> serde_json::Value {
    let instance_dir = crate::instances::get_instance_dir(&instance_id);
    let mods_dir = instance_dir.join("mods");

    let dir_mtime = crate::mod_meta::mtime_iso(&mods_dir);

    if let Ok(cache_lock) = MOD_LIST_CACHE.lock() {
        if let Some(cached) = cache_lock.get(&instance_id) {
            if cached.mtime_ms == dir_mtime {
                let mut in_place_change = false;
                for m in &cached.mods {
                    if let Some(filename) = m.get("filename").and_then(|f| f.as_str()) {
                        let file_path = mods_dir.join(filename);
                        let size = fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
                        let mtime = crate::mod_meta::mtime_iso(&file_path);
                        let cached_size = m.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                        let cached_mtime =
                            m.get("modifiedAt").and_then(|m| m.as_str()).unwrap_or("");
                        if size != cached_size || mtime != cached_mtime {
                            in_place_change = true;
                            break;
                        }
                    }
                }
                if !in_place_change {
                    return serde_json::json!({ "ok": true, "mods": cached.mods, "hasUncached": cached.has_uncached });
                }
            }
        }
    }

    let links = std::sync::Arc::new(crate::mod_meta::read_content_links(&instance_dir));

    let entries = if let Ok(entries) = fs::read_dir(&mods_dir) {
        entries.flatten().collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    let lookup_batch_limit = if entries.len() > 120 { 50 } else { 80 };

    let mut mods = Vec::new();
    let mut lookup_jobs: Vec<crate::mod_meta::LookupJob> = Vec::new();
    let mut has_uncached = false;

    for chunk in entries.chunks(8) {
        let mut tasks = Vec::new();
        for entry in chunk {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let links_clone = std::sync::Arc::clone(&links);

            tasks.push(tokio::task::spawn_blocking(move || {
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let enabled = !file_name.ends_with(".disabled");
                let fallback_name = file_name
                    .trim_end_matches(".disabled")
                    .trim_end_matches(".jar")
                    .to_string();
                let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let mtime = crate::mod_meta::mtime_iso(&path);
                
                let cache_key = crate::mod_meta::cache_key(&path, size, &mtime);
                let mut cached = crate::mod_meta::get_cached(&cache_key);
                let link = crate::mod_meta::link_for(&links_clone, "mod", &file_name).cloned();

                let mut needs_local_meta = false;

                
                
                if cached.is_none() {
                    needs_local_meta = true;
                }

                let display_name = if let Some(c) = &cached {
                    if let Some(n) = &c.display_name {
                        n.clone()
                    } else if c.hash.is_some() || c.modrinth_id.is_some() || c.curseforge_project_id.is_some() {
                        fallback_name.clone()
                    } else {
                        needs_local_meta = true;
                        fallback_name.clone()
                    }
                } else {
                    needs_local_meta = true;
                    fallback_name.clone()
                };

                let version = cached.as_ref().and_then(|c| c.version.clone())
                    .or_else(|| infer_version_from_filename(&file_name));
                let description = cached.as_ref().and_then(|c| c.description.clone());
                let icon = cached
                    .as_ref()
                    .and_then(|c| c.icon.clone())
                    .or_else(|| link.as_ref().and_then(|l| l.icon_url.clone()));

                let mut modrinth_project_id = cached.as_ref().and_then(|c| c.modrinth_project_id.clone());
                let mut curseforge_project_id = cached.as_ref().and_then(|c| c.curseforge_project_id.clone());
                if let Some(l) = &link {
                    match l.source.as_str() {
                        "curseforge" => {
                            curseforge_project_id = curseforge_project_id.or(Some(l.project_id.clone()))
                        }
                        _ => modrinth_project_id = modrinth_project_id.or(Some(l.project_id.clone())),
                    }
                }
                let installed_version_id = link.and_then(|l| l.version_id.clone());

                let resolved = icon.is_some()
                    || modrinth_project_id.is_some()
                    || curseforge_project_id.is_some()
                    || cached.as_ref().and_then(|c| c.modrinth_id.as_deref()) == Some("checked_missing");

                let mut lookup_job = None;
                let pending = crate::mod_meta::is_pending(&cache_key);
                let is_uncached = !resolved || needs_local_meta || pending;
                
                if (!resolved || needs_local_meta) && !pending {
                    lookup_job = Some(crate::mod_meta::LookupJob {
                        path: path.clone(),
                        cache_key,
                        slug: None,
                        display_name: Some(display_name.clone()),
                        needs_local_meta,
                    });
                }

                let mod_json = serde_json::json!({
                    "filename": file_name,
                    "name": display_name.clone(),
                    "displayName": display_name,
                    "author": cached.as_ref().and_then(|c| c.author.clone()),
                    "version": version,
                    "description": description,
                    "icon": icon,
                    "enabled": enabled,
                    "size": size,
                    "modifiedAt": mtime,
                    "modrinthProjectId": modrinth_project_id,
                    "curseforgeProjectId": curseforge_project_id,
                    "installedVersionId": installed_version_id,
                    "source": serde_json::Value::Null,
                    "isDirectory": false,
                });

                (mod_json, lookup_job, is_uncached)
            }));
        }

        for task in tasks {
            if let Ok((mod_json, lookup_job, is_uncached)) = task.await {
                mods.push(mod_json);
                if is_uncached {
                    has_uncached = true;
                }
                if let Some(job) = lookup_job {
                    if lookup_jobs.len() < lookup_batch_limit {
                        lookup_jobs.push(job);
                    }
                }
            }
        }
    }

    
    crate::mod_meta::flush_cache();

    if !lookup_jobs.is_empty() {
        crate::mod_meta::schedule_lookups(app, instance_id.clone(), lookup_jobs);
    }

    mods.sort_by(|a, b| {
        a.get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_lowercase()
            .cmp(
                &b.get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_lowercase(),
            )
    });

    if let Ok(mut cache_lock) = MOD_LIST_CACHE.lock() {
        cache_lock.insert(
            instance_id,
            ModListCacheEntry {
                mtime_ms: dir_mtime,
                mods: mods.clone(),
                has_uncached,
            },
        );
    }

    serde_json::json!({ "ok": true, "mods": mods, "hasUncached": has_uncached })
}



fn pack_icon_data_url(path: &std::path::Path) -> Option<String> {
    if path.is_dir() {
        let bytes = fs::read(path.join("pack.png")).ok()?;
        if bytes.is_empty() {
            return None;
        }
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Some(format!("data:image/png;base64,{b64}"));
    }
    let file = fs::File::open(path).ok()?;
    let mut zip = zip::ZipArchive::new(file).ok()?;
    read_zip_icon(&mut zip, "pack.png")
}




fn pack_row_extras(
    links: &crate::mod_meta::ContentLinks,
    content_type: &str,
    file_name: &str,
    path: &std::path::Path,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let link = crate::mod_meta::link_for(links, content_type, file_name);
    let icon = link
        .and_then(|l| l.icon_url.clone())
        .or_else(|| pack_icon_data_url(path));
    let (mut modrinth_id, mut curseforge_id) = (None, None);
    if let Some(l) = link {
        match l.source.as_str() {
            "curseforge" => curseforge_id = Some(l.project_id.clone()),
            _ => modrinth_id = Some(l.project_id.clone()),
        }
    }
    let installed_version_id = link.and_then(|l| l.version_id.clone());
    (icon, modrinth_id, curseforge_id, installed_version_id)
}

fn list_packs_in_dir(instance_id: &str, subdir: &str, content_type: &str) -> ListResult {
    let instance_dir = crate::instances::get_instance_dir(instance_id);
    let dir = instance_dir.join(subdir);
    let links = crate::mod_meta::read_content_links(&instance_dir);
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let enabled = !file_name.ends_with(".disabled");
            let is_dir = path.is_dir();
            let name = file_name
                .trim_end_matches(".disabled")
                .trim_end_matches(".zip")
                .to_string();
            let size = if path.is_file() {
                fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
            } else {
                0
            };
            let (icon, modrinth_id, curseforge_id, installed_version_id) =
                pack_row_extras(&links, content_type, &file_name, &path);

            items.push(serde_json::json!({
                "filename": file_name,
                "name": name,
                "enabled": enabled,
                "size": size,
                "isDirectory": is_dir,
                "icon": icon,
                "modrinthProjectId": modrinth_id,
                "curseforgeProjectId": curseforge_id,
                "installedVersionId": installed_version_id,
            }));
        }
    }

    items.sort_by(|a, b| {
        a.get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .cmp(&b.get("name").and_then(|n| n.as_str()).unwrap_or(""))
    });
    ListResult {
        ok: true,
        items,
        error: None,
    }
}

#[tauri::command]
pub fn instance_list_resourcepacks(instance_id: String) -> ListResult {
    list_packs_in_dir(&instance_id, "resourcepacks", "resourcepack")
}

#[tauri::command]
pub fn instance_list_shaders(instance_id: String) -> ListResult {
    list_packs_in_dir(&instance_id, "shaderpacks", "shader")
}

#[tauri::command]
pub fn instance_list_datapacks(instance_id: String) -> ListResult {
    let instance_dir = crate::instances::get_instance_dir(&instance_id);
    let saves_dir = instance_dir.join("saves");
    let links = crate::mod_meta::read_content_links(&instance_dir);
    let mut items = Vec::new();

    if let Ok(world_entries) = fs::read_dir(&saves_dir) {
        for world_entry in world_entries.flatten() {
            if !world_entry.path().is_dir() {
                continue;
            }
            let datapacks_dir = world_entry.path().join("datapacks");
            if let Ok(dp_entries) = fs::read_dir(&datapacks_dir) {
                for entry in dp_entries.flatten() {
                    let path = entry.path();
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    let enabled = !file_name.ends_with(".disabled");
                    let is_dir = path.is_dir();
                    let name = file_name
                        .trim_end_matches(".disabled")
                        .trim_end_matches(".zip")
                        .to_string();
                    let size = if path.is_file() {
                        fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                    } else {
                        0
                    };
                    let world_name = world_entry.file_name().to_string_lossy().to_string();

                    if !items.iter().any(|i: &serde_json::Value| {
                        i.get("filename").and_then(|n| n.as_str()) == Some(&file_name)
                    }) {
                        let (icon, modrinth_id, curseforge_id, installed_version_id) =
                            pack_row_extras(&links, "datapack", &file_name, &path);
                        items.push(serde_json::json!({
                            "filename": file_name,
                            "name": name,
                            "enabled": enabled,
                            "size": size,
                            "isDirectory": is_dir,
                            "worldName": world_name,
                            "icon": icon,
                            "modrinthProjectId": modrinth_id,
                            "curseforgeProjectId": curseforge_id,
                            "installedVersionId": installed_version_id,
                        }));
                    }
                }
            }
        }
    }

    items.sort_by(|a, b| {
        a.get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .cmp(&b.get("name").and_then(|n| n.as_str()).unwrap_or(""))
    });
    ListResult {
        ok: true,
        items,
        error: None,
    }
}

#[tauri::command]
pub fn instance_lock_mods(
    instance_id: String,
    filenames: Vec<String>,
    lock: bool,
) -> Result<LockToggleResult, String> {
    let existing =
        crate::instances::instances_get(instance_id.clone()).ok_or("Instance not found")?;

    let mut current = existing.locked_mods.unwrap_or_default();

    if lock {
        for f in &filenames {
            if !current.contains(f) {
                current.push(f.clone());
            }
        }
    } else {
        current.retain(|f| !filenames.contains(f));
    }

    crate::instances::instances_update(
        instance_id,
        serde_json::json!({
            "lockedMods": current,
        }),
    )?;

    
    
    Ok(LockToggleResult { ok: true, locked_mods: current, error: None })
}

#[tauri::command]
pub async fn content_download_to_instance(
    project_id: String,
    version_id: String,
    instance_id: String,
    content_type: String,
    content_source: Option<String>,
) -> DownloadResult {
    let source = content_source.as_deref().unwrap_or("modrinth");
    let client = crate::http_client::HTTP_CLIENT.clone();

    let (download_url, filename) = match source {
        "curseforge" => {
            let file_id: i32 = match version_id.parse() {
                Ok(id) => id,
                Err(_) => {
                    return DownloadResult {
                        ok: false,
                        filepath: None,
                        filename: None,
                        error: Some("Invalid file ID".to_string()),
                    };
                }
            };
            let project_id_num: i32 = match project_id.parse() {
                Ok(id) => id,
                Err(_) => {
                    return DownloadResult {
                        ok: false,
                        filepath: None,
                        filename: None,
                        error: Some("Invalid project ID".to_string()),
                    };
                }
            };
            match get_curseforge_download_url(&client, project_id_num, file_id).await {
                Ok(result) => result,
                Err(e) => {
                    return DownloadResult {
                        ok: false,
                        filepath: None,
                        filename: None,
                        error: Some(e),
                    };
                }
            }
        }
        _ => match get_modrinth_download_info(&client, &version_id).await {
            Ok(result) => result,
            Err(e) => {
                return DownloadResult {
                    ok: false,
                    filepath: None,
                    filename: None,
                    error: Some(e),
                };
            }
        },
    };

    let target_dir = match content_type.as_str() {
        "mod" => crate::instances::get_instance_dir(&instance_id).join("mods"),
        "resourcepack" => crate::instances::get_instance_dir(&instance_id).join("resourcepacks"),
        "shader" => crate::instances::get_instance_dir(&instance_id).join("shaderpacks"),
        "datapack" => crate::instances::get_instance_dir(&instance_id).join("datapacks"),
        _ => {
            return DownloadResult {
                ok: false,
                filepath: None,
                filename: None,
                error: Some("Unknown content type".to_string()),
            };
        }
    };

    fs::create_dir_all(&target_dir).ok();
    let target_path = target_dir.join(&filename);

    match client.get(&download_url).send().await {
        Ok(resp) => match resp.bytes().await {
            Ok(bytes) => {
                if let Err(e) = fs::write(&target_path, &bytes) {
                    return DownloadResult {
                        ok: false,
                        filepath: None,
                        filename: None,
                        error: Some(e.to_string()),
                    };
                }

                let icon_url = if source == "modrinth" {
                    fetch_modrinth_project_icon(&client, &project_id).await
                } else {
                    None
                };
                crate::mod_meta::save_content_link(
                    &crate::instances::get_instance_dir(&instance_id),
                    &content_type,
                    &filename,
                    crate::mod_meta::ContentLink {
                        source: source.to_string(),
                        project_id: project_id.clone(),
                        version_id: Some(version_id.clone()),
                        icon_url,
                    },
                );

                DownloadResult {
                    ok: true,
                    filepath: Some(target_path.to_string_lossy().to_string()),
                    filename: Some(filename),
                    error: None,
                }
            }
            Err(e) => DownloadResult {
                ok: false,
                filepath: None,
                filename: None,
                error: Some(e.to_string()),
            },
        },
        Err(e) => DownloadResult {
            ok: false,
            filepath: None,
            filename: None,
            error: Some(e.to_string()),
        },
    }
}

async fn fetch_modrinth_project_icon(client: &reqwest::Client, project_id: &str) -> Option<String> {
    let resp = client
        .get(format!("https://api.modrinth.com/v2/project/{project_id}"))
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let data: serde_json::Value = resp.json().await.ok()?;
    data.get("icon_url")
        .and_then(|u| u.as_str())
        .map(String::from)
}

async fn get_modrinth_download_info(
    client: &reqwest::Client,
    version_id: &str,
) -> Result<(String, String), String> {
    let url = format!("https://api.modrinth.com/v2/version/{version_id}");
    let resp = client
        .get(&url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| format!("Modrinth version fetch failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth API error: {}", resp.status()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let files = data
        .get("files")
        .and_then(|f| f.as_array())
        .ok_or("No files found")?;
    let file = files.first().ok_or("No files found")?;
    let url = file
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or("No download URL")?
        .to_string();
    let filename = file
        .get("filename")
        .and_then(|f| f.as_str())
        .ok_or("No filename")?
        .to_string();

    Ok((url, filename))
}

async fn get_curseforge_download_url(
    client: &reqwest::Client,
    project_id: i32,
    file_id: i32,
) -> Result<(String, String), String> {
    let url = format!("{API_URL}/curseforge/download/{project_id}/{file_id}");
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("CF download URL fetch failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge API error: {}", resp.status()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let download_url = data
        .get("data")
        .and_then(|d| d.as_str())
        .ok_or("No download URL")?
        .to_string();

    let file_url = format!("{API_URL}/curseforge/file/{project_id}/{file_id}");
    let file_resp = client
        .get(&file_url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("CF file info fetch failed: {e}"))?;

    let file_info: serde_json::Value = if file_resp.status().is_success() {
        file_resp.json().await.unwrap_or_default()
    } else {
        serde_json::Value::Null
    };

    let filename = file_info
        .get("data")
        .and_then(|d| d.get("fileName"))
        .and_then(|f| f.as_str())
        .unwrap_or(&format!("{file_id}.jar"))
        .to_string();

    Ok((download_url, filename))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleResult {
    pub ok: bool,
    pub new_filename: String,
    pub enabled: bool,
    pub error: Option<String>,
}

fn toggle_in_dir(dir: &std::path::Path, filename: &str) -> Result<(String, bool), String> {
    let current = dir.join(filename);
    let (new_name, enabled) = if filename.ends_with(".disabled") {
        (filename.trim_end_matches(".disabled").to_string(), true)
    } else {
        (format!("{filename}.disabled"), false)
    };
    let new_path = dir.join(&new_name);
    if current.exists() && current != new_path {
        fs::rename(&current, &new_path).map_err(|e| e.to_string())?;
    }
    Ok((new_name, enabled))
}

fn toggle_result(dir: std::path::PathBuf, filename: String) -> ToggleResult {
    match toggle_in_dir(&dir, &filename) {
        Ok((new_filename, enabled)) => ToggleResult {
            ok: true,
            new_filename,
            enabled,
            error: None,
        },
        Err(e) => ToggleResult {
            ok: false,
            new_filename: filename,
            enabled: false,
            error: Some(e),
        },
    }
}

fn delete_in_dir(dir: &std::path::Path, filename: &str) -> Result<bool, String> {
    let path = dir.join(filename);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn instance_toggle_resourcepack(instance_id: String, filename: String) -> ToggleResult {
    toggle_result(
        get_instance_dir(&instance_id).join("resourcepacks"),
        filename,
    )
}

#[tauri::command]
pub fn instance_toggle_shader(instance_id: String, filename: String) -> ToggleResult {
    toggle_result(get_instance_dir(&instance_id).join("shaderpacks"), filename)
}

#[tauri::command]
pub fn instance_toggle_datapack(
    instance_id: String,
    world_name: String,
    filename: String,
) -> ToggleResult {
    let dir = get_instance_dir(&instance_id)
        .join("saves")
        .join(&world_name)
        .join("datapacks");
    toggle_result(dir, filename)
}

#[tauri::command]
pub fn instance_delete_resourcepack(instance_id: String, filename: String) -> Result<bool, String> {
    let instance_dir = get_instance_dir(&instance_id);
    let deleted = delete_in_dir(&instance_dir.join("resourcepacks"), &filename)?;
    if deleted {
        crate::mod_meta::delete_content_link(&instance_dir, "resourcepack", &filename);
    }
    Ok(deleted)
}

#[tauri::command]
pub fn instance_delete_shader(instance_id: String, filename: String) -> Result<bool, String> {
    let instance_dir = get_instance_dir(&instance_id);
    let deleted = delete_in_dir(&instance_dir.join("shaderpacks"), &filename)?;
    if deleted {
        crate::mod_meta::delete_content_link(&instance_dir, "shader", &filename);
    }
    Ok(deleted)
}

#[tauri::command]
pub fn instance_delete_datapack(
    instance_id: String,
    world_name: String,
    filename: String,
) -> Result<bool, String> {
    let instance_dir = get_instance_dir(&instance_id);
    let dir = instance_dir
        .join("saves")
        .join(&world_name)
        .join("datapacks");
    let deleted = delete_in_dir(&dir, &filename)?;
    if deleted {
        crate::mod_meta::delete_content_link(&instance_dir, "datapack", &filename);
    }
    Ok(deleted)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockToggleResult {
    pub ok: bool,
    pub locked_mods: Vec<String>,
    pub error: Option<String>,
}



#[tauri::command]
pub fn instance_toggle_lock(instance_id: String, filename: String) -> LockToggleResult {
    let mut instances = match crate::instances::INSTANCES.lock() {
        Ok(g) => g,
        Err(e) => {
            return LockToggleResult {
                ok: false,
                locked_mods: vec![],
                error: Some(e.to_string()),
            }
        }
    };
    let Some(instance) = instances.iter_mut().find(|i| i.id == instance_id) else {
        return LockToggleResult {
            ok: false,
            locked_mods: vec![],
            error: Some("Instance not found".into()),
        };
    };
    let mut locked = instance.locked_mods.clone().unwrap_or_default();
    if let Some(pos) = locked.iter().position(|f| f == &filename) {
        locked.remove(pos);
    } else {
        locked.push(filename);
    }
    instance.locked_mods = Some(locked.clone());
    let updates = serde_json::json!({ "lockedMods": locked });
    drop(instances);
    match crate::instances::instances_update(instance_id, updates) {
        Ok(_) => LockToggleResult {
            ok: true,
            locked_mods: locked,
            error: None,
        },
        Err(e) => LockToggleResult {
            ok: false,
            locked_mods: vec![],
            error: Some(e),
        },
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFileResult {
    pub ok: bool,
    pub filename: Option<String>,
    pub error: Option<String>,
}



#[tauri::command]
pub fn instance_add_content_file(
    instance_id: String,
    file_path: String,
    content_type: String,
) -> AddFileResult {
    let src = std::path::Path::new(&file_path);
    let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
        return AddFileResult {
            ok: false,
            filename: None,
            error: Some("Invalid file path".into()),
        };
    };
    let sub = match content_type.as_str() {
        "resourcepack" => "resourcepacks",
        "shader" => "shaderpacks",
        "datapack" => "datapacks",
        _ => "mods",
    };
    let dir = get_instance_dir(&instance_id).join(sub);
    if let Err(e) = fs::create_dir_all(&dir) {
        return AddFileResult {
            ok: false,
            filename: None,
            error: Some(e.to_string()),
        };
    }
    match fs::copy(src, dir.join(name)) {
        Ok(_) => AddFileResult {
            ok: true,
            filename: Some(name.to_string()),
            error: None,
        },
        Err(e) => AddFileResult {
            ok: false,
            filename: None,
            error: Some(e.to_string()),
        },
    }
}

#[derive(Default)]
pub struct JarMeta {
    
    pub id: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>, 
}

fn image_mime_for(path: &str) -> &'static str {
    let p = path.to_lowercase();
    if p.ends_with(".webp") {
        "image/webp"
    } else if p.ends_with(".jpg") || p.ends_with(".jpeg") {
        "image/jpeg"
    } else if p.ends_with(".gif") {
        "image/gif"
    } else {
        "image/png"
    }
}

fn read_zip_text<R: std::io::Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
) -> Option<String> {
    let mut f = zip.by_name(name).ok()?;
    let mut s = String::new();
    std::io::Read::read_to_string(&mut f, &mut s).ok()?;
    Some(s)
}

/// Parse JSON, tolerating the raw control characters some mods leave in their
/// metadata strings (e.g. literal newlines in a description) which strict JSON
/// rejects. Retries with control chars replaced by spaces.
fn parse_json_lenient(txt: &str) -> Option<serde_json::Value> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(txt) {
        return Some(v);
    }
    let cleaned: String = txt
        .chars()
        .map(|c| {
            if (c as u32) < 0x20 && c != '\t' {
                ' '
            } else {
                c
            }
        })
        .collect();
    serde_json::from_str::<serde_json::Value>(&cleaned).ok()
}

fn read_zip_icon<R: std::io::Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    path: &str,
) -> Option<String> {
    let path = path.trim_start_matches('/');
    if path.is_empty() {
        return None;
    }
    let mut f = zip.by_name(path).ok()?;
    let mut buf = Vec::new();
    std::io::Read::read_to_end(&mut f, &mut buf).ok()?;
    if buf.is_empty() {
        return None;
    }
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Some(format!("data:{};base64,{}", image_mime_for(path), b64))
}

/// Pull one string field from a simple `key = "value" #comment` TOML line.
/// Only matches exact `key` (not a prefix of a longer identifier like
/// `version` vs `versionRange`), and strips trailing `#...` comments before
/// unquoting so `logoFile = "icon.png" #optional` yields `icon.png`, not
/// `icon.png" #optional`.
fn toml_str(src: &str, key: &str) -> Option<String> {
    for line in src.lines() {
        let line = line.trim();
        let Some(rest) = line.strip_prefix(key) else {
            continue;
        };
        let rest = rest.trim_start();
        let Some(mut rest) = rest.strip_prefix('=') else {
            continue;
        };
        rest = rest.trim();

        let value_str = if let Some(stripped) = rest.strip_prefix('"') {
            match stripped.find('"') {
                Some(end) => &stripped[..end],
                None => stripped,
            }
        } else if let Some(stripped) = rest.strip_prefix('\'') {
            match stripped.find('\'') {
                Some(end) => &stripped[..end],
                None => stripped,
            }
        } else {
            rest.split('#').next().unwrap_or(rest).trim()
        };

        let v = value_str.to_string();
        if !v.is_empty() {
            return Some(v);
        }
    }
    None
}

pub fn read_jar_metadata(path: &std::path::Path) -> JarMeta {
    let mut meta = JarMeta::default();
    let Ok(file) = fs::File::open(path) else {
        return meta;
    };
    let Ok(mut zip) = zip::ZipArchive::new(file) else {
        return meta;
    };

    if let Some(txt) = read_zip_text(&mut zip, "fabric.mod.json") {
        if let Some(v) = parse_json_lenient(&txt) {
            meta.id = v.get("id").and_then(|x| x.as_str()).map(String::from);
            meta.name = v.get("name").and_then(|x| x.as_str()).map(String::from);
            meta.version = v.get("version").and_then(|x| x.as_str()).map(String::from);
            meta.description = v
                .get("description")
                .and_then(|x| x.as_str())
                .map(String::from);
            let icon_path = match v.get("icon") {
                Some(serde_json::Value::String(s)) => Some(s.clone()),
                Some(serde_json::Value::Object(o)) => o
                    .values()
                    .filter_map(|x| x.as_str())
                    .last()
                    .map(String::from),
                _ => None,
            };
            if let Some(ip) = icon_path {
                meta.icon = read_zip_icon(&mut zip, &ip);
            }
            return meta;
        }
    }

    if let Some(txt) = read_zip_text(&mut zip, "quilt.mod.json") {
        if let Some(v) = parse_json_lenient(&txt) {
            let ql = v.get("quilt_loader");
            meta.id = ql
                .and_then(|q| q.get("id"))
                .and_then(|x| x.as_str())
                .map(String::from);
            meta.version = ql
                .and_then(|q| q.get("version"))
                .and_then(|x| x.as_str())
                .map(String::from);
            let md = ql.and_then(|q| q.get("metadata"));
            meta.name = md
                .and_then(|m| m.get("name"))
                .and_then(|x| x.as_str())
                .map(String::from);
            meta.description = md
                .and_then(|m| m.get("description"))
                .and_then(|x| x.as_str())
                .map(String::from);
            if let Some(ip) = md.and_then(|m| m.get("icon")).and_then(|x| x.as_str()) {
                meta.icon = read_zip_icon(&mut zip, ip);
            }
            return meta;
        }
    }

    let toml = read_zip_text(&mut zip, "META-INF/neoforge.mods.toml")
        .or_else(|| read_zip_text(&mut zip, "META-INF/mods.toml"));
    if let Some(txt) = toml {
        meta.id = toml_str(&txt, "modId");
        meta.name = toml_str(&txt, "displayName");
        meta.description = toml_str(&txt, "description");
        let mut version = toml_str(&txt, "version");
        if version
            .as_deref()
            .map_or(false, |v| v.contains("${file.jarVersion}"))
        {
            if let Some(mf) = read_zip_text(&mut zip, "META-INF/MANIFEST.MF") {
                for line in mf.lines() {
                    if let Some(v) = line.trim().strip_prefix("Implementation-Version:") {
                        version = Some(v.trim().to_string());
                        break;
                    }
                }
            }
        }
        meta.version = version;
        if let Some(logo) = toml_str(&txt, "logoFile") {
            meta.icon = read_zip_icon(&mut zip, &logo);
        }
    }

    if meta.icon.is_none() {
        for fallback in &["pack.png", "icon.png", "logo.png"] {
            if let Some(b64) = read_zip_icon(&mut zip, fallback) {
                meta.icon = Some(b64);
                break;
            }
        }
    }

    meta
}
