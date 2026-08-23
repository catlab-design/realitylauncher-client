use crate::config::default_launcher_dir;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;

const API_URL: &str = "https://api.reality.catlabdesign.space";
const MS_DEVICE_CODE_URL: &str =
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const MS_TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MC_ENTITLEMENTS_URL: &str = "https://api.minecraftservices.com/entitlements/mcstore";

struct OAuthConfig {
    client_id: String,
    fetched_at: i64,
}

fn oauth_config_cell() -> &'static Mutex<Option<OAuthConfig>> {
    static CELL: OnceLock<Mutex<Option<OAuthConfig>>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(None))
}

const OAUTH_CACHE_TTL_MS: i64 = 600_000;

async fn ensure_client_id() -> Result<String, String> {
    let now = chrono::Utc::now().timestamp_millis();
    {
        let cached = oauth_config_cell().lock().map_err(|e| e.to_string())?;
        if let Some(ref cfg) = *cached {
            if now - cfg.fetched_at < OAUTH_CACHE_TTL_MS {
                return Ok(cfg.client_id.clone());
            }
        }
    }

    let resp = crate::http_client::HTTP_CLIENT.get(format!("{API_URL}/oauth/config")).send()
        .await
        .map_err(|e| format!("Failed to fetch OAuth config: {e}"))?;

    #[derive(Deserialize)]
    struct OAuthCfgResp {
        #[serde(rename = "microsoftDeviceClientId")]
        microsoft_device_client_id: Option<String>,
    }

    let data = resp
        .json::<OAuthCfgResp>()
        .await
        .map_err(|e| format!("Bad OAuth config response: {e}"))?;

    let client_id = data
        .microsoft_device_client_id
        .ok_or_else(|| "Microsoft Client ID not returned by server".to_string())?;

    let mut cached = oauth_config_cell().lock().map_err(|e| e.to_string())?;
    *cached = Some(OAuthConfig {
        client_id: client_id.clone(),
        fetched_at: now,
    });

    Ok(client_id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub username: String,
    pub uuid: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub api_token: Option<String>,
    pub expires_at: Option<i64>,
    pub avatar_url: Option<String>,
    // "catid_avatar" | "minecraft_skin" โ€” which image the UI shows. Default
    // keeps pre-existing session.json files loading.
    #[serde(default)]
    pub avatar_source: Option<String>,
    pub auth_type: String,
}

fn session_path() -> PathBuf {
    default_launcher_dir().join("session.json")
}

fn load_session_from_disk() -> Option<Session> {
    let path = session_path();
    for attempt in 0..2 {
        if !path.exists() {
            crate::fs_utils::restore_pre_update_backup(&path);
        }
        if !path.exists() {
            return None;
        }
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                log::error!("[Auth] Cannot read session.json: {e}");
                return None;
            }
        };
        if let Ok(session) = serde_json::from_str::<Session>(&content) {
            let _ = fs::remove_file(crate::fs_utils::pre_update_backup_path(&path));
            return Some(session);
        }
        log::error!("[Auth] Failed to parse session.json (attempt {})", attempt + 1);
        crate::fs_utils::back_up_unreadable_file(&path);
        if attempt == 0 && crate::fs_utils::restore_pre_update_backup(&path) {
            continue;
        }
        return None;
    }
    None
}

fn save_session_to_disk(session: &Option<Session>) {
    let path = session_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Some(s) = session {
        if let Ok(json) = serde_json::to_string_pretty(s) {
            let tmp_path = path.with_extension("tmp");
            if fs::write(&tmp_path, json).is_ok() {
                if path.exists() {
                    let _ = fs::remove_file(&path);
                }
                let _ = fs::rename(&tmp_path, &path);
            }
        }
    } else if path.exists() {
        let _ = fs::remove_file(&path);
    }
}

static SESSION: Lazy<Mutex<Option<Session>>> = Lazy::new(|| Mutex::new(load_session_from_disk()));

fn set_session(session: Option<Session>) {
    if let Ok(mut s) = SESSION.lock() {
        *s = session.clone();
        save_session_to_disk(&session);
    }
}

pub(crate) fn get_session_inner() -> Option<Session> {
    SESSION.lock().ok().and_then(|s| s.clone())
}

/// Patch the stored session's avatar fields after the profile API confirms a


