use base64::{engine::general_purpose, Engine as _};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::write::FileOptions;
use zip::ZipArchive;

use super::{is_safe_relative_path, parse_pack_format, parse_shader_version};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct PackMetadataResult {
    #[napi(ts_type = "string | null | undefined")]
    pub icon_base64: Option<String>,
    #[napi(ts_type = "string | null | undefined")]
    pub version: Option<String>,
    #[napi(ts_type = "number | null | undefined")]
    pub pack_format: Option<u32>,
}

fn find_first_png_with_depth(root: &Path, max_depth: usize) -> Option<Vec<u8>> {
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let entries = std::fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            let file_type = entry.file_type().ok()?;
            if file_type.is_dir() {
                if depth < max_depth {
                    stack.push((path, depth + 1));
                }
                continue;
            }
            if path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("png"))
                .unwrap_or(false)
            {
                if let Ok(data) = std::fs::read(path) {
                    if !data.is_empty() {
                        return Some(data);
                    }
                }
            }
        }
    }
    None
}

fn inspect_pack_metadata_sync(pack_path: String, pack_kind: String) -> PackMetadataResult {
    let kind = pack_kind.to_lowercase();
    let path = PathBuf::from(pack_path);
    if !path.exists() {
        return PackMetadataResult {
            icon_base64: None,
            version: None,
            pack_format: None,
        };
    }

    let mut icon_bytes: Option<Vec<u8>> = None;
    let mut version: Option<String> = None;
    let mut pack_format: Option<u32> = None;

    if path.is_dir() {
        let icon_candidates: Vec<PathBuf> = match kind.as_str() {
            "shader" => vec![
                path.join("shaders").join("logo.png"),
                path.join("logo.png"),
                path.join("pack.png"),
                path.join("icon.png"),
            ],
            _ => vec![path.join("pack.png"), path.join("icon.png")],
        };

        for candidate in icon_candidates {
            if candidate.exists() {
                if let Ok(data) = std::fs::read(&candidate) {
                    if !data.is_empty() {
                        icon_bytes = Some(data);
                        break;
                    }
                }
            }
        }

        if icon_bytes.is_none() && (kind == "datapack" || kind == "shader") {
            icon_bytes = find_first_png_with_depth(&path, 2);
        }

        if kind == "shader" {
            let props_candidates = vec![
                path.join("shaders").join("shaders.properties"),
                path.join("shaders.properties"),
            ];
            for props in props_candidates {
                if let Ok(content) = std::fs::read_to_string(props) {
                    version = parse_shader_version(&content);
                    if version.is_some() {
                        break;
                    }
                }
            }
        } else {
            let mcmeta = path.join("pack.mcmeta");
            if let Ok(content) = std::fs::read_to_string(mcmeta) {
                pack_format = parse_pack_format(&content);
            }
        }
    } else {
        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(_) => {
                return PackMetadataResult {
                    icon_base64: None,
                    version: None,
                    pack_format: None,
                }
            }
        };

        let mut archive = match ZipArchive::new(file) {
            Ok(archive) => archive,
            Err(_) => {
                return PackMetadataResult {
                    icon_base64: None,
                    version: None,
                    pack_format: None,
                }
            }
        };

        let mut fallback_png: Option<Vec<u8>> = None;
        let mut shader_props: Option<String> = None;
        let mut mcmeta_content: Option<String> = None;

        for idx in 0..archive.len() {
            let mut entry = match archive.by_index(idx) {
                Ok(entry) => entry,
                Err(_) => continue,
            };
            if entry.is_dir() {
                continue;
            }

            let name = entry.name().replace('\\', "/");
            let lower = name.to_lowercase();

            let icon_match = match kind.as_str() {
                "shader" => {
                    lower == "shaders/logo.png"
                        || lower == "logo.png"
                        || lower == "pack.png"
                        || lower == "icon.png"
                }
                _ => {
                    lower == "pack.png"
                        || lower == "icon.png"
                        || (lower.ends_with("/pack.png") && lower.split('/').count() == 2)
                }
            };

            if icon_bytes.is_none() && icon_match {
                let mut data = Vec::new();
                if entry.read_to_end(&mut data).is_ok() && !data.is_empty() {
                    icon_bytes = Some(data);
                    continue;
                }
            }

            if fallback_png.is_none() && (kind == "shader" || kind == "datapack") && lower.ends_with(".png") {
                let mut data = Vec::new();
                if entry.read_to_end(&mut data).is_ok() && !data.is_empty() {
                    fallback_png = Some(data);
                    continue;
                }
            }

            if kind == "shader"
                && shader_props.is_none()
                && (lower == "shaders/shaders.properties" || lower == "shaders.properties")
            {
                let mut content = String::new();
                if entry.read_to_string(&mut content).is_ok() {
                    shader_props = Some(content);
                    continue;
                }
            }

            if kind != "shader"
                && mcmeta_content.is_none()
                && (lower == "pack.mcmeta" || (lower.ends_with("/pack.mcmeta") && lower.split('/').count() == 2))
            {
                let mut content = String::new();
                if entry.read_to_string(&mut content).is_ok() {
                    mcmeta_content = Some(content);
                    continue;
                }
            }
        }

        if icon_bytes.is_none() {
            icon_bytes = fallback_png;
        }

        if kind == "shader" {
            if let Some(content) = shader_props {
                version = parse_shader_version(&content);
            }
        } else if let Some(content) = mcmeta_content {
            pack_format = parse_pack_format(&content);
        }
    }

    PackMetadataResult {
        icon_base64: icon_bytes.map(|bytes| general_purpose::STANDARD.encode(bytes)),
        version,
        pack_format,
    }
}

