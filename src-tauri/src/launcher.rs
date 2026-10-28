use once_cell::sync::Lazy;
use sha1::{Digest, Sha1};
use std::fs;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Emitter;

use crate::auth::Session;
use crate::config::get_minecraft_dir;
use crate::instances::{GameInstance, LoaderType};

static GAME_PROCESS: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));
static LAUNCHING: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static PLAYING_INSTANCE_ID: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));
/// Bumped by every kill_game and every successful launch claim. A launch
/// captures its value at claim time and aborts at spawn time if it moved —
/// this prevents a stale launch whose sync phase outlived a kill/relaunch
/// from registering an orphaned, unstoppable game.
static LAUNCH_GENERATION: Lazy<Mutex<u64>> = Lazy::new(|| Mutex::new(0));
/// Current launch stage and when it began, for the per-stage timing log.
static STAGE_CLOCK: Lazy<Mutex<Option<(std::time::Instant, String)>>> = Lazy::new(|| Mutex::new(None));

/// Logs how long the previous launch stage took and starts timing `stage`.
/// Stages of a second or more also get a line in the instance's launch log.
fn mark_stage(stage: &str) {
    let now = std::time::Instant::now();
    let mut clock = STAGE_CLOCK.lock().unwrap();
    if let Some((started, prev)) = clock.take() {
        let elapsed = now.duration_since(started);
        println!("[Launcher] Stage {prev}: {} ms", elapsed.as_millis());
        if elapsed.as_secs() >= 1 {
            crate::launch_log::info(format!("Step \"{prev}\" took {}", crate::launch_log::took(elapsed)));
        }
    }
    if stage != "running" {
        *clock = Some((now, stage.to_string()));
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProgressPayload {
    pub stage: String,
    pub message: String,
    pub progress: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LogPayload {
    pub level: String,
    pub message: String,
}



fn classify_log_level(line: &str) -> &'static str {
    if line.contains("/ERROR]") || line.contains("/FATAL]") {
        "error"
    } else if line.contains("/WARN]") {
        "warn"
    } else if line.contains("/DEBUG]") {
        "debug"
    } else {
        "info"
    }
}

fn redact_args(args: &[String], token: &str) -> String {
    let mut out = Vec::with_capacity(args.len());
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--accessToken" && i + 1 < args.len() {
            out.push(args[i].clone());
            out.push("[REDACTED]".to_string());
            i += 2;
            continue;
        }
        let arg = if !token.is_empty() && token != "0" {
            args[i].replace(token, "[REDACTED]")
        } else {
            args[i].clone()
        };
        out.push(arg);
        i += 1;
    }
    out.join(" ")
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStartedPayload {
    pub instance_id: String,
    pub pid: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStoppedPayload {
    pub instance_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub ok: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseJavaResult {
    pub ok: bool,
    pub path: Option<String>,
    pub version: Option<i32>,
    pub message: Option<String>,
}

#[tauri::command]
pub fn is_game_running(instance_id: Option<String>) -> bool {
    // Read PLAYING_INSTANCE_ID as the source of truth instead of calling try_wait
    // on the child here. The monitor task is the sole reaper: if this also reaped
    // the process it could win the race and clear GAME_PROCESS before the monitor,
    // which would then break without emitting game-stopped — leaving the stop
    // button stuck until the next page switch re-polled.
    let playing = PLAYING_INSTANCE_ID.lock().unwrap().clone();
    match (instance_id, playing) {
        (Some(id), Some(current)) => id == current,
        (Some(_), None) => false,
        
        (None, current) => current.is_some(),
    }
}

#[tauri::command]
pub fn kill_game(app: tauri::AppHandle) -> Result<(), String> {
    *LAUNCH_GENERATION.lock().unwrap() += 1;
    if *LAUNCHING.lock().unwrap() {
        crate::launch_log::warn("Launch stopped by the player");
    }
    let mut process = GAME_PROCESS.lock().map_err(|e| e.to_string())?;
    let killed_instance_id = PLAYING_INSTANCE_ID.lock().unwrap().clone();
    if let Some(ref mut child) = *process {
        println!("[Launcher] Killing game process");
        #[cfg(target_os = "windows")]
        {
            let pid = child.id();
            let mut cmd = Command::new("taskkill");
            cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000);
            }
            let _ = cmd.output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = child.kill();
            let _ = child.wait();
        }
        *process = None;
        if let Some(id) = &killed_instance_id {
            let _ = app.emit(
                "game-stopped",
                GameStoppedPayload {
                    instance_id: id.clone(),
                    exit_code: None,
                },
            );
        }
    }
    *LAUNCHING.lock().unwrap() = false;
    *PLAYING_INSTANCE_ID.lock().unwrap() = None;
    Ok(())
}

/// Abandons a launch that has not registered its game process yet; a running
/// game is never touched. Holding GAME_PROCESS makes this atomic with the
/// registration in `launch_game`, which sees the new generation and drops its
/// child. Returns false when the game is already running.
#[tauri::command]
pub fn cancel_launch() -> bool {
    let game = GAME_PROCESS.lock().unwrap();
    if game.is_some() {
        return false;
    }
    *LAUNCH_GENERATION.lock().unwrap() += 1;
    *LAUNCHING.lock().unwrap() = false;
    *PLAYING_INSTANCE_ID.lock().unwrap() = None;
    println!("[Launcher] Launch abandoned: no progress");
    crate::launch_log::warn("Launch cancelled: no progress for 5 minutes");
    true
}

#[tauri::command]
pub async fn instances_launch(
    app_handle: tauri::AppHandle,
    id: String,
    skip_server_mod_sync: Option<bool>,
) -> LaunchResult {
    let _guard = match crate::op_guard::OperationGuard::try_shared() {
        Some(g) => g,
        None => {
            return LaunchResult {
                ok: false,
                message: Some(
                    "A folder migration is in progress. Try again when it finishes.".to_string(),
                ),
            }
        }
    };

    let launch_gen = {
        // Claim the launch: double-checked under the LAUNCHING lock so two
        // racing invocations cannot both pass. Never hold LAUNCHING while
        // taking GAME_PROCESS (kill_game takes them in the opposite order).
        let first = {
            let launching = LAUNCHING.lock().unwrap();
            *launching
        };
        if first {
            return LaunchResult {
                ok: false,
                message: Some("Already launching a game".to_string()),
            };
        }
        if is_game_running(None) {
            return LaunchResult {
                ok: false,
                message: Some("A game is already running".to_string()),
            };
        }
        let mut launching = LAUNCHING.lock().unwrap();
        if *launching {
            return LaunchResult {
                ok: false,
                message: Some("Already launching a game".to_string()),
            };
        }
        *launching = true;
        let mut gen = LAUNCH_GENERATION.lock().unwrap();
        *gen += 1;
        *gen
    };
    *PLAYING_INSTANCE_ID.lock().unwrap() = Some(id.clone());

    let instance = match crate::instances::instances_get(id.clone()) {
        Some(i) => i,
        None => {
            *LAUNCHING.lock().unwrap() = false;
            *PLAYING_INSTANCE_ID.lock().unwrap() = None;
            return LaunchResult {
                ok: false,
                message: Some("Instance not found".to_string()),
            };
        }
    };

    println!(
        "[Launcher] Launching instance: {} ({})",
        instance.name, instance.id
    );
    *STAGE_CLOCK.lock().unwrap() = Some((std::time::Instant::now(), "start".to_string()));
    crate::launch_log::start(Path::new(&instance.game_directory));
    crate::launch_log::info(format!(
        "Play pressed: {} (Minecraft {}, {:?} {}) - Reality Launcher {}",
        instance.name,
        instance.minecraft_version,
        instance.loader,
        instance.loader_version.as_deref().unwrap_or(""),
        env!("CARGO_PKG_VERSION")
    ));
    log_session_check();

    let _ = crate::discord::discord_rpc_update(
        "launching".to_string(),
        Some(instance.name.clone()),
        instance.icon.clone(),
        instance.cloud_id.clone(),
    ).await;

    
    
    
    if instance.cloud_id.is_some() && skip_server_mod_sync != Some(true) {
        
        
        emit_progress(&app_handle, "sync", "Syncing server mods...", 0.02);
        let sync_started = std::time::Instant::now();
        let synced = crate::cloud::sync_instance_for_launch(&app_handle, &instance).await;
        match &synced {
            Ok(failed) if failed.is_empty() => crate::launch_log::info(format!(
                "Server files up to date (checked in {})",
                crate::launch_log::took(sync_started.elapsed())
            )),
            Ok(failed) => {
                for (file, reason) in failed {
                    crate::launch_log::error(format!("Could not sync {file}: {reason}"));
                }
            }
            Err(e) => crate::launch_log::error(format!("Server sync failed: {e}")),
        }
        match synced {
            Ok(failed) if !failed.is_empty() => {
                *LAUNCHING.lock().unwrap() = false;
                *PLAYING_INSTANCE_ID.lock().unwrap() = None;
                let preview = failed
                    .iter()
                    .take(3)
                    .map(|(f, r)| format!("{} (Reason: {})", f, r))
                    .collect::<Vec<_>>()
                    .join(", ");
                return LaunchResult {
                    ok: false,
                    message: Some(format!(
                        "Could not sync {} server file(s): {preview}",
                        failed.len()
                    )),
                };
            }
            Err(e) => {
                *LAUNCHING.lock().unwrap() = false;
                *PLAYING_INSTANCE_ID.lock().unwrap() = None;
                return LaunchResult {
                    ok: false,
                    message: Some(format!("Server sync failed: {e}")),
                };
            }
            Ok(_) => {}
        }
    }

    
    
    
    
    
    match launch_game(app_handle.clone(), instance, launch_gen).await {
        Ok(()) => LaunchResult {
            ok: true,
            message: None,
        },
        Err(e) => {
            log::error!("[Launcher] Launch failed: {e}");
            crate::launch_log::error(format!("Launch failed: {e}"));
            *LAUNCHING.lock().unwrap() = false;
            *PLAYING_INSTANCE_ID.lock().unwrap() = None;
            let _ = app_handle.emit("launch-error", serde_json::json!({ "error": e.clone() }));
            LaunchResult {
                ok: false,
                message: Some(e),
            }
        }
    }
}





fn latest_log_path(instance_id: &str) -> PathBuf {
    crate::instances::get_instance_dir(instance_id)
        .join("logs")
        .join("latest.log")
}

/// Reads complete lines from `from` onward. A trailing line still being
/// written is left for the next poll, and `size` is the offset just past the
/// last newline, so lines are never split across polls. Bytes are decoded
/// lossily: a strict UTF-8 read drops the whole chunk on one bad byte.
fn read_log_lines(path: &Path, from: u64) -> serde_json::Value {
    use std::io::{Read, Seek, SeekFrom};

    let Ok(mut file) = fs::File::open(path) else {
        return serde_json::json!({ "ok": false, "content": "", "size": from });
    };
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    // A smaller file means latest.log was rotated by a new game session.
    let start = if from > size { 0 } else { from };
    if file.seek(SeekFrom::Start(start)).is_err() {
        return serde_json::json!({ "ok": false, "content": "", "size": start });
    }

    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return serde_json::json!({ "ok": false, "content": "", "size": start });
    }
    let complete = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    let content = crate::launch_log::redact(&String::from_utf8_lossy(&bytes[..complete]));
    let meta = file.metadata().ok();
    let epoch_ms = |t: std::io::Result<std::time::SystemTime>| {
        t.ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as u64)
    };
    let modified = meta.as_ref().map_or(0, |m| epoch_ms(m.modified()));
    let created = meta.as_ref().map_or(0, |m| epoch_ms(m.created()));
    serde_json::json!({
        "ok": true,
        "content": content,
        "size": start + complete as u64,
        "modified": modified,
        "created": created,
    })
}