pub(crate) fn update_session_avatar(
    avatar_url: Option<String>,
    avatar_source: Option<String>,
) {
    let mut current = get_session_inner();
    if let Some(ref mut s) = current {
        if avatar_url.is_some() {
            s.avatar_url = avatar_url;
        }
        if avatar_source.is_some() {
            s.avatar_source = avatar_source;
        }
    }
    set_session(current);
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeStartResult {
    pub ok: bool,
    pub device_code: Option<String>,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub expires_in: Option<i64>,
    pub interval: Option<i64>,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollSessionResult {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub api_token: Option<String>,
    pub api_token_expires_at: Option<String>,
    pub catid_linked: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    pub status: String,
    pub error: Option<String>,
    pub session: Option<PollSessionResult>,
    pub link_switched: Option<bool>,
    pub old_cat_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    pub ok: bool,
    pub refreshed: bool,
    pub new_access_token: Option<String>,
    pub new_api_token: Option<String>,
    pub error: Option<String>,
    pub requires_relogin: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCommandResult {
    pub ok: bool,
    pub account: Option<Session>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatIDLoginSessionResult {
    pub username: String,
    pub uuid: String,
    pub token: String,
    pub minecraft_uuid: Option<String>,
    pub expires_at: Option<String>,
    pub avatar_url: Option<String>,
    pub avatar_source: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatIDLoginResult {
    pub ok: bool,
    pub session: Option<CatIDLoginSessionResult>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: i64,
    interval: i64,
    message: Option<String>,
    error: Option<String>,
    #[serde(rename = "error_description")]
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MsTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error: Option<String>,
    #[serde(rename = "error_description")]
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct XblResponse {
    #[serde(rename = "Token")]
    token: Option<String>,
    #[serde(rename = "DisplayClaims")]
    display_claims: Option<XblDisplayClaims>,
}

#[derive(Debug, Deserialize)]
struct XblDisplayClaims {
    xui: Option<Vec<XblXui>>,
}

#[derive(Debug, Deserialize)]
struct XblXui {
    uhs: Option<String>,
}

#[derive(Debug, Deserialize)]
struct XstsResponse {
    #[serde(rename = "Token")]
    token: Option<String>,
    #[serde(rename = "XErr")]
    x_err: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct McLoginResponse {
    access_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct McProfile {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct McEntitlements {
    items: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct MlApiSessionResponse {
    token: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<String>,
    #[serde(rename = "linkSwitched")]
    link_switched: Option<bool>,
    #[serde(rename = "oldCatID")]
    old_cat_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CatIDUserPayload {
    id: Option<serde_json::Value>,
    username: Option<String>,
    #[serde(rename = "minecraftUsername")]
    minecraft_username: Option<String>,
    #[serde(rename = "minecraftUuid")]
    minecraft_uuid: Option<String>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    #[serde(rename = "avatarSource")]
    avatar_source: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CatIDLoginResponse {
    token: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: Option<String>,
    message: Option<String>,
    user: Option<CatIDUserPayload>,
}

fn map_ms_error(code: &str, description: Option<&str>) -> (String, bool) {
    match code {
        "authorization_pending" => ("pending".into(), false),
        "expired_token" => ("expired".into(), false),
        "authorization_declined" => ("User declined".into(), false),
        "invalid_grant" | "interaction_required" => (
            "Session expired, please re-login with Microsoft.".into(),
            true,
        ),
        _ => (description.unwrap_or("Unknown error").to_string(), false),
    }
}

async fn xbl_auth(ms_access_token: &str) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={ms_access_token}"),
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
    });

    let resp = crate::http_client::HTTP_CLIENT.clone()
        .post(XBL_AUTH_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XBL request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Xbox Live auth failed ({})", resp.status()));
    }

    let data = resp
        .json::<XblResponse>()
        .await
        .map_err(|e| format!("XBL parse failed: {e}"))?;

    let token = data.token.ok_or("XBL missing Token")?;
    let uhs = data
        .display_claims
        .and_then(|d| d.xui)
        .and_then(|x| x.into_iter().next())
        .and_then(|x| x.uhs)
        .ok_or("XBL missing uhs")?;

    Ok((token, uhs))
}

async fn xsts_auth(xbl_token: &str) -> Result<(String, String), String> {
    let body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token],
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT",
    });

    let resp = crate::http_client::HTTP_CLIENT.clone()
        .post(XSTS_AUTH_URL)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("XSTS request failed: {e}"))?;

    let data = resp
        .json::<XstsResponse>()
        .await
        .map_err(|e| format!("XSTS parse failed: {e}"))?;

    let token = data.token.ok_or_else(|| {
        if let Some(err) = data.x_err {
            match err {
                2148916233 => "เนเธกเนเธกเธต Xbox Live".to_string(),
                2148916238 => "เธ•เนเธญเธเธกเธตเธเธนเนเธเธเธเธฃเธญเธเธญเธเธธเธกเธฑเธ•เธด".to_string(),
                _ => format!("XSTS failed: {err}"),
            }
        } else {
            "XSTS failed".to_string()
        }
    })?;

    Ok((token, String::new()))
}

async fn mc_login(user_hash: &str, xsts_token: &str) -> Result<String, String> {
    let identity_token = format!("XBL3.0 x={user_hash};{xsts_token}");
    let body = serde_json::json!({
        "identityToken": identity_token,
    });

    let resp = crate::http_client::HTTP_CLIENT.clone()
        .post(MC_LOGIN_URL)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Minecraft auth request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Minecraft auth failed (HTTP {status}): {text}"));
    }

    let data = resp
        .json::<McLoginResponse>()
        .await
        .map_err(|e| format!("MC login parse failed: {e}"))?;

    data.access_token
        .ok_or("Minecraft auth missing access_token".to_string())
}

async fn check_entitlements(mc_token: &str) -> Result<(), String> {
    let resp = crate::http_client::HTTP_CLIENT.clone()
        .get(MC_ENTITLEMENTS_URL)
        .header("Authorization", format!("Bearer {mc_token}"))
        .send()
        .await
        .map_err(|e| format!("Entitlement check failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("เธ•เธฃเธงเธเธชเธญเธ Minecraft เธฅเนเธกเน€เธซเธฅเธง ({})", resp.status()));
    }

    let data = resp
        .json::<McEntitlements>()
        .await
        .map_err(|e| format!("Entitlement parse failed: {e}"))?;

    let items = data.items.unwrap_or_default();
    if items.is_empty() {
        return Err("เนเธกเนเธกเธต Minecraft".to_string());
    }

    Ok(())
}

async fn mc_profile(mc_token: &str) -> Result<(String, String), String> {
    let resp = crate::http_client::HTTP_CLIENT.clone()
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {mc_token}"))
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Profile fetch failed ({})", resp.status()));
    }

    let data = resp
        .json::<McProfile>()
        .await
        .map_err(|e| format!("Profile parse failed: {e}"))?;

    let uuid = data.id.ok_or("Profile missing id")?;
    let name = data.name.ok_or("Profile missing name")?;

    Ok((uuid, name))
}

async fn exchange_with_ml_api(
    mc_token: &str,
    uuid: &str,
    username: &str,
    is_linking: bool,
    api_token_override: Option<&str>,
) -> Result<(Option<String>, Option<String>, Option<bool>, Option<String>), String> {
    let body = serde_json::json!({
        "accessToken": mc_token,
        "uuid": uuid,
        "username": username,
    });

    let client = crate::http_client::HTTP_CLIENT.clone();

    if is_linking {
        if let Some(token) = api_token_override {
            let resp = client
                .post(format!("{API_URL}/auth/microsoft/link"))
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {token}"))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Link request failed: {e}"))?;

            if resp.status().is_success() {
                let data =
                    resp.json::<MlApiSessionResponse>()
                        .await
                        .unwrap_or(MlApiSessionResponse {
                            token: None,
                            expires_at: None,
                            link_switched: None,
                            old_cat_id: None,
                        });

                return Ok((
                    data.token,
                    data.expires_at,
                    data.link_switched,
                    data.old_cat_id,
                ));
            }

            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("Link failed ({status}): {err_text}"));
        }
        
    }

    
    let mut resp = client
        .post(format!("{API_URL}/auth/microsoft/login"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("ML API login request failed: {e}"))?;

    if resp.status() == 404 || resp.status() == 405 {
        resp = client
            .post(format!("{API_URL}/auth/microsoft/link"))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("ML API link fallback failed: {e}"))?;
    }

    if resp.status().is_success() {
        let data = resp
            .json::<MlApiSessionResponse>()
            .await
            .unwrap_or(MlApiSessionResponse {
                token: None,
                expires_at: None,
                link_switched: None,
                old_cat_id: None,
            });

        Ok((
            data.token,
            data.expires_at,
            data.link_switched,
            data.old_cat_id,
        ))
    } else {
        Ok((None, None, None, None))
    }
}

#[tauri::command]
pub async fn start_device_code_auth() -> DeviceCodeStartResult {
    let client_id = match ensure_client_id().await {
        Ok(id) => id,
        Err(e) => {
            return DeviceCodeStartResult {
                ok: false,
                device_code: None,
                user_code: None,
                verification_uri: None,
                expires_in: None,
                interval: None,
                message: None,
                error: Some(e),
            }
        }
    };

    let body = [
        ("client_id", client_id.as_str()),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let resp = match crate::http_client::HTTP_CLIENT.clone()
        .post(MS_DEVICE_CODE_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return DeviceCodeStartResult {
                ok: false,
                device_code: None,
                user_code: None,
                verification_uri: None,
                expires_in: None,
                interval: None,
                message: None,
                error: Some(format!("Device code request failed: {e}")),
            }
        }
    };

    let data: DeviceCodeResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return DeviceCodeStartResult {
                ok: false,
                device_code: None,
                user_code: None,
                verification_uri: None,
                expires_in: None,
                interval: None,
                message: None,
                error: Some(format!("Parse device code response failed: {e}")),
            }
        }
    };

    if let Some(err) = data.error {
        return DeviceCodeStartResult {
            ok: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            message: None,
            error: Some(data.error_description.unwrap_or(err)),
        };
    }

    DeviceCodeStartResult {
        ok: true,
        device_code: Some(data.device_code),
        user_code: Some(data.user_code),
        verification_uri: Some(data.verification_uri),
        expires_in: Some(data.expires_in),
        interval: Some(data.interval),
        message: data.message,
        error: None,
    }
}

