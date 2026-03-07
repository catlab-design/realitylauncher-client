use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::fs;
use std::io::Read;
use regex::Regex;
use crate::get_client;
use crate::download::download_file;
use std::process::Stdio;
use std::time::{Duration, Instant};
use std::thread;

#[derive(Serialize, Deserialize, Debug)]
#[napi(string_enum)]
pub enum ForgeLoaderType {
    Forge,
    NeoForge,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ForgeVersionInfo {
    pub forge_version: String,
    pub mc_version: String,
    pub loader_type: ForgeLoaderType,
    pub installer_url: String,
    pub version_json_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ForgeInstallerRunResult {
    pub success: bool,
    pub timeout: bool,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

fn run_forge_installer_sync(
    java_path: String,
    installer_path: String,
    minecraft_dir: String,
    timeout_ms: Option<u32>,
) -> ForgeInstallerRunResult {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let timeout = Duration::from_millis(timeout_ms.unwrap_or(600_000) as u64);

    let mut command = std::process::Command::new(&java_path);
    command
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .arg(&minecraft_dir)
        .current_dir(&minecraft_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return ForgeInstallerRunResult {
                success: false,
                timeout: false,
                exit_code: None,
                error: Some(format!("Failed to spawn installer: {error}")),
            };
        }
    };

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return ForgeInstallerRunResult {
                    success: status.success(),
                    timeout: false,
                    exit_code: status.code(),
                    error: if status.success() {
                        None
                    } else {
                        Some(format!("Installer exited with code {}", status.code().unwrap_or(-1)))
                    },
                };
            }
            Ok(None) => {
                if started.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return ForgeInstallerRunResult {
                        success: false,
                        timeout: true,
                        exit_code: None,
                        error: Some("Installer timeout".to_string()),
                    };
                }
                thread::sleep(Duration::from_millis(200));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return ForgeInstallerRunResult {
                    success: false,
                    timeout: false,
                    exit_code: None,
                    error: Some(format!("Installer wait failed: {error}")),
                };
            }
        }
    }
}

#[napi]
pub async fn run_forge_installer(
    java_path: String,
    installer_path: String,
    minecraft_dir: String,
    timeout_ms: Option<u32>,
) -> napi::Result<ForgeInstallerRunResult> {
    tokio::task::spawn_blocking(move || {
        run_forge_installer_sync(java_path, installer_path, minecraft_dir, timeout_ms)
    })
    .await
    .map_err(|error| napi::Error::from_reason(format!("Forge installer worker failed: {error}")))
}

