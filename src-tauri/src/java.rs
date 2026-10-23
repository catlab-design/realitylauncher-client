





use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::config::LauncherConfig;
use crate::instances::GameInstance;
use crate::launcher::{get_java_major_version, get_java_path};

fn java_base_dir() -> PathBuf {
    crate::config::default_launcher_dir().join("java")
}

fn java_exe_name() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

/// Corretto archives unpack to a single top-level dir whose `bin/java` lives
/// directly under it on Windows/Linux but under `Contents/Home/` on macOS.
fn java_exe_in(jdk_dir: &Path) -> Option<PathBuf> {
    let direct = jdk_dir.join("bin").join(java_exe_name());
    if direct.exists() {
        return Some(direct);
    }
    let mac = jdk_dir
        .join("Contents")
        .join("Home")
        .join("bin")
        .join(java_exe_name());
    if mac.exists() {
        return Some(mac);
    }
    None
}

/// Folder of a launcher-installed Java: `jdk-<major>` (Corretto) or
/// `graalvm-jdk-<major>`.
fn install_dir(major: i32, graalvm: bool) -> PathBuf {
    let prefix = if graalvm { "graalvm-jdk" } else { "jdk" };
    java_base_dir().join(format!("{prefix}-{major}"))
}

fn uses_graalvm(major: i32) -> bool {
    major >= 21 && crate::config::config_get().java_provider == "graalvm"
}

/// A launcher-installed Java of this major, from the chosen provider first.
fn bundled_java_exe(major: i32) -> Option<String> {
    let preferred = uses_graalvm(major);
    [preferred, !preferred]
        .into_iter()
        .find_map(|graalvm| java_exe_in(&install_dir(major, graalvm)))
        .map(|p| p.to_string_lossy().to_string())
}

/// Required Java major for a Minecraft version. Prefers the version manifest's


pub fn get_required_java_version(mc_version: &str, version_json: &serde_json::Value) -> i32 {
    if let Some(major) = version_json
        .get("javaVersion")
        .and_then(|j| j.get("majorVersion"))
        .and_then(|m| m.as_i64())
    {
        if major > 0 {
            return major as i32;
        }
    }

    let nums: Vec<i32> = mc_version
        .split('.')
        .map(|part| {
            let digits: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse().unwrap_or(0)
        })
        .collect();
    let major = nums.first().copied().unwrap_or(1);
    let minor = nums.get(1).copied().unwrap_or(0);
    let patch = nums.get(2).copied().unwrap_or(0);

    if major > 1 {
        21
    } else if minor < 17 {
        8
    } else if minor > 20 || (minor == 20 && patch >= 5) {
        21
    } else {
        17
    }
}




fn lts_for(required: i32) -> i32 {
    match required {
        ..=8 => 8,
        9..=17 => 17,
        18..=21 => 21,
        _ => 25,
    }
}

fn is_compatible(java_path: &str, required: i32) -> bool {
    match get_java_major_version(java_path) {
        Ok(major) if required == 8 => major == 8,
        Ok(major) => major >= required,
        Err(_) => false,
    }
}



fn tier_candidates(config: &LauncherConfig, required: i32) -> Vec<String> {
    let jp = config.java_paths.clone().unwrap_or_default();
    let mut out: Vec<String> = Vec::new();

    if required == 8 {
        out.extend(jp.java8);
        out.extend(bundled_java_exe(8));
    } else if required >= 25 {
        out.extend(jp.java25);
        out.extend(bundled_java_exe(25));
    } else if required >= 21 {
        out.extend(jp.java21);
        out.extend(jp.java25);
        out.extend(bundled_java_exe(21));
        out.extend(bundled_java_exe(25));
    } else {
        out.extend(jp.java17);
        out.extend(jp.java21);
        out.extend(jp.java25);
        out.extend(bundled_java_exe(17));
        out.extend(bundled_java_exe(21));
        out.extend(bundled_java_exe(25));
    }

    out.extend(config.java_path.clone());
    out.extend(get_java_path());
    out
}




