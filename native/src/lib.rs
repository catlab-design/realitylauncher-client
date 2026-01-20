//! Reality Launcher Core - Rust Backend

#![deny(clippy::all)]

mod java;
mod download;
mod instance;
mod extract;
mod api;
mod launcher;
mod forge;
mod fabric;
mod quilt;

pub use java::*;
pub use download::*;
pub use instance::*;
pub use extract::*;
pub use api::*;
pub use launcher::*;
pub use forge::*;
pub use fabric::*;
pub use quilt::*;

use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use reqwest::Client;

#[cfg(windows)]
use windows::{
    Win32::Foundation::{CloseHandle, STILL_ACTIVE},
    Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    },
    Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, TerminateProcess, PROCESS_QUERY_INFORMATION,
        PROCESS_TERMINATE,
    },
};

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

pub fn get_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent("RealityLauncher/0.3.1 (studiotne1@gmail.com)")
            .build()
            .expect("Failed to create HTTP client")
    })
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RunningInstance {
    pub instance_id: String,
    pub pid: u32,
    pub start_time: u64,
    pub game_dir: String,
}

fn get_state_file_path() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(app_data)
        .join("RealityLauncher")
        .join("running-instances.json")
}

#[napi]
pub fn is_process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid);
            if let Ok(h) = handle {
                if h.is_invalid() { return false; }
                let mut exit_code: u32 = 0;
                let result = GetExitCodeProcess(h, &mut exit_code);
                let _ = CloseHandle(h);
                result.is_ok() && exit_code == STILL_ACTIVE.0 as u32
            } else { false }
        }
    }
    #[cfg(not(windows))]
    {
        use std::process::Command;
        Command::new("kill").args(["-0", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
    }
}

#[napi]
pub fn kill_process_tree(pid: u32) -> bool {
    #[cfg(windows)]
    {
        let children = get_child_pids(pid);
        for child_pid in children.iter().rev() { terminate_process(*child_pid); }
        terminate_process(pid)
    }
    #[cfg(not(windows))]
    {
        use std::process::Command;
        Command::new("kill").args(["-9", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
    }
}

#[cfg(windows)]
fn get_child_pids(parent_pid: u32) -> Vec<u32> {
    let mut children = Vec::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if let Ok(snap) = snapshot {
            let mut entry = PROCESSENTRY32::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;
            if Process32First(snap, &mut entry).is_ok() {
                loop {
                    if entry.th32ParentProcessID == parent_pid {
                        children.push(entry.th32ProcessID);
                        children.extend(get_child_pids(entry.th32ProcessID));
                    }
                    if Process32Next(snap, &mut entry).is_err() { break; }
                }
            }
            let _ = CloseHandle(snap);
        }
    }
    children
}

#[cfg(windows)]
fn terminate_process(pid: u32) -> bool {
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, false, pid);
        if let Ok(h) = handle {
            if h.is_invalid() { return false; }
            let result = TerminateProcess(h, 1);
            let _ = CloseHandle(h);
            result.is_ok()
        } else { false }
    }
}

#[napi]
pub fn save_running_instance(instance_id: String, pid: u32, game_dir: String) -> bool {
    let mut instances = load_all_running_instances();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    instances.insert(instance_id.clone(), RunningInstance { instance_id, pid, start_time: now, game_dir });
    save_all_running_instances(&instances)
}

#[napi]
pub fn remove_running_instance(instance_id: String) -> bool {
    let mut instances = load_all_running_instances();
    instances.remove(&instance_id);
    save_all_running_instances(&instances)
}

#[napi]
pub fn get_running_instances() -> Vec<RunningInstanceJs> {
    let instances = load_all_running_instances();
    let mut alive = Vec::new();
    let mut to_remove = Vec::new();
    for (id, inst) in instances.iter() {
        if is_process_alive(inst.pid) {
            alive.push(RunningInstanceJs {
                instance_id: inst.instance_id.clone(),
                pid: inst.pid,
                start_time: inst.start_time as f64,
                game_dir: inst.game_dir.clone(),
            });
        } else { to_remove.push(id.clone()); }
    }
    if !to_remove.is_empty() {
        let mut instances = load_all_running_instances();
        for id in to_remove { instances.remove(&id); }
        save_all_running_instances(&instances);
    }
    alive
}

#[napi]
pub fn is_instance_running(instance_id: String) -> bool {
    load_all_running_instances().get(&instance_id).map(|i| is_process_alive(i.pid)).unwrap_or(false)
}

#[napi]
pub fn get_instance_pid(instance_id: String) -> Option<u32> {
    load_all_running_instances().get(&instance_id).map(|i| i.pid)
}

fn load_all_running_instances() -> HashMap<String, RunningInstance> {
    let path = get_state_file_path();
    if !path.exists() { return HashMap::new(); }
    fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn save_all_running_instances(instances: &HashMap<String, RunningInstance>) -> bool {
    let path = get_state_file_path();
    if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
    serde_json::to_string_pretty(instances).ok().map(|s| fs::write(&path, s).is_ok()).unwrap_or(false)
}

#[napi(object)]
pub struct RunningInstanceJs {
    pub instance_id: String,
    pub pid: u32,
    pub start_time: f64,
    pub game_dir: String,
}