/// Install Forge/NeoForge
#[napi]
pub async fn install_forge(
    mc_version: String,
    loader_type: ForgeLoaderType,
    loader_version: Option<String>, // "latest", "recommended", or specific version
    game_dir: String,
    _java_path: Option<String>,
) -> napi::Result<String> { // Returns path to version.json
    
    let minecraft_dir = PathBuf::from(&game_dir);
    let libraries_dir = minecraft_dir.join("libraries");
    let temp_dir = minecraft_dir.join("temp");

    // 1. Resolve Version
    let forge_version = resolve_forge_version(&mc_version, &loader_type, loader_version).await?;
    println!("[Rust] Resolved {:?} version: {}", loader_type, forge_version);

    // 2. Determine paths
    let version_id = match loader_type {
        ForgeLoaderType::NeoForge => format!("neoforge-{}", forge_version),
        ForgeLoaderType::Forge => format!("{}-forge-{}", mc_version, forge_version),
    };

    let version_dir = minecraft_dir.join("versions").join(&version_id);
    let version_json_path = version_dir.join(format!("{}.json", version_id));

    // CRITICAL FIX: Verify not just version.json, but also the main client JARs
    // 1. forge-1.20.1-47.4.13-client.jar (or similar) inside libraries/.../forge/...
    // 2. client-1.20.1-...-srg.jar (or similar) inside libraries/.../client/... (extracted from data)
    
    let mut is_intact = version_json_path.exists();
    
    if is_intact {
         // Perform a quick shallow check of key libraries
         // We construct the path for the main Forge client jar manually as a heuristic
         // libraries/net/minecraftforge/forge/VERSION/forge-VERSION-client.jar
         
         let forge_group = match loader_type {
             ForgeLoaderType::NeoForge => "net/neoforged/neoforge",
             ForgeLoaderType::Forge => "net/minecraftforge/forge",
         };
         
         let main_jar_name = match loader_type {
             ForgeLoaderType::NeoForge => format!("neoforge-{}-client.jar", forge_version),
             ForgeLoaderType::Forge => format!("forge-{}-client.jar", make_forge_full_version(&mc_version, &forge_version)),
         };
         
         let full_ver = match loader_type {
              ForgeLoaderType::NeoForge => forge_version.clone(),
              ForgeLoaderType::Forge => make_forge_full_version(&mc_version, &forge_version),
         };

         let main_jar_path = libraries_dir.join(forge_group).join(&full_ver).join(&main_jar_name);
         
         if !main_jar_path.exists() {
             // Try standard jar (Modern Forge often doesn't use -client classifier for the main jar in the lib path)
             // e.g. forge-1.20.1-47.4.0.jar instead of forge-1.20.1-47.4.0-client.jar
             let standard_jar_name = match loader_type {
                 ForgeLoaderType::NeoForge => format!("neoforge-{}.jar", forge_version),
                 ForgeLoaderType::Forge => format!("forge-{}.jar", make_forge_full_version(&mc_version, &forge_version)),
             };
             let standard_jar_path = libraries_dir.join(forge_group).join(&full_ver).join(&standard_jar_name);

             if !standard_jar_path.exists() {
                  println!("[Rust] Main jar missing (checked {:?} and {:?}). Forcing reinstall.", main_jar_path, standard_jar_path);
                  is_intact = false;
             } else {
                 println!("[Rust] Found standard jar: {:?}", standard_jar_path);
             }
         }
    }

    if is_intact {
        println!("[Rust] Forge/NeoForge version {} is already installed.", version_id);
        return Ok(version_json_path.to_string_lossy().to_string());
    }



    // 3. Download Installer
    let installer_url = match loader_type {
        ForgeLoaderType::NeoForge => format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
            forge_version, forge_version
        ),
        ForgeLoaderType::Forge => format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
            make_forge_full_version(&mc_version, &forge_version), make_forge_full_version(&mc_version, &forge_version)
        ),
    };

    let installer_path = temp_dir.join(format!("{:?}-installer-{}.jar", loader_type, forge_version));
    fs::create_dir_all(&temp_dir).map_err(|e| napi::Error::from_reason(e.to_string()))?;

    println!("[Rust] Downloading installer from: {}", installer_url);
    let download_result = download_file(
       installer_url.clone(), 
       installer_path.to_string_lossy().to_string(), 
       None, 
       None
    ).await?;
    
    if !download_result.success {
       return Err(napi::Error::from_reason(format!("Failed to download installer: {:?}", download_result.error)));
    }

    // 4. Extract and Install
    println!("[Rust] Extracting installer...");
    process_installer(&installer_path, &libraries_dir, &version_dir, &version_id, &loader_type).await?;

    Ok(version_json_path.to_string_lossy().to_string())
}

