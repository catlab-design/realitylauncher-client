use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use crate::get_client;

#[derive(Debug, Serialize, Deserialize)]
struct QuiltLoaderVersion {
    loader: QuiltLoaderInfo,
}

#[derive(Debug, Serialize, Deserialize)]
struct QuiltLoaderInfo {
    separator: Option<String>,
    build: Option<i32>,
    maven: Option<String>,
    version: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct QuiltProfile {
    id: String,
    #[serde(rename = "inheritsFrom")]
    inherits_from: Option<String>,
    #[serde(rename = "releaseTime")]
    release_time: Option<String>,
    time: Option<String>,
    #[serde(rename = "type")]
    profile_type: Option<String>,
    #[serde(rename = "mainClass")]
    main_class: String,
    arguments: Option<QuiltArguments>,
    libraries: Vec<QuiltLibrary>,
}

#[derive(Debug, Serialize, Deserialize)]
struct QuiltArguments {
    game: Option<Vec<serde_json::Value>>,
    jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct QuiltLibrary {
    name: String,
    url: Option<String>,
    sha1: Option<String>,
    size: Option<u64>,
}

#[napi(object)]
#[derive(Debug)]
pub struct QuiltInstallResult {
    pub version_id: String,
    pub version_json_path: String,
    pub main_class: String,
    pub libraries_json: String,
}

/// Install Quilt loader for a Minecraft version
/// Returns the path to the generated version JSON
#[napi]
pub async fn install_quilt(
    mc_version: String,
    requested_loader_version: Option<String>,
    minecraft_dir: String,
) -> napi::Result<QuiltInstallResult> {
    let client = get_client();

    // 1. Fetch available loader versions
    let loader_url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}",
        mc_version
    );

    println!("[Quilt] Fetching loader versions from: {}", loader_url);

    let res = client
        .get(&loader_url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to fetch Quilt versions: {}", e)))?;

    let loaders: Vec<QuiltLoaderVersion> = res
        .json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to parse Quilt versions: {}", e)))?;

    if loaders.is_empty() {
        return Err(napi::Error::from_reason(format!(
            "Quilt does not support Minecraft {}",
            mc_version
        )));
    }

    // 2. Select loader version
    let loader_version = if let Some(ref req) = requested_loader_version {
        if req == "latest" {
            loaders[0].loader.version.clone()
        } else {
            // Find matching version or use requested
            loaders
                .iter()
                .find(|l| l.loader.version == *req)
                .map(|l| l.loader.version.clone())
                .unwrap_or_else(|| req.clone())
        }
    } else {
        loaders[0].loader.version.clone()
    };

    println!("[Quilt] Selected loader version: {}", loader_version);

    // 3. Fetch profile JSON
    let profile_url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
        mc_version, loader_version
    );

    println!("[Quilt] Fetching profile from: {}", profile_url);