#[tauri::command]
pub fn instance_read_latest_log(instance_id: String) -> serde_json::Value {
    read_log_lines(&latest_log_path(&instance_id), 0)
}

#[tauri::command]
pub fn instance_tail_log(instance_id: String, from: u64) -> serde_json::Value {
    read_log_lines(&latest_log_path(&instance_id), from)
}

/// The launcher's own log of the last launch of this instance (`launch_log`).
#[tauri::command]
pub fn instance_tail_launch_log(instance_id: String, from: u64) -> serde_json::Value {
    read_log_lines(
        &crate::launch_log::path_for(&crate::instances::get_instance_dir(&instance_id)),
        from,
    )
}

#[tauri::command]
pub fn get_playing_instance_id() -> Option<String> {
    PLAYING_INSTANCE_ID.lock().unwrap().clone()
}

pub(crate) fn get_java_path() -> Option<String> {
    if let Ok(java_home) = std::env::var("JAVA_HOME") {
        let java_path = PathBuf::from(&java_home)
            .join("bin")
            .join(if cfg!(windows) { "java.exe" } else { "java" });
        if java_path.exists() {
            return Some(java_path.to_string_lossy().to_string());
        }
    }

    let mut cmd = Command::new(if cfg!(windows) { "where" } else { "which" });
    cmd.arg("java");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    if let Ok(output) = cmd.output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(|s| s.trim().to_string());
            if path.is_some() {
                return path;
            }
        }
    }

    None
}

#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn is_dev_mode() -> bool {
    cfg!(debug_assertions)
}





fn parse_java_version(output: &str) -> Option<i32> {
    for line in output.lines() {
        if let Some(version_str) = line.split_once("version") {
            let version_part = version_str.1.trim().trim_matches('"').trim();
            if let Some(first) = version_part.split('.').next() {
                let major: i32 = first.parse().ok()?;
                if major == 1 {
                    return Some(8);
                }
                return Some(major);
            }
        }
    }
    None
}

pub fn get_java_major_version(java_path: &str) -> Result<i32, String> {
    let check_path = if cfg!(windows) && java_path.to_lowercase().ends_with("javaw.exe") {
        java_path.to_lowercase().replace("javaw.exe", "java.exe")
    } else {
        java_path.to_string()
    };

    let mut cmd = Command::new(&check_path);
    cmd.arg("-version")
        .stderr(Stdio::piped())
        .stdout(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output()
        .map_err(|e| format!("Failed to execute Java: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{stdout}{stderr}");

    parse_java_version(&combined)
        .ok_or_else(|| format!("Could not parse Java version from:\n{combined}"))
}

#[tauri::command]
pub async fn browse_java(path: String) -> BrowseJavaResult {
    match get_java_major_version(&path) {
        Ok(major) => {
            let mut config = crate::config::config_get();
            config.java_path = Some(path.clone());
            let _ = crate::config::config_set(config);
            BrowseJavaResult {
                ok: true,
                path: Some(path),
                version: Some(major),
                message: None,
            }
        }
        Err(e) => BrowseJavaResult {
            ok: false,
            path: None,
            version: None,
            message: Some(e),
        },
    }
}





async fn launch_game(
    app: tauri::AppHandle,
    instance: GameInstance,
    launch_gen: u64,
) -> Result<(), String> {
    emit_progress(&app, "preparing", "Preparing to launch...", 0.0);

    let config_val = crate::config::config_get();
    let minecraft_dir_val = get_minecraft_dir();
    let libraries_dir = minecraft_dir_val.join("libraries");
    let assets_dir = minecraft_dir_val.join("assets");
    let instance_dir = PathBuf::from(&instance.game_directory);

    let session = match crate::auth::get_session().account {
        Some(s) => s,
        None => {
            let _ = app.emit(
                "launch-error",
                serde_json::json!({"error": "Not logged in"}),
            );
            *LAUNCHING.lock().unwrap() = false;
            return Err("Not logged in".to_string());
        }
    };
    log_session(&session);

    emit_progress(&app, "version", "Fetching version manifest...", 0.05);
    let version_json = get_version_json(&instance.minecraft_version, &minecraft_dir_val).await?;

    let required_java =
        crate::java::get_required_java_version(&instance.minecraft_version, &version_json);

    emit_progress(&app, "client", "Downloading client...", 0.15);
    let versions_dir = minecraft_dir_val
        .join("versions")
        .join(&instance.minecraft_version);
    download_client_jar(&version_json, &versions_dir).await?;

    emit_progress(&app, "libraries", "Downloading libraries...", 0.30);
    ensure_libraries(&version_json, &libraries_dir).await?;

    emit_progress(&app, "assets", "Checking assets...", 0.50);
    check_and_download_assets(&version_json, &assets_dir).await?;

    emit_progress(&app, "natives", "Extracting natives...", 0.65);
    let natives_dir = instance_dir.join("natives");
    extract_natives(&version_json, &libraries_dir, &natives_dir).await?;


    emit_progress(&app, "java", "Resolving Java...", 0.70);
    let java_path =
        crate::java::ensure_compatible_java(&app, &instance, &config_val, required_java).await?;
    crate::launch_log::info(format!(
        "Java: {} (Java {} or newer needed)",
        crate::launch_log::display_path(&java_path),
        required_java
    ));

    
    let effective_version_json = if instance.loader != LoaderType::Vanilla {
        emit_progress(&app, "modloader", "Installing mod loader...", 0.75);
        let watch = LaunchWatch { app: &app, generation: launch_gen };
        let loader_json =
            install_mod_loader(&instance, &minecraft_dir_val, &libraries_dir, &java_path, Some(watch))
                .await?;
        // Fabric/Quilt profiles only list their libraries (loader, intermediary, mixin, asm);
        // nothing else downloads them, and build_classpath skips missing jars, which left the
        // game without its main class. Forge/NeoForge installers fetch their own.
        if matches!(instance.loader, LoaderType::Fabric | LoaderType::Quilt) {
            emit_progress(&app, "modloader", "Downloading mod loader libraries...", 0.8);
            ensure_libraries(&loader_json, &libraries_dir).await?;
        }
        merge_inherited_version(&loader_json, &minecraft_dir_val)?
    } else {
        version_json
    };

    
    if let Some(id) = effective_version_json.get("id").and_then(|v| v.as_str()) {
        crate::launch_log::info(format!("Game version ready: {id}"));
    }
    emit_progress(&app, "classpath", "Building classpath...", 0.85);
    let classpath = build_classpath(
        &effective_version_json,
        &libraries_dir,
        &versions_dir,
        &instance,
        &instance_dir,
    )?;

    
    let mut jvm_args = build_jvm_args(
        &effective_version_json,
        &classpath,
        &natives_dir,
        &libraries_dir,
        &instance,
        &config_val,
    )?;
    mark_stage("branding");
    jvm_args.extend(branding_jvm_args(
        &minecraft_dir_val,
        &instance_dir,
        &assets_dir,
        &instance,
        &effective_version_json,
    ));
    mark_stage("tab-badges");
    // A previous game's whereabouts must not reach this launch's Discord presence.
    let _ = std::fs::remove_file(crate::tab_badge::game_status_path(&minecraft_dir_val));
    let badge_setup = prepare_tab_badges(
        &minecraft_dir_val,
        &libraries_dir,
        &instance_dir,
        &instance,
        &effective_version_json,
        &presence_uuids(&session),
    )
    .await;
    if let Some(ref setup) = badge_setup {
        jvm_args.extend(setup.jvm_args());
        crate::launch_log::info("Tab-list badges: on");
    } else {
        crate::launch_log::info("Tab-list badges: off for this launch");
    }

    
    let (main_class, game_args) = build_game_args(
        &effective_version_json,
        &session,
        &instance_dir,
        &assets_dir,
        &instance,
    )?;

    
    emit_progress(&app, "launching", "Launching Minecraft...", 0.95);
    let all_args: Vec<String> = jvm_args
        .into_iter()
        .chain(std::iter::once(main_class))
        .chain(game_args)
        .collect();

    println!("[Launcher] Java: {java_path}");
    let access_token = session.access_token.as_deref().unwrap_or("0");
    println!("[Launcher] Args: {}", redact_args(&all_args, access_token));


    let wrapper = crate::perf_tools::game_wrapper(config_val.enable_mango_hud, config_val.enable_game_mode);
    if !wrapper.is_empty() {
        println!("[Launcher] Wrapper: {}", wrapper.join(" "));
        crate::launch_log::info(format!("Running through: {}", wrapper.join(" ")));
    }
    if let Some(xmx) = all_args.iter().find_map(|a| a.strip_prefix("-Xmx")) {
        crate::launch_log::info(format!("Memory: up to {xmx}B for the game"));
    }
    let mut cmd = match wrapper.split_first() {
        Some((program, rest)) => {
            let mut cmd = Command::new(program);
            cmd.args(rest).arg(&java_path);
            cmd
        }
        None => Command::new(&java_path),
    };
    cmd.args(&all_args)
        .current_dir(&instance_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some((remove, set)) = crate::wayland::game_env(config_val.native_wayland) {
        for key in remove {
            cmd.env_remove(key);
        }
        cmd.envs(set);
        crate::launch_log::info("Wayland session: running Minecraft through XWayland");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn Java: {e}"))?;
    let spawned_at = std::time::SystemTime::now();

    let pid = child.id();
    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();

    // Atomically register the child under GAME_PROCESS lock.
    // kill_game() always locks GAME_PROCESS before clearing LAUNCHING,
    // so if LAUNCHING was set false while we were spawning we must
    // abort — otherwise the child would be orphaned. The generation
    // check additionally aborts a stale launch whose long sync phase
    // was superseded by a kill + relaunch.
    {
        let mut game = GAME_PROCESS.lock().unwrap();
        let launching = *LAUNCHING.lock().unwrap();
        let gen_current = *LAUNCH_GENERATION.lock().unwrap();
        if !launching || gen_current != launch_gen {
            let _ = child.kill();
            return Err("Launch cancelled".to_string());
        }
        *game = Some(child);
        *LAUNCHING.lock().unwrap() = false;
    }

    
    crate::instances::mark_played(&instance.id);

    println!("[Launcher] Game started (pid={pid})");
    mark_stage("after-spawn");
    crate::launch_log::info(format!(
        "Minecraft started (Java process {pid}). Its own log follows; the game window can take a minute or two with many mods."
    ));
    let launch_log_path = crate::launch_log::path_for(&instance_dir);
    let latest_log = instance_dir.join("logs").join("latest.log");
    let _ = crate::discord::discord_rpc_update(
        "playing".to_string(),
        Some(instance.name.clone()),
        instance.icon.clone(),
        instance.cloud_id.clone(),
    ).await;

    // Presence (active player count in ml-management/RPC) keys on the CLOUD
    // instance id — the local id is a name slug and never matches. Fall back to
    // the local id only for cloud-less instances (which have no presence anyway).
    let telemetry_instance_id = instance
        .cloud_id
        .clone()
        .unwrap_or_else(|| instance.id.clone());
    // Warm the users.id cache so the game_launch event carries a userId that
    // presence can match (non-catid accounts resolve it lazily from the API).
    crate::telemetry::ensure_user_id_resolved().await;
    crate::telemetry::queue_event("game_launch", serde_json::json!({
        "instanceId": telemetry_instance_id,
        "version": instance.minecraft_version,
        "loader": format!("{:?}", instance.loader).to_lowercase(),
    }));
    crate::telemetry::flush_now();

    let presence = match (badge_setup, session.api_token.clone()) {
        (Some(setup), Some(api_token)) => Some(crate::tab_badge::spawn_presence(
            setup,
            api_token,
            telemetry_instance_id.clone(),
        )),
        _ => None,
    };

    let _ = app.emit(
        "game-started",
        GameStartedPayload {
            instance_id: instance.id.clone(),
            pid,
        },
    );

    emit_progress(&app, "running", "Game is running", 1.0);

    if let Some(stdout) = child_stdout {
        let app_out = app.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let level = classify_log_level(&line);
                let _ = app_out.emit(
                    "game-log",
                    LogPayload {
                        level: level.to_string(),
                        message: line,
                    },
                );
            }
        });
    }

    if let Some(stderr) = child_stderr {
        let app_err = app.clone();
        let launch_log_path = launch_log_path.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            // Until the game's logger writes latest.log, stderr is the only
            // place errors show up (bad JVM flags, too little memory, crashes
            // during startup); copy those lines into the launch log.
            let mut game_logging = false;
            for line in reader.lines().flatten() {
                println!("[Game stderr] {line}");
                if !game_logging {
                    game_logging = fs::metadata(&latest_log)
                        .and_then(|m| m.modified())
                        .is_ok_and(|t| t >= spawned_at);
                    if !game_logging {
                        crate::launch_log::append(&launch_log_path, "Game stderr", "WARN", &line);
                    }
                }
                let _ = app_err.emit(
                    "game-log",
                    LogPayload {
                        level: "error".to_string(),
                        message: line,
                    },
                );
            }
        });
    }

    let instance_id = instance.id.clone();
    // Keep the cloud id for the game_close presence event (see game_launch above).
    let telemetry_close_id = instance
        .cloud_id
        .clone()
        .unwrap_or_else(|| instance.id.clone());
    let app_mon = app.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;

            enum PollResult {
                Running,
                Stopped(Option<i32>),
                NotSpawning,
            }

            let poll = {
                let mut guard = GAME_PROCESS.lock().unwrap();
                if let Some(ref mut child) = *guard {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            *guard = None;
                            PollResult::Stopped(status.code())
                        }
                        Ok(None) => PollResult::Running,
                        Err(_) => {
                            *guard = None;
                            PollResult::Stopped(None)
                        }
                    }
                } else {
                    PollResult::NotSpawning
                }
            }; 

            match poll {
                PollResult::Running => {}
                PollResult::Stopped(exit_code) => {
                    println!("[Launcher] Game stopped (exit={:?})", exit_code);
                    let (level, message) = match exit_code {
                        Some(0) => ("INFO", "Minecraft closed normally (exit code 0)".to_string()),
                        Some(code) => (
                            "ERROR",
                            format!("Minecraft closed with exit code {code}. Look above and in crash-reports/ for the cause."),
                        ),
                        None => ("WARN", "Minecraft was stopped".to_string()),
                    };
                    crate::launch_log::append(&launch_log_path, "Launcher", level, &message);
                    if let Some(ref presence) = presence {
                        presence.stop();
                    }

                    
                    crate::telemetry::queue_event("game_close", serde_json::json!({
                        "instanceId": telemetry_close_id,
                    }));
                    crate::telemetry::flush_now();

                    let _ = app_mon.emit(
                        "game-stopped",
                        GameStoppedPayload {
                            instance_id: instance_id.clone(),
                            exit_code,
                        },
                    );
                    *PLAYING_INSTANCE_ID.lock().unwrap() = None;
                    
                    let _ = crate::discord::discord_rpc_update(
                        "idle".to_string(),
                        None,
                        None,
                        None,
                    ).await;
                    
                    break;
                }
                PollResult::NotSpawning => {
                    break;
                }
            }
        }
    });

    Ok(())
}

