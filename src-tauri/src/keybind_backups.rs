//! Per-instance backups of the player's keybinds, stored as small JSON files
//! under `<app data>/keybind-backups/<instance id>/`.

use crate::keybinds::{apply_keys, read_keys, write_options_atomic, KeyMap};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub const MAX_BACKUPS: usize = 30;
const MANUAL: &str = "manual";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub created_at: u64,
    pub reason: String,
    pub key_count: usize,
}

pub enum CreateResult {
    Created(BackupEntry),
    Unchanged,
    NoKeys,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupFile {
    version: u32,
    created_at: u64,
    reason: String,
    keys: KeyMap,
}

pub fn backup_dir(app: &tauri::AppHandle, instance_id: &str) -> Result<PathBuf, String> {
    let id = crate::fs_utils::safe_file_name(instance_id).ok_or_else(|| "Invalid instance id".to_string())?;
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join("keybind-backups").join(id))
}

fn checked_name(name: &str) -> Result<&str, String> {
    if name.contains("..") {
        return Err("Invalid backup name".to_string());
    }
    crate::fs_utils::safe_file_name(name).ok_or_else(|| "Invalid backup name".to_string())
}

fn read_file(path: &Path) -> Option<BackupFile> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn list_backups(backup_dir: &Path) -> Vec<BackupEntry> {
    let Ok(rd) = fs::read_dir(backup_dir) else { return Vec::new() };
    let mut out: Vec<BackupEntry> = rd
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_str()?.to_string();
            if !name.ends_with(".json") {
                return None;
            }
            let f = read_file(&e.path())?;
            Some(BackupEntry { name, created_at: f.created_at, reason: f.reason, key_count: f.keys.len() })
        })
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.name.cmp(&a.name)));
    out
}

pub fn read_backup(backup_dir: &Path, name: &str) -> Result<KeyMap, String> {
    let name = checked_name(name)?;
    let text = fs::read_to_string(backup_dir.join(name)).map_err(|e| format!("Cannot read backup: {e}"))?;
    let f: BackupFile = serde_json::from_str(&text).map_err(|e| format!("Invalid backup: {e}"))?;
    Ok(f.keys)
}

pub fn delete_backup(backup_dir: &Path, name: &str) -> Result<(), String> {
    let name = checked_name(name)?;
    fs::remove_file(backup_dir.join(name)).map_err(|e| format!("Cannot delete backup: {e}"))
}

pub fn create_backup(backup_dir: &Path, options_txt: Option<&str>, reason: &str, now_ms: u64) -> Result<CreateResult, String> {
    if reason.is_empty() || !reason.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid backup reason".to_string());
    }
    let keys = read_keys(options_txt.unwrap_or(""));
    if keys.is_empty() {
        return Ok(CreateResult::NoKeys);
    }
    let existing = list_backups(backup_dir);
    if let Some(newest) = existing.first() {
        if read_backup(backup_dir, &newest.name).is_ok_and(|k| k == keys) {
            return Ok(CreateResult::Unchanged);
        }
    }

    fs::create_dir_all(backup_dir).map_err(|e| format!("Cannot create backup folder: {e}"))?;
    let mut name = format!("{now_ms}-{reason}.json");
    let mut n = 2;
    while backup_dir.join(&name).exists() {
        name = format!("{now_ms}-{reason}-{n}.json");
        n += 1;
    }
    let key_count = keys.len();
    let body = serde_json::to_string_pretty(&BackupFile { version: 1, created_at: now_ms, reason: reason.to_string(), keys })
        .map_err(|e| e.to_string())?;
    let tmp = backup_dir.join(format!("{name}.tmp"));
    let target = backup_dir.join(&name);
    fs::write(&tmp, body).map_err(|e| format!("Cannot write backup: {e}"))?;
    if let Err(e) = fs::rename(&tmp, &target) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Cannot write backup: {e}"));
    }

    prune(backup_dir);
    Ok(CreateResult::Created(BackupEntry { name, created_at: now_ms, reason: reason.to_string(), key_count }))
}

/// Keep at most `MAX_BACKUPS`: drop the oldest automatic backup first, and the
/// oldest overall only when every remaining one is manual.
fn prune(backup_dir: &Path) {
    let mut all = list_backups(backup_dir);
    all.reverse(); // oldest first
    while all.len() > MAX_BACKUPS {
        let idx = all.iter().position(|e| e.reason != MANUAL).unwrap_or(0);
        let victim = all.remove(idx);
        let _ = fs::remove_file(backup_dir.join(&victim.name));
    }
}