#[napi]
pub async fn inspect_pack_metadata(
    pack_path: String,
    pack_kind: String,
) -> napi::Result<PackMetadataResult> {
    tokio::task::spawn_blocking(move || inspect_pack_metadata_sync(pack_path, pack_kind))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Pack inspector worker failed: {err}")))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct PackScanEntry {
    pub filename: String,
    pub display_name: String,
    pub is_directory: bool,
    pub size: i64,
    pub modified_at: String,
    pub enabled: bool,
    #[napi(ts_type = "string | null | undefined")]
    pub icon_base64: Option<String>,
    #[napi(ts_type = "string | null | undefined")]
    pub version: Option<String>,
    #[napi(ts_type = "number | null | undefined")]
    pub pack_format: Option<u32>,
}

fn strip_known_pack_suffix(file_name: &str, kind: &str) -> (String, bool) {
    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".zip.disabled") {
        let trimmed = file_name[..file_name.len().saturating_sub(".zip.disabled".len())].to_string();
        return (trimmed, false);
    }
    if kind == "datapack" && lower.ends_with(".jar.disabled") {
        let trimmed = file_name[..file_name.len().saturating_sub(".jar.disabled".len())].to_string();
        return (trimmed, false);
    }
    if lower.ends_with(".zip") {
        let trimmed = file_name[..file_name.len().saturating_sub(".zip".len())].to_string();
        return (trimmed, true);
    }
    if kind == "datapack" && lower.ends_with(".jar") {
        let trimmed = file_name[..file_name.len().saturating_sub(".jar".len())].to_string();
        return (trimmed, true);
    }
    (file_name.to_string(), true)
}

fn pack_entry_is_supported(file_name: &str, is_directory: bool, kind: &str) -> bool {
    if is_directory {
        return true;
    }

    let lower = file_name.to_ascii_lowercase();
    if lower.ends_with(".zip") || lower.ends_with(".zip.disabled") {
        return true;
    }

    kind == "datapack" && (lower.ends_with(".jar") || lower.ends_with(".jar.disabled"))
}

fn to_rfc3339_or_default(meta: &std::fs::Metadata) -> String {
    meta.modified()
        .ok()
        .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339())
        .unwrap_or_default()
}

fn directory_size_bytes(path: &Path) -> i64 {
    let mut total = 0i64;
    for entry in WalkDir::new(path).into_iter().flatten() {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total += meta.len() as i64;
            }
        }
    }
    total
}

fn normalize_pack_kind(kind: &str) -> String {
    match kind.to_ascii_lowercase().as_str() {
        "resourcepack" | "resource" | "resourcepacks" => "resource".to_string(),
        "shader" | "shaders" | "shaderpack" | "shaderpacks" => "shader".to_string(),
        "datapack" | "datapacks" | "data" => "datapack".to_string(),
        other => other.to_string(),
    }
}

