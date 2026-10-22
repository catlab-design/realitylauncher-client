//! Reality badge in the multiplayer tab list (docs/plans/2026-10-22-tab-list-reality-badge-design.md).
//!
//! The launcher side: a resource pack that draws the badge glyph, the session
//! file the agent reads (lookup token + runtime names from `mappings`), and the
//! presence session that tells the API this game runs through Reality.
//! Everything here is best-effort: failures mean "no badge", never a failed launch.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::mappings::TabScheme;

const API_URL: &str = "https://api.reality.catlabdesign.space";
const BADGE_GLYPH: char = '\u{E2A0}';
const BADGE_PNG: &[u8] = include_bytes!("../resources/badge.png");
const PACK_FILE: &str = "reality-badge.zip";
const SESSION_FILE: &str = "session.properties";
const DEFAULT_HEARTBEAT_SECS: u64 = 120;

/// Resource pack format per Minecraft version (1.19+). Unknown newer versions
/// get the newest known format; `supported_formats` / `min_format` /
/// `max_format` keep the pack loading without the "incompatible" warning.
fn pack_format(mc_version: &str) -> u32 {
    let parts: Vec<u32> = mc_version
        .split('.')
        .map(|p| p.parse().unwrap_or(0))
        .collect();
    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);
    match (minor, patch) {
        (19, 0..=2) => 9,
        (19, 3) => 12,
        (19, _) => 13,
        (20, 0..=1) => 15,
        (20, 2) => 18,
        (20, 3..=4) => 22,
        (20, _) => 32,
        (21, 0..=1) => 34,
        (21, 2..=3) => 42,
        (21, 4) => 46,
        (21, 5) => 55,
        (21, 6) => 63,
        (21, 7..=8) => 64,
        _ => 69,
    }
}

fn pack_zip(mc_version: &str) -> Result<Vec<u8>, String> {
    let format = pack_format(mc_version);
    let mcmeta = serde_json::json!({
        "pack": {
            "description": "Reality Launcher badge",
            "pack_format": format,
            "supported_formats": { "min_inclusive": 9, "max_inclusive": 1000 },
            "min_format": 9,
            "max_format": 1000,
        }
    });
    let font = serde_json::json!({
        "providers": [{
            "type": "bitmap",
            "file": "reality:font/badge.png",
            "ascent": 7,
            "height": 8,
            "chars": [BADGE_GLYPH.to_string()],
        }]
    });

    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
        let files: [(&str, Vec<u8>); 3] = [
            ("pack.mcmeta", serde_json::to_vec_pretty(&mcmeta).map_err(|e| e.to_string())?),
            (
                "assets/minecraft/font/default.json",
                serde_json::to_vec_pretty(&font).map_err(|e| e.to_string())?,
            ),
            ("assets/reality/textures/font/badge.png", BADGE_PNG.to_vec()),
        ];
        for (name, bytes) in files {
            zip.start_file(name, opts).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
    }
    Ok(buf.into_inner())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("no parent dir")?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!(
        ".{}.{}.tmp",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("file"),
        std::process::id()
    ));
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    if path.file_name().and_then(|n| n.to_str()) == Some(SESSION_FILE) {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Adds the badge pack to `resourcePacks` in options.txt. Minecraft fills in
/// every other option itself when the file is new.
fn enable_pack(instance_dir: &Path) -> Result<(), String> {
    let options_path = instance_dir.join("options.txt");
    let entry = format!("file/{PACK_FILE}");
    let content = fs::read_to_string(&options_path).unwrap_or_default();
    let mut found = false;
    let mut changed = false;
    let mut lines: Vec<String> = content
        .lines()
        .map(|line| {
            let Some(raw) = line.strip_prefix("resourcePacks:") else {
                return line.to_string();
            };
            found = true;
            let mut packs: Vec<String> = serde_json::from_str(raw).unwrap_or_default();
            if packs.iter().any(|p| p == &entry) {
                return line.to_string();
            }
            if packs.is_empty() {
                packs.push("vanilla".to_string());
            }
            packs.push(entry.clone());
            changed = true;
            format!("resourcePacks:{}", serde_json::to_string(&packs).unwrap_or_default())
        })
        .collect();
    if !found {
        lines.push(format!(
            "resourcePacks:{}",
            serde_json::to_string(&["vanilla", entry.as_str()]).unwrap_or_default()
        ));
        changed = true;
    }
    if !changed {
        return Ok(());
    }
    let mut out = lines.join("\n");
    out.push('\n');
    write_atomic(&options_path, out.as_bytes())
}

/// Escapes a value for java.util.Properties (Latin-1 + \uXXXX).
fn escape_property(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for (i, ch) in value.chars().enumerate() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ' ' if i == 0 => out.push_str("\\ "),
            '=' | ':' | '#' | '!' => {
                out.push('\\');
                out.push(ch);
            }
            c if (c as u32) < 0x20 || (c as u32) > 0x7e => {
                let mut units = [0u16; 2];
                for unit in c.encode_utf16(&mut units) {
                    out.push_str(&format!("\\u{:04X}", unit));
                }
            }
            c => out.push(c),
        }
    }
    out
}