pub async fn ensure_compatible_java(
    app: &AppHandle,
    instance: &GameInstance,
    config: &LauncherConfig,
    required: i32,
) -> Result<String, String> {
    if let Some(p) = instance.java_path.as_deref() {
        if !p.is_empty() && p != "/path/to/java" {
            if is_compatible(p, required) {
                return Ok(p.to_string());
            }
            return Err(format!(
                "Selected Java is not compatible. Please choose Java {required}{}.",
                if required == 8 { "" } else { "+" }
            ));
        }
    }

    for candidate in tier_candidates(config, required) {
        if is_compatible(&candidate, required) {
            return Ok(candidate);
        }
    }

    
    
    install_java_inner(app, lts_for(required)).await
}





#[tauri::command]
pub fn detect_java_installations() -> Vec<serde_json::Value> {
    let config = crate::config::config_get();
    let jp = config.java_paths.clone().unwrap_or_default();

    let mut candidates: Vec<String> = Vec::new();
    candidates.extend(get_java_path());
    for major in [8, 17, 21, 25] {
        candidates.extend(bundled_java_exe(major));
    }
    candidates.extend(config.java_path.clone());
    candidates.extend(
        [jp.java8, jp.java17, jp.java21, jp.java25]
            .into_iter()
            .flatten(),
    );

    let mut seen: HashSet<String> = HashSet::new();
    let mut found = Vec::new();
    for path in candidates {
        if !seen.insert(path.clone()) {
            continue;
        }
        if let Ok(major) = get_java_major_version(&path) {
            found.push(serde_json::json!({
                "path": path,
                "majorVersion": major,
                "version": major.to_string(),
            }));
        }
    }

    found.sort_by(|a, b| {
        b.get("majorVersion")
            .and_then(|v| v.as_i64())
            .unwrap_or(0)
            .cmp(&a.get("majorVersion").and_then(|v| v.as_i64()).unwrap_or(0))
    });
    found
}





