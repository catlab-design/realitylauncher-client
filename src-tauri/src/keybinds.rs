//! Pack keybinds: parse `reality/keybinds.json` and apply it to `options.txt`.
//!
//! Pure functions only; file I/O, backups and sync wiring live elsewhere.

use serde::Deserialize;
use std::collections::BTreeMap;

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

/// Parse a pack `keybinds.json` and return its `set`. `known` is ignored.
pub fn parse_keybinds_file(json: &str) -> Result<KeyMap, String> {
    let file: KeybindsFile =
        serde_json::from_str(json).map_err(|e| format!("invalid keybinds.json: {e}"))?;
    if file.version != 1 {
        return Err(format!("unsupported keybinds.json version {}", file.version));
    }
    Ok(file.set)
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