    let profile_res = client
        .get(&profile_url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to fetch Quilt profile: {}", e)))?;

    let profile: QuiltProfile = profile_res
        .json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to parse Quilt profile: {}", e)))?;

    // 4. Create version directory and save JSON
    let version_id = format!("quilt-loader-{}-{}", loader_version, mc_version);
    let versions_dir = Path::new(&minecraft_dir).join("versions").join(&version_id);
    
    fs::create_dir_all(&versions_dir)
        .map_err(|e| napi::Error::from_reason(format!("Failed to create version directory: {}", e)))?;

    let version_json_path = versions_dir.join(format!("{}.json", version_id));
    
    // Build version JSON with correct structure
    let version_json = serde_json::json!({
        "id": version_id,
        "inheritsFrom": mc_version,
        "releaseTime": profile.release_time,
        "time": profile.time,
        "type": profile.profile_type.unwrap_or_else(|| "release".to_string()),
        "mainClass": profile.main_class,
        "arguments": profile.arguments,
        "libraries": profile.libraries,
    });

    fs::write(
        &version_json_path,
        serde_json::to_string_pretty(&version_json)
            .map_err(|e| napi::Error::from_reason(format!("Failed to serialize version JSON: {}", e)))?,
    )
    .map_err(|e| napi::Error::from_reason(format!("Failed to write version JSON: {}", e)))?;

    println!(
        "[Quilt] Version JSON saved to: {}",
        version_json_path.display()
    );

    // 5. Download libraries
    let libraries_dir = Path::new(&minecraft_dir).join("libraries");
    download_quilt_libraries(&profile.libraries, &libraries_dir).await?;

    Ok(QuiltInstallResult {
        version_id: version_id.clone(),
        version_json_path: version_json_path.to_string_lossy().to_string(),
        main_class: profile.main_class,
        libraries_json: serde_json::to_string(&profile.libraries)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?,
    })
}

/// Download Quilt libraries to the libraries directory
async fn download_quilt_libraries(
    libraries: &[QuiltLibrary],
    libraries_dir: &Path,
) -> napi::Result<()> {
    let client = get_client();
    let quilt_maven = "https://maven.quiltmc.org/repository/release/";
    let fabric_maven = "https://maven.fabricmc.net/";

    for lib in libraries {
        // Parse maven coordinates: group:artifact:version
        let parts: Vec<&str> = lib.name.split(':').collect();
        if parts.len() < 3 {
            println!("[Quilt] Skipping invalid library: {}", lib.name);
            continue;
        }

        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        let classifier = if parts.len() > 3 { format!("-{}", parts[3]) } else { String::new() };

        let file_name = format!("{}-{}{}.jar", artifact, version, classifier);
        let rel_path = format!("{}/{}/{}/{}", group, artifact, version, file_name);
        let target_path = libraries_dir.join(&rel_path);

        // Skip if already exists
        if target_path.exists() {
            println!("[Quilt] Library exists: {}", file_name);
            continue;
        }

        // Determine download URL
        let url = if let Some(ref lib_url) = lib.url {
            format!("{}{}", lib_url.trim_end_matches('/'), &rel_path)
        } else if lib.name.starts_with("org.quiltmc") {
            format!("{}{}", quilt_maven, rel_path)
        } else {
            format!("{}{}", fabric_maven, rel_path)
        };

        println!("[Quilt] Downloading: {}", file_name);

        // Create parent directories
        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| napi::Error::from_reason(format!("Failed to create directory: {}", e)))?;
        }

        // Download the library
        match client.get(&url).send().await {
            Ok(res) if res.status().is_success() => {
                let bytes = res.bytes().await.map_err(|e| {
                    napi::Error::from_reason(format!("Failed to download {}: {}", file_name, e))
                })?;
                fs::write(&target_path, bytes).map_err(|e| {
                    napi::Error::from_reason(format!("Failed to save {}: {}", file_name, e))
                })?;
                println!("[Quilt] Downloaded: {}", file_name);
            }
            Ok(res) => {
                // Try fallback URL
                let fallback_url = if url.contains("quiltmc") {
                    format!("{}{}", fabric_maven, rel_path)
                } else {
                    format!("{}{}", quilt_maven, rel_path)
                };

                match client.get(&fallback_url).send().await {
                    Ok(res2) if res2.status().is_success() => {
                        let bytes = res2.bytes().await.map_err(|e| {
                            napi::Error::from_reason(format!("Failed to download {}: {}", file_name, e))
                        })?;
                        fs::write(&target_path, bytes).map_err(|e| {
                            napi::Error::from_reason(format!("Failed to save {}: {}", file_name, e))
                        })?;
                        println!("[Quilt] Downloaded (fallback): {}", file_name);
                    }
                    _ => {
                        println!(
                            "[Quilt] Warning: Failed to download {} (status: {})",
                            file_name,
                            res.status()
                        );
                    }
                }
            }
            Err(e) => {
                println!("[Quilt] Warning: Failed to download {}: {}", file_name, e);
            }
        }
    }

    Ok(())
}

/// Get available Quilt loader versions for a Minecraft version
#[napi]
pub async fn get_quilt_versions(mc_version: String) -> napi::Result<Vec<String>> {
    let client = get_client();
    let url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{}",
        mc_version
    );

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    let loaders: Vec<QuiltLoaderVersion> = res
        .json()
        .await
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    Ok(loaders.into_iter().map(|l| l.loader.version).collect())
}