pub(crate) fn scan_pack_directory_sync(directory: String, pack_kind: String) -> Vec<PackScanEntry> {
    let dir_path = PathBuf::from(directory);
    if !dir_path.exists() {
        return Vec::new();
    }

    let normalized_kind = normalize_pack_kind(&pack_kind);
    let entries = match std::fs::read_dir(&dir_path) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut items = Vec::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };
        let is_directory = file_type.is_dir();
        if !pack_entry_is_supported(&file_name, is_directory, &normalized_kind) {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        let entry_path = entry.path();
        let size = if is_directory {
            directory_size_bytes(&entry_path)
        } else {
            metadata.len() as i64
        };
        let modified_at = to_rfc3339_or_default(&metadata);
        let (display_name, enabled) = if is_directory {
            (file_name.clone(), true)
        } else {
            strip_known_pack_suffix(&file_name, &normalized_kind)
        };

        let metadata = inspect_pack_metadata_sync(
            entry_path.to_string_lossy().to_string(),
            normalized_kind.clone(),
        );

        items.push(PackScanEntry {
            filename: file_name,
            display_name,
            is_directory,
            size,
            modified_at,
            enabled,
            icon_base64: metadata.icon_base64,
            version: metadata.version,
            pack_format: metadata.pack_format,
        });
    }

    items.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
    items
}

#[napi]
pub async fn scan_pack_directory(
    directory: String,
    pack_kind: String,
) -> napi::Result<Vec<PackScanEntry>> {
    tokio::task::spawn_blocking(move || scan_pack_directory_sync(directory, pack_kind))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Pack scan worker failed: {err}")))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ModpackExportRequest {
    pub instance_dir: String,
    pub output_path: String,
    pub format: String,
    pub included_paths: Vec<String>,
    pub name: String,
    pub version: String,
    #[napi(ts_type = "string | null | undefined")]
    pub description: Option<String>,
    pub minecraft_version: String,
    pub loader: String,
    #[napi(ts_type = "string | null | undefined")]
    pub loader_version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct ModpackExportResult {
    pub success: bool,
    pub files_written: u32,
    pub total_bytes: i64,
}

fn normalize_export_rel_path(value: &str) -> String {
    value
        .trim()
        .replace('\\', "/")
        .trim_matches('/')
        .to_string()
}

fn collect_export_files(
    instance_dir: &Path,
    included_paths: &[String],
) -> Result<Vec<(PathBuf, String)>, String> {
    let canonical_base = std::fs::canonicalize(instance_dir)
        .map_err(|err| format!("Failed to resolve instance directory: {err}"))?;
    let mut seen = HashSet::<String>::new();
    let mut files = Vec::<(PathBuf, String)>::new();

    for raw_path in included_paths {
        let relative = normalize_export_rel_path(raw_path);
        if relative.is_empty() || !is_safe_relative_path(&relative) {
            continue;
        }

        let candidate = canonical_base.join(&relative);
        if !candidate.exists() {
            continue;
        }

        let canonical_candidate = match std::fs::canonicalize(&candidate) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if !canonical_candidate.starts_with(&canonical_base) {
            continue;
        }

        if canonical_candidate.is_dir() {
            for entry in WalkDir::new(&canonical_candidate)
                .into_iter()
                .flatten()
                .filter(|entry| entry.file_type().is_file())
            {
                let file_path = entry.path().to_path_buf();
                if !file_path.starts_with(&canonical_base) {
                    continue;
                }
                let rel = match file_path.strip_prefix(&canonical_base) {
                    Ok(path) => normalize_export_rel_path(&path.to_string_lossy()),
                    Err(_) => continue,
                };
                if rel.is_empty() || !seen.insert(rel.clone()) {
                    continue;
                }
                files.push((file_path, rel));
            }
        } else {
            let rel = match canonical_candidate.strip_prefix(&canonical_base) {
                Ok(path) => normalize_export_rel_path(&path.to_string_lossy()),
                Err(_) => continue,
            };
            if rel.is_empty() || !seen.insert(rel.clone()) {
                continue;
            }
            files.push((canonical_candidate, rel));
        }
    }

    files.sort_by(|a, b| a.1.cmp(&b.1));
    Ok(files)
}

fn loader_key_for_modrinth(loader: &str) -> Option<&'static str> {
    match loader.trim().to_ascii_lowercase().as_str() {
        "fabric" => Some("fabric-loader"),
        "quilt" => Some("quilt-loader"),
        "forge" => Some("forge"),
        "neoforge" | "neo-forge" => Some("neoforge"),
        _ => None,
    }
}

