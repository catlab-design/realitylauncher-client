


use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;



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

fn default_ram_mb() -> u32 {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherConfig {
    pub minecraft_dir: Option<String>,
    pub java_path: Option<String>,
    #[serde(default)]
    pub java_paths: Option<JavaPaths>,
    #[serde(rename = "ramMB", default = "default_ram_mb")]
    pub ram_mb: u32,
    #[serde(default)]
    pub close_launcher_on_game_start: bool,
    #[serde(default)]
    pub discord_rpc_enabled: bool,
    #[serde(default)]
    pub auto_update_enabled: bool,
    #[serde(default)]
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
    for attempt in 0..2 {
        if !path.exists() {
            crate::fs_utils::restore_pre_update_backup(&path);
        }
        if !path.exists() {
            return None;
        }
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                log::error!("[Config] Cannot read config.json: {e}");
                return None;
            }
        };
        if let Ok(config) = serde_json::from_str::<LauncherConfig>(&content) {
            let _ = fs::remove_file(crate::fs_utils::pre_update_backup_path(&path));
            return Some(config);
        }
        log::error!("[Config] Failed to parse config.json (attempt {})", attempt + 1);
        crate::fs_utils::back_up_unreadable_file(&path);
        if attempt == 0 && crate::fs_utils::restore_pre_update_backup(&path) {
            continue;
        }
        return salvage_config(&content);
    }
    None
}

fn salvage_config(content: &str) -> Option<LauncherConfig> {
    let value: serde_json::Value = serde_json::from_str(content).ok()?;
    let mut config = LauncherConfig::default();
    config.minecraft_dir = value.get("minecraftDir").and_then(|v| v.as_str()).map(String::from);
    config.java_path = value.get("javaPath").and_then(|v| v.as_str()).map(String::from);
    log::warn!(
        "[Config] Salvaged minecraft_dir={:?} java_path={:?} from unreadable config",
        config.minecraft_dir,
        config.java_path
    );
    Some(config)
}


fn save_config_to_disk(config: &LauncherConfig) -> Result<(), String> {
    let path = get_config_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    let tmp_path = path.with_extension("tmp");
    fs::write(&tmp_path, content).map_err(|e| e.to_string())?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;

    Ok(())
}





#[tauri::command]
pub fn config_get() -> LauncherConfig {
    CONFIG.lock().unwrap().clone()
}

#[tauri::command]
pub fn config_set(config: LauncherConfig) -> Result<(), String> {
    let mut stored = CONFIG.lock().map_err(|e| e.to_string())?;
    if let Some(dir) = &config.minecraft_dir {
        if stored.minecraft_dir.as_ref() != Some(dir) {
            let path = std::path::Path::new(dir);
            if !path.is_absolute() || !path.exists() {
                return Err(
                    "minecraft_dir must be an absolute path that exists on disk".to_string(),
                );
            }
        }
    }
    *stored = config.clone();
    save_config_to_disk(&config)?;
    Ok(())
}

#[tauri::command]
pub fn config_get_minecraft_dir() -> String {
    get_minecraft_dir().to_string_lossy().to_string()
}

/// Set by `cancel_migrate()`; checked by the migration copy loop.
static MIGRATION_CANCEL: AtomicBool = AtomicBool::new(false);

/// Pure validation of a migration request. Returns `Ok(())` when the move
/// should proceed (or is a no-op). Kept free of globals so it is unit-testable.
pub fn validate_migration_target(
    old_path: &Path,
    new_path: &Path,
    game_running: bool,
) -> Result<(), String> {
    if new_path == old_path {
        return Ok(());
    }
    if new_path.starts_with(old_path) {
        return Err("Destination cannot be inside the current launcher folder".to_string());
    }
    if game_running {
        return Err("Cannot move the launcher folder while a game is running".to_string());
    }
    if new_path.exists() {
        let has_files = fs::read_dir(new_path)
            .map(|mut it| it.next().is_some())
            .unwrap_or(false);
        if has_files {
            return Err("Destination folder is not empty".to_string());
        }
    }
    Ok(())
}

fn nearest_existing_ancestor(path: &Path) -> PathBuf {
    let mut current = path.to_path_buf();
    loop {
        if current.exists() {
            return current;
        }
        match current.parent() {
            Some(parent) if parent != current => current = parent.to_path_buf(),
            _ => return current,
        }
    }
}