#[tauri::command]
pub async fn poll_device_code_auth(device_code: String, is_linking: Option<bool>) -> PollResult {
    let client_id = match ensure_client_id().await {
        Ok(id) => id,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(e),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    let linking = is_linking.unwrap_or(false);

    let body = [
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ("client_id", client_id.as_str()),
        ("device_code", device_code.as_str()),
    ];

    let resp = match crate::http_client::HTTP_CLIENT.clone()
        .post(MS_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(format!("Token poll request failed: {e}")),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    let token_data: MsTokenResponse = match resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(format!("Parse token response failed: {e}")),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    if let Some(ref err) = token_data.error {
        let (msg, _) = map_ms_error(err, token_data.error_description.as_deref());
        let status = match err.as_str() {
            "authorization_pending" => "pending".to_string(),
            "expired_token" => "expired".to_string(),
            _ => "error".to_string(),
        };
        return PollResult {
            status,
            error: Some(msg),
            session: None,
            link_switched: None,
            old_cat_id: None,
        };
    }

    let ms_access_token = match token_data.access_token {
        Some(t) => t,
        None => {
            return PollResult {
                status: "error".into(),
                error: Some("No access token".into()),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    let ms_refresh_token = token_data.refresh_token;
    let ms_expires_in = token_data.expires_in;

    let (xbl_token, user_hash) = match xbl_auth(&ms_access_token).await {
        Ok(r) => r,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(e),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    let (xsts_token, _) = match xsts_auth(&xbl_token).await {
        Ok(r) => r,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(e),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    let mc_token = match mc_login(&user_hash, &xsts_token).await {
        Ok(t) => t,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(e),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    if let Err(e) = check_entitlements(&mc_token).await {
        return PollResult {
            status: "error".into(),
            error: Some(e),
            session: None,
            link_switched: None,
            old_cat_id: None,
        };
    }

    let (uuid, username) = match mc_profile(&mc_token).await {
        Ok(p) => p,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(e),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    
    let current_session = get_session_inner();
    let api_token_override = current_session.as_ref().and_then(|s| s.api_token.clone());

    let (api_token, api_token_expires_at, link_switched, old_cat_id) = match exchange_with_ml_api(
        &mc_token,
        &uuid,
        &username,
        linking,
        api_token_override.as_deref(),
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            return PollResult {
                status: "error".into(),
                error: Some(e),
                session: None,
                link_switched: None,
                old_cat_id: None,
            }
        }
    };

    let session = Session {
        username: username.clone(),
        uuid: uuid.clone(),
        access_token: Some(mc_token.clone()),
        refresh_token: ms_refresh_token.clone(),
        api_token: api_token.clone(),
        expires_at: ms_expires_in.map(|secs| chrono::Utc::now().timestamp_millis() + secs * 1000),
        avatar_url: None,
        avatar_source: None,
        auth_type: "microsoft".into(),
    };

    set_session(Some(session));

    PollResult {
        status: "success".into(),
        error: None,
        session: Some(PollSessionResult {
            username,
            uuid,
            access_token: mc_token,
            refresh_token: ms_refresh_token,
            expires_in: ms_expires_in,
            api_token,
            api_token_expires_at,
            catid_linked: if linking { Some(true) } else { None },
        }),
        link_switched,
        old_cat_id,
    }
}

#[tauri::command]
pub fn get_session() -> AuthCommandResult {
    match get_session_inner() {
        Some(s) => AuthCommandResult {
            ok: true,
            account: Some(s),
            error: None,
        },
        None => AuthCommandResult {
            ok: false,
            account: None,
            error: Some("Not logged in".into()),
        },
    }
}

#[tauri::command]
pub fn logout() -> Result<(), String> {
    set_session(None);
    Ok(())
}

static REFRESH_LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();

fn refresh_lock() -> &'static tokio::sync::Mutex<()> {
    REFRESH_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

async fn auth_refresh_core(force: bool) -> AuthCommandResult {
    let _guard = refresh_lock().lock().await;
    let session = match get_session_inner() {
        Some(s) => s,
        None => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some("Not logged in".into()),
            }
        }
    };

    if session.auth_type != "microsoft" {
        return AuthCommandResult {
            ok: true,
            account: get_session_inner(),
            error: None,
        };
    }

    let is_expired = session.expires_at.map_or(true, |exp| {
        chrono::Utc::now().timestamp_millis() > exp - 300_000
    });

    if !force && !is_expired {
        return AuthCommandResult {
            ok: true,
            account: get_session_inner(),
            error: None,
        };
    }

    let refresh_token = match session.refresh_token {
        Some(ref t) if !t.is_empty() => t.clone(),
        _ => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some("Session expired, please re-login with Microsoft.".into()),
            }
        }
    };

    let client_id = match ensure_client_id().await {
        Ok(id) => id,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(e),
            }
        }
    };

    let body = [
        ("grant_type", "refresh_token"),
        ("client_id", client_id.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("scope", "XboxLive.signin offline_access"),
    ];

    let token_resp = match crate::http_client::HTTP_CLIENT.clone()
        .post(MS_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(format!("Token refresh request failed: {e}")),
            }
        }
    };

    let token_data: MsTokenResponse = match token_resp.json().await {
        Ok(d) => d,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(format!("Parse token response failed: {e}")),
            }
        }
    };

    if let Some(ref err) = token_data.error {
        let (msg, _) = map_ms_error(err, token_data.error_description.as_deref());
        return AuthCommandResult {
            ok: false,
            account: None,
            error: Some(msg),
        };
    }

    let ms_access_token = match token_data.access_token {
        Some(t) => t,
        None => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some("No access token in refresh response".into()),
            }
        }
    };

    let ms_new_refresh_token = token_data.refresh_token.unwrap_or(refresh_token);
    let ms_expires_in = token_data.expires_in;

    let (xbl_token, user_hash) = match xbl_auth(&ms_access_token).await {
        Ok(r) => r,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(e),
            }
        }
    };

    let (xsts_token, _) = match xsts_auth(&xbl_token).await {
        Ok(r) => r,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(e),
            }
        }
    };

    let mc_token = match mc_login(&user_hash, &xsts_token).await {
        Ok(t) => t,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(e),
            }
        }
    };

    let expires_at = ms_expires_in.map(|secs| chrono::Utc::now().timestamp_millis() + secs * 1000);

    if let Ok(mut s) = SESSION.lock() {
        if let Some(ref mut stored) = *s {
            stored.access_token = Some(mc_token.clone());
            stored.refresh_token = Some(ms_new_refresh_token);
            stored.expires_at = expires_at;
        }
        save_session_to_disk(&s);
    }

    if let Some(api_token_str) = session.api_token.clone() {
        let refresh_body = serde_json::json!({
            "accessToken": mc_token,
            "uuid": session.uuid,
            "username": session.username,
        });

        let client = crate::http_client::HTTP_CLIENT.clone();
        let api_resp = client
            .post(format!("{API_URL}/auth/microsoft/link"))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {api_token_str}"))
            .json(&refresh_body)
            .send()
            .await;

        if let Ok(resp) = api_resp {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<MlApiSessionResponse>().await {
                    if let Some(ref token) = data.token {
                        if let Ok(mut s) = SESSION.lock() {
                            if let Some(ref mut stored) = *s {
                                stored.api_token = Some(token.clone());
                            }
                            save_session_to_disk(&s);
                        }
                    }
                }
            }
        }
    } else {
        let refresh_body = serde_json::json!({
            "accessToken": mc_token,
            "uuid": session.uuid,
            "username": session.username,
        });

        let client = crate::http_client::HTTP_CLIENT.clone();
        let mut api_resp = client
            .post(format!("{API_URL}/auth/microsoft/login"))
            .header("Content-Type", "application/json")
            .json(&refresh_body)
            .send()
            .await;

        if let Ok(ref resp) = api_resp {
            if resp.status() == 404 || resp.status() == 405 {
                api_resp = client
                    .post(format!("{API_URL}/auth/microsoft/link"))
                    .header("Content-Type", "application/json")
                    .json(&refresh_body)
                    .send()
                    .await;
            }
        }

        if let Ok(resp) = api_resp {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<MlApiSessionResponse>().await {
                    if let Some(ref token) = data.token {
                        if let Ok(mut s) = SESSION.lock() {
                            if let Some(ref mut stored) = *s {
                                stored.api_token = Some(token.clone());
                            }
                            save_session_to_disk(&s);
                        }
                    }
                }
            }
        }
    }

    AuthCommandResult {
        ok: true,
        account: get_session_inner(),
        error: None,
    }
}

