//! Minecraft Launcher Module
//!
//! Handles:
//! - Version manifest fetching
//! - Game asset/library downloads
//! - Launch argument building
//! - Game process spawning

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use crate::get_client;
use std::fs;


// ========================================
// Version Manifest Types
// ========================================

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionInfo>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct VersionInfo {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    pub sha1: Option<String>,
}

// ========================================
// Version Detail Types
// ========================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionDetail {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    #[serde(rename = "minecraftArguments")]
    pub minecraft_arguments: Option<String>,
    pub arguments: Option<Arguments>,
    pub libraries: Vec<Library>,
    pub downloads: Option<Downloads>,
    #[serde(rename = "assetIndex")]
    pub asset_index: Option<AssetIndex>,
    pub assets: Option<String>,
    #[serde(rename = "javaVersion")]
    pub java_version: Option<JavaVersionReq>,
    #[serde(rename = "inheritsFrom")]
    pub inherits_from: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Arguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub url: Option<String>,
    pub rules: Option<Vec<Rule>>,
    pub natives: Option<HashMap<String, String>>,
    pub extract: Option<ExtractRules>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LibraryDownloads {
    pub artifact: Option<Artifact>,
    pub classifiers: Option<HashMap<String, Artifact>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Artifact {
    pub path: Option<String>,
    pub sha1: Option<String>,
    pub size: Option<i64>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Rule {
    pub action: String,
    pub os: Option<OsRule>,
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OsRule {
    pub name: Option<String>,
    pub version: Option<String>,
    pub arch: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExtractRules {
    pub exclude: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Downloads {
    pub client: Option<Artifact>,
    pub server: Option<Artifact>,
    pub client_mappings: Option<Artifact>,
    pub server_mappings: Option<Artifact>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetIndex {
    pub id: String,
    pub sha1: String,
    pub size: i64,
    #[serde(rename = "totalSize")]
    pub total_size: Option<i64>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JavaVersionReq {
    pub component: String,
    #[serde(rename = "majorVersion")]
    pub major_version: u32,
}

// ========================================
// Asset Index Types
// ========================================

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetIndexData {
    pub objects: HashMap<String, AssetObject>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AssetObject {
    pub hash: String,
    pub size: i64,
}

// ========================================
// Launch Options
// ========================================

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct LaunchOptions {
    pub instance_id: String,
    pub version_id: String,
    pub java_path: String,
    pub game_dir: String,
    pub assets_dir: String,
    pub libraries_dir: String,
    pub natives_dir: String,
    pub version_jar_path: String,
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub user_type: String,
    pub ram_min_mb: Option<u32>,
    pub ram_max_mb: Option<u32>,
    pub extra_jvm_args: Option<Vec<String>>,
    pub extra_game_args: Option<Vec<String>>,
    pub window_width: Option<u32>,
    pub window_height: Option<u32>,
    pub fullscreen: Option<bool>,
    pub server_address: Option<String>,
    pub server_port: Option<u16>,
    pub asset_index: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct LaunchResult {
    pub success: bool,
    pub pid: Option<u32>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct DownloadItem {
    pub url: String,
    pub path: String,
    pub sha1: Option<String>,
    pub size: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct PrepareResult {
    pub success: bool,
    pub downloads_needed: Vec<DownloadItem>,
    pub classpath: Vec<String>,
    pub main_class: String,
    pub game_args: Vec<String>,
    pub jvm_args: Vec<String>,
    pub error: Option<String>,
}

// ========================================
// API Functions
// ========================================

const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_URL: &str = "https://resources.download.minecraft.net";

/// Fetch the Minecraft version manifest
#[napi]
pub async fn fetch_version_manifest() -> napi::Result<VersionManifest> {
    let client = get_client();
    
    let res = client.get(VERSION_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;
    
    let manifest: VersionManifest = res.json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {}", e)))?;
    
    Ok(manifest)
}

/// Fetch version detail JSON
#[napi]
pub async fn fetch_version_detail(url: String) -> napi::Result<String> {
    let client = get_client();
    
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;
    
    let text = res.text()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Read failed: {}", e)))?;
    
    Ok(text)
}

/// Prepare game launch - returns what needs to be downloaded and launch args
#[napi]
pub async fn prepare_launch(
    version_json: String,
    options: LaunchOptions,
) -> napi::Result<PrepareResult> {
    let mut version: VersionDetail = serde_json::from_str(&version_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid version JSON: {}", e)))?;
    
    // Resolve inheritance (Forge/NeoForge)
    if version.inherits_from.is_some() {
        println!("[Rust] Resolving inheritance for version {}", version.id);
        version = resolve_inheritance(version, &options.game_dir).map_err(|e| napi::Error::from_reason(e.to_string()))?;
    }
    
    let mut downloads_needed = Vec::new();
    let mut classpath = Vec::new();
    
    // Check client jar
    if let Some(ref downloads) = version.downloads {
        if let Some(ref client) = downloads.client {
            let client_path = PathBuf::from(&options.version_jar_path);
            if !client_path.exists() || !verify_file(&client_path, client.sha1.as_deref()) {
                downloads_needed.push(DownloadItem {
                    url: client.url.clone(),
                    path: options.version_jar_path.clone(),
                    sha1: client.sha1.clone(),
                    size: client.size,
                });
            }
            classpath.push(options.version_jar_path.clone());
        }
    }
    
    // Process libraries
    for lib in &version.libraries {
        if !should_use_library(lib) {
            continue;
        }
        
        if let Some(ref downloads) = lib.downloads {
            // Main artifact
            if let Some(ref artifact) = downloads.artifact {
                if let Some(ref path) = artifact.path {
                    let lib_path = PathBuf::from(&options.libraries_dir).join(path);
                    let lib_path_str = lib_path.to_string_lossy().to_string();
                    
                    if !lib_path.exists() || !verify_file(&lib_path, artifact.sha1.as_deref()) {
                        downloads_needed.push(DownloadItem {
                            url: artifact.url.clone(),
                            path: lib_path_str.clone(),
                            sha1: artifact.sha1.clone(),
                            size: artifact.size,
                        });
                    }
                    classpath.push(lib_path_str);
                }
            }
            
            // Native classifiers
            if let Some(ref natives) = lib.natives {
                let os_key = get_os_key();
                if let Some(classifier_key) = natives.get(&os_key) {
                    let classifier_key = classifier_key
                        .replace("${arch}", &get_arch_bits());
                    
                    if let Some(ref classifiers) = downloads.classifiers {
                        if let Some(native_artifact) = classifiers.get(&classifier_key) {
                            if let Some(ref path) = native_artifact.path {
                                let native_path = PathBuf::from(&options.libraries_dir).join(path);
                                let native_path_str = native_path.to_string_lossy().to_string();
                                
                                if !native_path.exists() || !verify_file(&native_path, native_artifact.sha1.as_deref()) {
                                    downloads_needed.push(DownloadItem {
                                        url: native_artifact.url.clone(),
                                        path: native_path_str,
                                        sha1: native_artifact.sha1.clone(),
                                        size: native_artifact.size,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } else if let Some(ref url) = lib.url {
            // Maven-style library without explicit downloads
            let path = maven_to_path(&lib.name);
            let lib_path = PathBuf::from(&options.libraries_dir).join(&path);
            let lib_path_str = lib_path.to_string_lossy().to_string();
            let full_url = format!("{}/{}", url.trim_end_matches('/'), path);
            
            if !lib_path.exists() {
                downloads_needed.push(DownloadItem {
                    url: full_url,
                    path: lib_path_str.clone(),
                    sha1: None,
                    size: None,
                });
            }
            classpath.push(lib_path_str);
        } else {
            // Library without explicit download but valid name (assume local from installer)
            let path = maven_to_path(&lib.name);
            let lib_path = PathBuf::from(&options.libraries_dir).join(&path);
            let lib_path_str = lib_path.to_string_lossy().to_string();
            
            // Add to classpath (Java will ignore if missing, but it should be there)
            classpath.push(lib_path_str);
        }
    }
    
    // Build JVM arguments
    let jvm_args = build_jvm_args(&version, &options, &classpath);
    
    // Build game arguments
    let game_args = build_game_args(&version, &options);
    
    Ok(PrepareResult {
        success: true,
        downloads_needed,
        classpath,
        main_class: version.main_class.clone(),
        game_args,
        jvm_args,
        error: None,
    })
}

/// Launch the game process
#[napi]
pub fn launch_game(
    java_path: String,
    jvm_args: Vec<String>,
    main_class: String,
    game_args: Vec<String>,
    game_dir: String,
) -> napi::Result<LaunchResult> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    
    #[cfg(windows)]
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    
    let mut cmd = Command::new(&java_path);
    
    cmd.current_dir(&game_dir)
        .args(&jvm_args)
        .arg(&main_class)
        .args(&game_args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    
    // Set environment variables
    #[cfg(windows)]
    cmd.env("APPDATA", std::env::var("APPDATA").unwrap_or_default());
    
    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            Ok(LaunchResult {
                success: true,
                pid: Some(pid),
                error: None,
            })
        }
        Err(e) => {
            Ok(LaunchResult {
                success: false,
                pid: None,
                error: Some(format!("Failed to launch: {}", e)),
            })
        }
    }
}

/// Get asset index and return download items for missing assets
#[napi]
pub async fn get_asset_downloads(
    asset_index_url: String,
    assets_dir: String,
) -> napi::Result<Vec<DownloadItem>> {
    let client = get_client();
    
    let res = client.get(&asset_index_url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;
    
    let index: AssetIndexData = res.json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {}", e)))?;
    
    let mut downloads = Vec::new();
    let objects_dir = PathBuf::from(&assets_dir).join("objects");
    
    for (_name, obj) in index.objects {
        let hash_prefix = &obj.hash[..2];
        let asset_path = objects_dir.join(hash_prefix).join(&obj.hash);
        
        if !asset_path.exists() {
            downloads.push(DownloadItem {
                url: format!("{}/{}/{}", RESOURCES_URL, hash_prefix, obj.hash),
                path: asset_path.to_string_lossy().to_string(),
                sha1: Some(obj.hash.clone()),
                size: Some(obj.size),
            });
        }
    }
    
    Ok(downloads)
}

fn resolve_inheritance(mut version: VersionDetail, game_dir: &str) -> Result<VersionDetail, String> {
    if let Some(parent_id) = &version.inherits_from {
        let parent_path = PathBuf::from(game_dir)
            .join("versions")
            .join(parent_id)
            .join(format!("{}.json", parent_id));
            
        if parent_path.exists() {
             let content = fs::read_to_string(&parent_path).map_err(|e| e.to_string())?;
             let parent: VersionDetail = serde_json::from_str(&content).map_err(|e| e.to_string())?;
             
             println!("[Rust] Merging parent version: {}", parent.id);

             // 1. Merge Libraries (Child first to override Parent)
             // Using Child's libraries first ensures they are earlier in the classpath
             let mut new_libs = version.libraries;
             new_libs.extend(parent.libraries);
             version.libraries = new_libs;
             
             // 2. Merge Arguments
             // Initialize with parent arguments if child has none, or merge
             if let Some(parent_args) = parent.arguments {
                 if let Some(ref mut child_args) = version.arguments {
                     // Merge Game args
                     if let Some(parent_game) = parent_args.game {
                         let child_game = child_args.game.get_or_insert(Vec::new());
                         // Prepend parent args? Or Append?
                         // Usually order matters. Vanilla args + Forge args.
                         // Insert parent args at the beginning.
                         let mut merged = parent_game.clone();
                         merged.extend(child_game.drain(..));
                         *child_game = merged;
                     }
                     
                     // Merge JVM args
                     if let Some(parent_jvm) = parent_args.jvm {
                         let child_jvm = child_args.jvm.get_or_insert(Vec::new());
                         let mut merged = parent_jvm.clone();
                         merged.extend(child_jvm.drain(..));
                         *child_jvm = merged;
                     }
                 } else {
                     version.arguments = Some(parent_args);
                 }
             }
             
             // 3. Asset Index (Inherit if missing)
             if version.asset_index.is_none() {
                 version.asset_index = parent.asset_index;
             }
             if version.assets.is_none() {
                 version.assets = parent.assets;
             }
             
             // 4. Downloads (Inherit client jar if missing)
             // Typically Forge versions don't have a "client" download in their JSON, 
             // but they might use the one from the parent (Vanilla) to patch it?
             // Actually Forge usually patches the vanilla jar on the classpath, 
             // so we need the vanilla jar ON THE CLASSPATH or accessible.
             // If we inherit downloads, we ensure vanilla jar is checked/downloaded.
             if version.downloads.is_none() {
                 version.downloads = parent.downloads;
             } else {
                 if let Some(ref mut child_dl) = version.downloads {
                     if child_dl.client.is_none() {
                         if let Some(parent_dl) = parent.downloads {
                             child_dl.client = parent_dl.client;
                         }
                     }
                 }
             }

             // 5. Minecraft Arguments (Legacy string)
             if let Some(parent_mc_args) = parent.minecraft_arguments {
                 if let Some(ref mut child_mc_args) = version.minecraft_arguments {
                     *child_mc_args = format!("{} {}", parent_mc_args, child_mc_args);
                 } else {
                     version.minecraft_arguments = Some(parent_mc_args);
                 }
             }
        }
    }
    Ok(version)
}

// ========================================
// Helper Functions
// ========================================

fn should_use_library(lib: &Library) -> bool {
    if let Some(ref rules) = lib.rules {
        let mut dominated_action = "disallow";
        
        for rule in rules {
            let mut matches = true;
            
            if let Some(ref os) = rule.os {
                if let Some(ref name) = os.name {
                    let current_os = get_os_name();
                    if name != &current_os {
                        matches = false;
                    }
                }
                if let Some(ref arch) = os.arch {
                    let current_arch = get_arch();
                    if arch != &current_arch {
                        matches = false;
                    }
                }
            }
            
            if matches {
                dominated_action = &rule.action;
            }
        }
        
        return dominated_action == "allow";
    }
    
    true
}

fn get_os_name() -> String {
    if cfg!(windows) {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "osx".to_string()
    } else {
        "linux".to_string()
    }
}

fn get_os_key() -> String {
    if cfg!(windows) {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "osx".to_string()
    } else {
        "linux".to_string()
    }
}

fn get_arch() -> String {
    if cfg!(target_arch = "x86_64") {
        "x64".to_string()
    } else if cfg!(target_arch = "x86") {
        "x86".to_string()
    } else if cfg!(target_arch = "aarch64") {
        "arm64".to_string()
    } else {
        "unknown".to_string()
    }
}

fn get_arch_bits() -> String {
    if cfg!(target_arch = "x86_64") || cfg!(target_arch = "aarch64") {
        "64".to_string()
    } else {
        "32".to_string()
    }
}

fn maven_to_path(name: &str) -> String {
    // Convert maven coordinate to path: group:artifact:version -> group/artifact/version/artifact-version.jar
    let parts: Vec<&str> = name.split(':').collect();
    if parts.len() >= 3 {
        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        let classifier = if parts.len() > 3 { Some(parts[3]) } else { None };
        
        let filename = if let Some(c) = classifier {
            format!("{}-{}-{}.jar", artifact, version, c)
        } else {
            format!("{}-{}.jar", artifact, version)
        };
        
        format!("{}/{}/{}/{}", group, artifact, version, filename)
    } else {
        name.to_string()
    }
}

fn verify_file(path: &PathBuf, expected_sha1: Option<&str>) -> bool {
    if !path.exists() {
        return false;
    }
    
    if let Some(expected) = expected_sha1 {
        if let Ok(data) = std::fs::read(path) {
            use sha1::{Sha1, Digest};
            let mut hasher = Sha1::new();
            hasher.update(&data);
            let actual = hex::encode(hasher.finalize());
            return actual.to_lowercase() == expected.to_lowercase();
        }
        return false;
    }
    
    true
}

fn build_jvm_args(version: &VersionDetail, options: &LaunchOptions, classpath: &[String]) -> Vec<String> {
    let mut args = Vec::new();

    // Memory settings
    let min_ram = options.ram_min_mb.unwrap_or(512);
    let max_ram = options.ram_max_mb.unwrap_or(2048);
    args.push(format!("-Xms{}M", min_ram));
    args.push(format!("-Xmx{}M", max_ram));

    // Natives path
    args.push(format!("-Djava.library.path={}", options.natives_dir));

    // Pre-scan: check if version JSON already includes -cp / ${classpath} in JVM args
    // Modern MC (1.13+) version JSONs include "-cp ${classpath}" in their jvm args list.
    // If present, we skip the manual -cp addition below to avoid duplicate -cp flags.
    let mut classpath_in_json = false;
    if let Some(ref arguments) = version.arguments {
        if let Some(ref jvm) = arguments.jvm {
            for arg in jvm {
                if let Some(s) = arg.as_str() {
                    if s == "${classpath}" || s == "-cp" || s == "-classpath" {
                        classpath_in_json = true;
                        break;
                    }
                }
            }
        }
    }

    // Process JVM arguments from version JSON
    if let Some(ref arguments) = version.arguments {
        if let Some(ref jvm) = arguments.jvm {
            for arg in jvm {
                if let Some(s) = arg.as_str() {
                    let processed = process_arg(s, options, classpath);
                    args.push(processed);
                } else if let Some(obj) = arg.as_object() {
                    // Conditional argument
                    if should_use_arg(obj) {
                        if let Some(value) = obj.get("value") {
                            if let Some(s) = value.as_str() {
                                args.push(process_arg(s, options, classpath));
                            } else if let Some(arr) = value.as_array() {
                                for v in arr {
                                    if let Some(s) = v.as_str() {
                                        args.push(process_arg(s, options, classpath));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Add -cp only if it was NOT already included via version JSON JVM args.
    // Legacy MC (<1.13) uses minecraftArguments string format and has no jvm args list,
    // so we must add -cp manually for those versions.
    if !classpath_in_json {
        let cp_separator = if cfg!(windows) { ";" } else { ":" };
        args.push("-cp".to_string());
        args.push(classpath.join(cp_separator));
    }

    // Extra JVM args - Append LAST to override any previous properties
    if let Some(ref extra) = options.extra_jvm_args {
        args.extend(extra.clone());
    }

    args
}

fn build_game_args(version: &VersionDetail, options: &LaunchOptions) -> Vec<String> {
    let mut args = Vec::new();
    
    // Legacy minecraft arguments
    if let Some(ref mc_args) = version.minecraft_arguments {
        let processed = process_arg(mc_args, options, &[]);
        args.extend(processed.split_whitespace().map(String::from));
    }
    
    // Modern arguments
    if let Some(ref arguments) = version.arguments {
        if let Some(ref game) = arguments.game {
            for arg in game {
                if let Some(s) = arg.as_str() {
                    args.push(process_arg(s, options, &[]));
                } else if let Some(obj) = arg.as_object() {
                    if should_use_arg(obj) {
                        if let Some(value) = obj.get("value") {
                            if let Some(s) = value.as_str() {
                                args.push(process_arg(s, options, &[]));
                            } else if let Some(arr) = value.as_array() {
                                for v in arr {
                                    if let Some(s) = v.as_str() {
                                        args.push(process_arg(s, options, &[]));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Window size
    if let Some(w) = options.window_width {
        args.push("--width".to_string());
        args.push(w.to_string());
    }
    if let Some(h) = options.window_height {
        args.push("--height".to_string());
        args.push(h.to_string());
    }
    
    // Fullscreen
    if options.fullscreen.unwrap_or(false) {
        args.push("--fullscreen".to_string());
    }
    
    // Quick play / server
    if let Some(ref server) = options.server_address {
        args.push("--server".to_string());
        args.push(server.clone());
        if let Some(port) = options.server_port {
            args.push("--port".to_string());
            args.push(port.to_string());
        }
    }
    
    // Extra game args
    if let Some(ref extra) = options.extra_game_args {
        args.extend(extra.clone());
    }
    
    args
}

fn process_arg(arg: &str, options: &LaunchOptions, classpath: &[String]) -> String {
    let cp_separator = if cfg!(windows) { ";" } else { ":" };
    let asset_index = options.asset_index.as_deref().unwrap_or(&options.version_id);
    
    arg.replace("${auth_player_name}", &options.username)
        .replace("${version_name}", &options.version_id)
        .replace("${game_directory}", &options.game_dir)
        .replace("${assets_root}", &options.assets_dir)
        .replace("${assets_index_name}", asset_index)
        .replace("${auth_uuid}", &options.uuid)
        .replace("${auth_access_token}", &options.access_token)
        .replace("${user_type}", &options.user_type)
        .replace("${version_type}", "release")
        .replace("${natives_directory}", &options.natives_dir)
        .replace("${launcher_name}", "Reality Launcher")
        .replace("${launcher_version}", "1.2.0")
        .replace("${classpath}", &classpath.join(cp_separator))
        .replace("${classpath_separator}", cp_separator)
        .replace("${library_directory}", &options.libraries_dir)
        .replace("${user_properties}", "{}")
        .replace("${quickPlayPath}", ".")
}

fn should_use_arg(obj: &serde_json::Map<String, serde_json::Value>) -> bool {
    if let Some(rules) = obj.get("rules") {
        if let Some(rules_arr) = rules.as_array() {
            for rule in rules_arr {
                if let Some(rule_obj) = rule.as_object() {
                    let action = rule_obj.get("action")
                        .and_then(|v| v.as_str())
                        .unwrap_or("allow");
                    
                    // Check OS
                    if let Some(os) = rule_obj.get("os") {
                        if let Some(os_obj) = os.as_object() {
                            if let Some(name) = os_obj.get("name").and_then(|v| v.as_str()) {
                                let current_os = get_os_name();
                                if name != current_os {
                                    if action == "allow" {
                                        return false;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Check features (demo, custom resolution, quick play, etc.)
                    if let Some(features) = rule_obj.get("features") {
                        if let Some(features_obj) = features.as_object() {
                            // Skip demo mode features
                            if features_obj.contains_key("is_demo_user") {
                                return false;
                            }
                            // Skip quick play features - we don't support quick play
                            if features_obj.contains_key("is_quick_play_singleplayer") ||
                               features_obj.contains_key("is_quick_play_multiplayer") ||
                               features_obj.contains_key("is_quick_play_realms") {
                                return false;
                            }
                            // Skip custom resolution - we don't set window size
                            if features_obj.contains_key("has_custom_resolution") {
                                return false;
                            }
                        }
                    }
                }
            }
        }
    }
    
    true
}