fn emit_progress(app: &tauri::AppHandle, stage: &str, message: &str, progress: f64) {
    mark_stage(stage);
    if stage != "running" {
        crate::launch_log::info(message);
    }
    let _ = app.emit(
        "launch-progress",
        ProgressPayload {
            stage: stage.to_string(),
            message: message.to_string(),
            progress,
        },
    );
}












fn merge_inherited_version(
    version_json: &serde_json::Value,
    minecraft_dir: &Path,
) -> Result<serde_json::Value, String> {
    let mut chain = vec![version_json.clone()];
    let mut current = version_json.clone();
    let mut depth = 0;

    while let Some(parent_id) = current.get("inheritsFrom").and_then(|v| v.as_str()) {
        depth += 1;
        if depth > 5 {
            return Err("inheritsFrom chain too deep".to_string());
        }
        let parent_path = minecraft_dir
            .join("versions")
            .join(parent_id)
            .join(format!("{parent_id}.json"));
        let content = fs::read_to_string(&parent_path)
            .map_err(|e| format!("Missing parent version {parent_id}: {e}"))?;
        let parent: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Invalid parent version {parent_id}: {e}"))?;
        chain.push(parent.clone());
        current = parent;
    }

    
    let mut merged = serde_json::Map::new();
    for layer in chain.into_iter().rev() {
        let Some(obj) = layer.as_object() else {
            continue;
        };
        for (key, value) in obj {
            match key.as_str() {
                "libraries" => merge_array(&mut merged, key, value),
                "arguments" => merge_arguments(&mut merged, value),
                _ => {
                    merged.insert(key.clone(), value.clone());
                }
            }
        }
    }

    
    
    merged.remove("inheritsFrom");

    Ok(serde_json::Value::Object(merged))
}

fn merge_array(
    merged: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    value: &serde_json::Value,
) {
    let Some(items) = value.as_array() else {
        return;
    };
    let entry = merged
        .entry(key.to_string())
        .or_insert_with(|| serde_json::Value::Array(Vec::new()));
    if let Some(arr) = entry.as_array_mut() {
        arr.extend(items.iter().cloned());
    }
}

fn merge_arguments(
    merged: &mut serde_json::Map<String, serde_json::Value>,
    value: &serde_json::Value,
) {
    let Some(obj) = value.as_object() else {
        return;
    };
    let args = merged
        .entry("arguments".to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let Some(args_obj) = args.as_object_mut() else {
        return;
    };
    for sub in ["jvm", "game"] {
        if let Some(list) = obj.get(sub).and_then(|v| v.as_array()) {
            let slot = args_obj
                .entry(sub.to_string())
                .or_insert_with(|| serde_json::Value::Array(Vec::new()));
            if let Some(arr) = slot.as_array_mut() {
                arr.extend(list.iter().cloned());
            }
        }
    }
}





async fn install_mod_loader(
    instance: &GameInstance,
    minecraft_dir: &Path,
    libraries_dir: &Path,
    java_path: &str,
    watch: Option<LaunchWatch<'_>>,
) -> Result<serde_json::Value, String> {
    let loader_version = instance.loader_version.as_deref().unwrap_or("latest");
    match instance.loader {
        LoaderType::Fabric => {
            install_fabric(&instance.minecraft_version, loader_version, minecraft_dir).await
        }
        LoaderType::Forge => {
            install_forge(
                &instance.minecraft_version,
                loader_version,
                minecraft_dir,
                libraries_dir,
                java_path,
                watch,
            )
            .await
        }
        LoaderType::Neoforge => {
            install_neoforge(
                &instance.minecraft_version,
                loader_version,
                minecraft_dir,
                libraries_dir,
                java_path,
                watch,
            )
            .await
        }
        LoaderType::Quilt => {
            install_quilt(&instance.minecraft_version, loader_version, minecraft_dir).await
        }
        LoaderType::Vanilla => unreachable!(),
    }
}

async fn install_fabric(
    mc_version: &str,
    loader_version: &str,
    minecraft_dir: &Path,
) -> Result<serde_json::Value, String> {
    let meta_url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{mc_version}/{loader_version}/profile/json"
    );
    let resp = crate::http_client::HTTP_CLIENT.get(&meta_url).send()
        .await
        .map_err(|e| format!("Failed to fetch Fabric profile: {e}"))?;
    let profile: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Fabric profile: {e}"))?;

    let version_id = profile
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Fabric profile missing id")?;

    let versions_dir = minecraft_dir.join("versions").join(version_id);
    fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;

    let version_json_path = versions_dir.join(format!("{version_id}.json"));
    let content = serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())?;
    fs::write(&version_json_path, content).map_err(|e| e.to_string())?;

    Ok(profile)
}










/// Forge/NeoForge --installClient refuses to run when the target dir has no
/// launcher_profiles.json ("you need to run the launcher first!"), which is
/// always the case on a fresh machine that never ran the vanilla launcher.
/// A minimal stub is enough to satisfy the check.
fn ensure_launcher_profiles(minecraft_dir: &Path) -> Result<(), String> {
    let profiles_path = minecraft_dir.join("launcher_profiles.json");
    if !profiles_path.exists() {
        fs::create_dir_all(minecraft_dir).map_err(|e| e.to_string())?;
        fs::write(&profiles_path, "{\"profiles\":{}}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

const INSTALLER_ERROR_TAIL_LINES: usize = 40;

/// Forge/NeoForge processors check the SHA1 of the jars they write, and those
/// hashes assume classic zlib. A JDK whose libzip links the system libz
/// deflates through zlib-ng on distros that ship zlib-ng-compat (Arch,
/// CachyOS, Fedora 40+) and every processor output mismatches.
fn libzip_links_system_zlib(java_home: &Path) -> bool {
    fs::read(java_home.join("lib/libzip.so"))
        .map(|bytes| bytes.windows(10).any(|w| w == b"libz.so.1\0"))
        .unwrap_or(false)
}

fn java_home_of(java_path: &Path) -> Option<PathBuf> {
    let resolved = fs::canonicalize(java_path).ok()?;
    Some(resolved.parent()?.parent()?.to_path_buf())
}

/// On Linux, swaps a system-zlib JDK for one with bundled zlib (same or newer
/// major) so loader installers produce the jars they expect. With none
/// installed, downloads a Temurin JRE for it once (`java::install_installer_java`).
async fn installer_java(java_path: &str, watch: Option<LaunchWatch<'_>>) -> String {
    if !cfg!(target_os = "linux") {
        return java_path.to_string();
    }
    let Some(home) = java_home_of(Path::new(java_path)) else {
        return java_path.to_string();
    };
    if !libzip_links_system_zlib(&home) {
        return java_path.to_string();
    }
    let Ok(required) = get_java_major_version(java_path) else {
        return java_path.to_string();
    };
    if let Some(java) = bundled_zlib_java(&home, required) {
        log::info!("[Launcher] {java_path} uses system zlib; running loader installer with {java}");
        return java;
    }

    log::info!("[Launcher] {java_path} uses system zlib; downloading Temurin {required} for the loader installer");
    if watch.is_some() {
        crate::launch_log::info(format!(
            "Java uses the system zlib-ng, which breaks the loader installer's checksums; \
             getting Java {required} with its own zlib for the installer (downloaded once)"
        ));
    }
    let progress = |message: String| {
        if let Some(watch) = watch {
            watch.progress(message);
        }
    };
    match crate::java::install_installer_java(required, progress).await {
        Ok(java) => java,
        Err(e) => {
            log::warn!("[Launcher] Could not get a bundled-zlib Java {required}: {e}; loader install may fail checksum checks");
            if watch.is_some() {
                crate::launch_log::warn(format!("Could not download Java {required} for the installer: {e}"));
            }
            java_path.to_string()
        }
    }
}

/// An installed JDK/JRE with bundled zlib, Java `required` or newer (the
/// oldest such one).
fn bundled_zlib_java(home: &Path, required: i32) -> Option<String> {
    let mut search_dirs = vec![PathBuf::from("/usr/lib/jvm"), PathBuf::from("/usr/lib64/jvm")];
    search_dirs.extend(home.parent().map(Path::to_path_buf));

    let mut seen = std::collections::HashSet::new();
    let best = search_dirs
        .iter()
        .filter_map(|dir| fs::read_dir(dir).ok())
        .flatten()
        .flatten()
        .filter_map(|entry| fs::canonicalize(entry.path()).ok())
        .filter(|candidate| seen.insert(candidate.clone()))
        .filter(|candidate| candidate.join("lib/libzip.so").exists())
        .filter(|candidate| !libzip_links_system_zlib(candidate))
        .filter_map(|candidate| {
            let java = candidate.join("bin/java");
            let major = get_java_major_version(&java.to_string_lossy()).ok()?;
            (major >= required).then_some((major, java))
        })
        .min_by_key(|(major, _)| *major);
    best.map(|(_, java)| java.to_string_lossy().to_string())
}

/// A launch waiting on a loader installer. The installer's output is relayed
/// as launch progress, so the UI's stall watchdog sees it working (Forge can
/// take minutes on a slow connection), and a cancelled launch stops it.
#[derive(Clone, Copy)]
struct LaunchWatch<'a> {
    app: &'a tauri::AppHandle,
    generation: u64,
}

impl LaunchWatch<'_> {
    fn cancelled(&self) -> bool {
        *LAUNCH_GENERATION.lock().unwrap() != self.generation
    }

    fn progress(&self, message: String) {
        let _ = self.app.emit(
            "launch-progress",
            ProgressPayload {
                stage: "modloader".to_string(),
                message,
                progress: 0.75,
            },
        );
    }
}

const INSTALLER_PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);
const INSTALLER_QUIET_WARNING: std::time::Duration = std::time::Duration::from_secs(60);