#[tauri::command]
pub async fn auth_refresh() -> AuthCommandResult {
    auth_refresh_core(false).await
}

/// Best-effort token refresh for internal callers (cloud 401 retry path).
/// Forces the Microsoft refresh chain even when the MC token is not yet near
/// expiry, so a rejected/rotated API token gets re-minted via
/// `/auth/microsoft/link`. Never fails for CatID sessions — they fall back to
/// the stored token so the caller's single retry still happens.
pub(crate) async fn refresh_api_token() -> Result<String, String> {
    let Some(session) = get_session_inner() else {
        return Err("Not logged in".to_string());
    };
    if session.auth_type == "microsoft" {
        let result = auth_refresh_core(true).await;
        if let Some(err) = result.error {
            log::warn!("[Auth] Background token refresh failed: {err}");
        }
    }
    get_session_inner()
        .and_then(|s| s.api_token)
        .ok_or_else(|| "No API token available".to_string())
}

#[tauri::command]
pub async fn login_microsoft() -> AuthCommandResult {
    match get_session_inner() {
        Some(session) => AuthCommandResult {
            ok: true,
            account: Some(session),
            error: None,
        },
        None => AuthCommandResult {
            ok: false,
            account: None,
            error: Some("Not logged in".into()),
        },
    }
}