fn build_modrinth_index(request: &ModpackExportRequest) -> String {
    let mut dependencies = serde_json::Map::new();
    dependencies.insert("minecraft".to_string(), json!(request.minecraft_version));
    if let Some(key) = loader_key_for_modrinth(&request.loader) {
        dependencies.insert(
            key.to_string(),
            json!(request.loader_version.clone().unwrap_or_else(|| "*".to_string())),
        );
    }

    let index = json!({
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": request.version,
        "name": request.name,
        "summary": request.description.clone().unwrap_or_else(|| "Exported from Reality Launcher".to_string()),
        "version": request.version,
        "files": [],
        "dependencies": dependencies,
    });

    serde_json::to_string_pretty(&index).unwrap_or_else(|_| "{\"formatVersion\":1}".to_string())
}

pub(crate) fn export_modpack_archive_sync(request: ModpackExportRequest) -> Result<ModpackExportResult, String> {
    let format = request.format.trim().to_ascii_lowercase();
    if format != "zip" && format != "mrpack" {
        return Err("Unsupported export format".to_string());
    }

    let instance_dir = PathBuf::from(&request.instance_dir);
    if !instance_dir.exists() {
        return Err("Instance directory not found".to_string());
    }

    let files = collect_export_files(&instance_dir, &request.included_paths)?;
    let output_path = PathBuf::from(&request.output_path);
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create output directory: {err}"))?;
    }

    let tmp_path = PathBuf::from(format!("{}.tmp", output_path.to_string_lossy()));
    let export_result = (|| -> Result<ModpackExportResult, String> {
        let file = std::fs::File::create(&tmp_path)
            .map_err(|err| format!("Failed to create archive: {err}"))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);

        let mut files_written = 0u32;
        let mut total_bytes = 0i64;

        if format == "mrpack" {
            let index = build_modrinth_index(&request);
            zip.start_file("modrinth.index.json", options)
                .map_err(|err| format!("Failed to add modrinth index: {err}"))?;
            zip.write_all(index.as_bytes())
                .map_err(|err| format!("Failed to write modrinth index: {err}"))?;
            total_bytes += index.len() as i64;
        }

        for (source_path, relative_path) in files {
            let zip_name = if format == "mrpack" {
                format!("overrides/{relative_path}")
            } else {
                relative_path.clone()
            };
            zip.start_file(zip_name, options)
                .map_err(|err| format!("Failed to start zip entry: {err}"))?;

            let mut source = std::fs::File::open(&source_path)
                .map_err(|err| format!("Failed to read source file {:?}: {err}", source_path))?;
            let written = std::io::copy(&mut source, &mut zip)
                .map_err(|err| format!("Failed to write zip entry {:?}: {err}", source_path))?;
            files_written += 1;
            total_bytes += written as i64;
        }

        zip.finish()
            .map_err(|err| format!("Failed to finalize archive: {err}"))?;

        if output_path.exists() {
            let _ = std::fs::remove_file(&output_path);
        }
        std::fs::rename(&tmp_path, &output_path)
            .map_err(|err| format!("Failed to move archive into place: {err}"))?;

        Ok(ModpackExportResult {
            success: true,
            files_written,
            total_bytes,
        })
    })();

    if export_result.is_err() {
        let _ = std::fs::remove_file(&tmp_path);
    }
    export_result
}

#[napi]
pub async fn export_modpack_archive(
    request: ModpackExportRequest,
) -> napi::Result<ModpackExportResult> {
    tokio::task::spawn_blocking(move || export_modpack_archive_sync(request))
        .await
        .map_err(|err| napi::Error::from_reason(format!("Modpack export worker failed: {err}")))?
        .map_err(napi::Error::from_reason)
}