/// Installer lines worth a Game Logs entry. Forge prints 20–35k lines per run
/// (all of them also land in `<installer>.log` next to the jar).
fn installer_milestone(line: &str) -> Option<&str> {
    let line = line.trim_end();
    (line == "Downloading libraries" || line == "Building Processors" || line.starts_with("Task: "))
        .then_some(line)
}

fn shorten(text: &str, max_chars: usize) -> String {
    match text.char_indices().nth(max_chars) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.to_string(),
    }
}

fn forward_lines<R>(reader: R, tx: tokio::sync::mpsc::UnboundedSender<String>)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    use tokio::io::AsyncBufReadExt;
    tokio::spawn(async move {
        let mut reader = tokio::io::BufReader::new(reader);
        let mut buf = Vec::new();
        while matches!(reader.read_until(b'\n', &mut buf).await, Ok(n) if n > 0) {
            let line = String::from_utf8_lossy(&buf).trim_end().to_string();
            buf.clear();
            if tx.send(line).is_err() {
                break;
            }
        }
    });
}

async fn run_loader_installer(
    loader: &str,
    java_path: &str,
    installer_path: &Path,
    minecraft_dir: &Path,
    watch: Option<LaunchWatch<'_>>,
) -> Result<(), String> {
    let mut cmd = tokio::process::Command::new(installer_java(java_path, watch).await);
    cmd.args([
        "-jar",
        &installer_path.to_string_lossy(),
        "--installClient",
        &minecraft_dir.to_string_lossy(),
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true);
    if let Some(installer_dir) = installer_path.parent() {
        cmd.current_dir(installer_dir);
    }
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run {loader} installer: {e}"))?;
    if watch.is_some() {
        crate::launch_log::info(format!(
            "{loader} installer started; its full log: {}.log",
            crate::launch_log::display_path(installer_path)
        ));
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    if let Some(stdout) = child.stdout.take() {
        forward_lines(stdout, tx.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        forward_lines(stderr, tx);
    }

    let mut tail = std::collections::VecDeque::with_capacity(INSTALLER_ERROR_TAIL_LINES);
    let mut invalid_outputs = false;
    let mut last_line_at = std::time::Instant::now();
    let mut last_progress_at: Option<std::time::Instant> = None;
    let mut quiet_logged = false;
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
    loop {
        tokio::select! {
            line = rx.recv() => {
                let Some(line) = line else { break };
                if line.trim().is_empty() {
                    continue;
                }
                last_line_at = std::time::Instant::now();
                quiet_logged = false;
                invalid_outputs |= line.contains("Processor failed, invalid outputs");
                if let Some(watch) = watch {
                    if let Some(milestone) = installer_milestone(&line) {
                        crate::launch_log::info(format!("{loader} installer: {milestone}"));
                    }
                    if last_progress_at.is_none_or(|at| at.elapsed() >= INSTALLER_PROGRESS_INTERVAL) {
                        last_progress_at = Some(std::time::Instant::now());
                        watch.progress(format!("Installing {loader}: {}", shorten(line.trim(), 60)));
                    }
                }
                if tail.len() == INSTALLER_ERROR_TAIL_LINES {
                    tail.pop_front();
                }
                tail.push_back(line);
            }
            _ = tick.tick() => {
                let Some(watch) = watch else { continue };
                if watch.cancelled() {
                    let _ = child.kill().await;
                    return Err("Launch cancelled".to_string());
                }
                if !quiet_logged && last_line_at.elapsed() >= INSTALLER_QUIET_WARNING {
                    quiet_logged = true;
                    crate::launch_log::warn(format!(
                        "{loader} installer: no output for {} s. Last line: {}",
                        INSTALLER_QUIET_WARNING.as_secs(),
                        tail.back().map(String::as_str).unwrap_or("(none)")
                    ));
                }
            }
        }
    }
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to run {loader} installer: {e}"))?;

    if status.success() {
        return Ok(());
    }
    let log_text = Vec::from(tail).join("\n");
    let hint = if invalid_outputs {
        "\n\nThe installer's output checksums did not match. On Linux this usually means \
         Java is using the system zlib-ng; install a distro OpenJDK of the same version \
         (e.g. jdk17-openjdk) and try again."
    } else {
        ""
    };
    Err(format!(
        "{loader} installer exited with {}:\n{}{hint}",
        status,
        log_text
    ))
}

async fn verify_installer_jar(bytes: &[u8], url: &str) -> Result<(), String> {
    if bytes.len() < 2 || bytes[0] != b'P' || bytes[1] != b'K' {
        return Err("Downloaded loader installer is not a valid JAR archive".to_string());
    }
    match crate::http_client::HTTP_CLIENT
        .get(format!("{url}.sha1"))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let text = resp.text().await.map_err(|e| e.to_string())?;
            let expected = text.trim().split_whitespace().next().unwrap_or("");
            let actual = sha1_bytes(bytes);
            if !expected.is_empty() && actual != expected {
                return Err(format!(
                    "Loader installer checksum mismatch: expected {expected}, got {actual}"
                ));
            }
        }
        Ok(resp) => {
            log::warn!("[Launcher] Installer checksum unavailable (HTTP {})", resp.status())
        }
        Err(e) => log::warn!("[Launcher] Could not fetch installer checksum: {e}"),
    }
    Ok(())
}

async fn install_forge(
    mc_version: &str,
    forge_version: &str,
    minecraft_dir: &Path,
    libraries_dir: &Path,
    java_path: &str,
    watch: Option<LaunchWatch<'_>>,
) -> Result<serde_json::Value, String> {
    let full_version = if forge_version.starts_with(mc_version) {
        forge_version.to_string()
    } else {
        format!("{mc_version}-{forge_version}")
    };

    
    
    let version_id = format!(
        "{mc_version}-forge-{}",
        forge_version
            .strip_prefix(&format!("{mc_version}-"))
            .unwrap_or(forge_version)
    );
    let version_json_path = minecraft_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{version_id}.json"));
    let patched_client_jar = libraries_dir
        .join("net/minecraftforge/forge")
        .join(&full_version)
        .join(format!("forge-{full_version}-client.jar"));

    if version_json_path.exists() && patched_client_jar.exists() {
        let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
        let version_data: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        ensure_libraries(&version_data, libraries_dir).await?;
        return Ok(version_data);
    }

    let installer_filename = format!("forge-{full_version}-installer.jar");
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{full_version}/{installer_filename}"
    );

    let client = crate::http_client::HTTP_CLIENT.clone();
    let resp = client
        .get(&installer_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download Forge installer: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Forge installer download failed: HTTP {} ({installer_url})",
            resp.status()
        ));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    verify_installer_jar(&bytes, &installer_url).await?;

    let installer_dir = minecraft_dir.join("installers");
    fs::create_dir_all(&installer_dir).map_err(|e| e.to_string())?;
    let installer_path = installer_dir.join(&installer_filename);
    fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

    ensure_launcher_profiles(minecraft_dir)?;
    run_loader_installer("Forge", java_path, &installer_path, minecraft_dir, watch).await?;

    if !version_json_path.exists() {
        return Err(format!(
            "Forge installer finished but {} is missing",
            version_json_path.display()
        ));
    }

    let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    let version_data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    ensure_libraries(&version_data, libraries_dir)
        .await
        .map_err(|e| format!("Forge installed but downloading its libraries failed: {e}"))?;
    Ok(version_data)
}





/// Maven coordinates of a NeoForge build. 1.20.1 builds are the legacy
/// `net.neoforged:forge:1.20.1-47.1.x` artifact; 1.20.2+ are
/// `net.neoforged:neoforge:<ver>` with no Minecraft prefix.
struct NeoforgeArtifact {
    artifact: &'static str,
    full_version: String,
    version_id: String,
}

impl NeoforgeArtifact {
    fn new(mc_version: &str, neoforge_version: &str) -> Self {
        let bare = neoforge_version
            .strip_prefix("neoforge-")
            .unwrap_or(neoforge_version);
        let bare = bare.strip_prefix(&format!("{mc_version}-")).unwrap_or(bare);
        if mc_version == "1.20.1" {
            Self {
                artifact: "forge",
                full_version: format!("{mc_version}-{bare}"),
                version_id: format!("{mc_version}-forge-{bare}"),
            }
        } else {
            Self {
                artifact: "neoforge",
                full_version: bare.to_string(),
                version_id: format!("neoforge-{bare}"),
            }
        }
    }

    fn file_name(&self, classifier: &str) -> String {
        format!("{}-{}-{classifier}.jar", self.artifact, self.full_version)
    }

    fn installer_url(&self) -> String {
        format!(
            "https://maven.neoforged.net/releases/net/neoforged/{}/{}/{}",
            self.artifact,
            self.full_version,
            self.file_name("installer")
        )
    }

    fn loads_game_jar_itself(&self) -> bool {
        self.artifact == "neoforge"
    }

    fn patched_client_jar(&self, libraries_dir: &Path) -> PathBuf {
        libraries_dir
            .join("net/neoforged")
            .join(self.artifact)
            .join(&self.full_version)
            .join(self.file_name("client"))
    }
}

