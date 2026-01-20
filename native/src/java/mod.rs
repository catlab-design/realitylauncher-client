//! Java Detection and Management Module
//! 
//! Handles:
//! - Auto-detection of installed Java versions
//! - Java version validation
//! - Adoptium/Temurin Java downloads
//! - Java path management

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

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