fn session_properties(schemes: &[TabScheme], lookup_token: Option<&str>) -> String {
    let mut entries: Vec<(String, String)> = vec![
        ("api.url".into(), API_URL.into()),
        ("badge".into(), format!("{BADGE_GLYPH} ")),
        ("scheme.count".into(), schemes.len().to_string()),
    ];
    if let Some(token) = lookup_token {
        entries.push(("lookup.token".into(), token.to_string()));
    }
    for (i, s) in schemes.iter().enumerate() {
        let fields: [(&str, &str); 12] = [
            ("name", &s.name),
            ("overlay.class", &s.overlay_class),
            ("overlay.method", &s.overlay_method),
            ("overlay.desc", &s.overlay_desc),
            ("playerinfo.class", &s.player_info_class),
            ("getprofile", &s.get_profile),
            ("component.class", &s.component_class),
            ("literal", &s.literal),
            ("literal.desc", &s.literal_desc),
            ("mutable.class", &s.mutable_class),
            ("append", &s.append),
            ("append.desc", &s.append_desc),
        ];
        for (key, value) in fields {
            entries.push((format!("scheme.{i}.{key}"), value.to_string()));
        }
    }
    entries
        .iter()
        .map(|(k, v)| format!("{}={}\n", escape_property(k), escape_property(v)))
        .collect()
}

pub struct BadgeSetup {
    session_path: PathBuf,
    schemes: Vec<TabScheme>,
}

impl BadgeSetup {
    pub fn jvm_arg(&self) -> String {
        format!("-Dreality.session={}", self.session_path.to_string_lossy())
    }
}

/// Writes the pack, enables it and writes the session file (without a token
/// yet). None when there is nothing to hook for this version/loader.
pub fn prepare(
    minecraft_dir: &Path,
    instance_dir: &Path,
    mc_version: &str,
    schemes: Vec<TabScheme>,
) -> Option<BadgeSetup> {
    if schemes.is_empty() {
        return None;
    }
    let result = (|| -> Result<BadgeSetup, String> {
        let pack = pack_zip(mc_version)?;
        write_atomic(&instance_dir.join("resourcepacks").join(PACK_FILE), &pack)?;
        enable_pack(instance_dir)?;
        let session_path = minecraft_dir.join("agent").join(SESSION_FILE);
        write_atomic(&session_path, session_properties(&schemes, None).as_bytes())?;
        Ok(BadgeSetup { session_path, schemes })
    })();
    match result {
        Ok(setup) => Some(setup),
        Err(e) => {
            log::warn!("[TabBadge] Skipping tab badges: {e}");
            None
        }
    }
}

/// Stops the presence task; it then ends the session on the API.
#[derive(Clone)]
pub struct PresenceHandle(Arc<AtomicBool>);

