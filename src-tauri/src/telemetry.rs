use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::Mutex;

const API_URL: &str = "https://api.reality.catlabdesign.space";
const TELEMETRY_BATCH_SIZE: usize = 20;
const TELEMETRY_FLUSH_INTERVAL_MS: u64 = 30_000;
const TELEMETRY_MAX_QUEUE_SIZE: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryEvent {
    pub event_type: String,
    pub client_id: String,
    pub user_id: Option<String>,
    pub data: Option<serde_json::Value>,
    pub launcher_version: String,
    pub platform: String,
    pub locale: String,
}

pub struct TelemetryQueue {
    events: VecDeque<TelemetryEvent>,
}

static QUEUE: Lazy<Mutex<TelemetryQueue>> = Lazy::new(|| {
    Mutex::new(TelemetryQueue {
        events: VecDeque::new(),
    })
});

static FLUSH_INITIALIZED: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

// (api_token, users.id) — resolved from /auth/session/me for non-catid accounts.
// Keyed by token so an account switch invalidates it.
static TOKEN_USER_ID: Lazy<Mutex<Option<(String, String)>>> = Lazy::new(|| Mutex::new(None));

// When the app opened, used to compute the app_close session duration.
static SESSION_START: Lazy<Mutex<Option<std::time::Instant>>> = Lazy::new(|| Mutex::new(None));

fn get_client_id() -> String {
    let config = crate::config::config_get();
    let dir = config.minecraft_dir.unwrap_or_default();
    if dir.is_empty() {
        "unknown".to_string()
    } else {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        dir.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
}

fn get_platform() -> String {
    if cfg!(target_os = "windows") {
        "win32".to_string()
    } else if cfg!(target_os = "macos") {
        "darwin".to_string()
    } else {
        "linux".to_string()
    }
}

fn get_locale() -> String {
    crate::config::config_get()
        .extra
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("th")
        .to_string()
}

fn get_launcher_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn get_api_token() -> Option<String> {
    crate::auth::get_session_inner()?.api_token.clone()
}

fn resolve_user_id() -> Option<String> {
    let session = crate::auth::get_session_inner()?;
    if session.uuid.starts_with("catid-") {
        let id = session.uuid.strip_prefix("catid-")?.trim();
        if !id.is_empty() {
            return Some(id.to_string());
        }
    }
    // Microsoft/Minecraft accounts have no catid in the uuid — fall back to the
    // users.id resolved from the API token (see ensure_user_id_resolved). Without
    // this, telemetry.userId is null and presence/active-player counts never match.
    let token = session.api_token?;
    let cache = TOKEN_USER_ID.lock().ok()?;
    match cache.as_ref() {
        Some((cached_token, id)) if *cached_token == token => Some(id.clone()),
        _ => None,
    }
}

/// Resolve and cache users.id for non-catid accounts via /auth/session/me. Cheap
/// no-op once cached or for catid accounts. Call before presence-critical events.
pub async fn ensure_user_id_resolved() {
    let session = match crate::auth::get_session_inner() {
        Some(s) => s,
        None => return,
    };
    if session.uuid.starts_with("catid-") {
        return;
    }
    let token = match session.api_token {
        Some(t) => t,
        None => return,
    };

    if let Ok(cache) = TOKEN_USER_ID.lock() {
        if matches!(cache.as_ref(), Some((cached_token, _)) if *cached_token == token) {
            return;
        }
    }

    let resp = reqwest::Client::new()
        .get(format!("{API_URL}/auth/session/me"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await;

    if let Ok(resp) = resp {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
                    let id = id.trim();
                    if !id.is_empty() {
                        if let Ok(mut cache) = TOKEN_USER_ID.lock() {
                            *cache = Some((token, id.to_string()));
                        }
                    }
                }
            }
        }
    }
}

