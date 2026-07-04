const API_URL: &str = "https://api.reality.catlabdesign.space";

#[tauri::command]
pub async fn curseforge_search(
    query: Option<String>,
    project_type: Option<String>,
    game_version: Option<String>,
    mod_loader_type: Option<i32>,
    sort_by: Option<String>,
    page_size: Option<i32>,
    index: Option<i32>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut params = Vec::new();

    if let Some(ref q) = query {
        let clean_q = crate::mod_meta::clean_search_name(q);
        params.push(format!("query={}", urlencoding::encode(&clean_q)));
    }
    if let Some(ref pt) = project_type {
        params.push(format!("projectType={}", urlencoding::encode(pt)));
    }
    if let Some(ref gv) = game_version {
        params.push(format!("gameVersion={}", urlencoding::encode(gv)));
    }
    if let Some(mlt) = mod_loader_type {
        params.push(format!("modLoaderType={mlt}"));
    }
    if let Some(ref sb) = sort_by {
        params.push(format!("sortBy={}", urlencoding::encode(sb)));
    }
    if let Some(ps) = page_size {
        params.push(format!("pageSize={ps}"));
    }
    if let Some(idx) = index {
        params.push(format!("index={idx}"));
    }

    let query_str = params.join("&");
    let url = format!("{API_URL}/curseforge/search?{query_str}");

    println!("[CurseForge] Search: {}", url);

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("CurseForge search request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge API error: {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn curseforge_get_project(project_id: i32) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{API_URL}/curseforge/project/{project_id}");

    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("CurseForge get project failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge API error: {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn curseforge_get_files(
    project_id: i32,
    game_version: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut all_files: Vec<serde_json::Value> = Vec::new();
    let mut index = 0;
    let page_size = 50;

    loop {
        let mut url = format!(
            "{API_URL}/curseforge/project/{project_id}/files?pageSize={page_size}&index={index}"
        );
        if let Some(ref gv) = game_version {
            url.push_str(&format!("&gameVersion={}", urlencoding::encode(gv)));
        }

        let resp = client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| format!("CurseForge get files failed: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("CurseForge API error: {}", resp.status()));
        }

        let result: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let data = result
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();
        if data.is_empty() {
            break;
        }

        let total = result
            .get("pagination")
            .and_then(|p| p.get("totalCount").and_then(|t| t.as_u64()))
            .unwrap_or(0);

        all_files.extend(data);
        index += page_size;

        if index as u64 >= total {
            break;
        }
        
        if all_files.len() >= 200 {
            break;
        }
    }

    Ok(serde_json::json!({ "data": all_files }))
}



#[tauri::command]
pub fn curseforge_clear_cache() -> Result<(), String> {
    Ok(())
}



#[tauri::command]
pub async fn curseforge_get_description(project_id: i32) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{API_URL}/curseforge/project/{project_id}/description");
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("CurseForge get description failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("CurseForge API error: {}", resp.status()));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())
}