async fn install_neoforge(
    mc_version: &str,
    neoforge_version: &str,
    minecraft_dir: &Path,
    libraries_dir: &Path,
    java_path: &str,
    watch: Option<LaunchWatch<'_>>,
) -> Result<serde_json::Value, String> {
    let nf = NeoforgeArtifact::new(mc_version, neoforge_version);
    let version_json_path = minecraft_dir
        .join("versions")
        .join(&nf.version_id)
        .join(format!("{}.json", nf.version_id));
    let patched_client_jar = nf.patched_client_jar(libraries_dir);

    if version_json_path.exists() && patched_client_jar.exists() {
        let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
        let version_data: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;
        ensure_libraries(&version_data, libraries_dir).await?;
        return Ok(version_data);
    }

    let installer_filename = nf.file_name("installer");
    let installer_url = nf.installer_url();

    let client = crate::http_client::HTTP_CLIENT.clone();
    let resp = client
        .get(&installer_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download NeoForge installer: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "NeoForge installer download failed: HTTP {} ({installer_url})",
            resp.status()
        ));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    verify_installer_jar(&bytes, &installer_url).await?;

    let installer_dir = minecraft_dir.join("installers");
    fs::create_dir_all(&installer_dir).map_err(|e| e.to_string())?;
    let installer_path = installer_dir.join(&installer_filename);
    fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

    ensure_launcher_profiles(minecraft_dir)?;
    run_loader_installer("NeoForge", java_path, &installer_path, minecraft_dir, watch).await?;

    if !version_json_path.exists() {
        return Err(format!(
            "NeoForge installer finished but {} is missing",
            version_json_path.display()
        ));
    }

    let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    let version_data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| e.to_string())?;
    ensure_libraries(&version_data, libraries_dir)
        .await
        .map_err(|e| format!("NeoForge installed but downloading its libraries failed: {e}"))?;
    Ok(version_data)
}

async fn install_quilt(
    mc_version: &str,
    loader_version: &str,
    minecraft_dir: &Path,
) -> Result<serde_json::Value, String> {
    let meta_url = format!(
        "https://meta.quiltmc.org/v3/versions/loader/{mc_version}/{loader_version}/profile/json"
    );
    let resp = crate::http_client::HTTP_CLIENT.get(&meta_url).send()
        .await
        .map_err(|e| format!("Failed to fetch Quilt profile: {e}"))?;
    let profile: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Quilt profile: {e}"))?;

    let version_id = profile
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Quilt profile missing id")?;

    let versions_dir = minecraft_dir.join("versions").join(version_id);
    fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;

    let version_json_path = versions_dir.join(format!("{version_id}.json"));
    let content = serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())?;
    fs::write(&version_json_path, content).map_err(|e| e.to_string())?;

    Ok(profile)
}





fn build_classpath(
    version_json: &serde_json::Value,
    libraries_dir: &Path,
    _versions_dir: &Path,
    instance: &GameInstance,
    instance_dir: &Path,
) -> Result<String, String> {
    let os_key = get_os_key();

    let mut all_libs = collect_libraries_recursive(version_json, &mut Vec::new(), 0)?;

    all_libs.retain(|lib| lib.get("natives").is_none());

    let mut paths: Vec<PathBuf> = Vec::new();
    // A loader's libraries come before the inherited vanilla ones, so the
    // loader's version of a shared library wins. NeoForge's bootstrap aborts
    // on a jar listed twice ("Duplicate key").
    let mut seen = std::collections::HashSet::new();

    for lib in &all_libs {
        if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
            if !check_rules(rules, os_key) {
                continue;
            }
        }

        if let Some(path) = resolve_library_path(lib, libraries_dir) {
            let key = lib
                .get("name")
                .and_then(|n| n.as_str())
                .map(library_identity)
                .unwrap_or_else(|| path.to_string_lossy().to_string());
            if seen.insert(key) {
                paths.push(path);
            }
        }
    }

    
    
    
    
    
    
    
    let client_version = &instance.minecraft_version;
    let mc_version = client_version;
    let patched_client_jar = match instance.loader {
        LoaderType::Forge => instance.loader_version.as_deref().map(|v| {
            let full_version = if v.starts_with(mc_version.as_str()) {
                v.to_string()
            } else {
                format!("{mc_version}-{v}")
            };
            libraries_dir
                .join("net/minecraftforge/forge")
                .join(&full_version)
                .join(format!("forge-{full_version}-client.jar"))
        }),
        LoaderType::Neoforge => instance
            .loader_version
            .as_deref()
            .map(|v| NeoforgeArtifact::new(mc_version, v).patched_client_jar(libraries_dir)),
        _ => None,
    };
    // NeoForge 1.20.2+ loads the game jar from libraries/ itself and, unlike
    // Forge, has no `forge-` entry in its ignoreList: a client jar on the
    // classpath becomes a second `minecraft` module and resolution fails.
    let loader_finds_game_jar = matches!(instance.loader, LoaderType::Neoforge)
        && instance
            .loader_version
            .as_deref()
            .is_some_and(|v| NeoforgeArtifact::new(mc_version, v).loads_game_jar_itself());

    let client_jar = match patched_client_jar {
        Some(p) if p.exists() => p,
        _ => minecraft_dir()
            .join("versions")
            .join(client_version)
            .join(format!("{client_version}.jar")),
    };
    if !loader_finds_game_jar && client_jar.exists() {
        paths.push(client_jar);
    }

    let add_mods = match instance.loader {
        LoaderType::Forge | LoaderType::Neoforge => false,
        _ => true,
    };
    if add_mods {
        let mods_dir = instance_dir.join("mods");
        if mods_dir.exists() {
            if let Ok(entries) = fs::read_dir(&mods_dir) {
                let mut mod_jars: Vec<PathBuf> = entries
                    .flatten()
                    .filter(|e| e.path().extension().map_or(false, |ext| ext == "jar"))
                    .map(|e| e.path())
                    .collect();
                mod_jars.sort();
                paths.extend(mod_jars);
            }
        }
    }

    let separator = if cfg!(windows) { ";" } else { ":" };
    let classpath: String = paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(separator);

    println!(
        "[Launcher] Classpath: {} entries (first 200 chars: {})",
        paths.len(),
        &classpath[..classpath.len().min(200)]
    );

    let cp_path = instance_dir.join("classpath.txt");
    fs::write(&cp_path, &classpath).ok();

    Ok(classpath)
}

/// `group:artifact[:classifier]` of a Maven coordinate, without the version.
fn library_identity(name: &str) -> String {
    let parts: Vec<&str> = name.split('@').next().unwrap_or(name).split(':').collect();
    match parts.as_slice() {
        [group, artifact, _version, classifier, ..] => format!("{group}:{artifact}:{classifier}"),
        [group, artifact, ..] => format!("{group}:{artifact}"),
        _ => name.to_string(),
    }
}

fn collect_libraries_recursive(
    version_json: &serde_json::Value,
    visited: &mut Vec<String>,
    depth: usize,
) -> Result<Vec<serde_json::Value>, String> {
    if depth > 5 {
        return Err("Too deep version inheritance".to_string());
    }

    let mut libs = Vec::new();

    if let Some(arr) = version_json.get("libraries").and_then(|l| l.as_array()) {
        libs.extend(arr.iter().cloned());
    }

    if let Some(parent_id) = version_json.get("inheritsFrom").and_then(|v| v.as_str()) {
        if !visited.contains(&parent_id.to_string()) {
            visited.push(parent_id.to_string());
            let parent_dir = minecraft_dir().join("versions").join(parent_id);
            let parent_path = parent_dir.join(format!("{parent_id}.json"));
            if let Ok(content) = fs::read_to_string(&parent_path) {
                if let Ok(parent_json) = serde_json::from_str::<serde_json::Value>(&content) {
                    let inherited = collect_libraries_recursive(&parent_json, visited, depth + 1)?;
                    libs.extend(inherited);
                }
            }
        }
    }

    Ok(libs)
}

fn resolve_library_path(lib: &serde_json::Value, libraries_dir: &Path) -> Option<PathBuf> {
    if let Some(path) = lib
        .get("downloads")
        .and_then(|d| d.get("artifact"))
        .and_then(|a| a.get("path"))
        .and_then(|p| p.as_str())
    {
        let full = libraries_dir.join(path);
        if full.exists() {
            return Some(full);
        }
    }

    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
        if let Some(rel) = maven_to_path(name) {
            let full = libraries_dir.join(&rel);
            if full.exists() {
                return Some(full);
            }
        }
    }

    None
}

fn minecraft_dir() -> PathBuf {
    get_minecraft_dir()
}





const BRAND_NAME: &str = "Reality Launcher";
const REALITY_AGENT_JAR: &[u8] = include_bytes!("../resources/reality-agent.jar");

/// Writes the bundled agent (source in `agent/`) next to the libraries,
/// replacing it only when the bytes differ.
fn ensure_agent_jar(minecraft_dir: &Path) -> Result<PathBuf, String> {
    let agent_dir = minecraft_dir.join("agent");
    let path = agent_dir.join("reality-agent.jar");
    if fs::read(&path).is_ok_and(|bytes| bytes == REALITY_AGENT_JAR) {
        return Ok(path);
    }
    fs::create_dir_all(&agent_dir).map_err(|e| e.to_string())?;
    let tmp = agent_dir.join(format!("reality-agent.jar.{}.tmp", std::process::id()));
    fs::write(&tmp, REALITY_AGENT_JAR).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(path)
}

/// Tab-list badge setup (`tab_badge`); `None` means this launch simply has no
/// badges. Mapping downloads are capped so a slow network never stalls a launch.
async fn prepare_tab_badges(
    minecraft_dir: &Path,
    libraries_dir: &Path,
    instance_dir: &Path,
    instance: &GameInstance,
    version_json: &serde_json::Value,
    self_uuids: &[String],
) -> Option<crate::tab_badge::BadgeSetup> {
    let resolve = crate::mappings::resolve_tab_schemes(
        minecraft_dir,
        libraries_dir,
        &instance.minecraft_version,
        &instance.loader,
        version_json,
    );
    let schemes = match tokio::time::timeout(std::time::Duration::from_secs(60), resolve).await {
        Ok(Ok(schemes)) => schemes,
        Ok(Err(e)) => {
            log::warn!("[TabBadge] Could not resolve tab-list names: {e}");
            return None;
        }
        Err(_) => {
            log::warn!("[TabBadge] Resolving tab-list names timed out");
            return None;
        }
    };
    crate::tab_badge::prepare(minecraft_dir, instance_dir, &instance.minecraft_version, schemes, self_uuids)
}

/// Reports the sign-in check the frontend ran right before calling launch.
fn log_session_check() {
    let last = crate::auth::LAST_REFRESH.lock().unwrap();
    match last.as_ref().filter(|r| r.at.elapsed().as_secs() < 120) {
        Some(r) => match &r.error {
            None => crate::launch_log::info(format!("Sign-in checked ({})", crate::launch_log::took(r.took))),
            Some(e) => crate::launch_log::warn(format!("Sign-in check failed after {}: {e}", crate::launch_log::took(r.took))),
        },
        None => crate::launch_log::info("Sign-in: not re-checked for this launch"),
    }
}

/// Shows the player name with most letters hidden, so shared logs don't name the account.
fn masked_name(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    match chars.len() {
        0..=2 => "*".repeat(chars.len()),
        n => format!("{}{}{}", chars[0], "*".repeat(n - 2), chars[n - 1]),
    }
}

fn log_session(session: &Session) {
    let kind = if session.auth_type == "microsoft" { "Microsoft" } else { "CatID" };
    let validity = match session.expires_at {
        Some(exp) => {
            let mins = (exp - chrono::Utc::now().timestamp_millis()) / 60_000;
            if mins > 0 {
                format!("session valid for {}h {}m", mins / 60, mins % 60)
            } else {
                "session expired".to_string()
            }
        }
        None => "no expiry recorded".to_string(),
    };
    let token = if session.access_token.as_deref().is_some_and(|t| !t.is_empty() && t != "0") {
        "game token present"
    } else {
        "no game token (offline)"
    };
    crate::launch_log::info(format!(
        "Session: {kind} account {}, {validity}, {token}",
        masked_name(&session.username)
    ));
}