async fn resolve_forge_version(
    mc_version: &str,
    loader_type: &ForgeLoaderType,
    requested_version: Option<String>,
) -> napi::Result<String> {
    // If specific version provided and not "latest"/"recommended", use it
    if let Some(v) = &requested_version {
        if v != "latest" && v != "recommended" {
            // Handle format "1.20.1-47.4.0" (MC version + Forge version)
            // Extract just the forge version part if it contains MC version prefix
            if v.starts_with(&format!("{}-", mc_version)) {
                let forge_part = &v[(mc_version.len() + 1)..];
                println!("[Rust] Extracted Forge version '{}' from '{}'", forge_part, v);
                return Ok(forge_part.to_string());
            }
            // If it's just a forge version (e.g. "47.4.0"), use it directly
            if !v.starts_with("1.") {
                return Ok(v.clone());
            }
            // If it starts with "1." but doesn't match MC version prefix, it might be wrong
            println!("[Rust] Warning: Forge version '{}' looks like MC version, fetching latest", v);
        }
    }

    let client = get_client();

    match loader_type {
        ForgeLoaderType::NeoForge => {
            let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
            let res = client.get(url).send().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
            let xml = res.text().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
            
            // Simple Regex Parsing for NeoForge
            // NeoForge versioning: 21.0.0 (for MC 1.21), 47.1.0 (for MC 1.20.1)
            let re = Regex::new(r"<version>(.*?)</version>").unwrap();
            let mut versions: Vec<String> = re.captures_iter(&xml)
                .map(|c| c[1].to_string())
                .filter(|v| {
                     // Filter logic
                     if mc_version == "1.20.1" { v.starts_with("47.") || v.starts_with("20.1") }
                     else if mc_version == "1.21" { v.starts_with("21.") }
                     else if mc_version == "1.21.1" { v.starts_with("21.1") }
                     else {
                         let short = mc_version.split('.').skip(1).collect::<Vec<&str>>().join(".");
                         v.starts_with(&short)
                     }
                })
                .collect();
            
            // Reverse to get newest first (assuming xml is sorted or we sort)
            // Maven metadata is usually sorted, but let's trust the logic
            // Ideally we should semver sort, but string reverse works for simple cases often
            versions.reverse(); 

            versions.first().cloned().ok_or_else(|| napi::Error::from_reason(format!("No NeoForge version found for {}", mc_version)))
        },
        ForgeLoaderType::Forge => {
            let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
            let res = client.get(url).send().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
            let json: serde_json::Value = res.json().await.map_err(|e| napi::Error::from_reason(e.to_string()))?;
            
            let promos = json.get("promos").ok_or_else(|| napi::Error::from_reason("Invalid promotions json"))?;
            
            let key = if requested_version.as_deref() == Some("recommended") {
                format!("{}-recommended", mc_version)
            } else {
                format!("{}-latest", mc_version)
            };

            let version = promos.get(&key)
                .or_else(|| promos.get(format!("{}-latest", mc_version).as_str()))
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());

            version.ok_or_else(|| napi::Error::from_reason(format!("No Forge version found for {}", mc_version)))
        }
    }
}

fn make_forge_full_version(mc_version: &str, forge_version: &str) -> String {
    if forge_version.contains(mc_version) {
        forge_version.to_string()
    } else {
        format!("{}-{}", mc_version, forge_version)
    }
}

