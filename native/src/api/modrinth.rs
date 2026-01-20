//! Modrinth API Client

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use crate::get_client;

#[napi(object)]
pub struct ModrinthSearchOptions {
    pub query: Option<String>,
    pub project_type: Option<String>,
    pub game_version: Option<String>,
    pub loader: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub sort_by: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthProject {
    #[serde(alias = "id")]
    pub project_id: String,
    pub project_type: String,
    pub slug: Option<String>,
    pub title: String,
    pub description: String,
    pub categories: Option<Vec<String>>,
    pub display_categories: Option<Vec<String>>,
    pub client_side: String,
    pub server_side: String,
    pub downloads: i32,
    #[serde(alias = "followers")]
    pub follows: i32,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub author: String,
    pub versions: Option<Vec<String>>,
    pub game_versions: Option<Vec<String>>,
    pub loaders: Option<Vec<String>>,
    pub license: Option<String>,
    pub color: Option<i32>,
    pub latest_version: Option<String>,
    pub date_created: String,
    pub date_modified: String,
    pub gallery: Option<Vec<ModrinthGalleryItem>>,
    pub featured_gallery: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthSearchProject {
    #[serde(alias = "id")]
    pub project_id: String,
    pub project_type: String,
    pub slug: Option<String>,
    pub title: String,
    pub description: String,
    pub categories: Option<Vec<String>>,
    pub display_categories: Option<Vec<String>>,
    pub client_side: String,
    pub server_side: String,
    pub downloads: i32,
    #[serde(alias = "followers")]
    pub follows: i32,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub author: String,
    pub versions: Option<Vec<String>>,
    pub game_versions: Option<Vec<String>>,
    pub loaders: Option<Vec<String>>,
    pub license: Option<String>,
    pub color: Option<i32>,
    pub latest_version: Option<String>,
    pub date_created: String,
    pub date_modified: String,
    pub gallery: Option<Vec<String>>,
    pub featured_gallery: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthSearchResult {
    pub hits: Vec<ModrinthSearchProject>,
    pub offset: i32,
    pub limit: i32,
    pub total_hits: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub author_id: Option<String>,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub version_type: String,
    pub status: Option<String>,
    pub featured: Option<bool>,
    pub changelog: Option<String>,
    pub files: Vec<ModrinthFile>,
    pub date_published: String,
    pub downloads: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[napi(object)]
pub struct ModrinthGalleryItem {
    pub url: String,
    pub raw_url: Option<String>, // Contains the full resolution image URL
    pub featured: bool,
    pub title: Option<String>,
    pub description: Option<String>,
    pub created: String,
    pub ordering: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ModrinthProjectDetail {
    #[serde(alias = "id")]
    pub project_id: String,
    pub project_type: String,
    pub slug: Option<String>,
    pub title: String,
    pub description: String,
    pub categories: Option<Vec<String>>,
    pub display_categories: Option<Vec<String>>,
    pub client_side: String,
    pub server_side: String,
    pub downloads: i32,
    #[serde(alias = "followers")]
    pub follows: i32,
    pub icon_url: Option<String>,
    pub license: Option<ModrinthLicense>,
    pub color: Option<i32>,
    pub versions: Option<Vec<String>>,
    pub game_versions: Option<Vec<String>>,
    pub loaders: Option<Vec<String>>,
    pub gallery: Option<Vec<ModrinthGalleryItem>>,
    pub published: String,
    pub updated: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ModrinthLicense {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
}

#[napi]
pub async fn modrinth_search(options: ModrinthSearchOptions) -> napi::Result<ModrinthSearchResult> {
    let client = get_client();
    
    let mut query_params = Vec::new();
    
    if let Some(ref q) = options.query {
        if !q.is_empty() {
            query_params.push(("query", q.clone()));
        }
    }
    
    let mut facets_list: Vec<Vec<String>> = Vec::new();
    if let Some(pt) = options.project_type {
        if !pt.is_empty() {
            facets_list.push(vec![format!("project_type:{}", pt)]);
        }
    }
    if let Some(gv) = options.game_version {
        if !gv.is_empty() {
            facets_list.push(vec![format!("versions:{}", gv)]);
        }
    }
    if let Some(l) = options.loader {
        if !l.is_empty() {
            facets_list.push(vec![format!("categories:{}", l)]);
        }
    }
    
    if !facets_list.is_empty() {
        if let Ok(facets_str) = serde_json::to_string(&facets_list) {
            query_params.push(("facets", facets_str));
        }
    }
    
    let limit = options.limit.unwrap_or(20);
    let offset = options.offset.unwrap_or(0);
    let index = options.sort_by.unwrap_or_else(|| "relevance".to_string());
    
    query_params.push(("limit", limit.to_string()));
    query_params.push(("offset", offset.to_string()));
    query_params.push(("index", index));

    let url = "https://api.modrinth.com/v2/search";
    
    let res = client.get(url)
        .query(&query_params)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| napi::Error::from_reason(format!("Failed to get text: {}", e)))?;

    if !status.is_success() {
        return Err(napi::Error::from_reason(format!("API error ({}): {}", status, text)));
    }

    let search_result: ModrinthSearchResult = serde_json::from_str(&text)
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {} | Body: {:.200}", e, text)))?;
        
    Ok(search_result)
}

#[napi]
pub async fn modrinth_get_project(project_id: String) -> napi::Result<ModrinthProject> {
    let client = get_client();
    let url = format!("https://api.modrinth.com/v2/project/{}", project_id);
    
    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;
        
    let detail: ModrinthProjectDetail = res.json()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {}", e)))?;
        
    let mut gallery_items = Vec::new();
    let mut featured_gallery = None;
    
    if let Some(items) = detail.gallery {
        for item in items {
            if item.featured && featured_gallery.is_none() {
                // Use standard optimized url for featured banner (faster loading)
                featured_gallery = Some(item.url.clone());
            }
            // Pass the full item object
            gallery_items.push(item);
        }
    }
    
    Ok(ModrinthProject {
        project_id: detail.project_id,
        project_type: detail.project_type,
        slug: detail.slug,
        title: detail.title,
        description: detail.description,
        categories: detail.categories,
        display_categories: detail.display_categories,
        client_side: detail.client_side,
        server_side: detail.server_side,
        downloads: detail.downloads,
        follows: detail.follows,
        icon_url: detail.icon_url,
        author: "Unknown".to_string(),
        versions: detail.versions,
        game_versions: detail.game_versions,
        loaders: detail.loaders,
        license: detail.license.map(|l| l.name),
        color: detail.color,
        latest_version: None,
        date_created: detail.published,
        date_modified: detail.updated,
        gallery: Some(gallery_items),
        featured_gallery,
    })
}

#[napi]
pub async fn modrinth_get_versions(project_id: String) -> napi::Result<Vec<ModrinthVersion>> {
    let client = get_client();
    let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);

    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Request failed: {}", e)))?;
        
    let status = res.status();
    let text = res.text().await.map_err(|e| napi::Error::from_reason(format!("Failed to get text: {}", e)))?;

    if !status.is_success() {
        return Err(napi::Error::from_reason(format!("API error ({}): {}", status, text)));
    }

    let versions: Vec<ModrinthVersion> = serde_json::from_str(&text)
        .map_err(|e| napi::Error::from_reason(format!("Parse failed: {} | Body: {:.200}", e, text)))?;
    
    Ok(versions)
}
