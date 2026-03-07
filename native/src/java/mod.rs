//! Java Detection and Management Module
//! 
//! Handles:
//! - Auto-detection of installed Java versions
//! - Java version validation
//! - Azul Zulu Java downloads
//! - Java path management

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use serde_json::Value;
use crate::download::download_file;
use crate::extract::extract_zip;
use crate::get_client;

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

/// Represents a detected Java installation
#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub vendor: String,
    pub is_64bit: bool,
    pub is_jdk: bool,
}

/// Java detection result
#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct JavaDetectionResult {
    pub installations: Vec<JavaInstallation>,
    pub recommended: Option<JavaInstallation>,
}

/// Get Java version info from executable
fn get_java_info(java_path: &str) -> Option<JavaInstallation> {
    let output = Command::new(java_path)
        .arg("-version")
        .output()
        .ok()?;

    // Java outputs version to stderr
    let version_output = String::from_utf8_lossy(&output.stderr);
    
    // Parse version string like: openjdk version "17.0.1" 2021-10-19
    let version = parse_java_version(&version_output)?;
    let major = parse_major_version(&version);
    let vendor = parse_vendor(&version_output);
    let is_64bit = version_output.contains("64-Bit");
    
    // Check if JDK by looking for javac
    let java_dir = PathBuf::from(java_path).parent()?.to_path_buf();
    let javac_path = java_dir.join(if cfg!(windows) { "javac.exe" } else { "javac" });
    let is_jdk = javac_path.exists();

    Some(JavaInstallation {
        path: java_path.to_string(),
        version,
        major_version: major,
        vendor,
        is_64bit,
        is_jdk,
    })
}

