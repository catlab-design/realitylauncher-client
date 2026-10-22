//! Optional Linux wrappers for the game process: MangoHud (overlay) and
//! Feral GameMode (`gamemoderun`). Both are shell scripts that `exec` the
//! wrapped command, so the game keeps the spawned PID (kill/running checks
//! still work).

use std::path::{Path, PathBuf};

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable(candidate))
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(_path: &Path) -> bool {
    false
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfTools {
    pub linux: bool,
    pub mangohud: bool,
    pub gamemode: bool,
}

/// What the settings page can offer: the section only shows on Linux, and
/// each toggle is disabled when its tool isn't installed.
#[tauri::command]
pub fn linux_perf_tools() -> PerfTools {
    let linux = cfg!(target_os = "linux");
    PerfTools {
        linux,
        mangohud: linux && find_in_path("mangohud").is_some(),
        gamemode: linux && find_in_path("gamemoderun").is_some(),
    }
}

/// Command prefix to put in front of `java`. MangoHud needs `--dlsym`
/// because LWJGL loads OpenGL through dlopen/dlsym. A tool that's enabled but
/// missing is skipped with a warning rather than failing the launch.
pub fn game_wrapper(enable_mangohud: bool, enable_gamemode: bool) -> Vec<String> {
    if !cfg!(target_os = "linux") {
        return Vec::new();
    }
    let mut prefix = Vec::new();
    if enable_gamemode {
        match find_in_path("gamemoderun") {
            Some(path) => prefix.push(path.to_string_lossy().to_string()),
            None => log::warn!("[Launcher] GameMode enabled but gamemoderun is not installed; skipping"),
        }
    }
    if enable_mangohud {
        match find_in_path("mangohud") {
            Some(path) => {
                prefix.push(path.to_string_lossy().to_string());
                prefix.push("--dlsym".to_string());
            }
            None => log::warn!("[Launcher] MangoHud enabled but mangohud is not installed; skipping"),
        }
    }
    prefix
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_tools_add_no_prefix() {
        assert!(game_wrapper(false, false).is_empty());
    }

    #[test]
    fn finds_executables_on_path_only() {
        assert!(find_in_path("definitely-not-a-real-tool-xyz").is_none());
        #[cfg(unix)]
        assert!(find_in_path("sh").is_some());
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn wrapper_order_is_gamemode_then_mangohud() {
        let prefix = game_wrapper(true, true);
        let gm = prefix.iter().position(|p| p.ends_with("gamemoderun"));
        let mh = prefix.iter().position(|p| p.ends_with("mangohud"));
        if let (Some(gm), Some(mh)) = (gm, mh) {
            assert!(gm < mh);
            assert_eq!(prefix.get(mh + 1).map(String::as_str), Some("--dlsym"));
        }
    }
}