#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JavaInstallProgress {
    major_version: i32,
    phase: String,
    percent: u32,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaInstallResult {
    pub ok: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

fn emit(app: &AppHandle, major: i32, phase: &str, percent: u32, message: &str) {
    let _ = app.emit(
        "java-install-progress",
        JavaInstallProgress {
            major_version: major,
            phase: phase.to_string(),
            percent,
            message: message.to_string(),
        },
    );
}


fn graalvm_url(major: i32) -> (String, String, bool) {
    let os = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" };
    let is_zip = cfg!(windows);
    let ext = if is_zip { "zip" } else { "tar.gz" };
    let file = format!("graalvm-jdk-{major}_{os}-{arch}_bin.{ext}");
    (
        format!("https://download.oracle.com/graalvm/{major}/latest/{file}"),
        file,
        is_zip,
    )
}

fn corretto_url(major: i32) -> (String, String, bool) {
    let os = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    
    
    
    let arch = if cfg!(target_arch = "aarch64") && !cfg!(windows) {
        "aarch64"
    } else {
        "x64"
    };
    let is_zip = cfg!(windows);
    let ext = if is_zip { "zip" } else { "tar.gz" };
    let file = format!("amazon-corretto-{major}-{arch}-{os}-jdk.{ext}");
    (
        format!("https://corretto.aws/downloads/latest/{file}"),
        file,
        is_zip,
    )
}

#[tauri::command]
pub async fn install_java(app: AppHandle, major_version: i32) -> JavaInstallResult {
    match install_java_inner(&app, major_version).await {
        Ok(path) => {
            emit(&app, major_version, "complete", 100, "ติดตั้งสำเร็จ!");
            JavaInstallResult {
                ok: true,
                path: Some(path),
                error: None,
            }
        }
        Err(e) => {
            emit(&app, major_version, "error", 0, &e);
            JavaInstallResult {
                ok: false,
                path: None,
                error: Some(e),
            }
        }
    }
}

async fn install_java_inner(app: &AppHandle, major: i32) -> Result<String, String> {
    let base = java_base_dir();
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let graalvm = uses_graalvm(major);
    let target = install_dir(major, graalvm);
    if let Some(existing) = java_exe_in(&target) {
        emit(app, major, "complete", 100, "Java already installed");
        return Ok(existing.to_string_lossy().to_string());
    }

    let (url, file_name, is_zip) = if graalvm { graalvm_url(major) } else { corretto_url(major) };
    emit(
        app,
        major,
        "download",
        0,
        &format!("กำลังดาวน์โหลด {file_name}..."),
    );

    let archive_path = base.join(&file_name);
    download_with_progress(&url, &archive_path, |percent, message| {
        emit(app, major, "download", percent, &message)
    })
    .await?;

    emit(app, major, "extract", 0, "กำลังแตกไฟล์...");
    let exe = unpack_java(&archive_path, is_zip, &base.join(format!("temp-{major}")), &target)?;
    emit(app, major, "install", 90, "กำลังติดตั้ง...");

    record_java_path(major, &exe);
    Ok(exe)
}

/// Unpacks a Java archive (one top-level dir) into `target` and returns its java.
fn unpack_java(archive: &Path, is_zip: bool, extract_dir: &Path, target: &Path) -> Result<String, String> {
    if extract_dir.exists() {
        fs::remove_dir_all(extract_dir).ok();
    }
    fs::create_dir_all(extract_dir).map_err(|e| e.to_string())?;

    if is_zip {
        extract_zip(archive, extract_dir)?;
    } else {
        extract_tar_gz(archive, extract_dir)?;
    }
    fs::remove_file(archive).ok();

    let top_dir = fs::read_dir(extract_dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.is_dir())
        .ok_or("Extract produced no directory")?;

    if target.exists() {
        fs::remove_dir_all(target).ok();
    }
    fs::rename(&top_dir, target).map_err(|e| e.to_string())?;
    fs::remove_dir_all(extract_dir).ok();

    let exe = java_exe_in(target).ok_or_else(|| {
        format!(
            "Java executable not found after install ({})",
            java_exe_name()
        )
    })?;
    Ok(exe.to_string_lossy().to_string())
}

/// Linux only: a Temurin JRE kept for Forge/NeoForge installers, which need
/// classic zlib (see `launcher::installer_java`). Temurin bundles zlib; Corretto
/// links the system libz, which is zlib-ng on Arch/CachyOS/Fedora 40+. Lives in
/// `java/installer-jre-<major>`, outside the game's Java detection.
pub async fn install_installer_java(
    major: i32,
    on_progress: impl Fn(String),
) -> Result<String, String> {
    let base = java_base_dir();
    let target = base.join(format!("installer-jre-{major}"));
    if let Some(existing) = java_exe_in(&target) {
        return Ok(existing.to_string_lossy().to_string());
    }
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "aarch64",
        other => return Err(format!("no Temurin build for {other}")),
    };
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{major}/ga/linux/{arch}/jre/hotspot/normal/eclipse"
    );
    let archive_path = base.join(format!("installer-jre-{major}.tar.gz"));
    download_with_progress(&url, &archive_path, |_, message| {
        on_progress(format!("Java {major} for the loader installer: {message}"))
    })
    .await?;
    on_progress(format!("Java {major} for the loader installer: unpacking"));
    unpack_java(&archive_path, false, &base.join(format!("temp-installer-{major}")), &target)
}

fn record_java_path(major: i32, path: &str) {
    let mut config = crate::config::config_get();
    let mut jp = config.java_paths.clone().unwrap_or_default();
    if major == 8 {
        jp.java8 = Some(path.to_string());
    } else if major >= 25 {
        jp.java25 = Some(path.to_string());
    } else if major >= 21 {
        jp.java21 = Some(path.to_string());
    } else {
        jp.java17 = Some(path.to_string());
    }
    config.java_paths = Some(jp);
    let _ = crate::config::config_set(config);
}

async fn download_with_progress(
    url: &str,
    dest: &Path,
    on_progress: impl Fn(u32, String),
) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;

    let resp = crate::http_client::HTTP_CLIENT.clone()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Java download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Java download HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_percent = 0u32;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total > 0 {
            let percent = ((downloaded * 100) / total) as u32;
            if percent >= last_percent + 5 || percent == 100 {
                last_percent = percent;
                let dl_mb = downloaded / 1_048_576;
                let total_mb = total / 1_048_576;
                on_progress(percent, format!("Downloading {dl_mb}/{total_mb} MB ({percent}%)"));
            }
        }
    }

    Ok(())
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let out = match entry.enclosed_name() {
            Some(p) => dest.join(p),
            None => continue,
        };

        if entry.is_dir() {
            fs::create_dir_all(&out).ok();
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).ok();
        }
        let mut outfile = fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = entry.unix_mode() {
                fs::set_permissions(&out, fs::Permissions::from_mode(mode)).ok();
            }
        }
    }
    Ok(())
}