fn catid_display_name(user: &CatIDUserPayload, fallback: &str) -> String {
    user.minecraft_username
        .as_deref()
        .or(user.username.as_deref())
        .unwrap_or(fallback)
        .to_string()
}

fn catid_session_uuid(user: &CatIDUserPayload, fallback: &str) -> String {
    user.id
        .as_ref()
        .map(|id| format!("catid-{id}"))
        .unwrap_or_else(|| fallback.to_string())
}

#[tauri::command]
pub async fn login_catid(username: String, password: String) -> AuthCommandResult {
    let body = serde_json::json!({
        "username": username,
        "password": password,
    });

    let resp = match crate::http_client::HTTP_CLIENT.clone()
        .post(format!("{API_URL}/auth/catid/login"))
        .header("Content-Type", "application/json")
        .header("X-Client-App", "RealityLauncher")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(format!("Login request failed: {e}")),
            }
        }
    };

    let status = resp.status();
    let data: CatIDLoginResponse = match resp.json().await {
        Ok(d) => d,
        Err(_) => {
            let msg = if status.is_success() {
                "เน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเธ•เธญเธเธเธฅเธฑเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ".to_string()
            } else {
                format!("เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”: {status}")
            };
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(msg),
            };
        }
    };

    if !status.is_success() || data.token.is_none() {
        let msg = data
            .message
            .or_else(|| data.token.as_ref().map(|_| "".to_string()))
            .unwrap_or_else(|| "เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธกเนเธชเธณเน€เธฃเนเธ".to_string());
        if msg.is_empty() && status.is_success() {
        } else {
            return AuthCommandResult {
                ok: false,
                account: None,
                error: Some(msg),
            };
        }
    }

    let Some(token) = data.token else {
        return AuthCommandResult {
            ok: false,
            account: None,
            error: Some("CatID login missing token".to_string()),
        };
    };

    let user = data.user.unwrap_or(CatIDUserPayload {
        id: None,
        username: None,
        minecraft_username: None,
        minecraft_uuid: None,
        avatar_url: None,
        avatar_source: None,
    });

    let display_name = catid_display_name(&user, &username);
    let uuid = catid_session_uuid(
        &user,
        &format!("catid-{}", chrono::Utc::now().timestamp_millis()),
    );

    let api_token = Some(token.clone());

    let session = Session {
        username: display_name.clone(),
        uuid: uuid.clone(),
        access_token: Some(token.clone()),
        refresh_token: None,
        api_token,
        expires_at: data.expires_at.as_ref().and_then(|s| {
            
            chrono::DateTime::parse_from_rfc3339(s)
                .ok()
                .map(|dt| dt.timestamp_millis())
        }),
        avatar_url: user.avatar_url.clone(),
        avatar_source: user.avatar_source.clone(),
        auth_type: "catid".into(),
    };

    set_session(Some(session.clone()));

    AuthCommandResult {
        ok: true,
        account: Some(session),
        error: None,
    }
}

