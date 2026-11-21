//! Per-instance launcher log (`<instance>/logs/launcher.log`), restarted on
//! every Play press. Game Logs shows it above Minecraft's `latest.log`, so a
//! player can see what happened between pressing Play and the game window:
//! sign-in, server sync, downloads, Java, loader, and how long each step took.
//! Lines use Forge's log layout so the viewer parses time and level the same way.
//! Everything read back for the viewer goes through [`redact`].

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use regex::Regex;

pub const FILE_NAME: &str = "launcher.log";

static CURRENT: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Starts a fresh log for this launch; later lines go to it until the next start.
pub fn start(instance_dir: &Path) {
    let dir = instance_dir.join("logs");
    let path = dir.join(FILE_NAME);
    // Recreate rather than truncate: the file's creation time marks when this
    // launch began, which the viewer uses to skip a previous session's latest.log.
    let _ = fs::remove_file(&path);
    let _ = fs::create_dir_all(&dir).and_then(|_| fs::write(&path, b""));
    *CURRENT.lock().unwrap() = Some(path);
}

pub fn path_for(instance_dir: &Path) -> PathBuf {
    instance_dir.join("logs").join(FILE_NAME)
}

pub fn info(message: impl AsRef<str>) {
    write("INFO", message.as_ref());
}

pub fn warn(message: impl AsRef<str>) {
    write("WARN", message.as_ref());
}

pub fn error(message: impl AsRef<str>) {
    write("ERROR", message.as_ref());
}

/// Writes to the log of the launch in progress, if any. Never fails the launch.
fn write(level: &str, message: &str) {
    let Some(path) = CURRENT.lock().unwrap().clone() else {
        return;
    };
    append(&path, "Launcher", level, message);
}

/// Appends to a specific launch log; for game output that arrives after the
/// launch call returned.
pub fn append(path: &Path, thread: &str, level: &str, message: &str) {
    let line = format_line(&chrono::Local::now(), thread, level, message);
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

/// `[22Oct2026 19:05:21.123] [Launcher/INFO] [Reality Launcher/]: message`
fn format_line(at: &chrono::DateTime<chrono::Local>, thread: &str, level: &str, message: &str) -> String {
    let mut out = String::new();
    for line in message.lines() {
        out.push_str(&format!(
            "[{}] [{thread}/{level}] [Reality Launcher/]: {line}\n",
            at.format("%d%b%Y %H:%M:%S%.3f")
        ));
    }
    out
}

/// Duration as players read it: "850 ms", "3.6 s".
pub fn took(d: std::time::Duration) -> String {
    if d.as_millis() < 1000 {
        format!("{} ms", d.as_millis())
    } else {
        format!("{:.1} s", d.as_secs_f64())
    }
}

/// Paths shown in the log, with the home folder (the OS user name) hidden.
pub fn display_path(path: impl AsRef<Path>) -> String {
    redact(&path.as_ref().to_string_lossy())
}

static SECRET_PATTERNS: Lazy<Vec<(Regex, &'static str)>> = Lazy::new(|| {
    [
        // JWTs (Minecraft access tokens, API tokens).
        (r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}", "[REDACTED]"),
        // Account arguments on command lines ("--accessToken X") and in
        // Forge's "ModLauncher running: args [--username, X, ...]".
        (
            r"(?i)(--(?:accessToken|clientId|xuid|session|uuid|username)(?:\s+|,\s*))[^\s,\]]+",
            "${1}[REDACTED]",
        ),
        // key=value / key: value / "key":"value" for secret-looking keys.
        (
            r#"(?i)((?:access[_-]?token|refresh[_-]?token|api[_-]?token|lookup\.token|token|session[_-]?id|password|passwd|secret|authorization|api[_-]?key)"?\s*[:=]\s*"?)(?:Bearer\s+)?[^\s",;&]+"#,
            "${1}[REDACTED]",
        ),
        (r"(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}", "${1}[REDACTED]"),
        // The account name Minecraft prints at startup.
        (r"(Setting user: )\S+", "${1}[PLAYER]"),
        // E-mail addresses.
        (r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL]"),
        // IPv4 addresses where Minecraft and Netty print them ("Connecting to
        // 1.2.3.4, 25565", "/1.2.3.4:25565"); bare dotted numbers are usually
        // mod versions, so they are left alone.
        (
            r"(?i)(connecting to |/|address[:= ]+|host[:= ]+|ip[:= ]+)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b",
            "${1}[IP]",
        ),
    ]
    .into_iter()
    .map(|(re, rep)| (Regex::new(re).expect("valid redaction pattern"), rep))
    .collect()
});