/// UUIDs this player can appear as in a tab list: the account UUID on
/// online-mode servers, the name-derived offline UUID on offline-mode servers.
fn presence_uuids(session: &Session) -> Vec<String> {
    let mut uuids = vec![offline_uuid(&session.username)];
    if session.auth_type == "microsoft" && !session.uuid.starts_with("catid-") {
        uuids.push(session.uuid.clone());
    }
    uuids
}

/// The agent fixes the window title and adds the Forge/NeoForge title-screen
/// line; vanilla/Fabric/Quilt show the brand through `--versionType`. Branding
/// is cosmetic, so a failure to write the agent never blocks the launch.
fn branding_jvm_args(
    minecraft_dir: &Path,
    instance_dir: &Path,
    assets_dir: &Path,
    instance: &GameInstance,
    version_json: &serde_json::Value,
) -> Vec<String> {
    let agent = match ensure_agent_jar(minecraft_dir) {
        Ok(agent) => agent,
        Err(e) => {
            log::warn!("[Launcher] Skipping in-game branding, could not write agent: {e}");
            return Vec::new();
        }
    };
    let mut args = vec![
        format!("-javaagent:{}", agent.to_string_lossy()),
        format!(
            "-Dreality.title={}",
            crate::game_window::window_title(&instance.name, &instance.minecraft_version)
        ),
        format!("-Dreality.mcversion={}", instance.minecraft_version),
        format!("-Dreality.brand={BRAND_NAME}"),
    ];

    let asset_index = version_json
        .get("assetIndex")
        .and_then(|i| i.get("id"))
        .and_then(|i| i.as_str())
        .unwrap_or("legacy");
    let fingerprints = crate::game_window::vanilla_icon_fingerprints(assets_dir, asset_index);
    if fingerprints.is_empty() {
        log::warn!("[Launcher] No default icons found in asset index {asset_index}; keeping the game icon");
    } else {
        match crate::game_window::write_icon_file(minecraft_dir, instance_dir) {
            Ok(icon) => {
                args.push(format!("-Dreality.icon={}", icon.to_string_lossy()));
                args.push(format!("-Dreality.vanillaIcons={}", fingerprints.join(",")));
            }
            Err(e) => log::warn!("[Launcher] Could not write window icon: {e}"),
        }
    }
    args
}

fn build_jvm_args(
    version_json: &serde_json::Value,
    classpath: &str,
    natives_dir: &Path,
    libraries_dir: &Path,
    instance: &GameInstance,
    config: &crate::config::LauncherConfig,
) -> Result<Vec<String>, String> {
    let ram = instance.ram_mb.unwrap_or(config.ram_mb);
    let ram = if ram == 0 { config.ram_mb } else { ram };
    let version_name = version_json
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let sep = if cfg!(windows) { ";" } else { ":" };

    let mut args = vec![
        format!("-Xmx{}M", ram),
        "-Dminecraft.eula.accept=true".to_string(),
    ];

    // macOS requires -XstartOnFirstThread for LWJGL/GLFW
    #[cfg(target_os = "macos")]
    args.push("-XstartOnFirstThread".to_string());

    if let Some(jvm_arr) = version_json
        .get("arguments")
        .and_then(|a| a.get("jvm"))
        .and_then(|j| j.as_array())
    {
        for entry in jvm_arr {
            if let Some(s) = entry.as_str() {
                let resolved = s
                    .replace("${natives_directory}", &natives_dir.to_string_lossy())
                    .replace("${classpath_separator}", sep)
                    .replace("${library_directory}", &libraries_dir.to_string_lossy())
                    .replace("${launcher_name}", "reality-launcher")
                    .replace("${launcher_version}", env!("CARGO_PKG_VERSION"))
                    .replace("${version_name}", version_name)
                    .replace("${classpath}", classpath);
                args.push(resolved);
            }
            
        }
    } else {
        
        args.push(format!(
            "-Djava.library.path={}",
            natives_dir.to_string_lossy()
        ));
        args.push("-cp".to_string());
        args.push(classpath.to_string());
    }

    // Append user-configured JVM arguments from instance or config
    if let Some(ref extra) = instance.java_arguments {
        args.extend(extra.split_whitespace().map(String::from));
    } else if let Some(ref extra) = config.extra.get("javaArguments") {
        if let Some(s) = extra.as_str() {
            args.extend(s.split_whitespace().map(String::from));
        }
    }

    Ok(args)
}





fn build_game_args(
    version_json: &serde_json::Value,
    session: &Session,
    instance_dir: &Path,
    assets_dir: &Path,
    instance: &GameInstance,
) -> Result<(String, Vec<String>), String> {
    let main_class = version_json
        .get("mainClass")
        .and_then(|v| v.as_str())
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();

    let version_name = version_json
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or(&instance.minecraft_version);
    let asset_index = version_json
        .get("assetIndex")
        .and_then(|i| i.get("id"))
        .and_then(|i| i.as_str())
        .unwrap_or("legacy");

    let is_microsoft = session.auth_type == "microsoft";
    let user_type = if is_microsoft { "msa" } else { "legacy" };

    let username = &session.username;
    
    
    let uuid = if session.uuid.starts_with("catid-") || !is_microsoft {
        offline_uuid(username)
    } else {
        session.uuid.replace('-', "")
    };
    let access_token = session.access_token.as_deref().unwrap_or("0");
    let user_properties = "{}";

    let resolve = |s: &str| -> String {
        s.replace("${auth_player_name}", username)
            .replace("${auth_uuid}", &uuid)
            .replace("${auth_access_token}", access_token)
            .replace("${auth_session}", access_token)
            .replace("${version_name}", version_name)
            .replace("${version_type}", BRAND_NAME)
            .replace("${assets_root}", &assets_dir.to_string_lossy())
            .replace("${assets_index_name}", asset_index)
            .replace("${game_directory}", &instance_dir.to_string_lossy())
            .replace("${user_properties}", user_properties)
            .replace("${user_type}", user_type)
            .replace("${clientid}", "")
            .replace("${auth_xuid}", "")
    };

    
    
    
    let strip_unresolved = |args: Vec<String>| -> Vec<String> {
        let mut out = Vec::with_capacity(args.len());
        let mut i = 0;
        while i < args.len() {
            let cur = &args[i];
            let next_is_placeholder = args.get(i + 1).map(|n| n.contains("${")).unwrap_or(false);
            if cur.starts_with("--") && next_is_placeholder {
                i += 2; 
                continue;
            }
            if cur.contains("${") {
                i += 1; 
                continue;
            }
            out.push(cur.clone());
            i += 1;
        }
        out
    };

    let game_args = if let Some(game_arr) = version_json
        .get("arguments")
        .and_then(|a| a.get("game"))
        .and_then(|g| g.as_array())
    {
        let mut args = Vec::new();
        for entry in game_arr {
            
            if let Some(s) = entry.as_str() {
                args.push(resolve(s));
            }
        }
        strip_unresolved(args)
    } else if let Some(template) = version_json
        .get("minecraftArguments")
        .and_then(|v| v.as_str())
    {
        strip_unresolved(template.split_whitespace().map(|s| resolve(s)).collect())
    } else {
        vec![
            "--username".to_string(),
            username.to_string(),
            "--uuid".to_string(),
            uuid.clone(),
            "--accessToken".to_string(),
            access_token.to_string(),
            "--version".to_string(),
            version_name.to_string(),
            "--gameDir".to_string(),
            instance_dir.to_string_lossy().to_string(),
            "--assetsDir".to_string(),
            assets_dir.to_string_lossy().to_string(),
            "--assetIndex".to_string(),
            asset_index.to_string(),
            "--userProperties".to_string(),
            user_properties.to_string(),
            "--userType".to_string(),
            user_type.to_string(),
            "--versionType".to_string(),
            BRAND_NAME.to_string(),
        ]
    };

    Ok((main_class, game_args))
}





const VERSION_MANIFEST_URL: &str =
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

fn get_os_key() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

fn get_arch_bits() -> &'static str {
    if cfg!(target_pointer_width = "64") {
        "64"
    } else {
        "32"
    }
}

fn check_rules(rules: &[serde_json::Value], os_key: &str) -> bool {
    let mut allowed = false;
    let mut has_allow = false;
    let mut has_disallow = false;

    for rule in rules {
        let action = rule.get("action").and_then(|a| a.as_str()).unwrap_or("");
        let os = rule.get("os");
        let os_match = os.map_or(true, |o| {
            o.get("name").and_then(|n| n.as_str()) == Some(os_key)
        });

        match action {
            "allow" => {
                has_allow = true;
                if os_match {
                    allowed = true;
                }
            }
            "disallow" => {
                has_disallow = true;
                if os_match {
                    allowed = false;
                }
            }
            _ => {}
        }
    }

    if !has_allow && !has_disallow {
        true
    } else if has_disallow && !has_allow {
        !allowed
    } else {
        allowed
    }
}

fn maven_to_path(lib_name: &str) -> Option<String> {
    let parts: Vec<&str> = lib_name.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).filter(|c| !c.is_empty());
    let ext = parts.get(4).unwrap_or(&"jar");

    let filename = if let Some(c) = classifier {
        format!("{artifact}-{version}-{c}.{ext}")
    } else {
        format!("{artifact}-{version}.{ext}")
    };

    Some(format!("{group}/{artifact}/{version}/{filename}"))
}

fn sha1_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(sha1_bytes(&bytes))
}

fn sha1_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}




fn offline_uuid(username: &str) -> String {
    use md5::{Digest, Md5};
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{username}").as_bytes());
    let mut bytes = hasher.finalize();
    bytes[6] = (bytes[6] & 0x0f) | 0x30; 
    bytes[8] = (bytes[8] & 0x3f) | 0x80; 
    let h = hex::encode(bytes);
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}

async fn fetch_version_manifest() -> Result<serde_json::Value, String> {
    let resp = crate::http_client::HTTP_CLIENT.get(VERSION_MANIFEST_URL).send()
        .await
        .map_err(|e| format!("Failed to fetch version manifest: {e}"))?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse version manifest: {e}"))
}