fn extract_tar_gz(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|e| e.to_string())?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);
    tar.unpack(dest).map_err(|e| e.to_string())
}





fn clear_recorded_java_path(major: i32) {
    let mut config = crate::config::config_get();
    if let Some(mut jp) = config.java_paths.clone() {
        let marker = format!("jdk-{major}");
        let clear = |slot: &mut Option<String>| {
            if slot.as_deref().is_some_and(|s| s.contains(&marker)) {
                *slot = None;
            }
        };
        clear(&mut jp.java8);
        clear(&mut jp.java17);
        clear(&mut jp.java21);
        clear(&mut jp.java25);
        config.java_paths = Some(jp);
        let _ = crate::config::config_set(config);
    }
}

#[tauri::command]
pub fn delete_java(major_version: i32) -> serde_json::Value {
    let dirs: Vec<PathBuf> = [false, true]
        .into_iter()
        .map(|graalvm| install_dir(major_version, graalvm))
        .filter(|dir| dir.exists())
        .collect();
    if dirs.is_empty() {
        return serde_json::json!({ "ok": true, "message": format!("ไม่พบ Java {major_version}") });
    }
    for dir in dirs {
        if let Err(e) = fs::remove_dir_all(&dir) {
            return serde_json::json!({ "ok": false, "error": e.to_string() });
        }
    }
    clear_recorded_java_path(major_version);
    serde_json::json!({ "ok": true, "message": format!("ลบ Java {major_version} สำเร็จ") })
}

#[tauri::command]
pub fn test_java_execution(java_path: String) -> serde_json::Value {
    if !Path::new(&java_path).exists() {
        return serde_json::json!({ "ok": false, "error": "ไม่พบ Java" });
    }

    let mut cmd = std::process::Command::new(&java_path);
    cmd.arg("-version")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    match cmd.output() {
        Ok(out) => {
            let combined = format!(
                "{}{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            )
            .trim()
            .to_string();

            if combined.contains("version") {
                let version = combined.split('"').nth(1).map(String::from);
                serde_json::json!({ "ok": true, "output": combined, "version": version })
            } else if !out.status.success() {
                serde_json::json!({ "ok": false, "error": format!("Java exit code: {:?}", out.status.code()), "output": combined })
            } else {
                serde_json::json!({ "ok": true, "output": combined })
            }
        }
        Err(e) => serde_json::json!({ "ok": false, "error": e.to_string() }),
    }
}

#[tauri::command]
pub fn auto_detect_java() -> Option<String> {
    let list = detect_java_installations();
    if let Some(first) = list.first() {
        if let Some(path) = first.get("path").and_then(|p| p.as_str()) {
            return Some(path.to_string());
        }
    }

    let cmd = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    let mut command = std::process::Command::new(cmd);
    command.arg("java");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    if let Ok(output) = command.output() {
        let out_str = String::from_utf8_lossy(&output.stdout);
        let first_line = out_str.lines().next().unwrap_or("").trim();
        if !first_line.is_empty() && std::path::Path::new(first_line).exists() {
            return Some(first_line.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{get_required_java_version, lts_for};
    use serde_json::json;

    fn required(version: &str) -> i32 {
        get_required_java_version(version, &json!({}))
    }

    #[test]
    fn snaps_required_major_to_installable_lts() {
        assert_eq!(lts_for(8), 8);
        assert_eq!(lts_for(16), 17); 
        assert_eq!(lts_for(17), 17);
        assert_eq!(lts_for(20), 21);
        assert_eq!(lts_for(21), 21);
        assert_eq!(lts_for(24), 25);
    }

    #[test]
    fn maps_minecraft_version_to_java_major() {
        assert_eq!(required("1.16.5"), 8);
        assert_eq!(required("1.17.1"), 17);
        assert_eq!(required("1.20.4"), 17);
        assert_eq!(required("1.20.5"), 21);
        assert_eq!(required("1.21"), 21);
        assert_eq!(required("1.21.4"), 21);
    }

    #[test]
    fn manifest_java_version_wins_over_heuristic() {
        let manifest = json!({ "javaVersion": { "majorVersion": 21 } });
        assert_eq!(get_required_java_version("1.16.5", &manifest), 21);
    }
}