fn parse_java_version(output: &str) -> Option<String> {
    // Match patterns like: "17.0.1", "1.8.0_312", "21"
    let re = regex::Regex::new(r#"version "([^"]+)""#).ok()?;
    re.captures(output)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn parse_major_version(version: &str) -> u32 {
    // Handle both old (1.8.x) and new (17.x) version formats
    let parts: Vec<&str> = version.split('.').collect();
    if parts.is_empty() {
        return 0;
    }
    
    let first: u32 = parts[0].parse().unwrap_or(0);
    if first == 1 && parts.len() > 1 {
        // Old format: 1.8.0 -> major is 8
        parts[1].parse().unwrap_or(0)
    } else {
        // New format: 17.0.1 -> major is 17
        first
    }
}

fn parse_vendor(output: &str) -> String {
    if output.contains("Temurin") || output.contains("AdoptOpenJDK") {
        "Adoptium".to_string()
    } else if output.contains("Azul") || output.contains("Zulu") {
        "Azul Zulu".to_string()
    } else if output.contains("GraalVM") {
        "GraalVM".to_string()
    } else if output.contains("Oracle") {
        "Oracle".to_string()
    } else if output.contains("Microsoft") {
        "Microsoft".to_string()
    } else if output.contains("Amazon") || output.contains("Corretto") {
        "Amazon Corretto".to_string()
    } else {
        "Unknown".to_string()
    }
}

/// Detect all Java installations on the system
#[napi]
pub fn detect_java_installations() -> JavaDetectionResult {
    let mut installations = Vec::new();
    let mut checked_paths = std::collections::HashSet::new();

    // 1. Check PATH environment
    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            let java_exe = if cfg!(windows) {
                PathBuf::from(dir).join("java.exe")
            } else {
                PathBuf::from(dir).join("java")
            };
            
            if java_exe.exists() {
                let path_str = java_exe.to_string_lossy().to_string();
                if !checked_paths.contains(&path_str) {
                    checked_paths.insert(path_str.clone());
                    if let Some(info) = get_java_info(&path_str) {
                        installations.push(info);
                    }
                }
            }
        }
    }

    // 2. Check JAVA_HOME
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let java_exe = if cfg!(windows) {
            PathBuf::from(&java_home).join("bin").join("java.exe")
        } else {
            PathBuf::from(&java_home).join("bin").join("java")
        };
        
        if java_exe.exists() {
            let path_str = java_exe.to_string_lossy().to_string();
            if !checked_paths.contains(&path_str) {
                checked_paths.insert(path_str.clone());
                if let Some(info) = get_java_info(&path_str) {
                    installations.push(info);
                }
            }
        }
    }

    // 3. Platform-specific locations
    #[cfg(windows)]
    {
        // Check Windows Registry
        let registry_paths = get_java_from_registry();
        for path in registry_paths {
            if !checked_paths.contains(&path) {
                checked_paths.insert(path.clone());
                if let Some(info) = get_java_info(&path) {
                    installations.push(info);
                }
            }
        }

        // Check common installation directories
        let common_dirs = vec![
            "C:\\Program Files\\Java",
            "C:\\Program Files\\Eclipse Adoptium",
            "C:\\Program Files\\Zulu",
            "C:\\Program Files\\Microsoft",
            "C:\\Program Files\\Amazon Corretto",
        ];

        for base_dir in common_dirs {
            if let Ok(entries) = std::fs::read_dir(base_dir) {
                for entry in entries.flatten() {
                    let java_exe = entry.path().join("bin").join("java.exe");
                    if java_exe.exists() {
                        let path_str = java_exe.to_string_lossy().to_string();
                        if !checked_paths.contains(&path_str) {
                            checked_paths.insert(path_str.clone());
                            if let Some(info) = get_java_info(&path_str) {
                                installations.push(info);
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        // Check common Unix locations
        let common_paths = vec![
            "/usr/bin/java",
            "/usr/local/bin/java",
            "/opt/java/bin/java",
            "/opt/jdk/bin/java",
        ];

        for path in common_paths {
            if !checked_paths.contains(&path.to_string()) && PathBuf::from(path).exists() {
                checked_paths.insert(path.to_string());
                if let Some(info) = get_java_info(path) {
                    installations.push(info);
                }
            }
        }

        // Check /usr/lib/jvm (Linux)
        if let Ok(entries) = std::fs::read_dir("/usr/lib/jvm") {
            for entry in entries.flatten() {
                let java_exe = entry.path().join("bin").join("java");
                if java_exe.exists() {
                    let path_str = java_exe.to_string_lossy().to_string();
                    if !checked_paths.contains(&path_str) {
                        checked_paths.insert(path_str.clone());
                        if let Some(info) = get_java_info(&path_str) {
                            installations.push(info);
                        }
                    }
                }
            }
        }

        // Check macOS standard locations
        if cfg!(target_os = "macos") {
             if let Ok(entries) = std::fs::read_dir("/Library/Java/JavaVirtualMachines") {
                for entry in entries.flatten() {
                    // Contents/Home/bin/java
                    let java_exe = entry.path().join("Contents").join("Home").join("bin").join("java");
                    if java_exe.exists() {
                        let path_str = java_exe.to_string_lossy().to_string();
                        if !checked_paths.contains(&path_str) {
                            checked_paths.insert(path_str.clone());
                            if let Some(info) = get_java_info(&path_str) {
                                installations.push(info);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by major version (descending)
    installations.sort_by(|a, b| b.major_version.cmp(&a.major_version));

    // Find recommended (Java 17 or 21 preferred for modern Minecraft)
    let recommended = installations.iter()
        .filter(|j| j.is_64bit)
        .find(|j| j.major_version == 21 || j.major_version == 17)
        .or_else(|| installations.iter().filter(|j| j.is_64bit && j.major_version >= 17).next())
        .or_else(|| installations.iter().filter(|j| j.is_64bit).next())
        .cloned();

    JavaDetectionResult {
        installations,
        recommended,
    }
}

#[cfg(windows)]
fn get_java_from_registry() -> Vec<String> {
    let mut paths = Vec::new();
    
    let registry_keys = vec![
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\JavaSoft\Java Runtime Environment"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\JavaSoft\Java Development Kit"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\JavaSoft\JDK"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Eclipse Adoptium\JDK"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Eclipse Adoptium\JRE"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Azul Systems\Zulu"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\JDK"),
    ];

    for (hkey, key_path) in registry_keys {
        if let Ok(key) = RegKey::predef(hkey).open_subkey(key_path) {
            // Enumerate subkeys (version numbers)
            if let Ok(subkeys) = key.enum_keys().collect::<Result<Vec<_>, _>>() {
                for subkey_name in subkeys {
                    if let Ok(subkey) = key.open_subkey(&subkey_name) {
                        if let Ok(java_home) = subkey.get_value::<String, _>("JavaHome") {
                            let java_exe = PathBuf::from(&java_home).join("bin").join("java.exe");
                            if java_exe.exists() {
                                paths.push(java_exe.to_string_lossy().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    paths
}

/// Validate a Java path
#[napi]
pub fn validate_java_path(path: String) -> Option<JavaInstallation> {
    let java_path = PathBuf::from(&path);
    
    if !java_path.exists() {
        return None;
    }

    // If directory, look for java executable
    let exe_path = if java_path.is_dir() {
        let bin_java = if cfg!(windows) {
            java_path.join("bin").join("java.exe")
        } else {
            java_path.join("bin").join("java")
        };
        
        if bin_java.exists() {
            bin_java
        } else {
            return None;
        }
    } else {
        java_path
    };

    get_java_info(&exe_path.to_string_lossy())
}

/// Get recommended Java version for a Minecraft version
#[napi]
pub fn get_recommended_java_version(minecraft_version: String) -> u32 {
    // Parse MC version
    let parts: Vec<&str> = minecraft_version.split('.').collect();
    let major: u32 = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(1);
    let minor: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

    // Minecraft version to Java version mapping
    if major >= 1 && minor >= 21 {
        21 // 1.21+ requires Java 21
    } else if major >= 1 && minor >= 18 {
        17 // 1.18+ requires Java 17
    } else if major >= 1 && minor >= 17 {
        16 // 1.17 requires Java 16
    } else {
        8 // Older versions use Java 8
    }
}

/// Find best Java for a Minecraft version from detected installations
#[napi]
pub fn find_java_for_minecraft(minecraft_version: String) -> Option<JavaInstallation> {
    let required = get_recommended_java_version(minecraft_version);
    let result = detect_java_installations();
    
    // Find exact match first
    result.installations.iter()
        .filter(|j| j.is_64bit && j.major_version == required)
        .next()
        .cloned()
        // Then find any compatible version
        .or_else(|| {
            result.installations.iter()
                .filter(|j| j.is_64bit && j.major_version >= required)
                .next()
                .cloned()
        })
}

fn map_azul_os() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    }
}

fn build_azul_package_api_url(major_version: u32) -> String {
    format!(
        "https://api.azul.com/metadata/v1/zulu/packages/?java_version={major_version}&os={}&arch=x64&archive_type=zip&java_package_type=jdk&javafx_bundled=false&release_status=ga&availability_types=CA&certifications=tck&java_package_features=headful&latest=true&page=1&page_size=100",
        map_azul_os()
    )
}

fn extract_zulu_package(payload: &Value) -> Option<(String, String)> {
    let entries = payload.as_array()?;
    let entry = entries
        .iter()
        .find(|item| item.get("latest").and_then(|v| v.as_bool()) == Some(true)
            && item.get("download_url").and_then(|v| v.as_str()).is_some())
        .or_else(|| {
            entries
                .iter()
                .find(|item| item.get("download_url").and_then(|v| v.as_str()).is_some())
        })?;

    let download_url = entry.get("download_url")?.as_str()?.to_string();
    let inferred_name = download_url
        .split('/')
        .last()
        .map(|name| name.split('?').next().unwrap_or(name).to_string())
        .unwrap_or_else(|| "java-runtime.zip".to_string());
    let file_name = entry
        .get("name")
        .and_then(|v| v.as_str())
        .map(|name| name.to_string())
        .unwrap_or(inferred_name);

    Some((download_url, file_name))
}

fn java_executable_name() -> &'static str {
    if cfg!(windows) {
        "java.exe"
    } else {
        "java"
    }
}

#[napi]
pub async fn install_java_runtime(major_version: u32, install_root: String) -> napi::Result<String> {
    let install_root_path = PathBuf::from(&install_root);
    std::fs::create_dir_all(&install_root_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to create install root: {e}")))?;

    let target_dir = install_root_path.join(format!("jdk-{major_version}"));
    let java_path = target_dir.join("bin").join(java_executable_name());
    if java_path.exists() {
        return Ok(java_path.to_string_lossy().to_string());
    }

    let api_url = build_azul_package_api_url(major_version);

    let client = get_client();
    let response = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to fetch Java metadata: {e}")))?;

    let payload: Value = response
        .json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Invalid Java metadata response: {e}")))?;

    let (download_url, file_name) = extract_zulu_package(&payload)
        .ok_or_else(|| napi::Error::from_reason(format!(
            "No Azul Zulu runtime found for version {major_version}"
        )))?;

    let zip_path = install_root_path.join(file_name);
    let download_result = download_file(
        download_url,
        zip_path.to_string_lossy().to_string(),
        None,
        None,
    )
    .await?;

    if !download_result.success {
        return Err(napi::Error::from_reason(
            download_result
                .error
                .unwrap_or_else(|| "Java download failed".to_string()),
        ));
    }

    let extract_dir = install_root_path.join(format!("temp-{major_version}"));
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }

    let extract_result = tokio::task::spawn_blocking({
        let zip_path = zip_path.to_string_lossy().to_string();
        let extract_dir = extract_dir.to_string_lossy().to_string();
        move || extract_zip(zip_path, extract_dir, None)
    })
    .await
    .map_err(|e| napi::Error::from_reason(format!("Java extract worker failed: {e}")))??;

    if !extract_result.success {
        return Err(napi::Error::from_reason(
            extract_result
                .error
                .unwrap_or_else(|| "Java extraction failed".to_string()),
        ));
    }

    let mut extracted_subdirs = std::fs::read_dir(&extract_dir)
        .map_err(|e| napi::Error::from_reason(format!("Failed to read extraction output: {e}")))?
        .flatten()
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|kind| kind.is_dir())
                .map(|_| entry.path())
        })
        .collect::<Vec<PathBuf>>();

    extracted_subdirs.sort();

    let source_dir = extracted_subdirs
        .into_iter()
        .next()
        .unwrap_or_else(|| extract_dir.clone());

    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }

    std::fs::rename(&source_dir, &target_dir)
        .map_err(|e| napi::Error::from_reason(format!("Failed to finalize Java installation: {e}")))?;

    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    let _ = std::fs::remove_file(&zip_path);

    let installed_java = target_dir.join("bin").join(java_executable_name());
    if !installed_java.exists() {
        return Err(napi::Error::from_reason("Installed Java executable not found"));
    }

    Ok(installed_java.to_string_lossy().to_string())
}
