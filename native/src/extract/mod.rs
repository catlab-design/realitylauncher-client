//! Archive Extraction Module
//! 
//! Handles:
//! - ZIP extraction with progress
//! - Modpack extraction (Modrinth, CurseForge)
//! - Selective extraction

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::io::Read;
use zip::ZipArchive;

/// Extraction progress
#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ExtractProgress {
    pub current: u32,
    pub total: u32,
    pub current_file: String,
    pub bytes_extracted: i64,
}

/// Extraction result
#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ExtractResult {
    pub success: bool,
    pub files_extracted: u32,
    pub error: Option<String>,
}

/// Extract a ZIP file to a directory
#[napi]
pub fn extract_zip(
    zip_path: String,
    dest_path: String,
    strip_prefix: Option<String>,
) -> napi::Result<ExtractResult> {
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open zip: {}", e)))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| napi::Error::from_reason(format!("Invalid zip file: {}", e)))?;

    let dest = PathBuf::from(&dest_path);
    std::fs::create_dir_all(&dest)?;

    let total = archive.len();
    let mut extracted = 0u32;

    for i in 0..total {
        let mut file = archive.by_index(i)
            .map_err(|e| napi::Error::from_reason(format!("Failed to read entry: {}", e)))?;

        let mut outpath = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };

        // Strip prefix if specified
        if let Some(ref prefix) = strip_prefix {
            if let Ok(stripped) = outpath.strip_prefix(prefix) {
                outpath = stripped.to_path_buf();
            }
        }

        let outpath = dest.join(outpath);

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                if !parent.exists() {
                    std::fs::create_dir_all(parent)?;
                }
            }

            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }

        // Set permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                std::fs::set_permissions(&outpath, std::fs::Permissions::from_mode(mode)).ok();
            }
        }

        extracted += 1;
    }

    Ok(ExtractResult {
        success: true,
        files_extracted: extracted,
        error: None,
    })
}

#[napi]
pub async fn extract_zip_async(
    zip_path: String,
    dest_path: String,
    strip_prefix: Option<String>,
) -> napi::Result<ExtractResult> {
    tokio::task::spawn_blocking(move || extract_zip(zip_path, dest_path, strip_prefix))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Extract worker failed: {err}")))?
}

/// Extract specific files from a ZIP
#[napi]
pub fn extract_files_from_zip(
    zip_path: String,
    dest_path: String,
    files: Vec<String>,
) -> napi::Result<ExtractResult> {
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open zip: {}", e)))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| napi::Error::from_reason(format!("Invalid zip file: {}", e)))?;

    let dest = PathBuf::from(&dest_path);
    std::fs::create_dir_all(&dest)?;

    let mut extracted = 0u32;

    for filename in &files {
        if let Ok(mut file) = archive.by_name(filename) {
            let outpath = dest.join(filename);

            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
            extracted += 1;
        }
    }

    Ok(ExtractResult {
        success: true,
        files_extracted: extracted,
        error: None,
    })
}

/// List files in a ZIP archive
#[napi]
pub fn list_zip_contents(zip_path: String) -> napi::Result<Vec<String>> {
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open zip: {}", e)))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| napi::Error::from_reason(format!("Invalid zip file: {}", e)))?;

    let mut files = Vec::new();
    for i in 0..archive.len() {
        if let Ok(f) = archive.by_index(i) {
            if let Some(p) = f.enclosed_name() {
                files.push(p.to_string_lossy().to_string());
            }
        }
    }

    Ok(files)
}

/// Read a file from inside a ZIP without extracting
#[napi]
pub fn read_file_from_zip(zip_path: String, file_path: String) -> napi::Result<Option<String>> {
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open zip: {}", e)))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| napi::Error::from_reason(format!("Invalid zip file: {}", e)))?;

    let result = match archive.by_name(&file_path) {
        Ok(mut zip_file) => {
            let mut content = String::new();
            zip_file.read_to_string(&mut content)
                .map_err(|e| napi::Error::from_reason(format!("Failed to read file: {}", e)))?;
            Some(content)
        }
        Err(_) => None,
    };
    
    Ok(result)
}

/// Modrinth modpack manifest
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ModrinthManifest {
    pub format_version: u32,
    pub game: String,
    pub version_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub files: Vec<ModrinthManifestFile>,
    pub minecraft_version: Option<String>,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
}