async fn get_version_json(
    version_id: &str,
    minecraft_dir: &Path,
) -> Result<serde_json::Value, String> {
    let versions_dir = minecraft_dir.join("versions").join(version_id);
    let version_json_path = versions_dir.join(format!("{version_id}.json"));

    if version_json_path.exists() {
        let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
        if let Ok(json) = serde_json::from_str(&content) {
            return Ok(json);
        }
    }

    let manifest = fetch_version_manifest().await?;
    let versions = manifest
        .get("versions")
        .and_then(|v| v.as_array())
        .ok_or("Invalid version manifest")?;

    let version_info = versions
        .iter()
        .find(|v| v.get("id").and_then(|i| i.as_str()) == Some(version_id))
        .ok_or_else(|| format!("Version {version_id} not found in manifest"))?;

    let url = version_info
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or("Version missing URL")?;

    let resp = crate::http_client::HTTP_CLIENT.get(url).send()
        .await
        .map_err(|e| format!("Failed to fetch version JSON: {e}"))?;
    let version_json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse version JSON: {e}"))?;

    fs::create_dir_all(&versions_dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(&version_json).map_err(|e| e.to_string())?;
    fs::write(&version_json_path, content).map_err(|e| e.to_string())?;

    Ok(version_json)
}

async fn download_client_jar(
    version_data: &serde_json::Value,
    versions_dir: &Path,
) -> Result<PathBuf, String> {
    let version_id = version_data
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Version data missing id")?;
    let client_download = version_data
        .get("downloads")
        .and_then(|d| d.get("client"))
        .ok_or("Version missing client download")?;
    let url = client_download
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or("Client download missing URL")?;
    let expected_sha1 = client_download.get("sha1").and_then(|s| s.as_str());

    let jar_path = versions_dir.join(format!("{version_id}.jar"));

    // Hashing the ~25 MB jar on every launch is slow; once it has been
    // verified, its size and mtime vouch for it until the file changes.
    let marker = versions_dir.join(format!(".{version_id}.jar.verified"));
    let stamp = |sha1: &str| {
        let meta = fs::metadata(&jar_path).ok()?;
        let mtime = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?;
        Some(format!("{sha1}:{}:{}", meta.len(), mtime.as_millis()))
    };
    if jar_path.exists() {
        let valid = match expected_sha1 {
            Some(sha1) => {
                let current = stamp(sha1);
                if current.is_some() && fs::read_to_string(&marker).ok() == current {
                    true
                } else if sha1_file(&jar_path).ok().as_deref() == Some(sha1) {
                    crate::launch_log::info(format!("Client jar {version_id} verified"));
                    if let Some(current) = current {
                        let _ = fs::write(&marker, current);
                    }
                    true
                } else {
                    false
                }
            }
            None => true,
        };
        if valid {
            return Ok(jar_path);
        }
    }

    fs::create_dir_all(versions_dir).map_err(|e| e.to_string())?;
    crate::launch_log::info(format!("Downloading client jar {version_id}"));

    use sha1::Digest as Sha1Digest;
    use std::io::Write;

    let response = crate::http_client::HTTP_CLIENT.get(url).send()
        .await
        .map_err(|e| format!("Failed to download client jar: {e}"))?;

    let tmp_path = jar_path.with_extension("tmp");
    let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut hasher = expected_sha1.map(|_| sha1::Sha1::new());

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read client jar: {e}"))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        if let Some(ref mut h) = hasher {
            h.update(&chunk);
        }
    }
    drop(file);

    if let (Some(ref expected), Some(h)) = (expected_sha1, hasher) {
        let actual = hex::encode(h.finalize());
        if &actual != expected {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(format!("Client jar SHA1 mismatch: expected {expected}, got {actual}"));
        }
    }

    std::fs::rename(&tmp_path, &jar_path).map_err(|e| e.to_string())?;
    if let Some(current) = expected_sha1.and_then(stamp) {
        let _ = fs::write(&marker, current);
    }
    Ok(jar_path)
}

async fn download_files(
    client: &reqwest::Client,
    files: &[(String, PathBuf, Option<String>)],
) -> Result<(), String> {
    use sha1::Digest as Sha1Digest;
    use std::io::Write;

    let concurrency = std::sync::Arc::new(tokio::sync::Semaphore::new(crate::config::get_max_concurrent_downloads()));
    let mut handles = Vec::new();

    for (url, dest, expected_sha1) in files {
        let client = client.clone();
        let url = url.clone();
        let dest = dest.clone();
        let expected = expected_sha1.clone();
        let sem = concurrency.clone();

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).ok();
            }

            let resp = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Download failed: {url} - {e}"))?;

            static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let seq = TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let mut tmp_name = dest.file_name().unwrap_or_default().to_os_string();
            tmp_name.push(format!(".{}-{seq}.tmp", std::process::id()));
            let tmp_path = dest.with_file_name(tmp_name);
            let mut file = std::fs::File::create(&tmp_path)
                .map_err(|e| format!("Create error: {}", e))?;
            let mut stream = resp.bytes_stream();
            let mut hasher = expected.as_ref().map(|_| sha1::Sha1::new());

            use futures_util::StreamExt;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("Read failed: {url} - {e}"))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Write error: {}", e))?;
                if let Some(ref mut h) = hasher {
                    h.update(&chunk);
                }
            }
            drop(file);

            if let (Some(ref expected), Some(h)) = (expected, hasher) {
                let actual = hex::encode(h.finalize());
                if &actual != expected {
                    let _ = std::fs::remove_file(&tmp_path);
                    return Err(format!(
                        "SHA1 mismatch for {url}: expected {expected}, got {actual}"
                    ));
                }
            }

            if dest.exists() {
                let _ = std::fs::remove_file(&dest);
            }
            if let Err(e) = std::fs::rename(&tmp_path, &dest) {
                let _ = std::fs::remove_file(&tmp_path);
                // Another writer (concurrent launch/preinstall) may have just put the same file in place.
                if !dest.exists() {
                    return Err(format!("Rename error: {} - {e}", dest.display()));
                }
            }
            Ok::<_, String>(())
        }));
    }

    for handle in handles {
        handle
            .await
            .map_err(|e| format!("Download task failed: {e}"))??;
    }

    Ok(())
}

async fn ensure_libraries(
    version_data: &serde_json::Value,
    libraries_dir: &Path,
) -> Result<(), String> {
    let os_key = get_os_key();

    let libs = version_data
        .get("libraries")
        .and_then(|l| l.as_array())
        .ok_or("Version data missing libraries")?;

    let client = crate::http_client::HTTP_CLIENT.clone();
    let mut downloads = Vec::new();

    for lib in libs {
        if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
            if !check_rules(rules, os_key) {
                continue;
            }
        }

        if lib.get("natives").is_some() {
            continue;
        }

        let (rel_path, url, sha1) =
            if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                let p = artifact
                    .get("path")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        lib.get("name")
                            .and_then(|n| n.as_str())
                            .and_then(maven_to_path)
                    });
                let u = artifact
                    .get("url")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        let base = lib
                            .get("url")
                            .and_then(|s| s.as_str())
                            .unwrap_or("https://libraries.minecraft.net");
                        p.as_ref().map(|rp| format!("{base}/{rp}"))
                    });
                let s = artifact
                    .get("sha1")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                (p, u, s)
            } else if lib.get("name").is_some() {
                // Maven-style entry (Fabric/Quilt): repo base URL, often with a trailing slash.
                let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let rel = maven_to_path(name);
                let base = lib
                    .get("url")
                    .and_then(|u| u.as_str())
                    .unwrap_or("https://libraries.minecraft.net")
                    .trim_end_matches('/');
                let u = rel.as_ref().map(|rp| format!("{base}/{rp}"));
                let s = lib.get("sha1").and_then(|s| s.as_str()).map(|s| s.to_string());
                (rel, u, s)
            } else {
                continue;
            };

        let (Some(rel_path), Some(url)) = (&rel_path, &url) else {
            continue;
        };
        let dest = libraries_dir.join(rel_path);
        
        
        if dest.exists() {
            continue;
        }
        downloads.push((url.clone(), dest, sha1.clone()));
    }

    if !downloads.is_empty() {
        crate::launch_log::info(format!("Downloading {} missing libraries", downloads.len()));
        download_files(&client, &downloads).await?;
    }

    Ok(())
}

async fn check_and_download_assets(
    version_data: &serde_json::Value,
    assets_dir: &Path,
) -> Result<(), String> {
    let asset_index = version_data
        .get("assetIndex")
        .ok_or("Version missing assetIndex")?;
    let index_url = asset_index
        .get("url")
        .and_then(|u| u.as_str())
        .ok_or("assetIndex missing URL")?;
    let expected_sha1 = asset_index.get("sha1").and_then(|s| s.as_str());

    let index_id = asset_index
        .get("id")
        .and_then(|i| i.as_str())
        .unwrap_or("legacy");
    let indexes_dir = assets_dir.join("indexes");
    let index_path = indexes_dir.join(format!("{index_id}.json"));

    if !index_path.exists()
        || expected_sha1.map_or(false, |sha1| {
            sha1_file(&index_path).ok().map_or(true, |h| h != sha1)
        })
    {
        fs::create_dir_all(&indexes_dir).map_err(|e| e.to_string())?;
        let resp = crate::http_client::HTTP_CLIENT.get(index_url).send()
            .await
            .map_err(|e| format!("Failed to download asset index: {e}"))?;
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        if let Some(sha1) = expected_sha1 {
            let actual = sha1_bytes(&bytes);
            if actual != sha1 {
                return Err(format!("Asset index SHA1 mismatch"));
            }
        }
        fs::write(&index_path, &bytes).map_err(|e| e.to_string())?;
    }

    
    
    
    let index_sha1 = sha1_file(&index_path).ok().unwrap_or_default();
    let verified_marker = indexes_dir.join(format!(".{index_id}.{index_sha1}.verified"));
    if verified_marker.exists() && index_path.exists() {
        crate::launch_log::info(format!("Assets: index {index_id} already verified"));
        return Ok(());
    }

    let index_content = fs::read_to_string(&index_path).map_err(|e| e.to_string())?;
    let index: serde_json::Value =
        serde_json::from_str(&index_content).map_err(|e| e.to_string())?;

    let objects = index
        .get("objects")
        .and_then(|o| o.as_object())
        .ok_or("Asset index missing objects")?;

    let objects_dir = assets_dir.join("objects");
    let client = crate::http_client::HTTP_CLIENT.clone();
    let mut downloads = Vec::new();
    // Many asset names share one hash; queueing a hash twice races two writers on the same object.
    let mut seen = std::collections::HashSet::new();

    for (_path_str, info) in objects {
        let hash = info.get("hash").and_then(|h| h.as_str()).unwrap_or("");
        if hash.is_empty() || !seen.insert(hash) {
            continue;
        }

        let prefix = &hash[..2];
        let obj_path = objects_dir.join(prefix).join(hash);

        
        
        
        if obj_path.exists() {
            continue;
        }

        let url = format!("https://resources.download.minecraft.net/{prefix}/{hash}");
        downloads.push((url, obj_path, Some(hash.to_string())));
    }

    if downloads.is_empty() {
        crate::launch_log::info(format!("Assets: all {} objects of index {index_id} present", seen.len()));
    } else {
        crate::launch_log::info(format!(
            "Assets: downloading {} of {} objects (index {index_id})",
            downloads.len(),
            seen.len()
        ));
        download_files(&client, &downloads).await?;
    }

    
    
    let _ = fs::write(
        &verified_marker,
        serde_json::json!({ "id": index_id, "verifiedAt": chrono::Utc::now().to_rfc3339() })
            .to_string(),
    );

    Ok(())
}

fn compute_native_fingerprint(
    version_data: &serde_json::Value,
    libraries_dir: &Path,
    os_key: &str,
    arch_bits: &str,
) -> String {
    let mut hasher = Sha1::new();
    hasher.update(
        version_data
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    );

    let empty_libs: Vec<serde_json::Value> = vec![];
    let libs = version_data
        .get("libraries")
        .and_then(|l| l.as_array())
        .unwrap_or(&empty_libs);
    for lib in libs {
        let natives = match lib.get("natives") {
            Some(n) => n,
            None => continue,
        };
        let template = match natives.get(os_key) {
            Some(c) => c.as_str().unwrap_or(""),
            None => continue,
        };
        let classifier_key = template.replace("${arch}", arch_bits);
        let classifier_dl = lib
            .get("downloads")
            .and_then(|d| d.get("classifiers"))
            .and_then(|c| c.get(&classifier_key));

        let native_path = classifier_dl
            .and_then(|d| d.get("path").and_then(|p| p.as_str()))
            .map(|p| libraries_dir.join(p));

        let Some(ref path) = native_path else {
            continue;
        };
        hasher.update(path.to_string_lossy().as_bytes());
        let Ok(meta) = fs::metadata(path) else {
            continue;
        };
        hasher.update(meta.len().to_string().as_bytes());
        let Ok(mtime) = meta.modified() else {
            continue;
        };
        let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) else {
            continue;
        };
        hasher.update(dur.as_millis().to_string().as_bytes());
    }

    hex::encode(hasher.finalize())
}

