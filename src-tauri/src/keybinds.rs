//! Pack keybinds: parse `reality/keybinds.json` and apply it to `options.txt`.
//!
//! The parsing and line rewriting are pure; `apply_pack_keybinds` is the sync-time
//! I/O wrapper (backups live in `keybind_backups`).

use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

/// Keybind id (without the `key_` prefix) to value, e.g. `key.jump` -> `key.keyboard.j`.
pub type KeyMap = BTreeMap<String, String>;

const PREFIX: &str = "key_";

#[derive(Deserialize)]
struct KeybindsFile {
    version: u64,
    set: KeyMap,
}

/// Split a line into (content, terminator) where terminator is `\r\n`, `\n` or empty.
fn split_eol(line: &str) -> (&str, &str) {
    if let Some(s) = line.strip_suffix("\r\n") {
        (s, "\r\n")
    } else if let Some(s) = line.strip_suffix('\n') {
        (s, "\n")
    } else {
        (line, "")
    }
}

/// Split `key_<id>:<value>` on the first `:` after the prefix.
fn split_key_line(content: &str) -> Option<(&str, &str)> {
    content.strip_prefix(PREFIX)?.split_once(':')
}

/// Every `key_<id>:<value>` line of an `options.txt`.
pub fn read_keys(options_txt: &str) -> KeyMap {
    options_txt
        .split_inclusive('\n')
        .filter_map(|line| split_key_line(split_eol(line).0))
        .map(|(id, value)| (id.to_string(), value.to_string()))
        .collect()
}

/// Rewrite `key_<id>:` lines whose id is in `keys` and append the missing ones.
/// Every other line, line order and line endings are preserved byte for byte.
pub fn apply_keys(options_txt: Option<&str>, keys: &KeyMap) -> String {
    let text = options_txt.unwrap_or("");
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let mut out = String::with_capacity(text.len());
    let mut seen: Vec<&str> = Vec::new();

    for line in text.split_inclusive('\n') {
        let (content, term) = split_eol(line);
        match split_key_line(content) {
            Some((id, _)) if keys.contains_key(id) => {
                out.push_str(PREFIX);
                out.push_str(id);
                out.push(':');
                out.push_str(&keys[id]);
                out.push_str(term);
                seen.push(id);
            }
            _ => out.push_str(line),
        }
    }

    for (id, value) in keys.iter().filter(|(id, _)| !seen.contains(&id.as_str())) {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push_str(eol);
        }
        out.push_str(&format!("{PREFIX}{id}:{value}{eol}"));
    }
    out
}

/// A keybind id that can be written as `key_<id>:` and read back: non-empty,
/// no `:`, no whitespace, no control characters.
pub fn is_valid_key_id(id: &str) -> bool {
    !id.is_empty() && !id.chars().any(|c| c == ':' || c.is_whitespace() || c.is_control())
}

/// `key.(keyboard|mouse).[a-z0-9._]+` with an optional `:SHIFT|:CONTROL|:ALT`.
pub fn is_valid_key_value(value: &str) -> bool {
    let (key, modifier) = match value.split_once(':') {
        Some((k, m)) => (k, Some(m)),
        None => (value, None),
    };
    if !matches!(modifier, None | Some("SHIFT" | "CONTROL" | "ALT")) {
        return false;
    }
    let Some(name) = key.strip_prefix("key.keyboard.").or_else(|| key.strip_prefix("key.mouse.")) else {
        return false;
    };
    !name.is_empty() && name.chars().all(|c| matches!(c, 'a'..='z' | '0'..='9' | '.' | '_'))
}

/// Parse a pack `keybinds.json` and return its `set`. `known` is ignored.
/// Entries with an invalid id or value are dropped (and logged); they would
/// otherwise inject lines into `options.txt` or never match their line.
pub fn parse_keybinds_file(json: &str) -> Result<KeyMap, String> {
    let file: KeybindsFile =
        serde_json::from_str(json).map_err(|e| format!("invalid keybinds.json: {e}"))?;
    if file.version != 1 {
        return Err(format!("unsupported keybinds.json version {}", file.version));
    }
    let mut set = file.set;
    set.retain(|id, value| {
        let ok = is_valid_key_id(id) && is_valid_key_value(value);
        if !ok {
            log::warn!("[Keybinds] dropping invalid pack keybind {id:?}: {value:?}");
        }
        ok
    });
    Ok(set)
}