async fn catid_passthrough(req: reqwest::RequestBuilder, default_err: &str) -> serde_json::Value {
    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let mut data = resp
                .json::<serde_json::Value>()
                .await
                .unwrap_or_else(|_| serde_json::json!({}));
            if status.is_success() {
                if let Some(obj) = data.as_object_mut() {
                    obj.insert("ok".into(), serde_json::Value::Bool(true));
                }
                data
            } else {
                let msg = data
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or(default_err)
                    .to_string();
                serde_json::json!({ "ok": false, "error": msg })
            }
        }
        Err(e) => serde_json::json!({ "ok": false, "error": e.to_string() }),
    }
}

#[tauri::command]
pub async fn register_catid(
    username: String,
    email: String,
    password: String,
    confirm_password: Option<String>,
) -> serde_json::Value {
    let body = serde_json::json!({
        "username": username,
        "email": email,
        "password": password,
        "confirmPassword": confirm_password,
    });
    let req = crate::http_client::HTTP_CLIENT.clone()
        .post(format!("{API_URL}/auth/catid/register"))
        .header("Content-Type", "application/json")
        .header("X-Client-App", "RealityLauncher")
        .json(&body);
    catid_passthrough(req, "เธชเธกเธฑเธเธฃเนเธกเนเธชเธณเน€เธฃเนเธ").await
}