fn has_native_binary(dir: &Path) -> bool {
    if !dir.exists() {
        return false;
    }
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if name.ends_with(".dll")
                || name.ends_with(".so")
                || name.ends_with(".dylib")
                || name.ends_with(".jnilib")
            {
                return true;
            }
        }
    }
    false
}

async fn extract_natives(
    version_data: &serde_json::Value,
    libraries_dir: &Path,
    natives_dir: &Path,
) -> Result<(), String> {
    let os_key = get_os_key();
    let arch_bits = get_arch_bits();

    let fingerprint = compute_native_fingerprint(version_data, libraries_dir, os_key, arch_bits);

    let meta_path = natives_dir.join(".extract-meta.json");
    if meta_path.exists() {
        if let Ok(content) = fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                if meta.get("fingerprint").and_then(|f| f.as_str()) == Some(&fingerprint)
                    && has_native_binary(natives_dir)
                {
                    return Ok(());
                }
            }
        }
    }

    if natives_dir.exists() {
        fs::remove_dir_all(natives_dir).ok();
    }
    fs::create_dir_all(natives_dir).map_err(|e| e.to_string())?;

    let empty_libs: Vec<serde_json::Value> = vec![];
    let libs = version_data
        .get("libraries")
        .and_then(|l| l.as_array())
        .unwrap_or(&empty_libs);

    for lib in libs {
        
        
        if let Some(natives) = lib.get("natives") {
            let classifier_template = match natives.get(os_key) {
                Some(c) => c.as_str().unwrap_or(""),
                None => continue,
            };
            if classifier_template.is_empty() {
                continue;
            }

            let classifier_key = classifier_template.replace("${arch}", arch_bits);
            let classifier_dl = lib
                .get("downloads")
                .and_then(|d| d.get("classifiers"))
                .and_then(|c| c.get(&classifier_key));

            let native_path = classifier_dl
                .and_then(|d| d.get("path").and_then(|p| p.as_str()))
                .map(|p| libraries_dir.join(p));

            if let Some(native_path) = native_path {
                if native_path.exists() {
                    let file = fs::File::open(&native_path).map_err(|e| e.to_string())?;
                    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
                    archive.extract(natives_dir).ok();
                }
            }
            continue;
        }

        
        
        
        
        
        
        let name = match lib.get("name").and_then(|n| n.as_str()) {
            Some(n) => n,
            None => continue,
        };
        let classifier = match name.rsplit_once(':') {
            Some((_, c)) if c.starts_with("natives-") => c,
            _ => continue,
        };
        if !classifier.contains(os_key) {
            continue;
        }
        if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
            if !check_rules(rules, os_key) {
                continue;
            }
        }

        let native_path = lib
            .get("downloads")
            .and_then(|d| d.get("artifact"))
            .and_then(|a| a.get("path"))
            .and_then(|p| p.as_str())
            .map(|p| p.to_string())
            .or_else(|| maven_to_path(name))
            .map(|p| libraries_dir.join(p));

        if let Some(native_path) = native_path {
            if native_path.exists() {
                let file = fs::File::open(&native_path).map_err(|e| e.to_string())?;
                let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
                archive.extract(natives_dir).ok();
            }
        }
    }

    let meta = serde_json::json!({
        "fingerprint": fingerprint,
        "platform": os_key,
        "arch": arch_bits,
        "extractedAt": chrono::Utc::now().to_rfc3339(),
    });
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn instances_preinstall(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let instance = match crate::instances::instances_get(id) {
        Some(i) => i,
        None => return Err("Instance not found".to_string()),
    };

    let minecraft_dir_val = get_minecraft_dir();
    let libraries_dir = minecraft_dir_val.join("libraries");
    let assets_dir = minecraft_dir_val.join("assets");

    
    let version_json = get_version_json(&instance.minecraft_version, &minecraft_dir_val).await?;

    
    let versions_dir = minecraft_dir_val
        .join("versions")
        .join(&instance.minecraft_version);
    download_client_jar(&version_json, &versions_dir).await?;

    
    ensure_libraries(&version_json, &libraries_dir).await?;

    
    check_and_download_assets(&version_json, &assets_dir).await?;

    
    if instance.loader != LoaderType::Vanilla {
        let required_java =
            crate::java::get_required_java_version(&instance.minecraft_version, &version_json);
        let config_val = crate::config::config_get();
        let java_path =
            crate::java::ensure_compatible_java(&app, &instance, &config_val, required_java)
                .await?;
        let loader_json =
            install_mod_loader(&instance, &minecraft_dir_val, &libraries_dir, &java_path, None).await?;
        // Same as launch: Fabric/Quilt libraries are only listed in the profile.
        if matches!(instance.loader, LoaderType::Fabric | LoaderType::Quilt) {
            ensure_libraries(&loader_json, &libraries_dir).await?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_java_versions() {
        let graalvm = "java version \"21.0.12\" 2026-07-21 LTS\nJava(TM) SE Runtime Environment Oracle GraalVM 21.0.12+7.1";
        assert_eq!(parse_java_version(graalvm), Some(21));
        assert_eq!(parse_java_version("openjdk version \"17.0.20.1\" 2026-08-18 LTS"), Some(17));
        assert_eq!(parse_java_version("java version \"1.8.0_462\""), Some(8));
    }

    #[test]
    fn installer_milestones() {
        assert_eq!(installer_milestone("Task: MCP_DATA"), Some("Task: MCP_DATA"));
        assert_eq!(installer_milestone("Building Processors\r"), Some("Building Processors"));
        assert_eq!(installer_milestone("  Downloading library from https://x"), None);
        assert_eq!(installer_milestone("Data kindly mirrored by CreeperHost"), None);
    }

    #[test]
    fn shorten_cuts_on_char_boundary() {
        assert_eq!(shorten("abc", 5), "abc");
        assert_eq!(shorten("ไทยภาษา", 3), "ไทย…");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn loader_installer_failure_keeps_output_tail() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("reality-installer-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let fake_java = dir.join("java");
        fs::write(
            &fake_java,
            "#!/bin/sh\nfor i in $(seq 1 60); do echo \"line $i\"; done\n\
             echo 'Processor failed, invalid outputs' >&2\necho 'last'\nexit 3\n",
        )
        .unwrap();
        fs::set_permissions(&fake_java, fs::Permissions::from_mode(0o755)).unwrap();

        let ok = dir.join("ok");
        fs::write(&ok, "#!/bin/sh\necho done\n").unwrap();
        fs::set_permissions(&ok, fs::Permissions::from_mode(0o755)).unwrap();
        let installer = dir.join("installer.jar");

        assert!(run_loader_installer("Forge", &ok.to_string_lossy(), &installer, &dir, None)
            .await
            .is_ok());
        let err = run_loader_installer("Forge", &fake_java.to_string_lossy(), &installer, &dir, None)
            .await
            .unwrap_err();
        let _ = fs::remove_dir_all(&dir);

        assert!(err.contains("exit status: 3"), "{err}");
        assert!(err.contains("line 60") && err.contains("last"), "{err}");
        assert!(!err.contains("line 5\n"), "{err}");
        assert!(err.contains("zlib-ng"), "{err}");
    }

    #[test]
    fn read_log_lines_holds_back_partial_line_and_decodes_lossily() {
        let dir = std::env::temp_dir().join(format!("rl-log-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("latest.log");

        fs::write(&path, b"one\ntw\xffo\nthr").unwrap();
        let res = read_log_lines(&path, 0);
        assert_eq!(res["content"], "one\ntw\u{fffd}o\n");
        assert_eq!(res["size"], 9);

        fs::write(&path, b"one\ntw\xffo\nthree\n").unwrap();
        let res = read_log_lines(&path, 9);
        assert_eq!(res["content"], "three\n");
        assert_eq!(res["size"], 15);

        fs::write(&path, b"new\n").unwrap();
        let res = read_log_lines(&path, 15);
        assert_eq!(res["content"], "new\n");
        assert_eq!(res["size"], 4);

        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(read_log_lines(&path, 4)["ok"], false);
    }

    #[test]
    fn bundled_agent_declares_premain() {
        assert_eq!(&REALITY_AGENT_JAR[..2], b"PK");
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(REALITY_AGENT_JAR)).unwrap();
        let mut manifest = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("META-INF/MANIFEST.MF").unwrap(), &mut manifest)
            .unwrap();
        assert!(manifest.contains("Premain-Class: space.catlabdesign.reality.agent.RealityAgent"));
    }

    #[test]
    fn ensure_agent_jar_writes_and_refreshes() {
        let dir = std::env::temp_dir().join(format!("rl-agent-test-{}", std::process::id()));
        let path = ensure_agent_jar(&dir).unwrap();
        assert_eq!(fs::read(&path).unwrap(), REALITY_AGENT_JAR);
        fs::write(&path, b"stale").unwrap();
        ensure_agent_jar(&dir).unwrap();
        assert_eq!(fs::read(&path).unwrap(), REALITY_AGENT_JAR);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn detects_system_zlib_dependency() {
        let dir = std::env::temp_dir().join(format!("rl-zlib-test-{}", std::process::id()));
        let lib = dir.join("lib");
        fs::create_dir_all(&lib).unwrap();

        fs::write(lib.join("libzip.so"), b"\x7fELF...libjvm.so\0libz.so.1\0libc.so.6\0").unwrap();
        assert!(libzip_links_system_zlib(&dir));

        fs::write(lib.join("libzip.so"), b"\x7fELF...libjvm.so\0libc.so.6\0inflate").unwrap();
        assert!(!libzip_links_system_zlib(&dir));

        fs::remove_dir_all(&dir).unwrap();
        assert!(!libzip_links_system_zlib(&dir));
    }

    #[test]
    fn neoforge_artifact_coordinates() {
        let modern = NeoforgeArtifact::new("1.21.1", "21.1.264");
        assert_eq!(
            modern.installer_url(),
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.264/neoforge-21.1.264-installer.jar"
        );
        assert_eq!(modern.version_id, "neoforge-21.1.264");
        assert_eq!(NeoforgeArtifact::new("1.21.1", "neoforge-21.1.264").full_version, "21.1.264");

        let legacy = NeoforgeArtifact::new("1.20.1", "47.1.106");
        assert_eq!(
            legacy.installer_url(),
            "https://maven.neoforged.net/releases/net/neoforged/forge/1.20.1-47.1.106/forge-1.20.1-47.1.106-installer.jar"
        );
        assert_eq!(legacy.version_id, "1.20.1-forge-47.1.106");
        assert_eq!(NeoforgeArtifact::new("1.20.1", "1.20.1-47.1.106").full_version, "1.20.1-47.1.106");
    }

    #[test]
    fn library_identity_ignores_version_but_keeps_classifier() {
        assert_eq!(library_identity("com.google.code.gson:gson:2.10.1"), "com.google.code.gson:gson");
        assert_eq!(
            library_identity("org.lwjgl:lwjgl:3.3.3:natives-linux"),
            "org.lwjgl:lwjgl:natives-linux"
        );
        assert_eq!(library_identity("net.neoforged:neoforge:21.1.264:client@jar"), "net.neoforged:neoforge:client");
    }
}
