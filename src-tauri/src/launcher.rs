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
pub fn kill_game() -> Result<(), String> {
    let mut process = GAME_PROCESS.lock().map_err(|e| e.to_string())?;
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
        }
        *process = None;
    }
    *LAUNCHING.lock().unwrap() = false;
    *PLAYING_INSTANCE_ID.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn instances_launch(
    app_handle: tauri::AppHandle,
    id: String,
    skip_server_mod_sync: Option<bool>,
) -> LaunchResult {
    {
        let launching = LAUNCHING.lock().unwrap();
        if *launching {
            return LaunchResult {
                ok: false,
                message: Some("Already launching a game".to_string()),
            };
        }
    }

    if is_game_running(None) {
        return LaunchResult {
            ok: false,
            message: Some("A game is already running".to_string()),
        };
    }

    *LAUNCHING.lock().unwrap() = true;
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

    let _ = crate::discord::discord_rpc_update(
        "launching".to_string(),
        Some(instance.name.clone()),
        instance.icon.clone(),
        instance.cloud_id.clone(),
    ).await;

    
    
    
    if instance.cloud_id.is_some() && skip_server_mod_sync != Some(true) {
        
        
        emit_progress(&app_handle, "sync", "Syncing server mods...", 0.02);
        match crate::cloud::sync_instance_for_launch(&app_handle, &instance).await {
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

    
    
    
    
    
    match launch_game(app_handle.clone(), instance).await {
        Ok(()) => LaunchResult {
            ok: true,
            message: None,
        },
        Err(e) => {
            eprintln!("[Launcher] Launch failed: {e}");
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





#[tauri::command]
pub fn instance_read_latest_log(instance_id: String) -> serde_json::Value {
    let log_path = crate::instances::get_instance_dir(&instance_id)
        .join("logs")
        .join("latest.log");
    match fs::read_to_string(&log_path) {
        Ok(content) => {
            let len = content.len();
            serde_json::json!({ "ok": true, "content": content, "size": len })
        }
        Err(_) => serde_json::json!({ "ok": false, "content": "", "size": 0 }),
    }
}




#[tauri::command]
pub fn instance_tail_log(instance_id: String, from: u64) -> serde_json::Value {
    use std::io::{Read, Seek, SeekFrom};

    let log_path = crate::instances::get_instance_dir(&instance_id)
        .join("logs")
        .join("latest.log");

    let Ok(mut file) = fs::File::open(&log_path) else {
        return serde_json::json!({ "ok": false, "content": "", "size": from });
    };
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);

    
    let start = if from > size { 0 } else { from };
    if file.seek(SeekFrom::Start(start)).is_err() {
        return serde_json::json!({ "ok": false, "content": "", "size": size });
    }

    let mut buf = String::new();
    let _ = file.read_to_string(&mut buf);
    serde_json::json!({ "ok": true, "content": buf, "size": size })
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





async fn launch_game(app: tauri::AppHandle, instance: GameInstance) -> Result<(), String> {
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

    
    let effective_version_json = if instance.loader != LoaderType::Vanilla {
        emit_progress(&app, "modloader", "Installing mod loader...", 0.75);
        let loader_json =
            install_mod_loader(&instance, &minecraft_dir_val, &libraries_dir, &java_path).await?;
        merge_inherited_version(&loader_json, &minecraft_dir_val)?
    } else {
        version_json
    };

    
    emit_progress(&app, "classpath", "Building classpath...", 0.85);
    let classpath = build_classpath(
        &effective_version_json,
        &libraries_dir,
        &versions_dir,
        &instance,
        &instance_dir,
    )?;

    
    let jvm_args = build_jvm_args(
        &effective_version_json,
        &classpath,
        &natives_dir,
        &libraries_dir,
        &instance,
        &config_val,
    )?;

    
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
    println!("[Launcher] Args: {}", all_args.join(" "));


    let mut cmd = Command::new(&java_path);
    cmd.args(&all_args)
        .current_dir(&instance_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn Java: {e}"))?;

    let pid = child.id();
    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();

    *GAME_PROCESS.lock().unwrap() = Some(child);
    *LAUNCHING.lock().unwrap() = false;

    
    crate::instances::mark_played(&instance.id);

    println!("[Launcher] Game started (pid={pid})");
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
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines().flatten() {
                println!("[Game stderr] {line}");
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

async fn install_forge(
    mc_version: &str,
    forge_version: &str,
    minecraft_dir: &Path,
    libraries_dir: &Path,
    java_path: &str,
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
        return serde_json::from_str(&content).map_err(|e| e.to_string());
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
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    let installer_dir = minecraft_dir.join("installers");
    fs::create_dir_all(&installer_dir).map_err(|e| e.to_string())?;
    let installer_path = installer_dir.join(&installer_filename);
    fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

    ensure_launcher_profiles(minecraft_dir)?;

    let mut cmd = Command::new(java_path);
    cmd.args([
        "-jar",
        &installer_path.to_string_lossy(),
        "--installClient",
        &minecraft_dir.to_string_lossy(),
    ])
    .current_dir(&installer_dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output()
        .map_err(|e| format!("Failed to run Forge installer: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Forge installer exited with {}: {}",
            output.status,
            if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
        ));
    }

    if !version_json_path.exists() {
        return Err(format!(
            "Forge installer finished but {} is missing",
            version_json_path.display()
        ));
    }

    let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}





async fn install_neoforge(
    mc_version: &str,
    neoforge_version: &str,
    minecraft_dir: &Path,
    libraries_dir: &Path,
    java_path: &str,
) -> Result<serde_json::Value, String> {
    let full_version = format!("{mc_version}-{neoforge_version}");
    let version_id = format!("neoforge-{neoforge_version}");
    let version_json_path = minecraft_dir
        .join("versions")
        .join(&version_id)
        .join(format!("{version_id}.json"));
    let patched_client_jar = libraries_dir
        .join("net/neoforged/neoforge")
        .join(neoforge_version)
        .join(format!("neoforge-{neoforge_version}-client.jar"));

    if version_json_path.exists() && patched_client_jar.exists() {
        let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
        return serde_json::from_str(&content).map_err(|e| e.to_string());
    }

    let installer_filename = format!("neoforge-{full_version}-installer.jar");
    let installer_url = format!(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/{full_version}/{installer_filename}"
    );

    let client = crate::http_client::HTTP_CLIENT.clone();
    let resp = client
        .get(&installer_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download NeoForge installer: {e}"))?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    let installer_dir = minecraft_dir.join("installers");
    fs::create_dir_all(&installer_dir).map_err(|e| e.to_string())?;
    let installer_path = installer_dir.join(&installer_filename);
    fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

    ensure_launcher_profiles(minecraft_dir)?;

    let mut cmd = Command::new(java_path);
    cmd.args([
        "-jar",
        &installer_path.to_string_lossy(),
        "--installClient",
        &minecraft_dir.to_string_lossy(),
    ])
    .current_dir(&installer_dir);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let output = cmd.output()
        .map_err(|e| format!("Failed to run NeoForge installer: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "NeoForge installer exited with {}: {}",
            output.status,
            if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() }
        ));
    }

    if !version_json_path.exists() {
        return Err(format!(
            "NeoForge installer finished but {} is missing",
            version_json_path.display()
        ));
    }

    let content = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
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

    for lib in &all_libs {
        if let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) {
            if !check_rules(rules, os_key) {
                continue;
            }
        }

        if let Some(path) = resolve_library_path(lib, libraries_dir) {
            paths.push(path);
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
        LoaderType::Neoforge => instance.loader_version.as_deref().map(|v| {
            libraries_dir
                .join("net/neoforged/neoforge")
                .join(v)
                .join(format!("neoforge-{v}-client.jar"))
        }),
        _ => None,
    };

    let client_jar = match patched_client_jar {
        Some(p) if p.exists() => p,
        _ => minecraft_dir()
            .join("versions")
            .join(client_version)
            .join(format!("{client_version}.jar")),
    };
    if client_jar.exists() {
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
            .replace("${version_type}", "release")
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

    if jar_path.exists() {
        let valid = match expected_sha1 {
            Some(sha1) => sha1_file(&jar_path).ok().as_deref() == Some(sha1),
            None => true,
        };
        if valid {
            return Ok(jar_path);
        }
    }

    fs::create_dir_all(versions_dir).map_err(|e| e.to_string())?;

    let response = crate::http_client::HTTP_CLIENT.get(url).send()
        .await
        .map_err(|e| format!("Failed to download client jar: {e}"))?;
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read client jar: {e}"))?;

    if let Some(sha1) = expected_sha1 {
        let actual = sha1_bytes(&bytes);
        if actual != sha1 {
            return Err(format!(
                "Client jar SHA1 mismatch: expected {sha1}, got {actual}"
            ));
        }
    }

    fs::write(&jar_path, &bytes).map_err(|e| e.to_string())?;
    Ok(jar_path)
}

async fn download_files(
    client: &reqwest::Client,
    files: &[(String, PathBuf, Option<String>)],
) -> Result<(), String> {
    let concurrency = std::sync::Arc::new(tokio::sync::Semaphore::new(crate::config::get_max_concurrent_downloads()));
    let mut handles = Vec::new();

    for (url, dest, expected_sha1) in files {
        let client = client.clone();
        let url = url.clone();
        let dest = dest.clone();
        let expected = expected_sha1.clone();
        let sem = concurrency.clone();

        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).ok();
            }

            let resp = client
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Download failed: {url} - {e}"))?;
            let bytes = resp
                .bytes()
                .await
                .map_err(|e| format!("Read failed: {url} - {e}"))?;

            if let Some(ref sha1) = expected {
                let actual = sha1_bytes(&bytes);
                if &actual != sha1 {
                    return Err(format!(
                        "SHA1 mismatch for {url}: expected {sha1}, got {actual}"
                    ));
                }
            }

            fs::write(&dest, &bytes)
                .map_err(|e| format!("Write failed: {} - {e}", dest.display()))?;
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
                let name = lib.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let rel = maven_to_path(name);
                let base = lib
                    .get("url")
                    .and_then(|u| u.as_str())
                    .unwrap_or("https://libraries.minecraft.net");
                let u = rel.as_ref().map(|rp| format!("{base}/{rp}"));
                (rel, u, None)
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

    
    
    
    let verified_marker = indexes_dir.join(format!(".{index_id}.verified"));
    if verified_marker.exists() && index_path.exists() {
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

    for (_path_str, info) in objects {
        let hash = info.get("hash").and_then(|h| h.as_str()).unwrap_or("");
        if hash.is_empty() {
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

    if !downloads.is_empty() {
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
    fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap())
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
        install_mod_loader(&instance, &minecraft_dir_val, &libraries_dir, &java_path).await?;
    }

    Ok(())
}
