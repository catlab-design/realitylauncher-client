use discord_rich_presence::{
    activity::{Activity, Assets},
    DiscordIpc, DiscordIpcClient,
};
use once_cell::sync::Lazy;
use std::sync::Mutex;

const CLIENT_ID: &str = "1449834700079366174";

struct DiscordState {
    client: Option<DiscordIpcClient>,
    is_ready: bool,
    is_initializing: bool,
    start_timestamp: i64,
    enabled: bool,
    last_game_status: Option<String>,
    last_game_server_name: Option<String>,
    last_game_server_icon: Option<String>,
    last_game_cloud_id: Option<String>,
    last_game_ping_ms: Option<i64>,
    last_game_player_count: Option<(u32, u32)>,
    ping_loop_active: bool,
}

static STATE: Lazy<Mutex<DiscordState>> = Lazy::new(|| {
    Mutex::new(DiscordState {
        client: None,
        is_ready: false,
        is_initializing: false,
        start_timestamp: chrono::Utc::now().timestamp_millis(),
        enabled: true,
        last_game_status: None,
        last_game_server_name: None,
        last_game_server_icon: None,
        last_game_cloud_id: None,
        last_game_ping_ms: None,
        last_game_player_count: None,
        ping_loop_active: false,
    })
});

async fn ensure_connected() -> bool {
    let mut state = STATE.lock().unwrap();
    if state.is_ready && state.client.is_some() {
        return true;
    }
    if state.is_initializing || !state.enabled {
        return false;
    }

    state.is_initializing = true;
    drop(state);

    match DiscordIpcClient::new(CLIENT_ID) {
        Ok(mut client) => match client.connect() {
            Ok(_) => {
                let mut state = STATE.lock().unwrap();
                state.client = Some(client);
                state.is_ready = true;
                state.is_initializing = false;
                println!("[Discord RPC] Connected!");
                true
            }
            Err(e) => {
                println!("[Discord RPC] Failed to connect: {e}");
                STATE.lock().unwrap().is_initializing = false;
                false
            }
        },
        Err(e) => {
            println!("[Discord RPC] Failed to create client: {e}");
            STATE.lock().unwrap().is_initializing = false;
            false
        }
    }
}

fn disconnect() {
    let mut state = STATE.lock().unwrap();
    if let Some(mut client) = state.client.take() {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    state.is_ready = false;
    state.is_initializing = false;
    println!("[Discord RPC] Disconnected");
}

fn clean_image_key(icon: Option<String>) -> Option<String> {
    let icon = icon?;
    let lower = icon.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some(icon);
    }
    if !icon.is_empty()
        && !icon.contains('/')
        && !icon.contains('\\')
        && !lower.starts_with("data:")
        && !lower.starts_with("file:")
        && icon.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
    {
        return Some(icon);
    }
    None
}

fn map_status_to_activity(
    status: &str,
    server_name: &Option<String>,
    server_icon: &Option<String>,
) -> (String, String, Option<String>, Option<String>) {
    match status {
        "idle" => (
            "On Main Menu".to_string(),
            "Choosing a server...".to_string(),
            Some("logo".to_string()),
            Some("Main Menu".to_string()),
        ),
        "browsing_home" => (
            "Browsing Home".to_string(),
            "Checking launcher dashboard".to_string(),
            Some("logo".to_string()),
            Some("Home".to_string()),
        ),
        "browsing_explore" => (
            "Browsing Explore".to_string(),
            "Finding mods and modpacks".to_string(),
            Some("logo".to_string()),
            Some("Explore".to_string()),
        ),
        "browsing_settings" => (
            "Adjusting Settings".to_string(),
            "Tweaking launcher preferences".to_string(),
            Some("logo".to_string()),
            Some("Settings".to_string()),
        ),
        "browsing_wardrobe" => (
            "Customizing Skin".to_string(),
            "Previewing player cosmetics".to_string(),
            Some("logo".to_string()),
            Some("Wardrobe".to_string()),
        ),
        "browsing_about" => (
            "Viewing About".to_string(),
            "Reading launcher information".to_string(),
            Some("logo".to_string()),
            Some("About".to_string()),
        ),
        "browsing_admin" => (
            "Admin Panel".to_string(),
            "Managing launcher data".to_string(),
            Some("logo".to_string()),
            Some("Admin".to_string()),
        ),
        "browsing_modpacks" => (
            "Browsing Modpacks".to_string(),
            "Looking for modpacks".to_string(),
            Some("modpack".to_string()),
            Some("Browsing Modpacks".to_string()),
        ),
        "browsing_servers" => (
            "Browsing Servers".to_string(),
            "Looking for a server to play".to_string(),
            Some("server".to_string()),
            Some("Browsing Servers".to_string()),
        ),
        _ => {
            let name = server_name.as_deref().unwrap_or("Minecraft");
            let icon = clean_image_key(server_icon.clone()).or(Some("logo".to_string()));
            (
                name.to_string(),
                "Launching...".to_string(),
                icon,
                Some(name.to_string()),
            )
        }
    }
}