#[tauri::command]
pub async fn check_registration_status(token: String) -> serde_json::Value {
    match crate::http_client::HTTP_CLIENT.clone()
        .get(format!("{API_URL}/auth/catid/register/status/{token}"))
        .header("Content-Type", "application/json")
        .send()
        .await
    {
        Ok(resp) => resp.json::<serde_json::Value>().await.unwrap_or_else(
            |_| serde_json::json!({ "status": "error", "message": "เน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเธ•เธญเธเธเธฅเธฑเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ" }),
        ),
        Err(e) => serde_json::json!({ "status": "error", "message": e.to_string() }),
    }
}

#[tauri::command]
pub async fn forgot_password(email: String) -> serde_json::Value {
    let req = crate::http_client::HTTP_CLIENT.clone()
        .post(format!("{API_URL}/auth/catid/forgot-password"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "email": email }));
    catid_passthrough(req, "Failed to send OTP").await
}

#[tauri::command]
pub async fn reset_password(email: String, otp: String, new_password: String) -> serde_json::Value {
    let req = crate::http_client::HTTP_CLIENT.clone()
        .post(format!("{API_URL}/auth/catid/reset-password"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "email": email, "otp": otp, "newPassword": new_password }));
    catid_passthrough(req, "Failed to reset password").await
}

#[tauri::command]
pub async fn login_catid_token(token: String) -> serde_json::Value {
    let resp = match crate::http_client::HTTP_CLIENT.clone()
        .get(format!("{API_URL}/auth/catid/me"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }),
    };

    let status = resp.status();
    let data = match resp.json::<serde_json::Value>().await {
        Ok(d) => d,
        Err(_) => {
            return serde_json::json!({
                "ok": false,
                "error": if status.is_success() { "เน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเธ•เธญเธเธเธฅเธฑเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ".to_string() } else { format!("เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”: {status}") }
            })
        }
    };

    if !status.is_success() {
        let msg = data
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Session เธซเธกเธ”เธญเธฒเธขเธธเธซเธฃเธทเธญเนเธเนเนเธกเนเนเธ”เน");
        return serde_json::json!({ "ok": false, "error": msg });
    }

    let user: CatIDUserPayload =
        serde_json::from_value(data.get("user").cloned().unwrap_or(serde_json::Value::Null))
            .unwrap_or(CatIDUserPayload {
                id: None,
                username: None,
                minecraft_username: None,
                minecraft_uuid: None,
                avatar_url: None,
                avatar_source: None,
            });

    let display_name = catid_display_name(&user, "Player");
    let uuid = catid_session_uuid(
        &user,
        &format!("catid-{}", chrono::Utc::now().timestamp_millis()),
    );

    set_session(Some(Session {
        username: display_name.clone(),
        uuid: uuid.clone(),
        access_token: Some(token.clone()),
        refresh_token: None,
        api_token: Some(token.clone()),
        expires_at: None,
        avatar_url: user.avatar_url.clone(),
        avatar_source: user.avatar_source.clone(),
        auth_type: "catid".into(),
    }));

    serde_json::json!({
        "ok": true,
        "session": {
            "type": "catid",
            "username": display_name,
            "uuid": uuid,
            "accessToken": token,
            "minecraftUuid": user.minecraft_uuid,
            "avatarUrl": user.avatar_url,
            "avatarSource": user.avatar_source,
            "createdAt": chrono::Utc::now().timestamp_millis(),
        }
    })
}

#[tauri::command]
pub fn set_active_session(session: serde_json::Value) -> serde_json::Value {
    let get = |keys: &[&str]| -> Option<String> {
        keys.iter()
            .find_map(|k| session.get(*k).and_then(|v| v.as_str()).map(String::from))
    };
    let auth_type = get(&["type", "authType"]).unwrap_or_else(|| "catid".to_string());
    let access_token = get(&["accessToken", "access_token"]);
    let api_token = get(&["apiToken", "api_token"]).or_else(|| {
        if auth_type == "catid" {
            access_token.clone()
        } else {
            None
        }
    });

    set_session(Some(Session {
        username: get(&["username"]).unwrap_or_default(),
        uuid: get(&["uuid"]).unwrap_or_default(),
        access_token,
        refresh_token: get(&["refreshToken", "refresh_token"]),
        api_token,
        expires_at: session
            .get("expiresAt")
            .or_else(|| session.get("expires_at"))
            .and_then(|v| v.as_i64()),
        avatar_url: get(&["avatarUrl", "avatar_url"]),
        avatar_source: get(&["avatarSource", "avatar_source"]),
        auth_type,
    }));

    session
}