impl PresenceHandle {
    pub fn stop(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartResponse {
    session_id: String,
    lookup_token: String,
    heartbeat_seconds: Option<u64>,
}

async fn post(path: &str, api_token: &str, body: serde_json::Value) -> Result<reqwest::Response, String> {
    crate::http_client::HTTP_CLIENT
        .post(format!("{API_URL}{path}"))
        .bearer_auth(api_token)
        .json(&body)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())
}

async fn start_session(
    api_token: &str,
    instance_id: &str,
    uuids: &[String],
) -> Result<StartResponse, String> {
    let resp = post(
        "/presence/start",
        api_token,
        serde_json::json!({ "instanceId": instance_id, "uuids": uuids }),
    )
    .await?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json::<StartResponse>().await.map_err(|e| e.to_string())
}

/// Registers the running game, hands the lookup token to the agent, heartbeats
/// until stopped, then ends the session and removes the session file.
pub fn spawn_presence(
    setup: BadgeSetup,
    api_token: String,
    instance_id: String,
    uuids: Vec<String>,
) -> PresenceHandle {
    let stopped = Arc::new(AtomicBool::new(false));
    let handle = PresenceHandle(stopped.clone());
    tauri::async_runtime::spawn(async move {
        let mut session: Option<StartResponse> = None;
        let mut next_beat = std::time::Instant::now();
        while !stopped.load(Ordering::SeqCst) {
            if std::time::Instant::now() >= next_beat {
                let interval = session
                    .as_ref()
                    .and_then(|s| s.heartbeat_seconds)
                    .unwrap_or(DEFAULT_HEARTBEAT_SECS);
                next_beat = std::time::Instant::now() + std::time::Duration::from_secs(interval);

                let alive = match &session {
                    Some(s) => matches!(
                        post("/presence/heartbeat", &api_token, serde_json::json!({ "sessionId": s.session_id })).await,
                        Ok(resp) if resp.status().is_success()
                    ),
                    None => false,
                };
                if !alive {
                    match start_session(&api_token, &instance_id, &uuids).await {
                        Ok(started) => {
                            let props = session_properties(&setup.schemes, Some(&started.lookup_token));
                            if let Err(e) = write_atomic(&setup.session_path, props.as_bytes()) {
                                log::warn!("[TabBadge] Could not write session file: {e}");
                            }
                            session = Some(started);
                        }
                        Err(e) => {
                            log::warn!("[TabBadge] Presence start failed: {e}");
                            session = None;
                            // Retry sooner than a full heartbeat interval.
                            next_beat = std::time::Instant::now() + std::time::Duration::from_secs(30);
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
        if let Some(s) = session {
            let _ = post("/presence/end", &api_token, serde_json::json!({ "sessionId": s.session_id })).await;
        }
        let _ = fs::remove_file(&setup.session_path);
    });
    handle
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scheme() -> TabScheme {
        TabScheme {
            name: "intermediary".into(),
            overlay_class: "net/minecraft/class_355".into(),
            overlay_method: "method_1918".into(),
            overlay_desc: "(Lnet/minecraft/class_640;)Lnet/minecraft/class_2561;".into(),
            player_info_class: "net/minecraft/class_640".into(),
            get_profile: "method_2966".into(),
            component_class: "net/minecraft/class_2561".into(),
            literal: "method_43470".into(),
            literal_desc: "(Ljava/lang/String;)Lnet/minecraft/class_5250;".into(),
            mutable_class: "net/minecraft/class_5250".into(),
            append: "method_10852".into(),
            append_desc: "(Lnet/minecraft/class_2561;)Lnet/minecraft/class_5250;".into(),
        }
    }

    #[test]
    fn pack_formats() {
        assert_eq!(pack_format("1.19.2"), 9);
        assert_eq!(pack_format("1.20.1"), 15);
        assert_eq!(pack_format("1.20.4"), 22);
        assert_eq!(pack_format("1.21.1"), 34);
        assert_eq!(pack_format("1.21.11"), 69);
    }

    #[test]
    fn pack_contains_font_and_glyph() {
        let bytes = pack_zip("1.20.1").unwrap();
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut font = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("assets/minecraft/font/default.json").unwrap(), &mut font)
            .unwrap();
        assert!(font.contains('\u{E2A0}'));
        assert!(zip.by_name("assets/reality/textures/font/badge.png").is_ok());
        let mut meta = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("pack.mcmeta").unwrap(), &mut meta).unwrap();
        assert!(meta.contains("\"pack_format\": 15"));
    }

    #[test]
    fn enable_pack_appends_once_and_creates_line() {
        let dir = std::env::temp_dir().join(format!("rl-badge-opts-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let opts = dir.join("options.txt");

        fs::write(&opts, "fov:0.0\nresourcePacks:[\"vanilla\",\"mod_resources\"]\nlang:th_th\n").unwrap();
        enable_pack(&dir).unwrap();
        enable_pack(&dir).unwrap();
        assert_eq!(
            fs::read_to_string(&opts).unwrap(),
            "fov:0.0\nresourcePacks:[\"vanilla\",\"mod_resources\",\"file/reality-badge.zip\"]\nlang:th_th\n"
        );

        fs::remove_file(&opts).unwrap();
        enable_pack(&dir).unwrap();
        assert_eq!(
            fs::read_to_string(&opts).unwrap(),
            "resourcePacks:[\"vanilla\",\"file/reality-badge.zip\"]\n"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn session_properties_escape_for_java() {
        let props = session_properties(&[scheme()], Some("tok_-123"));
        assert!(props.contains("badge=\\uE2A0 \n"));
        assert!(props.contains("api.url=https\\://api.reality.catlabdesign.space\n"));
        assert!(props.contains("lookup.token=tok_-123\n"));
        assert!(props.contains("scheme.count=1\n"));
        assert!(props.contains("scheme.0.overlay.desc=(Lnet/minecraft/class_640;)Lnet/minecraft/class_2561;\n"));
    }
}