/// Restore a backup's keys into `options.txt`. Refused while the game runs.
/// The current keys are backed up first (`before-restore`); if that fails the
/// restore is aborted without touching `options.txt`.
pub fn restore_backup(instance_dir: &Path, backup_dir: &Path, name: &str, running: bool, now_ms: u64) -> Result<(), String> {
    if running {
        return Err("game-running".to_string());
    }
    let keys = read_backup(backup_dir, name)?;
    let options_path = instance_dir.join("options.txt");
    let current = match fs::read_to_string(&options_path) {
        Ok(text) => Some(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Cannot read options.txt: {e}")),
    };
    create_backup(backup_dir, current.as_deref(), "before-restore", now_ms)?;
    let updated = apply_keys(current.as_deref(), &keys);
    write_options_atomic(instance_dir, &updated).map_err(|e| format!("Cannot write options.txt: {e}"))
}

fn instance_paths(app: &tauri::AppHandle, id: &str) -> Result<(PathBuf, PathBuf), String> {
    let instance = crate::instances::instances_get(id.to_string()).ok_or_else(|| "Instance not found".to_string())?;
    Ok((PathBuf::from(instance.game_directory), backup_dir(app, id)?))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn keybind_backups_list(app: tauri::AppHandle, id: String) -> Result<Vec<BackupEntry>, String> {
    let (_, dir) = instance_paths(&app, &id)?;
    Ok(list_backups(&dir))
}

/// `None` = nothing new to back up (unchanged or no keys).
#[tauri::command]
pub fn keybind_backup_create(app: tauri::AppHandle, id: String) -> Result<Option<BackupEntry>, String> {
    let (game_dir, dir) = instance_paths(&app, &id)?;
    let options = match fs::read_to_string(game_dir.join("options.txt")) {
        Ok(t) => Some(t),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(format!("Cannot read options.txt: {e}")),
    };
    Ok(match create_backup(&dir, options.as_deref(), MANUAL, now_ms())? {
        CreateResult::Created(entry) => Some(entry),
        CreateResult::Unchanged | CreateResult::NoKeys => None,
    })
}

#[tauri::command]
pub fn keybind_backup_restore(app: tauri::AppHandle, id: String, name: String) -> Result<(), String> {
    let (game_dir, dir) = instance_paths(&app, &id)?;
    let running = crate::launcher::is_game_running(Some(id));
    restore_backup(&game_dir, &dir, &name, running, now_ms())
}

#[tauri::command]
pub fn keybind_backup_delete(app: tauri::AppHandle, id: String, name: String) -> Result<(), String> {
    let (_, dir) = instance_paths(&app, &id)?;
    delete_backup(&dir, &name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("keybind-backups-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test] fn creates_and_lists_newest_first() {
        let d = temp_dir("list");
        create_backup(&d, Some("key_key.jump:key.keyboard.space\n"), "manual", 1000).unwrap();
        create_backup(&d, Some("key_key.jump:key.keyboard.j\n"), "before-repair", 2000).unwrap();
        let l = list_backups(&d);
        assert_eq!(l.iter().map(|e| (e.created_at, e.reason.as_str(), e.key_count)).collect::<Vec<_>>(), vec![(2000, "before-repair", 1), (1000, "manual", 1)]);
    }
    #[test] fn skips_identical_and_empty() {
        let d = temp_dir("dedupe");
        create_backup(&d, Some("key_key.jump:key.keyboard.space\n"), "manual", 1).unwrap();
        assert!(matches!(create_backup(&d, Some("fov:1\nkey_key.jump:key.keyboard.space\n"), "before-repair", 2).unwrap(), CreateResult::Unchanged));
        assert!(matches!(create_backup(&d, Some("fov:1\n"), "manual", 3).unwrap(), CreateResult::NoKeys));
        assert!(matches!(create_backup(&d, None, "manual", 4).unwrap(), CreateResult::NoKeys));
    }
    #[test] fn prunes_oldest_automatic_first() {
        let d = temp_dir("prune");
        create_backup(&d, Some("key_key.a:key.keyboard.0\n"), "manual", 0).unwrap();
        for i in 1..=30u64 { create_backup(&d, Some(&format!("key_key.a:key.keyboard.{i}\n")), "before-repair", i).unwrap(); }
        let l = list_backups(&d);
        assert_eq!(l.len(), MAX_BACKUPS);
        assert!(l.iter().any(|e| e.reason == "manual"), "manual kept");
        assert!(!l.iter().any(|e| e.created_at == 1), "oldest automatic removed");
    }
    #[test] fn read_round_trip_and_rejects_traversal() {
        let d = temp_dir("read");
        let CreateResult::Created(e) = create_backup(&d, Some("key_key.jump:key.keyboard.j\n"), "manual", 5).unwrap() else { panic!() };
        assert_eq!(read_backup(&d, &e.name).unwrap().get("key.jump").map(String::as_str), Some("key.keyboard.j"));
        assert!(read_backup(&d, "../x.json").is_err());
        assert!(delete_backup(&d, "a/b.json").is_err());
    }
    #[test] fn restore_refused_while_running() {
        let (i, b) = (temp_dir("ri"), temp_dir("rb"));
        assert_eq!(restore_backup(&i, &b, "1-manual.json", true, 1).unwrap_err(), "game-running");
    }
    #[test] fn restore_writes_keys_and_backs_up_current() {
        let (i, b) = (temp_dir("ri2"), temp_dir("rb2"));
        let CreateResult::Created(e) = create_backup(&b, Some("key_key.jump:key.keyboard.j\n"), "manual", 1).unwrap() else { panic!() };
        fs::write(i.join("options.txt"), "fov:1\nkey_key.jump:key.keyboard.space\n").unwrap();
        restore_backup(&i, &b, &e.name, false, 2).unwrap();
        assert_eq!(fs::read_to_string(i.join("options.txt")).unwrap(), "fov:1\nkey_key.jump:key.keyboard.j\n");
        assert_eq!(list_backups(&b)[0].reason, "before-restore");
    }
    #[test] fn restore_creates_missing_options_and_unknown_backup_leaves_file() {
        let (i, b) = (temp_dir("ri3"), temp_dir("rb3"));
        let CreateResult::Created(e) = create_backup(&b, Some("key_key.jump:key.keyboard.j\n"), "manual", 1).unwrap() else { panic!() };
        restore_backup(&i, &b, &e.name, false, 2).unwrap();
        assert_eq!(fs::read_to_string(i.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.j\n");
        fs::write(i.join("options.txt"), "fov:1\n").unwrap();
        assert!(restore_backup(&i, &b, "9-manual.json", false, 3).is_err());
        assert_eq!(fs::read_to_string(i.join("options.txt")).unwrap(), "fov:1\n");
    }
}
