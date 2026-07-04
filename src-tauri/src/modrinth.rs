


use serde::{Deserialize, Serialize};

const MODRINTH_API_BASE: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = "RealityLauncher/2.0 (github.com/catlab-design)";


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    pub offset: u32,
    pub limit: u32,
    pub total_hits: u32,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub project_id: String,
    pub project_type: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u32,
    pub author: String,
    pub versions: Vec<String>,
    pub categories: Vec<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameVersion {
    pub version: String,
    pub version_type: String,
}





#[tauri::command]
pub async fn modrinth_search(
    query: String,
    project_type: String,
    version: Option<String>,
    loader: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
    sort_by: Option<String>,
    facets: Option<String>,
) -> Result<SearchResult, String> {
    let client = reqwest::Client::new();

    
    let mut facets_list: Vec<Vec<String>> = vec![vec![format!("project_type:{}", project_type)]];

    if let Some(v) = version.as_ref() {
        facets_list.push(vec![format!("versions:{}", v)]);
    }

    if let Some(l) = loader.as_ref() {
        facets_list.push(vec![format!("categories:{}", l)]);
    }

    if let Some(ref extra_facets_json) = facets {
        if let Ok(extra_facets) = serde_json::from_str::<Vec<Vec<String>>>(extra_facets_json) {
            for group in extra_facets {
                facets_list.push(group);
            }
        }
    }

    let facets_str = serde_json::to_string(&facets_list).unwrap_or_else(|_| "[]".to_string());

    let index = sort_by.unwrap_or_else(|| "relevance".to_string());
    
    let clean_query = crate::mod_meta::clean_search_name(&query);

    let url = format!(
        "{}/search?query={}&facets={}&limit={}&offset={}&index={}",
        MODRINTH_API_BASE,
        urlencoding::encode(&clean_query),
        urlencoding::encode(&facets_str),
        limit.unwrap_or(20),
        offset.unwrap_or(0),
        index
    );

    println!("[Modrinth] Searching: {}", url);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_get_project(id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    let url = format!("{}/project/{}", MODRINTH_API_BASE, id);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_get_project_versions(
    id: String,
    loaders: Option<Vec<String>>,
    game_versions: Option<Vec<String>>,
) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::new();

    let mut url = format!("{}/project/{}/version", MODRINTH_API_BASE, id);
    let mut params = Vec::new();

    if let Some(l) = loaders {
        params.push(format!(
            "loaders=[{}]",
            l.iter()
                .map(|s| format!("\"{}\"", s))
                .collect::<Vec<_>>()
                .join(",")
        ));
    }
    if let Some(v) = game_versions {
        params.push(format!(
            "game_versions=[{}]",
            v.iter()
                .map(|s| format!("\"{}\"", s))
                .collect::<Vec<_>>()
                .join(",")
        ));
    }

    if !params.is_empty() {
        url = format!("{}?{}", url, params.join("&"));
    }

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_get_game_versions() -> Result<Vec<GameVersion>, String> {
    let client = reqwest::Client::new();

    let url = format!("{}/tag/game_version", MODRINTH_API_BASE);

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API error: {}", response.status()));
    }

    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_get_versions(project_id: String) -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::new();
    let url = format!("{MODRINTH_API_BASE}/project/{project_id}/version");

    let resp = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Modrinth get versions failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth API error: {}", resp.status()));
    }

    resp.json::<Vec<serde_json::Value>>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_get_loader_versions(
    loader: String,
    game_version: String,
) -> Result<Vec<String>, String> {
    match loader.to_lowercase().as_str() {
        "fabric" => get_fabric_loader_versions(&game_version).await,
        "quilt" => get_quilt_loader_versions(&game_version).await,
        "forge" => get_forge_versions(&game_version).await,
        "neoforge" => get_neoforge_versions(&game_version).await,
        _ => Err(format!("Unknown loader: {loader}")),
    }
}

async fn get_fabric_loader_versions(game_version: &str) -> Result<Vec<String>, String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{game_version}");
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Fabric meta request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Fabric meta error: {}", resp.status()));
    }

    let data: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    let versions: Vec<String> = data
        .iter()
        .filter_map(|entry| {
            entry
                .get("loader")
                .and_then(|l| l.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();

    Ok(versions)
}

async fn get_quilt_loader_versions(game_version: &str) -> Result<Vec<String>, String> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{game_version}");
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Quilt meta request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Quilt meta error: {}", resp.status()));
    }

    let data: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
    let versions: Vec<String> = data
        .iter()
        .filter_map(|entry| {
            entry
                .get("loader")
                .and_then(|l| l.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();

    Ok(versions)
}

async fn get_forge_versions(game_version: &str) -> Result<Vec<String>, String> {
    let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Forge promotions slim request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Forge promotions slim error: {}", resp.status()));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let promos = data
        .get("promos")
        .and_then(|p| p.as_object())
        .ok_or_else(|| "Invalid forge promotions JSON".to_string())?;

    let prefix = format!("{}-", game_version);
    let mut versions: Vec<String> = promos
        .iter()
        .filter(|(key, _)| key.starts_with(&prefix))
        .filter_map(|(_, val)| val.as_str().map(|s| s.to_string()))
        .collect();

    versions.sort();
    versions.dedup();
    versions.reverse();
    Ok(versions)
}

async fn get_neoforge_versions(game_version: &str) -> Result<Vec<String>, String> {
    let url = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("NeoForge releases maven request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("NeoForge maven error: {}", resp.status()));
    }

    let xml = resp.text().await.map_err(|e| e.to_string())?;

    let mut all_versions = Vec::new();
    let mut remaining = &xml[..];
    while let Some(start_pos) = remaining.find("<version>") {
        let rest = &remaining[start_pos + 9..];
        if let Some(end_pos) = rest.find("</version>") {
            let ver = &rest[..end_pos];
            all_versions.push(ver.to_string());
            remaining = &rest[end_pos + 10..];
        } else {
            break;
        }
    }

    let mut versions = Vec::new();
    if game_version.starts_with("1.") {
        let rest = &game_version[2..];
        let parts: Vec<&str> = rest.split('.').collect();
        if !parts.is_empty() {
            let major = parts[0];
            let minor = if parts.len() > 1 { parts[1] } else { "0" };
            let prefix = format!("{major}.{minor}.");

            let mut matches: Vec<String> = all_versions
                .into_iter()
                .filter(|v| v.starts_with(&prefix))
                .collect();
            matches.reverse();
            versions.extend(matches);
        }
    }

    Ok(versions)
}



#[tauri::command]
pub fn modrinth_clear_cache() -> Result<(), String> {
    Ok(())
}



#[tauri::command]
pub async fn modrinth_get_team(project_id: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("https://api.modrinth.com/v2/project/{project_id}/members");
    let resp = client
        .get(&url)
        .header("User-Agent", "RealityLauncher/2.0")
        .send()
        .await
        .map_err(|e| format!("Modrinth get team failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth API error: {}", resp.status()));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}