#[tauri::command]
pub async fn discord_rpc_set_enabled(enabled: bool) -> Result<(), String> {
    println!("[Discord RPC] set_enabled: {enabled}");

    let mut config = crate::config::config_get();
    config.discord_rpc_enabled = enabled;
    crate::config::config_set(config).map_err(|e| e.to_string())?;

    {
        let mut state = STATE.lock().map_err(|e| e.to_string())?;
        state.enabled = enabled;
        if !enabled {
            drop(state);
            disconnect();
            return Ok(());
        }
        state.start_timestamp = chrono::Utc::now().timestamp_millis();
    }

    if enabled {
        ensure_connected().await;
    }

    Ok(())
}

#[tauri::command]
pub fn discord_rpc_is_connected() -> bool {
    STATE.lock().map(|s| s.is_ready).unwrap_or(false)
}

/// Fetch (activePlayers, members) for a cloud instance — the same "Playing X/Y"
/// the Admin Panel shows. `activePlayersCount` is telemetry presence resolved
/// server-side, so it reflects launcher members currently in-game (not the raw
/// Minecraft server population).
async fn fetch_instance_counts(cloud_id: &str) -> Option<(u32, u32)> {
    let token = crate::auth::get_session_inner()?.api_token?;
    let resp = reqwest::Client::new()
        .get(format!("https://api.reality.catlabdesign.space/instances/{}", cloud_id))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let json: serde_json::Value = resp.json().await.ok()?;
    let active = json
        .get("activePlayersCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let members = json
        .get("membersCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    Some((active, members))
}

async fn discord_rpc_update_raw(
    status: String,
    server_name: Option<String>,
    server_icon: Option<String>,
    ping_ms: Option<i64>,
    player_count: Option<(u32, u32)>,
    cloud_id: Option<String>,
) -> Result<(), String> {
    {
        let state = STATE.lock().map_err(|e| e.to_string())?;
        if !state.enabled {
            return Ok(());
        }
    }

    ensure_connected().await;

    let (is_ready, start_ts) = {
        let state = STATE.lock().map_err(|e| e.to_string())?;
        (state.is_ready, state.start_timestamp)
    };

    if !is_ready {
        return Ok(());
    }

    let mut final_status = status;
    let mut final_server_name = server_name;
    let mut final_server_icon = server_icon;
    let mut final_ping_ms = ping_ms;
    let mut final_player_count = player_count;
    let mut final_cloud_id = cloud_id;

    if crate::launcher::is_game_running(None) {
        if final_status != "playing" && final_status != "launching" {
            let state = STATE.lock().map_err(|e| e.to_string())?;
            if state.last_game_status.is_some() {
                final_status = state.last_game_status.clone().unwrap();
                final_server_name = state.last_game_server_name.clone();
                final_server_icon = state.last_game_server_icon.clone();
                final_ping_ms = state.last_game_ping_ms;
                final_player_count = state.last_game_player_count;
                final_cloud_id = state.last_game_cloud_id.clone();
            } else {
                final_status = "playing".to_string();
            }
        }
    }

    let lang = crate::config::config_get()
        .extra
        .get("language")
        .and_then(|l| l.as_str())
        .unwrap_or("th")
        .to_string();

    let username = crate::auth::get_session_inner()
        .map(|s| s.username.clone())
        .unwrap_or_else(|| "Player".to_string());

    let (mut details, mut state_text, large_key, large_text) =
        map_status_to_activity(&final_status, &final_server_name, &final_server_icon);

    if final_status == "playing" || final_status == "launching" {
        if final_cloud_id.is_some() {
            let name_str = final_server_name.as_deref().unwrap_or("Minecraft");

            let p_str = final_player_count
                .map(|(active, members)| format!("Playing {}/{}", active, members))
                .unwrap_or_else(|| "Playing".to_string());

            details = format!("{} | {}", name_str, p_str);
            let _ = final_ping_ms;
            state_text = username;
        } else {
            let name_str = final_server_name.as_deref().unwrap_or("Minecraft");
            details = name_str.to_string();

            let sp_label = match lang.as_str() {
                "th" => "เล่นคนเดียว".to_string(),
                "jp" => "シングルプレイ".to_string(),
                _ => "Singleplayer".to_string(),
            };
            state_text = format!("{} | {}", username, sp_label);
        }
    }

    let mut small_image = None;
    let mut small_text = None;

    if final_status == "playing" || final_status == "launching" {
        small_image = Some("r_nobg".to_string());

        if let Some(session) = crate::auth::get_session_inner() {
            small_text = Some(session.username.clone());
            let source = session.avatar_source.as_deref().unwrap_or("minecraft_skin");
            if source == "catid_avatar" && session.avatar_url.is_some() {
                small_image = session.avatar_url;
            } else if !session.uuid.starts_with("catid-") {
                small_image = Some(format!("https://crafthead.net/avatar/{}/128", session.uuid));
            } else {
                small_image = Some(format!("https://crafthead.net/avatar/{}/128", session.username));
            }
        }
    }

    let mut assets = Assets::new()
        .large_image(large_key.as_deref().unwrap_or("logo"));

    if let Some(ref sm_img) = small_image {
        assets = assets.small_image(sm_img);
    }
    if let Some(ref sm_txt) = small_text {
        assets = assets.small_text(sm_txt);
    }
    if let Some(ref lg_txt) = large_text {
        assets = assets.large_text(lg_txt);
    }

    let mut activity = Activity::new()
        .details(&details)
        .state(&state_text)
        .assets(assets)
        .timestamps(discord_rich_presence::activity::Timestamps::new().start(start_ts));

    let button_text = format!("Reality Launcher v{}", env!("CARGO_PKG_VERSION"));
    activity = activity.buttons(vec![discord_rich_presence::activity::Button::new(
        &button_text,
        "https://reality.catlabdesign.space",
    )]);

    let mut state = STATE.lock().map_err(|e| e.to_string())?;
    let client = state.client.as_mut().ok_or_else(|| "Client not connected".to_string())?;
    client.set_activity(activity).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn discord_rpc_update(
    status: String,
    server_name: Option<String>,
    server_icon: Option<String>,
    cloud_id: Option<String>,
) -> Result<(), String> {
    {
        let mut state = STATE.lock().map_err(|e| e.to_string())?;
        if !state.enabled {
            return Ok(());
        }

        if status == "playing" || status == "launching" {
            state.last_game_status = Some(status.clone());
            state.last_game_server_name = server_name.clone();
            state.last_game_server_icon = server_icon.clone();
            state.last_game_cloud_id = cloud_id.clone();
            state.last_game_ping_ms = None;
            state.last_game_player_count = None;
        } else if status == "idle" {
            state.last_game_status = None;
            state.last_game_server_name = None;
            state.last_game_server_icon = None;
            state.last_game_cloud_id = None;
            state.last_game_ping_ms = None;
            state.last_game_player_count = None;
        }
    }

    discord_rpc_update_raw(
        status.clone(),
        server_name.clone(),
        server_icon.clone(),
        None,
        None,
        cloud_id.clone(),
    )
    .await?;

    let mut state = STATE.lock().map_err(|e| e.to_string())?;
    if (status == "playing" || status == "launching") && !state.ping_loop_active {
        state.ping_loop_active = true;

        tauri::async_runtime::spawn(async move {
            loop {
                let (current_status, current_name, current_icon, current_cloud_id) = {
                    let s = STATE.lock().unwrap();
                    if !s.enabled || s.last_game_status.is_none() {
                        break;
                    }
                    (
                        s.last_game_status.clone().unwrap(),
                        s.last_game_server_name.clone(),
                        s.last_game_server_icon.clone(),
                        s.last_game_cloud_id.clone(),
                    )
                };

                if current_status == "playing" {
                    // Pull the "Playing X/Y" (active players / members) straight from
                    // ml-api so RPC matches the Admin Panel exactly.
                    let player_count = match current_cloud_id {
                        Some(ref cid) => fetch_instance_counts(cid).await,
                        None => None,
                    };

                    if let Ok(mut s) = STATE.lock() {
                        s.last_game_player_count = player_count;
                    }

                    let _ = discord_rpc_update_raw(
                        current_status,
                        current_name,
                        current_icon,
                        None,
                        player_count,
                        current_cloud_id,
                    )
                    .await;
                }

                tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
            }

            if let Ok(mut s) = STATE.lock() {
                s.ping_loop_active = false;
            }
        });
    }

    Ok(())
}
