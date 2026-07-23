


use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;



#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaPaths {
    pub java8: Option<String>,
    pub java17: Option<String>,
    pub java21: Option<String>,
    pub java25: Option<String>,
}


fn default_max_concurrent_downloads() -> u32 {
    8
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherConfig {
    pub minecraft_dir: Option<String>,
    pub java_path: Option<String>,
    #[serde(default)]
    pub java_paths: Option<JavaPaths>,
    #[serde(rename = "ramMB")]
    pub ram_mb: u32,
    pub close_launcher_on_game_start: bool,
    pub discord_rpc_enabled: bool,
    pub auto_update_enabled: bool,
    pub theme: String,
    #[serde(rename = "maxConcurrentDownloads", default = "default_max_concurrent_downloads")]
    pub max_concurrent_downloads: u32,
    
    
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for LauncherConfig {
    fn default() -> Self {
        Self {
            minecraft_dir: None,
            java_path: None,
            java_paths: None,
            ram_mb: 4096,
            close_launcher_on_game_start: false,
            discord_rpc_enabled: true,
            auto_update_enabled: true,
            theme: "dark".to_string(),
            max_concurrent_downloads: 8,
            extra: std::collections::HashMap::new(),
        }
    }
}


static CONFIG: Lazy<Mutex<LauncherConfig>> =
    Lazy::new(|| Mutex::new(load_config_from_disk().unwrap_or_default()));



pub fn default_launcher_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(appdata).join("RealityLauncher")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join("Library/Application Support/RealityLauncher")
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".reality-launcher")
    }
}


pub fn get_minecraft_dir() -> PathBuf {
    if let Some(dir) = CONFIG.lock().unwrap().minecraft_dir.clone() {
        return PathBuf::from(dir);
    }
    default_launcher_dir()
}

pub fn get_max_concurrent_downloads() -> usize {
    CONFIG.lock().unwrap().max_concurrent_downloads as usize
}




fn get_config_path() -> PathBuf {
    default_launcher_dir().join("config.json")
}


fn load_config_from_disk() -> Option<LauncherConfig> {
    let path = get_config_path();
    if path.exists() {
        let content = fs::read_to_string(&path).ok()?;
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}


fn save_config_to_disk(config: &LauncherConfig) -> Result<(), String> {
    let path = get_config_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(())
}





#[tauri::command]
pub fn config_get() -> LauncherConfig {
    CONFIG.lock().unwrap().clone()
}

#[tauri::command]
pub fn config_set(config: LauncherConfig) -> Result<(), String> {
    let mut stored = CONFIG.lock().map_err(|e| e.to_string())?;
    *stored = config.clone();
    save_config_to_disk(&config)?;
    Ok(())
}

#[tauri::command]
pub fn config_get_minecraft_dir() -> String {
    get_minecraft_dir().to_string_lossy().to_string()
}

/// Move the launcher's game-data folder (instances, libraries, assets, cache —
/// everything `get_minecraft_dir()` resolves to) to `new_dir`, then repoint the
/// config at it. Runs the actual file move off the async runtime since it can
/// be several GB; `instances_list_sync()` is called afterward to reload the
/// in-memory instance cache from the new location (game_directory is always
/// recomputed from the current dir on load, so no stale paths remain).
#[tauri::command]
pub async fn config_migrate_minecraft_dir(new_dir: String) -> Result<(), String> {
    let new_path = PathBuf::from(&new_dir);
    let old_path = get_minecraft_dir();

    if new_path == old_path {
        return Ok(());
    }
    if new_path.starts_with(&old_path) {
        return Err("Destination cannot be inside the current launcher folder".to_string());
    }
    if crate::launcher::is_game_running(None) {
        return Err("Cannot move the launcher folder while a game is running".to_string());
    }
    if new_path.exists() {
        let has_files = fs::read_dir(&new_path)
            .map(|mut it| it.next().is_some())
            .unwrap_or(false);
        if has_files {
            return Err("Destination folder is not empty".to_string());
        }
    }

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if old_path.exists() {
            crate::instances::copy_dir_recursive(&old_path, &new_path).map_err(|e| e.to_string())?;
            fs::remove_dir_all(&old_path).map_err(|e| e.to_string())?;
        } else {
            fs::create_dir_all(&new_path).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    {
        let mut config = CONFIG.lock().map_err(|e| e.to_string())?;
        config.minecraft_dir = Some(new_dir);
        save_config_to_disk(&config)?;
    }

    crate::instances::instances_list_sync();
    Ok(())
}

#[tauri::command]
pub fn reset_config() -> Result<LauncherConfig, String> {
    let default = LauncherConfig::default();
    let mut stored = CONFIG.lock().map_err(|e| e.to_string())?;
    *stored = default.clone();
    save_config_to_disk(&default)?;
    Ok(default)
}

#[cfg(target_os = "windows")]
fn get_system_ram_bytes() -> u64 {
    // Read total physical memory straight from the Win32 API. The previous
    // implementation shelled out to `powershell`, which popped a console window
    // at startup (CREATE_NO_WINDOW was not reliably suppressing it on Win11),
    // and this runs at boot via the RAM pre-fetch in api.ts.
    #[allow(non_snake_case)]
    #[repr(C)]
    struct MEMORYSTATUSEX {
        dwLength: u32,
        dwMemoryLoad: u32,
        ullTotalPhys: u64,
        ullAvailPhys: u64,
        ullTotalPageFile: u64,
        ullAvailPageFile: u64,
        ullTotalVirtual: u64,
        ullAvailVirtual: u64,
        ullAvailExtendedVirtual: u64,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalMemoryStatusEx(lpBuffer: *mut MEMORYSTATUSEX) -> i32;
    }

    unsafe {
        let mut status: MEMORYSTATUSEX = std::mem::zeroed();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status) != 0 && status.ullTotalPhys > 0 {
            return status.ullTotalPhys;
        }
    }

    16 * 1024 * 1024 * 1024
}

#[cfg(target_os = "macos")]
fn get_system_ram_bytes() -> u64 {
    if let Ok(output) = std::process::Command::new("sysctl")
        .args(["-n", "hw.memsize"])
        .output()
    {
        let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(val) = out_str.parse::<u64>() {
            return val;
        }
    }
    16 * 1024 * 1024 * 1024
}

#[cfg(target_os = "linux")]
fn get_system_ram_bytes() -> u64 {
    if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
        for line in meminfo.lines() {
            if line.starts_with("MemTotal:") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    if let Ok(val_kb) = parts[1].parse::<u64>() {
                        return val_kb * 1024;
                    }
                }
            }
        }
    }
    16 * 1024 * 1024 * 1024
}

#[tauri::command]
pub fn get_system_ram() -> u64 {
    let bytes = get_system_ram_bytes();
    bytes / (1024 * 1024)
}

#[tauri::command]
pub fn get_max_ram() -> u64 {
    let system_ram_mb = get_system_ram();
    if system_ram_mb > 2048 {
        std::cmp::max(system_ram_mb - 2048, 4096)
    } else {
        4096
    }
}