fn free_space_bytes(path: &Path) -> Result<u64, String> {
    fs4::available_space(nearest_existing_ancestor(path)).map_err(|e| e.to_string())
}

fn human_mb(bytes: u64) -> u64 {
    bytes / (1024 * 1024)
}

/// Abort an in-flight folder migration. The copy loop notices the flag at the
/// next file and rolls back the partial destination.
#[tauri::command]
pub fn cancel_migrate() -> bool {
    MIGRATION_CANCEL.store(true, Ordering::SeqCst);
    true
}

/// Move the launcher's game-data folder (instances, libraries, assets, cache —
/// everything `get_minecraft_dir()` resolves to) to `new_dir`, then repoint the
/// config at it.
///
/// Ordering guarantees:
/// - same-volume moves use an atomic `fs::rename` (instant, nothing to lose);
/// - cross-device moves copy first and only repoint the config after the copy
///   fully succeeded; a failed copy rolls back the partial destination so the
///   operation is retryable;
/// - deleting the old folder is best-effort after the config is repointed, so
///   a locked file can never leave the launcher pointing at a half-deleted dir;
/// - an exclusive operation guard blocks migration while installs/syncs are
///   writing into the game folder.
/// Emits `instances-updated` afterward so the frontend instance cache reloads.
#[tauri::command]
pub async fn config_migrate_minecraft_dir(
    app: tauri::AppHandle,
    new_dir: String,
) -> Result<(), String> {
    let new_path = PathBuf::from(&new_dir);
    let old_path = get_minecraft_dir();

    validate_migration_target(&old_path, &new_path, crate::launcher::is_game_running(None))?;
    if new_path == old_path {
        return Ok(());
    }

    let _guard = crate::op_guard::OperationGuard::try_exclusive().ok_or_else(|| {
        "Another install or sync operation is in progress. Try again when it finishes.".to_string()
    })?;

    MIGRATION_CANCEL.store(false, Ordering::SeqCst);
    let app_handle = app.clone();
    let old_path_for_copy = old_path.clone();
    let new_path_for_copy = new_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if !old_path_for_copy.exists() {
            fs::create_dir_all(&new_path_for_copy).map_err(|e| e.to_string())?;
            return Ok(());
        }

        let _ = app_handle.emit(
            "migrate-progress",
            serde_json::json!({ "phase": "moving", "percent": 0 }),
        );

        if new_path_for_copy.exists() {
            fs::remove_dir(&new_path_for_copy).map_err(|e| e.to_string())?;
        }
        if fs::rename(&old_path_for_copy, &new_path_for_copy).is_ok() {
            let _ = app_handle.emit(
                "migrate-progress",
                serde_json::json!({ "phase": "moving", "percent": 100 }),
            );
            return Ok(());
        }

        let total = crate::instances::dir_size(&old_path_for_copy).map_err(|e| e.to_string())?;
        let free = free_space_bytes(&new_path_for_copy)?;
        if free < total {
            return Err(format!(
                "Not enough free space: need {} MB, available {} MB",
                human_mb(total),
                human_mb(free)
            ));
        }

        let cancelled = || MIGRATION_CANCEL.load(Ordering::SeqCst);
        let mut progress = |copied: u64| {
            let pct = if total > 0 {
                (copied as f64 * 100.0 / total as f64).min(99.0) as u32
            } else {
            99
            };
            let _ = app_handle.emit(
                "migrate-progress",
                serde_json::json!({ "phase": "copying", "percent": pct }),
            );
        };

        let copy_result = crate::instances::copy_dir_recursive_with_progress(
            &old_path_for_copy,
            &new_path_for_copy,
            &["config.json"],
            Some(total),
            &cancelled,
            &mut progress,
        );

        if let Err(e) = copy_result {
            if cancelled() {
                let _ = fs::remove_dir_all(&new_path_for_copy);
                let _ = app_handle.emit("migrate-cancelled", serde_json::json!({}));
                return Err("Migration cancelled".to_string());
            }
            let _ = fs::remove_dir_all(&new_path_for_copy);
            return Err(format!("Failed to copy game folder: {e}"));
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    {
        let mut config = CONFIG.lock().map_err(|e| e.to_string())?;
        config.minecraft_dir = Some(new_dir);
        if let Err(e) = save_config_to_disk(&config) {
            // If the data was RENAMED (same volume), old_path is gone and
            // new_path is the only copy — deleting it would destroy every
            // instance. Keep the moved folder and tell the user config is
            // stale instead. The copy path leaves old_path intact, so there
            // we can safely roll back.
            if old_path.exists() {
                let _ = fs::remove_dir_all(&new_path);
                return Err(format!(
                    "Failed to save config after moving the folder (rolled back): {e}"
                ));
            }
            return Err(format!(
                "Folder was moved, but the config could not be saved ({e}). \
                 The launcher data now lives at the new location; on next \
                 launch the config will be re-read from there."
            ));
        }
    }

    if old_path.exists() {
        if let Err(e) = fs::remove_dir_all(&old_path) {
            log::warn!("[Config] Migration succeeded but old folder could not be removed: {e}");
        }
    }

    crate::instances::instances_list_sync();
    let _ = app.emit("instances-updated", serde_json::json!({}));
    let _ = app.emit(
        "migrate-progress",
        serde_json::json!({ "phase": "done", "percent": 100 }),
    );
    Ok(())
}

#[tauri::command]
pub fn reset_config() -> Result<LauncherConfig, String> {
    let mut default = LauncherConfig::default();
    let mut stored = CONFIG.lock().map_err(|e| e.to_string())?;
    default.minecraft_dir = stored.minecraft_dir.clone();
    default.java_path = stored.java_path.clone();
    default.java_paths = stored.java_paths.clone();
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use std::sync::Once;

    static TMP_INIT: Once = Once::new();
    fn tmp_base() -> PathBuf {
        TMP_INIT.call_once(|| {
            let _ = fs::create_dir_all(temp_dir().join("rl-config-tests"));
        });
        temp_dir().join("rl-config-tests")
    }

    #[test]
    fn test_validate_migration_same_path_is_noop() {
        let p = tmp_base().join("same");
        assert!(validate_migration_target(&p, &p, false).is_ok());
    }

    #[test]
    fn test_validate_migration_inside_current_rejected() {
        let old = tmp_base().join("root");
        let new = old.join("nested");
        assert!(validate_migration_target(&old, &new, false).is_err());
    }

    #[test]
    fn test_validate_migration_game_running_rejected() {
        let old = tmp_base().join("a");
        let new = tmp_base().join("b");
        assert!(validate_migration_target(&old, &new, true).is_err());
    }

    #[test]
    fn test_validate_migration_non_empty_dest_rejected() {
        let old = tmp_base().join("a2");
        let new = tmp_base().join("b2");
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join("existing.txt"), "x").unwrap();
        let err = validate_migration_target(&old, &new, false).unwrap_err();
        assert!(err.contains("not empty"));
        fs::remove_dir_all(&new).unwrap();
    }

    #[test]
    fn test_validate_migration_empty_dest_ok() {
        let old = tmp_base().join("a3");
        let new = tmp_base().join("b3");
        fs::create_dir_all(&new).unwrap();
        assert!(validate_migration_target(&old, &new, false).is_ok());
        fs::remove_dir_all(&new).unwrap();
    }

    #[test]
    fn test_nearest_existing_ancestor() {
        let root = tmp_base().join("ancestor-test");
        fs::create_dir_all(&root).unwrap();
        let deep = root.join("x").join("y").join("z");
        assert_eq!(nearest_existing_ancestor(&deep), root);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_launcher_config_default() {
        let cfg = LauncherConfig::default();
        assert_eq!(cfg.ram_mb, 4096);
        assert!(!cfg.close_launcher_on_game_start);
        assert!(cfg.discord_rpc_enabled);
        assert!(cfg.auto_update_enabled);
        assert_eq!(cfg.theme, "dark");
        assert_eq!(cfg.max_concurrent_downloads, 8);
        assert!(cfg.java_path.is_none());
        assert!(cfg.java_paths.is_none());
        assert!(cfg.extra.is_empty());
    }

    #[test]
    fn test_get_max_concurrent_downloads_default() {
        assert_eq!(get_max_concurrent_downloads(), 8);
    }
}