/// When a sync may write pack keybinds into `options.txt`.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum KeybindMode {
    /// Launch / install: only on a brand-new instance.
    FirstInstallOnly,
    /// Repair: back up the current keys, then overwrite the pack's keys.
    Repair,
}

/// Keybind settings threaded through a sync.
#[derive(Clone, Debug)]
pub struct KeybindSync {
    pub mode: KeybindMode,
    /// Backup folder for this instance; required for `Repair` to touch anything.
    pub backup_dir: Option<PathBuf>,
    /// The instance's game is running: Minecraft rewrites `options.txt` on exit,
    /// so Repair only takes the backup and leaves `options.txt` alone.
    pub game_running: bool,
}

const PACK_FILE: &str = "reality/keybinds.json";
const OPTIONS_FILE: &str = "options.txt";

/// A fresh instance: no pack state and no `options.txt`. Call before writing pack files.
pub fn is_first_install(instance_dir: &Path) -> bool {
    !instance_dir.join(crate::pack_v2::STATE_FILE).exists() && !instance_dir.join(OPTIONS_FILE).exists()
}

/// Apply the pack's `reality/keybinds.json` to `options.txt` according to `mode`.
/// Never fails: every problem is logged and the step is skipped.
pub fn apply_pack_keybinds(
    instance_dir: &Path,
    mode: KeybindMode,
    first_install: bool,
    backup_dir: Option<&Path>,
    game_running: bool,
    now_ms: u64,
) {
    if mode == KeybindMode::FirstInstallOnly && !first_install {
        return;
    }

    let options_path = instance_dir.join(OPTIONS_FILE);
    let current = match fs::read_to_string(&options_path) {
        Ok(text) => Some(text),
        Err(e) if e.kind() == ErrorKind::NotFound => None,
        Err(e) => {
            log::warn!("[Keybinds] cannot read options.txt, leaving it alone: {e}");
            return;
        }
    };

    // Repair always backs up first, even when the pack has no keybinds.json.
    let backed_up = mode != KeybindMode::Repair
        || match backup_dir {
            None => {
                log::warn!("[Keybinds] no backup folder; not changing keybinds");
                false
            }
            Some(dir) => match crate::keybind_backups::create_backup(dir, current.as_deref(), "before-repair", now_ms) {
                Ok(_) => true,
                Err(e) => {
                    log::warn!("[Keybinds] backup failed, not changing keybinds: {e}");
                    false
                }
            },
        };

    let json = match fs::read_to_string(instance_dir.join(PACK_FILE)) {
        Ok(j) => j,
        Err(e) if e.kind() == ErrorKind::NotFound => return,
        Err(e) => {
            log::warn!("[Keybinds] cannot read {PACK_FILE}: {e}");
            return;
        }
    };
    let set = match parse_keybinds_file(&json) {
        Ok(set) => set,
        Err(e) => {
            log::warn!("[Keybinds] skipping pack keybinds: {e}");
            return;
        }
    };
    if !backed_up {
        return;
    }
    if game_running {
        log::warn!("[Keybinds] game is running; not writing pack keybinds (Minecraft would overwrite options.txt on exit)");
        return;
    }

    let updated = apply_keys(current.as_deref(), &set);
    if current.as_deref() == Some(updated.as_str()) {
        return;
    }
    if let Err(e) = write_options_atomic(instance_dir, &updated) {
        log::warn!("[Keybinds] cannot write options.txt: {e}");
    }
}