/// Internal manifest for parsing (with serde_json::Value for dependencies)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModrinthManifestRaw {
    format_version: u32,
    game: String,
    version_id: String,
    name: String,
    summary: Option<String>,
    files: Vec<ModrinthManifestFile>,
    #[serde(default)]
    dependencies: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ModrinthManifestFile {
    pub path: String,
    pub hashes: ModrinthFileHashes,
    pub downloads: Vec<String>,
    pub file_size: i64,
    pub env: Option<ModrinthFileEnv>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthFileHashes {
    pub sha1: String,
    pub sha512: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthFileEnv {
    pub client: Option<String>,
    pub server: Option<String>,
}

/// Parse Modrinth modpack manifest from .mrpack file
#[napi]
pub fn parse_modrinth_manifest(mrpack_path: String) -> napi::Result<Option<ModrinthManifest>> {
    let content = read_file_from_zip(mrpack_path, "modrinth.index.json".to_string())?;
    
    match content {
        Some(json) => {
            let raw: ModrinthManifestRaw = serde_json::from_str(&json)
                .map_err(|e| napi::Error::from_reason(format!("Invalid manifest: {}", e)))?;
            
            // Extract dependencies
            let minecraft_version = raw.dependencies.get("minecraft")
                .and_then(|v| v.as_str())
                .map(String::from);
            let (loader, loader_version) = extract_loader_from_deps(&raw.dependencies);
            
            Ok(Some(ModrinthManifest {
                format_version: raw.format_version,
                game: raw.game,
                version_id: raw.version_id,
                name: raw.name,
                summary: raw.summary,
                files: raw.files,
                minecraft_version,
                loader,
                loader_version,
            }))
        }
        None => Ok(None),
    }
}

fn extract_loader_from_deps(deps: &serde_json::Value) -> (Option<String>, Option<String>) {
    let loaders = ["fabric-loader", "forge", "neoforge", "quilt-loader"];
    for loader_key in loaders {
        if let Some(version) = deps.get(loader_key).and_then(|v| v.as_str()) {
            let loader_name = match loader_key {
                "fabric-loader" => "fabric",
                "quilt-loader" => "quilt",
                _ => loader_key,
            };
            return (Some(loader_name.to_string()), Some(version.to_string()));
        }
    }
    (None, None)
}

/// CurseForge modpack manifest
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeManifest {
    pub minecraft: CurseForgeMinecraft,
    pub manifest_type: String,
    pub manifest_version: u32,
    pub name: String,
    pub version: String,
    pub author: String,
    pub files: Vec<CurseForgeManifestFile>,
    pub overrides: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeMinecraft {
    pub version: String,
    pub mod_loaders: Vec<CurseForgeModLoader>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct CurseForgeModLoader {
    pub id: String,
    pub primary: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeManifestFile {
    #[serde(alias = "projectID")]
    pub project_id: u32,
    #[serde(alias = "fileID")]
    pub file_id: u32,
    pub required: bool,
}

/// Parse CurseForge modpack manifest
#[napi]
pub fn parse_curseforge_manifest(zip_path: String) -> napi::Result<Option<CurseForgeManifest>> {
    let content = read_file_from_zip(zip_path, "manifest.json".to_string())?;
    
    match content {
        Some(json) => {
            let manifest: CurseForgeManifest = serde_json::from_str(&json)
                .map_err(|e| napi::Error::from_reason(format!("Invalid manifest: {}", e)))?;
            Ok(Some(manifest))
        }
        None => Ok(None),
    }
}

/// Extract modpack overrides to instance directory
#[napi]
pub fn extract_modpack_overrides(
    zip_path: String,
    instance_path: String,
    overrides_folder: Option<String>,
) -> napi::Result<ExtractResult> {
    let overrides = overrides_folder.unwrap_or_else(|| "overrides".to_string());
    
    let file = std::fs::File::open(&zip_path)
        .map_err(|e| napi::Error::from_reason(format!("Failed to open zip: {}", e)))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| napi::Error::from_reason(format!("Invalid zip file: {}", e)))?;

    let dest = PathBuf::from(&instance_path);
    std::fs::create_dir_all(&dest)?;

    let prefix = format!("{}/", overrides);
    let mut extracted = 0u32;

    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let name = file.name().to_string();
        
        // Only extract files from overrides folder
        if !name.starts_with(&prefix) {
            continue;
        }

        // Strip the overrides prefix
        let relative_path = &name[prefix.len()..];
        if relative_path.is_empty() {
            continue;
        }

        let outpath = dest.join(relative_path);

        if name.ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }

            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
            extracted += 1;
        }
    }

    Ok(ExtractResult {
        success: true,
        files_extracted: extracted,
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{CurseForgeManifest, ModrinthManifestRaw};
    use serde_json::json;

    #[test]
    fn modrinth_manifest_raw_accepts_camel_case_fields() {
        let manifest_json = json!({
            "formatVersion": 1,
            "game": "minecraft",
            "versionId": "1.0.0",
            "name": "Test Pack",
            "summary": "Example pack",
            "files": [
                {
                    "path": "mods/test-mod.jar",
                    "hashes": {
                        "sha1": "deadbeef"
                    },
                    "downloads": ["https://example.com/test-mod.jar"],
                    "fileSize": 12345
                }
            ],
            "dependencies": {
                "minecraft": "1.20.1",
                "fabric-loader": "0.16.10"
            }
        })
        .to_string();

        let manifest: ModrinthManifestRaw = serde_json::from_str(&manifest_json)
            .expect("expected official Modrinth camelCase manifest to parse");

        assert_eq!(manifest.format_version, 1);
        assert_eq!(manifest.version_id, "1.0.0");
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].file_size, 12345);
        assert_eq!(
            manifest.dependencies.get("fabric-loader").and_then(|v| v.as_str()),
            Some("0.16.10")
        );
    }

    #[test]
    fn curseforge_manifest_accepts_official_id_fields() {
        let manifest_json = json!({
            "minecraft": {
                "version": "1.20.1",
                "modLoaders": [
                    {
                        "id": "forge-47.2.0",
                        "primary": true
                    }
                ]
            },
            "manifestType": "minecraftModpack",
            "manifestVersion": 1,
            "name": "Test CurseForge Pack",
            "version": "1.0.0",
            "author": "Tester",
            "files": [
                {
                    "projectID": 123456,
                    "fileID": 789012,
                    "required": true
                }
            ],
            "overrides": "overrides"
        })
        .to_string();

        let manifest: CurseForgeManifest = serde_json::from_str(&manifest_json)
            .expect("expected official CurseForge manifest to parse");

        assert_eq!(manifest.manifest_type, "minecraftModpack");
        assert_eq!(manifest.manifest_version, 1);
        assert_eq!(manifest.minecraft.mod_loaders.len(), 1);
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].project_id, 123456);
        assert_eq!(manifest.files[0].file_id, 789012);
    }
}