async fn flush_telemetry_queue() {
    let events_to_send = {
        let mut queue = match QUEUE.lock() {
            Ok(q) => q,
            Err(_) => return,
        };
        if queue.events.is_empty() {
            return;
        }

        let batch_size = TELEMETRY_BATCH_SIZE.min(queue.events.len());
        let batch: Vec<TelemetryEvent> = queue.events.drain(..batch_size).collect();
        while queue.events.len() > TELEMETRY_MAX_QUEUE_SIZE {
            queue.events.pop_front();
        }
        batch
    };

    if events_to_send.is_empty() {
        return;
    }

    let body = serde_json::json!({ "events": events_to_send });
    let mut req = reqwest::Client::new()
        .post(format!("{API_URL}/telemetry/batch"))
        .header("Content-Type", "application/json");

    if let Some(token) = get_api_token() {
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    match req.json(&body).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                eprintln!("[Telemetry] Batch send failed: {}", resp.status());
                let mut queue = QUEUE.lock().unwrap();
                for event in events_to_send {
                    if queue.events.len() < TELEMETRY_MAX_QUEUE_SIZE {
                        queue.events.push_back(event);
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[Telemetry] Flush error: {e}");
            let mut queue = QUEUE.lock().unwrap();
            for event in events_to_send {
                if queue.events.len() < TELEMETRY_MAX_QUEUE_SIZE {
                    queue.events.push_back(event);
                }
            }
        }
    }
}

fn ensure_flush_timer() {
    let mut initialized = match FLUSH_INITIALIZED.lock() {
        Ok(i) => i,
        Err(_) => return,
    };
    if !*initialized {
        *initialized = true;
        drop(initialized);
        // tauri::async_runtime::spawn (not tokio::spawn) so this is safe to
        // trigger from the setup hook, which isn't inside a tokio context.
        tauri::async_runtime::spawn(async {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(
                    TELEMETRY_FLUSH_INTERVAL_MS,
                ))
                .await;
                flush_telemetry_queue().await;
            }
        });
    }
}

/// Force an out-of-band flush. Presence-critical events (game_launch/close) use
/// this so the active player count updates in seconds instead of waiting for the
/// 30s timer.
pub fn flush_now() {
    tauri::async_runtime::spawn(async { flush_telemetry_queue().await });
}

/// Emit `app_open` on every startup (parity with the Electron client, which the
/// Tauri port dropped). Without this, telemetry only records users who actually
/// launch a game — so version distribution / active-user stats were incomplete.
pub fn track_app_open() {
    *SESSION_START.lock().unwrap() = Some(std::time::Instant::now());

    // firstLaunch flag persists in config.extra so it's only true once ever.
    let mut config = crate::config::config_get();
    let first_launch = !config
        .extra
        .get("hasLaunchedBefore")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if first_launch {
        config
            .extra
            .insert("hasLaunchedBefore".to_string(), serde_json::json!(true));
        let _ = crate::config::config_set(config);
    }

    queue_event("app_open", serde_json::json!({ "firstLaunch": first_launch }));
    flush_now();
}

/// Emit `app_close` with the session duration and drain the queue before exit.
/// Awaited from the ExitRequested handler so the final batch actually lands.
pub async fn track_app_close() {
    let session_duration = SESSION_START
        .lock()
        .unwrap()
        .map(|start| start.elapsed().as_secs())
        .unwrap_or(0);

    queue_event(
        "app_close",
        serde_json::json!({ "sessionDuration": session_duration }),
    );
    // Bound the final flush so a hung/offline network can't stall app exit.
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        flush_telemetry_queue(),
    )
    .await;
}

pub fn queue_event(event_type: &str, data: serde_json::Value) {
    ensure_flush_timer();

    let event = TelemetryEvent {
        event_type: event_type.to_string(),
        client_id: get_client_id(),
        user_id: resolve_user_id(),
        data: Some(data),
        launcher_version: get_launcher_version(),
        platform: get_platform(),
        locale: get_locale(),
    };

    let should_flush = {
        let mut queue = match QUEUE.lock() {
            Ok(q) => q,
            Err(_) => return,
        };
        queue.events.push_back(event);
        while queue.events.len() > TELEMETRY_MAX_QUEUE_SIZE {
            queue.events.pop_front();
        }
        queue.events.len() >= TELEMETRY_BATCH_SIZE
    };

    if should_flush {
        tauri::async_runtime::spawn(async { flush_telemetry_queue().await });
    }
}

#[tauri::command]
pub async fn telemetry_log_event(
    event_type: String,
    data: Option<serde_json::Value>,
) -> Result<(), String> {
    ensure_flush_timer();

    let event = TelemetryEvent {
        event_type,
        client_id: get_client_id(),
        user_id: resolve_user_id(),
        data,
        launcher_version: get_launcher_version(),
        platform: get_platform(),
        locale: get_locale(),
    };

    let should_flush = {
        let mut queue = QUEUE.lock().map_err(|e| e.to_string())?;
        queue.events.push_back(event);
        while queue.events.len() > TELEMETRY_MAX_QUEUE_SIZE {
            queue.events.pop_front();
        }
        queue.events.len() >= TELEMETRY_BATCH_SIZE
    };

    if should_flush {
        flush_telemetry_queue().await;
    }

    Ok(())
}
