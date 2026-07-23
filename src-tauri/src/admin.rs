





use serde_json::{json, Value};

const API_URL: &str = "https://api.reality.catlabdesign.space";

fn api_token() -> Result<String, String> {
    crate::auth::get_session()
        .account
        .and_then(|s| s.api_token)
        .ok_or_else(|| "Not logged in".to_string())
}


async fn send(req: reqwest::RequestBuilder) -> Result<Value, String> {
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    if status.is_success() {
        Ok(body)
    } else {
        let msg = body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Request failed")
            .to_string();
        Err(msg)
    }
}

fn client() -> reqwest::Client {
    crate::http_client::HTTP_CLIENT.clone()
}

#[tauri::command]
pub async fn admin_check_status() -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(_) => return json!({ "isAdmin": false }),
    };
    match send(
        client()
            .get(format!("{API_URL}/admin/check"))
            .bearer_auth(token),
    )
    .await
    {
        Ok(v) => v,
        Err(_) => json!({ "isAdmin": false }),
    }
}

#[tauri::command]
pub async fn admin_get_settings() -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    match send(
        client()
            .get(format!("{API_URL}/admin/settings"))
            .bearer_auth(token),
    )
    .await
    {
        Ok(settings) => json!({ "ok": true, "settings": settings }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn admin_save_setting(setting_key: String, value: String) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let (endpoint, body) = match setting_key.as_str() {
        "microsoft-client-id" => ("microsoft-client-id", json!({ "clientId": value })),
        "microsoft-device-client-id" => {
            ("microsoft-device-client-id", json!({ "clientId": value }))
        }
        "microsoft-secret" => ("microsoft-secret", json!({ "secret": value })),
        "curseforge-api-key" => ("curseforge-api-key", json!({ "apiKey": value })),
        _ => return json!({ "ok": false, "error": "Unknown setting key" }),
    };

    let url = format!("{API_URL}/admin/settings/{endpoint}");
    match send(client().put(url).bearer_auth(token).json(&body)).await {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub fn get_system_info(app: tauri::AppHandle) -> Value {
    json!({ "apiUrl": API_URL, "version": app.package_info().version.to_string() })
}

#[tauri::command]
pub async fn admin_get_users(
    page: Option<u32>,
    limit: Option<u32>,
    search: Option<String>,
) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let mut url = format!(
        "{API_URL}/admin/users?page={}&limit={}",
        page.unwrap_or(1),
        limit.unwrap_or(20)
    );
    if let Some(s) = search.filter(|s| !s.is_empty()) {
        url.push_str(&format!("&search={}", urlencoding::encode(&s)));
    }

    match send(client().get(url).bearer_auth(token)).await {
        Ok(data) => json!({
            "ok": true,
            "users": data.get("users").cloned().unwrap_or(json!([])),
            "pagination": data.get("pagination").cloned().unwrap_or(Value::Null),
        }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn admin_ban_user(user_id: String, reason: Option<String>) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    let body = json!({ "reason": reason.unwrap_or_default() });
    match send(
        client()
            .post(format!("{API_URL}/admin/users/{user_id}/ban"))
            .bearer_auth(token)
            .json(&body),
    )
    .await
    {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn admin_unban_user(user_id: String) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    match send(
        client()
            .post(format!("{API_URL}/admin/users/{user_id}/unban"))
            .bearer_auth(token),
    )
    .await
    {
        Ok(_) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn admin_toggle_user_admin(user_id: String) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    match send(
        client()
            .post(format!("{API_URL}/admin/users/{user_id}/toggle-admin"))
            .bearer_auth(token),
    )
    .await
    {
        Ok(data) => {
            json!({ "ok": true, "isAdmin": data.get("isAdmin").cloned().unwrap_or(json!(false)) })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn admin_create_user(user_data: Value) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    match send(
        client()
            .post(format!("{API_URL}/admin/users"))
            .bearer_auth(token)
            .json(&user_data),
    )
    .await
    {
        Ok(data) => json!({ "ok": true, "user": data.get("user").cloned().unwrap_or(Value::Null) }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

#[tauri::command]
pub async fn admin_get_user_details(user_id: String) -> Value {
    let token = match api_token() {
        Ok(t) => t,
        Err(e) => return json!({ "ok": false, "error": e }),
    };
    match send(
        client()
            .get(format!("{API_URL}/admin/users/{user_id}"))
            .bearer_auth(token),
    )
    .await
    {
        Ok(mut data) => {
            let sessions = data
                .get_mut("sessions")
                .map(|s| s.take())
                .unwrap_or(json!([]));
            json!({ "ok": true, "user": data, "sessions": sessions })
        }
        Err(e) => json!({ "ok": false, "error": e }),
    }
}