static HOME_DIR: Lazy<Option<String>> = Lazy::new(|| {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(|h| h.trim_end_matches(['/', '\\']).to_string())
        .filter(|h| h.len() > 1)
});

/// Hides secrets in log text: tokens, passwords, e-mail and IP addresses, and
/// the home folder in paths (it contains the OS user name).
pub fn redact(text: &str) -> String {
    let mut out = match HOME_DIR.as_deref() {
        Some(home) => text.replace(home, "~"),
        None => text.to_string(),
    };
    for (re, rep) in SECRET_PATTERNS.iter() {
        if let std::borrow::Cow::Owned(replaced) = re.replace_all(&out, *rep) {
            out = replaced;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_tokens_and_secrets() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
        assert_eq!(redact(&format!("token {jwt}")), "token [REDACTED]");
        assert_eq!(redact("--accessToken abc.def --version 1.20.1"), "--accessToken [REDACTED] --version 1.20.1");
        assert_eq!(
            redact("args [--username, Notch, --version, 1.20.1, --uuid, 069a79f444e94726a5befca90e38aaf5, --accessToken, xyz, --clientId, , --userType, msa]"),
            "args [--username, [REDACTED], --version, 1.20.1, --uuid, [REDACTED], --accessToken, [REDACTED], --clientId, , --userType, msa]"
        );
        assert_eq!(redact("lookup.token=s3cr3tvalue"), "lookup.token=[REDACTED]");
        assert_eq!(redact(r#"{"password":"hunter22"}"#), r#"{"password":"[REDACTED]"}"#);
        assert_eq!(redact("Authorization: Bearer abcdefgh12345"), "Authorization: [REDACTED]");
        assert_eq!(redact("mail me at someone@example.com"), "mail me at [EMAIL]");
        assert_eq!(redact("[main/INFO]: Setting user: Notch"), "[main/INFO]: Setting user: [PLAYER]");
        assert_eq!(redact("Connecting to 203.0.113.7, 25565"), "Connecting to [IP], 25565");
        assert_eq!(redact("[/203.0.113.7:25565] logged in"), "[/[IP]:25565] logged in");
        assert_eq!(redact("Loaded examplemod 1.2.3.4"), "Loaded examplemod 1.2.3.4");
    }

    #[test]
    fn keeps_ordinary_log_lines() {
        let line = "[22Oct2026 19:05:53.179] [pool-4-thread-1/INFO] [net.minecraft.server.Bootstrap/]: Vanilla bootstrap took 4525 milliseconds";
        assert_eq!(redact(line), line);
        assert_eq!(redact("Loading 1.20.1-forge-47.4.28"), "Loading 1.20.1-forge-47.4.28");
    }

    #[test]
    fn hides_home_folder() {
        if let Some(home) = HOME_DIR.as_deref() {
            assert_eq!(redact(&format!("{home}/.reality-launcher/java")), "~/.reality-launcher/java");
        }
    }

    #[test]
    fn writes_forge_style_lines() {
        let at = chrono::Local::now();
        let line = format_line(&at, "Launcher", "WARN", "one\ntwo");
        let lines: Vec<&str> = line.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with('['));
        assert!(lines[0].contains("] [Launcher/WARN] [Reality Launcher/]: one"));
    }
}
