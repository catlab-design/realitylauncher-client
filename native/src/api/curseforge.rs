//! CurseForge API Client

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use crate::get_client;

const CF_API_BASE: &str = "https://api.reality.notpumpkins.com/curseforge";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeLogo {
    pub id: u32,
    pub url: String,
    pub title: String,
    pub thumbnail_url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeCategory {
    pub id: u32,
    pub game_id: u32,
    pub name: String,
    pub slug: String,
    pub url: String,
    pub icon_url: String,
    pub date_modified: String,
    pub is_class: Option<bool>,
    pub class_id: Option<u32>,
    pub parent_category_id: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeAuthor {
    pub name: String,
    pub url: String,
    pub id: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeFile {
    pub id: u32,
    pub display_name: String,
    pub file_name: String,
    pub file_date: String,
    pub file_length: Option<f64>,
    pub release_type: u32,
    pub file_status: u32,
    pub download_url: Option<String>,
    pub is_available: bool,
    pub game_versions: Option<Vec<String>>,
    pub sortable_game_versions: Option<Vec<CurseForgeSortableGameVersion>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeSortableGameVersion {
    pub game_version_name: Option<String>,
    pub game_version_padded: Option<String>,
    pub game_version: Option<String>,
    pub game_version_release_date: Option<String>,
    pub game_version_type_id: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeFileIndex {
    pub game_version: String,
    pub file_id: u32,
    pub filename: String,
    pub release_type: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeLinks {
    pub website_url: String,
    pub wiki_url: Option<String>,
    pub issues_url: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeScreenshot {
    pub id: u32,
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: String,
    pub thumbnail_url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeProject {
    pub id: u32,
    pub class_id: Option<u32>,
    pub name: String,
    pub slug: String,
    pub summary: String,
    pub links: Option<CurseForgeLinks>,
    pub download_count: f64,
    pub thumbs_up_count: f64,
    pub logo: Option<CurseForgeLogo>,
    pub screenshots: Option<Vec<CurseForgeScreenshot>>,
    pub authors: Vec<CurseForgeAuthor>,
    pub categories: Vec<CurseForgeCategory>,
    pub main_file_id: u32,
    pub latest_files: Vec<CurseForgeFile>,
    pub latest_files_indexes: Option<Vec<CurseForgeFileIndex>>,
    pub date_created: String,
    pub date_modified: String,
    pub date_released: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgePagination {
    pub index: u32,
    pub page_size: u32,
    pub result_count: u32,
    pub total_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
#[napi(object)]
pub struct CurseForgeSearchResult {
    pub data: Vec<CurseForgeProject>,
    pub pagination: CurseForgePagination,
}

#[napi(object)]
pub struct CurseForgeSearchOptions {
    pub query: Option<String>,
    pub project_type: Option<String>,
    pub game_version: Option<String>,
    pub sort_by: Option<String>,
    pub page_size: Option<u32>,
    pub index: Option<u32>,
}

fn get_class_id(project_type: &str) -> Option<u32> {
    match project_type {
        "mod" => Some(6),
        "modpack" => Some(4471),
        "resourcepack" => Some(12),
        "shader" => Some(6552),
        "datapack" => Some(6945),
        _ => None,
    }
}

#[napi]
pub async fn curseforge_search(options: CurseForgeSearchOptions) -> napi::Result<CurseForgeSearchResult> {
    let client = get_client();
    let url = format!("{}/search", CF_API_BASE);
    
    let mut query_params = Vec::new();
    query_params.push(("gameId", "432".to_string()));
    
    if let Some(pt) = options.project_type {
        if let Some(class_id) = get_class_id(&pt) {
            query_params.push(("classId", class_id.to_string()));
        }
    }
    
    if let Some(q) = options.query {
        query_params.push(("searchFilter", q));
    }
    
    if let Some(gv) = options.game_version {
        query_params.push(("gameVersion", gv));
    }
    
    if let Some(sb) = options.sort_by {
        let sort_val = match sb.as_str() {
            "downloads" => "5",
            "updated" => "3",
            "newest" => "3",
            "follows" => "2",
            _ => "1",
        };
        query_params.push(("sortField", sort_val.to_string()));
        query_params.push(("sortOrder", "desc".to_string()));
    }
    
    if let Some(ps) = options.page_size {
        query_params.push(("pageSize", ps.to_string()));
    }
    
    if let Some(idx) = options.index {
        query_params.push(("index", idx.to_string()));
    }
    
    let res = client.get(&url)
        .query(&query_params)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;

    let result: CurseForgeSearchResult = res.json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {}", e)))?;
        
    Ok(result)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct CurseForgeFilesResult {
    pub data: Vec<CurseForgeFile>,
}

#[napi]
pub async fn curseforge_get_files(project_id: u32) -> napi::Result<CurseForgeFilesResult> {
    let client = get_client();
    let url = format!("{}/project/{}/files", CF_API_BASE, project_id);
    
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;

    let result: CurseForgeFilesResult = res.json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {}", e)))?;
        
    Ok(result)
}

/// Get download URL for a CurseForge file
#[napi]
pub async fn curseforge_get_download_url(project_id: u32, file_id: u32) -> napi::Result<Option<String>> {
    let client = get_client();
    let url = format!("{}/project/{}/file/{}/download-url", CF_API_BASE, project_id, file_id);
    
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;

    #[derive(Deserialize)]
    struct DownloadResponse {
        data: Option<String>,
    }

    let result: DownloadResponse = res.json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {}", e)))?;
        
    Ok(result.data)
}
