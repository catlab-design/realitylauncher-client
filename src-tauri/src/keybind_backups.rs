//! Per-instance backups of the player's keybinds, stored as small JSON files
//! under `<app data>/keybind-backups/<instance id>/`.

use crate::keybinds::{read_keys, KeyMap};
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
}
