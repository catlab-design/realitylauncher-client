
// Always build as a GUI (windows) subsystem app — even in debug — so no console
// window ever pops up. stdout is still piped when launched via `tauri dev`, so
// logs stay visible during development.
#![windows_subsystem = "windows"]

mod admin;
mod auth;
mod cloud;
mod config;
mod content;
mod curseforge;
mod discord;
mod download;
mod fs_utils;
mod http_client;
mod instances;
mod java;
mod launcher;
mod mod_meta;
mod modpack;
mod modrinth;
mod social;
mod telemetry;
mod update;
mod wardrobe;
mod window;

fn main() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            
            greet,
            
            auth::login_microsoft,
            auth::login_catid,
            auth::start_device_code_auth,
            auth::poll_device_code_auth,
            auth::get_session,
            auth::logout,
            auth::auth_refresh,
            auth::register_catid,
            auth::check_registration_status,
            auth::forgot_password,
            auth::reset_password,
            auth::login_catid_token,
            auth::link_catid,
            auth::set_active_session,
            auth::auth_unlink,
            
            config::config_get,
            config::config_set,
            config::config_get_minecraft_dir,
            config::config_migrate_minecraft_dir,
            config::reset_config,
            config::get_system_ram,
            config::get_max_ram,
            
            instances::instances_list,
            instances::instances_get,
            instances::instances_create,
            instances::instances_update,
            instances::instances_delete,
            instances::instances_duplicate,
            instances::instances_set_icon,
            
            launcher::is_game_running,
            launcher::kill_game,
            launcher::instances_launch,
            launcher::get_playing_instance_id,
            launcher::instance_read_latest_log,
            launcher::instance_tail_log,
            launcher::get_app_version,
            launcher::is_dev_mode,
            launcher::browse_java,
            launcher::instances_preinstall,
            
            java::install_java,
            java::detect_java_installations,
            java::delete_java,
            java::test_java_execution,
            java::auto_detect_java,
            
            admin::admin_check_status,
            admin::admin_get_settings,
            admin::admin_save_setting,
            admin::admin_get_users,
            admin::admin_ban_user,
            admin::admin_unban_user,
            admin::admin_toggle_user_admin,
            admin::admin_create_user,
            admin::admin_get_user_details,
            admin::get_system_info,
            
            content::instance_get_mods,
            content::instance_toggle_mod,
            content::instance_delete_mod,
            content::instance_get_resource_packs,
            content::instance_get_shaders,
            content::instance_get_datapacks,
            content::instance_install_content,
            content::instance_list_mods,
            content::instance_list_resourcepacks,
            content::instance_list_shaders,
            content::instance_list_datapacks,
            content::instance_lock_mods,
            content::content_download_to_instance,
            content::instance_toggle_resourcepack,
            content::instance_toggle_shader,
            content::instance_toggle_datapack,
            content::instance_delete_resourcepack,
            content::instance_delete_shader,
            content::instance_delete_datapack,
            content::instance_toggle_lock,
            content::instance_add_content_file,
            
            modrinth::modrinth_search,
            modrinth::modrinth_get_project,
            modrinth::modrinth_get_project_versions,
            modrinth::modrinth_get_game_versions,
            modrinth::modrinth_get_versions,
            modrinth::modrinth_get_loader_versions,
            modrinth::modrinth_get_team,
            modrinth::modrinth_clear_cache,
            
            curseforge::curseforge_search,
            curseforge::curseforge_get_project,
            curseforge::curseforge_get_files,
            curseforge::curseforge_get_description,
            curseforge::curseforge_clear_cache,
            
            modpack::modpack_install,
            modpack::modpack_install_from_modrinth,
            modpack::modpack_install_from_curseforge,
            modpack::modpack_cancel_install,
            modpack::instances_pre_install,
            modpack::instances_list_files,
            
            update::check_latest_version,
            update::download_update,
            update::install_update,
            
            fs_utils::open_folder,
            fs_utils::open_url,
            fs_utils::browse_directory,
            fs_utils::browse_icon,
            fs_utils::browse_modpack,
            fs_utils::launcher_clear_cache,
            
            window::window_minimize,
            window::window_maximize,
            window::window_close,
            window::window_is_maximized,
            window::window_set_main_mode,
            
            cloud::instances_get_joined_servers,
            cloud::instance_join,
            cloud::instance_join_public,
            cloud::instance_leave,
            cloud::instances_cloud_install,
            cloud::instances_cloud_sync,
            cloud::instance_check_integrity,
            cloud::cloud_instance_sync_managed,
            cloud::invitations_fetch,
            cloud::invitations_accept,
            cloud::invitations_reject,
            cloud::notifications_fetch_announcements,
            cloud::notifications_fetch_user,
            cloud::notifications_sync,
            cloud::notifications_mark_read,
            cloud::notifications_delete,
            
            discord::discord_rpc_set_enabled,
            discord::discord_rpc_update,
            discord::discord_rpc_is_connected,
            
            social::server_ping,
            
            telemetry::telemetry_log_event,
            
            wardrobe::catskinc_get_config,
            wardrobe::catskinc_save_config,
            wardrobe::catskinc_get_selected_skin,
            wardrobe::catskinc_upload_skin,
            wardrobe::catskinc_clear_assets,
            wardrobe::minecraft_get_profile,
            wardrobe::minecraft_upload_skin,
            wardrobe::auth_update_avatar_source,
        ])
        .setup(|_app| {
            telemetry::track_app_open();
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                tauri::async_runtime::block_on(telemetry::track_app_close());
            }
        });
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Reality Launcher!", name)
}