#[tauri::command]
pub async fn link_catid(
    app: tauri::AppHandle,
    username: String,
    password: String,
) -> serde_json::Value {
    let session = match get_session_inner() {
        Some(s) => s,
        None => return serde_json::json!({ "ok": false, "error": "เธ•เนเธญเธเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเธ”เนเธงเธข Microsoft เธเนเธญเธ" }),
    };

    if session.auth_type != "microsoft" {
        return serde_json::json!({ "ok": false, "error": "เธ•เนเธญเธเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเธ”เนเธงเธข Microsoft เธเนเธญเธ" });
    }

    
    let login_body = serde_json::json!({ "username": username, "password": password });
    let client = crate::http_client::HTTP_CLIENT.clone();
    let login_resp = match client
        .post(format!("{API_URL}/auth/catid/login"))
        .header("Content-Type", "application/json")
        .header("X-Client-App", "RealityLauncher")
        .json(&login_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return serde_json::json!({ "ok": false, "error": format!("Login failed: {e}") }),
    };

    let login_status = login_resp.status();
    let login_data: serde_json::Value = match login_resp.json().await {
        Ok(d) => d,
        Err(_) => return serde_json::json!({ "ok": false, "error": "เน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเธ•เธญเธเธเธฅเธฑเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ" }),
    };

    if !login_status.is_success() {
        let msg = login_data
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("เธเธทเนเธญเธเธนเนเนเธเนเธซเธฃเธทเธญเธฃเธซเธฑเธชเธเนเธฒเธเธเธดเธ”");
        return serde_json::json!({ "ok": false, "error": msg });
    }

    let catid_token = match login_data.get("token").and_then(|t| t.as_str()) {
        Some(t) => t.to_string(),
        None => return serde_json::json!({ "ok": false, "error": "เน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเนเธกเนเนเธ”เนเธเธทเธเธเนเธฒเนเธ—เน€เธเนเธเธกเธฒ" }),
    };

    let ms_expires_at = session.expires_at.map(|ts| {
        let dt = chrono::DateTime::from_timestamp_millis(ts).unwrap_or_default();
        dt.to_rfc3339()
    });

    let link_body = serde_json::json!({
        "accessToken": session.access_token.unwrap_or_default(),
        "uuid": session.uuid,
        "username": session.username,
        "accessTokenExpiresAt": ms_expires_at,
    });

    let link_resp = match client
        .post(format!("{API_URL}/auth/microsoft/link"))
        .header("Authorization", format!("Bearer {catid_token}"))
        .header("Content-Type", "application/json")
        .header("X-Client-App", "RealityLauncher")
        .json(&link_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return serde_json::json!({ "ok": false, "error": format!("Link failed: {e}") }),
    };

    let link_status = link_resp.status();
    if !link_status.is_success() {
        let error_text = link_resp.text().await.unwrap_or_default();
        return serde_json::json!({ "ok": false, "error": if error_text.is_empty() { "เน€เธเธทเนเธญเธกเธ•เนเธญเนเธกเนเธชเธณเน€เธฃเนเธ".to_string() } else { error_text } });
    }

    let link_data: serde_json::Value = match link_resp.json().await {
        Ok(d) => d,
        Err(_) => serde_json::json!({}),
    };

    if let Some(mut current_session) = get_session_inner() {
        current_session.api_token = Some(catid_token.clone());
        set_session(Some(current_session));
    }

    let app_clone = app.clone();
    tokio::spawn(async move {
        let _ = crate::cloud::instances_cloud_sync(app_clone).await;
    });

    serde_json::json!({
        "ok": true,
        "token": catid_token,
        "linkSwitched": link_data.get("linkSwitched").and_then(|v| v.as_bool()).unwrap_or(false),
        "oldCatID": link_data.get("oldCatID").cloned().unwrap_or(serde_json::Value::Null)
    })
}

#[tauri::command]
pub fn auth_unlink(provider: String) -> serde_json::Value {
    match get_session_inner() {
        None => serde_json::json!({ "ok": false, "error": "เนเธกเนเนเธ”เนเน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ" }),
        Some(session) => {
            if session.auth_type == provider {
                set_session(None);
            }
            serde_json::json!({ "ok": true })
        }
    }
}