async fn process_installer(
    installer_path: &Path,
    libraries_dir: &Path,
    version_dir: &Path,
    version_id: &str,
    _loader_type: &ForgeLoaderType,
) -> napi::Result<()> {
    
    let file = fs::File::open(installer_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| napi::Error::from_reason(e.to_string()))?;

    // 1. Find install_profile.json or version.json
    let mut install_profile_json: Option<serde_json::Value> = None;
    let mut version_json: Option<serde_json::Value> = None;

    if let Ok(mut file) = archive.by_name("install_profile.json") {
        let mut content = String::new();
        file.read_to_string(&mut content).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        install_profile_json = serde_json::from_str(&content).ok();
    }

    if let Ok(mut file) = archive.by_name("version.json") {
        let mut content = String::new();
        file.read_to_string(&mut content).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        version_json = serde_json::from_str(&content).ok();
    }

    if version_json.is_none() {
        if let Some(ref profile) = install_profile_json {
             if let Some(v_info) = profile.get("versionInfo") {
                 version_json = Some(v_info.clone());
             }
        }
    }

    let version_json = version_json.ok_or_else(|| napi::Error::from_reason("Could not find version.json info"))?;

    // 2. Write version.json to versions directory
    fs::create_dir_all(version_dir).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    let version_json_path = version_dir.join(format!("{}.json", version_id));
    
    // We might need to modify ID
    let mut final_version_json = version_json.clone();
    if let Some(obj) = final_version_json.as_object_mut() {
        obj.insert("id".to_string(), serde_json::Value::String(version_id.to_string()));
    }
    
    fs::write(&version_json_path, serde_json::to_string_pretty(&final_version_json).map_err(|e| napi::Error::from_reason(e.to_string()))?).map_err(|e| napi::Error::from_reason(e.to_string()))?;

    // 3. Extract maven libraries
    println!("[Rust] Scanning zip content...");
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let name = file.name().to_string();

        if name.starts_with("data/") {
             println!("[Rust] Found data entry: {}", name);
        }

        if name.starts_with("maven/") && file.is_file() {
            // ... (existing extraction logic)
            let rel_path = name.trim_start_matches("maven/");
            let target_path = libraries_dir.join(rel_path);
            
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| napi::Error::from_reason(e.to_string()))?;
            }

            let mut out = fs::File::create(&target_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
            std::io::copy(&mut file, &mut out).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        }
    }
    
    // 4. Handle "data" files (Modern Forge)
    if let Some(profile) = install_profile_json {
        if let Some(data) = profile.get("data").and_then(|d| d.as_object()) {
            println!("[Rust] Processing install_profile data keys: {:?}", data.keys());
            
            for (key, value) in data {
                println!("[Rust] Data Key: {}, Value: {:?}", key, value);
                let client_ref = value.get("client").and_then(|v| v.as_str());
                if let Some(ref_path) = client_ref {
                    if ref_path.starts_with("/") {
                        // It's a path inside the jar, e.g. /data/client.jar
                        let inner_path = ref_path.trim_start_matches("/");
                        
                        // We need to find which library needs this file
                        // by checking certain heuristics against version_json libraries
                        if let Some(libs) = final_version_json.get("libraries").and_then(|l| l.as_array()) {
                             for lib in libs {
                                 // Skip if has download
                                 let has_download = lib.get("downloads")
                                     .and_then(|d| d.get("artifact"))
                                     .and_then(|a| a.get("url"))
                                     .is_some() || lib.get("url").is_some();
                                 
                                 if has_download { continue; }

                                 let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                 let parts: Vec<&str> = name.split(':').collect();
                                 if parts.len() < 3 { continue; }

                                 let group = parts[0].replace('.', "/");
                                 let artifact = parts[1];
                                 let version = parts[2];
                                 let classifier = if parts.len() > 3 { format!("-{}", parts[3]) } else { "".to_string() };

                                 // Matching Heuristics
                                 let lower_key = key.to_lowercase();
                                 let lower_classifier = classifier.to_lowercase();
                                 let mut is_match = false;

                                 if lower_key == "patched" && (lower_classifier.contains("srg") || artifact == "client") { is_match = true; }
                                 if lower_key == "client_extra" && lower_classifier.contains("extra") { is_match = true; }
                                 if lower_key == "slim" && lower_classifier.contains("slim") { is_match = true; }
                                 if lower_key.contains(&artifact.to_lowercase()) { is_match = true; }
                                 
                                 // Broad fallback: if lib name has "client" and no download, assume it's related
                                 if !is_match && !has_download && name.contains("client") { is_match = true; }

                                 if is_match {
                                     // Extract!
                                     // Check for .lzma variant if plain path missing
                                     let mut try_names = vec![inner_path.to_string()];
                                     if inner_path.ends_with(".jar") {
                                         try_names.push(inner_path.replace(".jar", ".lzma"));
                                     }
                                     
                                     for try_name in try_names {
                                         if let Ok(mut info_file) = archive.by_name(&try_name) {
                                             let dest_filename = format!("{}-{}{}.jar", artifact, version, classifier);
                                         let dest_path = libraries_dir.join(&group).join(artifact).join(version).join(&dest_filename);
                                         
                                         if let Some(parent) = dest_path.parent() {
                                             fs::create_dir_all(parent).map_err(|e| napi::Error::from_reason(e.to_string()))?;
                                         }
                                         
                                         if !dest_path.exists() {
                                             let mut out_file = fs::File::create(&dest_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
                                             
                                             if try_name.ends_with(".lzma") {
                                                 println!("[Rust] Decompressing mapped LZMA: {} -> {:?}", inner_path, dest_path);
                                                 let mut reader = std::io::BufReader::new(info_file);
                                                 lzma_rs::lzma_decompress(&mut reader, &mut out_file).map_err(|e| napi::Error::from_reason(format!("LZMA Error: {}", e)))?;
                                             } else {
                                                 std::io::copy(&mut info_file, &mut out_file).map_err(|e| napi::Error::from_reason(e.to_string()))?;
                                                 println!("[Rust] Extracted data file {} -> {:?}", key, dest_path);
                                             }
                                         }
                                         // Don't break, might match multiple
                                         break; 
                                     }
                                 }
                             }
                        }
                    }
                }
            }
        }
    }
    
    }

    // 5. Fallback: Scan for any `data/*.jar` or `data/*.lzma` in zip that matches a library name
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let name = file.name().to_string();
        
        if name.starts_with("data/") && (name.ends_with(".jar") || name.ends_with(".lzma")) {
             println!("[Rust] DEBUG: Scanning data file: {}", name);
             // Try to find a matching library
             if let Some(libs) = final_version_json.get("libraries").and_then(|l| l.as_array()) {
                 for lib in libs {
                     // Same checks
                     let has_download = lib.get("downloads")
                         .and_then(|d| d.get("artifact"))
                         .and_then(|a| a.get("url"))
                         .is_some() || lib.get("url").is_some();
                     if has_download { continue; }

                     let lib_name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");
                     let parts: Vec<&str> = lib_name.split(':').collect();
                     if parts.len() < 3 { continue; }
                     
                     let artifact = parts[1];
                     
                     // If filename contains artifact name OR classifier
                     let simple_filename = Path::new(&name).file_name().unwrap_or_default().to_string_lossy();
                     
                     let mut classifier_match = false;
                     let mut target_classifier = "".to_string();

                     if parts.len() > 3 {
                         let classifier = parts[3];
                         if simple_filename.to_lowercase().contains(&classifier.to_lowercase()) {
                             classifier_match = true;
                             target_classifier = classifier.to_string();
                         }
                     }

                     // Special Handling for "client" artifact (minecraft)
                     // Expecting: client-1.20.1-20230612.114412-srg.jar, -extra.jar
                     if artifact == "client" {
                         if simple_filename.contains("srg") || name.contains("srg") {
                             target_classifier = "srg".to_string();
                             classifier_match = true;
                         } else if simple_filename.contains("extra") || name.contains("extra") {
                             target_classifier = "extra".to_string();
                             classifier_match = true;
                         } else if simple_filename == "client.jar" {
                             // This usually maps to the main client jar without classifier or specific one? 
                             // Usually "client" artifact in 1.20.1 needs srg/extra. 
                             // If exact match needed:
                             classifier_match = true; 
                         }
                     }

                     if simple_filename.to_lowercase().contains(&artifact.to_lowercase()) || 
                        classifier_match ||
                        (artifact == "client" && classifier_match) {
                            
                         let group = parts[0].replace('.', "/");
                         let version = parts[2];
                         // Use detected classifier if available, else from lib def
                         let classifier_suffix = if !target_classifier.is_empty() { 
                             format!("-{}", target_classifier) 
                         } else if parts.len() > 3 { 
                             format!("-{}", parts[3]) 
                         } else { 
                             "".to_string() 
                         };
                         
                         let dest_filename = format!("{}-{}{}.jar", artifact, version, classifier_suffix);
                         
                         // Wait, we are already inside the block where we have matched.
                         let target_dest_path = libraries_dir.join(&group).join(artifact).join(version).join(&dest_filename);
                         println!("[Rust] DEBUG: Target path for {}: {:?}", name, target_dest_path);
                         
                         if let Some(parent) = target_dest_path.parent() {
                             fs::create_dir_all(parent).map_err(|e| napi::Error::from_reason(e.to_string()))?;
                         }

                         if !target_dest_path.exists() {
                             // Check for LZMA
                             // We are using `file` variable from the outer loop?
                             // No, we are in the `install_profile` loop which uses `archive.by_name(inner_path)`
                             // BUT wait, this loop (lines 374+) is the FALLBACK loop which uses `file` from `archive.by_index(i)`.
                             
                             let is_lzma = name.ends_with(".lzma");
                             let mut out_file = fs::File::create(&target_dest_path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
                             
                             if is_lzma {
                                 println!("[Rust] Decompressing LZMA: {} -> {:?}", name, target_dest_path);
                                 let mut reader = std::io::BufReader::new(file);
                                 lzma_rs::lzma_decompress(&mut reader, &mut out_file).map_err(|e| napi::Error::from_reason(format!("LZMA Error: {}", e)))?;
                             } else {
                                 println!("[Rust] Extracting: {} -> {:?}", name, target_dest_path);
                                 std::io::copy(&mut file, &mut out_file).map_err(|e| napi::Error::from_reason(e.to_string()))?;
                             }
                         }
                         
                         break;
                     }
                 }
             }
        }
    }

    Ok(())
}