/// Atomically replace `options.txt` (temp file + rename).
pub(crate) fn write_options_atomic(instance_dir: &Path, content: &str) -> std::io::Result<()> {
    let tmp = instance_dir.join("options.txt.reality-tmp");
    let result = fs::write(&tmp, content).and_then(|_| fs::rename(&tmp, instance_dir.join(OPTIONS_FILE)));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn km(pairs: &[(&str, &str)]) -> KeyMap {
        pairs.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect()
    }

    #[test]
    fn replaces_existing_and_keeps_other_lines() {
        let out = apply_keys(
            Some("fov:0.5\nkey_key.jump:key.keyboard.space\nkey_key.drop:key.keyboard.q\n"),
            &km(&[("key.jump", "key.keyboard.j")]),
        );
        assert_eq!(out, "fov:0.5\nkey_key.jump:key.keyboard.j\nkey_key.drop:key.keyboard.q\n");
    }

    #[test]
    fn appends_missing_keys() {
        assert_eq!(
            apply_keys(Some("fov:0.5\n"), &km(&[("key.zoom", "key.keyboard.c")])),
            "fov:0.5\nkey_key.zoom:key.keyboard.c\n"
        );
    }

    #[test]
    fn creates_file_from_nothing() {
        assert_eq!(
            apply_keys(None, &km(&[("key.jump", "key.keyboard.j")])),
            "key_key.jump:key.keyboard.j\n"
        );
    }

    #[test]
    fn keeps_crlf() {
        assert_eq!(
            apply_keys(
                Some("fov:0.5\r\nkey_key.jump:key.keyboard.space\r\n"),
                &km(&[("key.jump", "key.keyboard.j"), ("key.zoom", "key.keyboard.c")])
            ),
            "fov:0.5\r\nkey_key.jump:key.keyboard.j\r\nkey_key.zoom:key.keyboard.c\r\n"
        );
    }

    #[test]
    fn appends_after_missing_trailing_newline() {
        assert_eq!(
            apply_keys(Some("fov:0.5"), &km(&[("key.zoom", "key.keyboard.c")])),
            "fov:0.5\nkey_key.zoom:key.keyboard.c\n"
        );
    }

    #[test]
    fn modifier_values_round_trip() {
        let keys = read_keys("key_key.create.rotate_menu:key.keyboard.r:SHIFT\nfov:1\n");
        assert_eq!(keys, km(&[("key.create.rotate_menu", "key.keyboard.r:SHIFT")]));
    }

    #[test]
    fn replaces_modifier_value_and_leaves_unlisted_keys() {
        let out = apply_keys(
            Some("key_key.x:key.keyboard.r:SHIFT\r\nkey_key.y:key.keyboard.t\r\n"),
            &km(&[("key.x", "key.keyboard.k")]),
        );
        assert_eq!(out, "key_key.x:key.keyboard.k\r\nkey_key.y:key.keyboard.t\r\n");
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("keybinds-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn pack(dir: &Path, json: &str) { fs::create_dir_all(dir.join("reality")).unwrap(); fs::write(dir.join("reality/keybinds.json"), json).unwrap(); }
    const SET_J: &str = r#"{"version":1,"set":{"key.jump":"key.keyboard.j"}}"#;

    #[test] fn first_install_detection() {
        let d = temp_dir("first");
        assert!(is_first_install(&d));
        fs::write(d.join("options.txt"), "fov:1\n").unwrap();
        assert!(!is_first_install(&d));
    }
    #[test] fn first_install_detection_pack_state_only() {
        let d = temp_dir("first-state");
        fs::create_dir_all(d.join(".reality")).unwrap();
        fs::write(d.join(".reality/pack-state.json"), "{}").unwrap();
        assert!(!is_first_install(&d));
    }
    #[test] fn first_install_writes_keys() {
        let d = temp_dir("fi"); pack(&d, SET_J);
        apply_pack_keybinds(&d, KeybindMode::FirstInstallOnly, true, None, false, 1);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.j\n");
    }
    #[test] fn launch_sync_never_changes_played_instance() {
        let d = temp_dir("played"); pack(&d, SET_J);
        fs::write(d.join("options.txt"), "key_key.jump:key.keyboard.space\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::FirstInstallOnly, false, None, false, 1);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.space\n");
    }
    #[test] fn repair_backs_up_then_overwrites_only_pack_keys() {
        let d = temp_dir("repair"); let b = temp_dir("repair-bk"); pack(&d, SET_J);
        fs::write(d.join("options.txt"), "fov:1\nkey_key.jump:key.keyboard.space\nkey_key.drop:key.keyboard.g\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::Repair, false, Some(&b), false, 7);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "fov:1\nkey_key.jump:key.keyboard.j\nkey_key.drop:key.keyboard.g\n");
        let l = crate::keybind_backups::list_backups(&b);
        assert_eq!((l.len(), l[0].reason.as_str(), l[0].key_count), (1, "before-repair", 2));
        assert!(!d.join("options.txt.reality-tmp").exists());
    }
    #[test] fn repair_without_backup_dir_changes_nothing() {
        let d = temp_dir("nobk"); pack(&d, SET_J);
        fs::write(d.join("options.txt"), "key_key.jump:key.keyboard.space\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::Repair, false, None, false, 1);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.space\n");
    }
    #[test] fn repair_without_pack_file_still_backs_up() {
        let d = temp_dir("repair-nopack"); let b = temp_dir("repair-nopack-bk");
        fs::write(d.join("options.txt"), "key_key.jump:key.keyboard.space\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::Repair, false, Some(&b), false, 3);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.space\n");
        let l = crate::keybind_backups::list_backups(&b);
        assert_eq!((l.len(), l[0].reason.as_str(), l[0].key_count), (1, "before-repair", 1));
    }
    #[test] fn repair_with_bad_pack_file_backs_up_and_changes_nothing() {
        let d = temp_dir("repair-badpack"); let b = temp_dir("repair-badpack-bk");
        pack(&d, "not json");
        fs::write(d.join("options.txt"), "key_key.jump:key.keyboard.space\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::Repair, false, Some(&b), false, 3);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.space\n");
        assert_eq!(crate::keybind_backups::list_backups(&b).len(), 1);
    }
    #[test] fn no_pack_file_or_bad_file_is_a_no_op() {
        let d = temp_dir("nofile");
        fs::write(d.join("options.txt"), "fov:1\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::Repair, false, Some(&temp_dir("nofile-bk")), false, 1);
        pack(&d, r#"{"version":9,"set":{}}"#);
        apply_pack_keybinds(&d, KeybindMode::FirstInstallOnly, true, None, false, 1);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "fov:1\n");
    }

    #[test]
    fn drops_invalid_entries_and_keeps_valid_ones() {
        let set = parse_keybinds_file(
            r#"{"version":1,"set":{
                "key.jump":"key.keyboard.j",
                "key.evil":"key.keyboard.k\nfov:1",
                "key.cr":"key.keyboard.k\r",
                "key:bad":"key.keyboard.l",
                "key bad":"key.keyboard.l",
                "":"key.keyboard.l",
                "key.rot":"key.keyboard.r:SHIFT",
                "key.ctl":"key.keyboard.r:CONTROL",
                "key.alt":"key.keyboard.r:ALT",
                "key.meta":"key.keyboard.r:META",
                "key.use":"key.mouse.right",
                "key.none":"key.keyboard.unknown",
                "key.upper":"key.keyboard.J",
                "key.other":"key.gamepad.a",
                "key.empty":"key.keyboard."
            }}"#,
        )
        .unwrap();
        assert_eq!(
            set,
            km(&[
                ("key.jump", "key.keyboard.j"),
                ("key.rot", "key.keyboard.r:SHIFT"),
                ("key.ctl", "key.keyboard.r:CONTROL"),
                ("key.alt", "key.keyboard.r:ALT"),
                ("key.use", "key.mouse.right"),
                ("key.none", "key.keyboard.unknown"),
            ])
        );
    }

    #[test]
    fn key_value_validation() {
        assert!(is_valid_key_value("key.keyboard.left.shift"));
        assert!(is_valid_key_value("key.mouse.4"));
        assert!(is_valid_key_value("key.keyboard.keypad.0:ALT"));
        assert!(!is_valid_key_value("key.keyboard.j:SHIFT:ALT"));
        assert!(!is_valid_key_value("key.keyboard.j:"));
        assert!(!is_valid_key_value("key.keyboard"));
        assert!(!is_valid_key_id("key.\tjump"));
        assert!(is_valid_key_id("key.create.rotate_menu"));
    }

    #[test] fn repair_while_game_running_backs_up_but_leaves_options() {
        let d = temp_dir("repair-running"); let b = temp_dir("repair-running-bk"); pack(&d, SET_J);
        fs::write(d.join("options.txt"), "key_key.jump:key.keyboard.space\n").unwrap();
        apply_pack_keybinds(&d, KeybindMode::Repair, false, Some(&b), true, 5);
        assert_eq!(fs::read_to_string(d.join("options.txt")).unwrap(), "key_key.jump:key.keyboard.space\n");
        let l = crate::keybind_backups::list_backups(&b);
        assert_eq!((l.len(), l[0].reason.as_str()), (1, "before-repair"));
    }

    #[test]
    fn parses_set_and_rejects_bad_files() {
        assert_eq!(
            parse_keybinds_file(r#"{"version":1,"set":{"key.jump":"key.keyboard.j"},"known":{}}"#).unwrap(),
            km(&[("key.jump", "key.keyboard.j")])
        );
        assert!(parse_keybinds_file(r#"{"version":2,"set":{}}"#).is_err());
        assert!(parse_keybinds_file("not json").is_err());
        assert!(parse_keybinds_file(r#"{"version":1,"set":{"key.jump":5}}"#).is_err());
    }
}
