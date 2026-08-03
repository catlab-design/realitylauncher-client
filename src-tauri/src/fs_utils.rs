use base64::Engine;
use std::fs;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn open_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let win_path = path.replace('/', "\\");
        app.shell()
            .command("explorer")
            .arg(&win_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        app.shell()
            .command("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        app.shell()
            .command("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = &app;
        // Spawn via std with CREATE_NO_WINDOW so the cmd console never flashes.
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        app.shell()
            .command("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        app.shell()
            .command("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn browse_directory(title: Option<String>) -> Result<Option<String>, String> {
    let result = tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        if let Some(ref t) = title {
            dialog = dialog.set_title(t);
        }
        dialog
            .pick_folder()
            .map(|p| dunce::simplified(&p).to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn check_dir_empty(path: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        let p = std::path::PathBuf::from(path);
        match fs::read_dir(&p) {
            Ok(mut entries) => Ok(entries.next().is_none()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(true),
            Err(e) => Err(e.to_string()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn browse_icon() -> Result<Option<String>, String> {
    let result = tokio::task::spawn_blocking(move || {
        let file = rfd::FileDialog::new()
            .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "ico"])
            .pick_file()?;
        let file = dunce::simplified(&file).to_path_buf();

        let data = fs::read(&file).ok()?;
        let ext = file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            _ => "image/png",
        };
        let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
        Some(format!("data:{};base64,{}", mime, b64))
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn browse_modpack() -> Result<Option<String>, String> {
    let result = tokio::task::spawn_blocking(move || {
        rfd::FileDialog::new()
            .add_filter("Modpack Files", &["mrpack", "zip"])
            .add_filter("All Files", &["*"])
            .pick_file()
            .map(|p| dunce::simplified(&p).to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn launcher_clear_cache(app: tauri::AppHandle) -> Result<(), String> {
    crate::content::clear_mod_list_cache();
    crate::mod_meta::clear_meta_cache();
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let launcher_dir = crate::config::default_launcher_dir();
    let minecraft_dir = crate::config::get_minecraft_dir();

    let cache_files = [
        launcher_dir.join("metadata-cache.json"),
        launcher_dir.join("icon-cache.json"),
        launcher_dir.join("minecraft-profile-cache.json"),
    ];
    for f in &cache_files {
        if f.exists() {
            let _ = fs::remove_file(f);
        }
    }

    let cache_dirs = [
        launcher_dir.join("cache"),
        launcher_dir.join("webcache"),
        minecraft_dir.join("cache"),
        app_data_dir.join("Cache"),
        app_data_dir.join("Code Cache"),
        app_data_dir.join("GPUCache"),
        app_data_dir.join("DawnCache"),
        app_data_dir.join("GrShaderCache"),
        app_data_dir.join("GraphiteDawnCache"),
        app_data_dir.join("Service Worker").join("CacheStorage"),
    ];
    for dir in &cache_dirs {
        if dir.exists() {
            let _ = fs::remove_dir_all(dir);
        }
    }

    let asset_indexes_dir = minecraft_dir.join("assets").join("indexes");
    if asset_indexes_dir.exists() {
        if let Ok(entries) = fs::read_dir(&asset_indexes_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                if let Some(name_str) = name.to_str() {
                    if name_str.starts_with(".") && name_str.ends_with(".verified") {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    Ok(())
}

fn collect_temp_files(dir: &std::path::Path, cleaned: &mut u32, depth: u32) {
    if depth > 5 {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_temp_files(&path, cleaned, depth + 1);
            } else if path.extension().is_some_and(|ext| ext == "tmp")
                && path.file_stem().is_some()
            {
                let _ = std::fs::remove_file(&path);
                *cleaned += 1;
            }
        }
    }
}

#[tauri::command]
pub async fn cleanup_temp_files() -> Result<u32, String> {
    let minecraft_dir = crate::config::get_minecraft_dir();
    let mut cleaned: u32 = 0;

    let dirs_to_sweep = [
        minecraft_dir.join("instances"),
        minecraft_dir.join("libraries"),
        minecraft_dir.join("assets"),
        minecraft_dir.join("cache"),
        crate::config::default_launcher_dir().join("cache"),
    ];

    for dir in &dirs_to_sweep {
        if !dir.exists() {
            continue;
        }
        collect_temp_files(dir, &mut cleaned, 0);
    }

    Ok(cleaned)
}
