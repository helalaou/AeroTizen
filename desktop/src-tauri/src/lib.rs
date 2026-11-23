mod commands;
mod models;
mod services;
mod state;
mod worker;

use services::profiles::Profiles;
use state::AppState;
use tauri::Manager;
use tokio::sync::watch;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let profiles = Profiles::new(directory.join("profiles.sqlite3"))
                .map_err(|error| std::io::Error::other(error.message))?;
            let worker_path =
                worker::binary_path().map_err(|error| std::io::Error::other(error.message))?;
            app.manage(AppState {
                profiles,
                worker_path,
                operation: tokio::sync::Mutex::new(()),
                cancelled_tv_read: watch::Sender::new(String::new()),
                samsung: services::samsung::SamsungState::default(),
                local_apps: services::local_apps::LocalAppsState::default(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::launcher::backend_status,
            commands::samsung::samsung_account,
            commands::samsung::samsung_sign_in,
            commands::samsung::cancel_samsung_sign_in,
            commands::samsung::samsung_sign_out,
            commands::samsung::prepare_signing_profile,
            commands::tvs::list_tvs,
            commands::apps::list_tv_apps,
            commands::buttons::list_tv_buttons,
            commands::buttons::list_tv_button_apps,
            commands::root::root_access_status,
            commands::root::setup_root_access,
            commands::root::upgrade_root_access,
            commands::buttons::change_tv_button,
            commands::tvs::cancel_tv_read,
            commands::apps::remove_tv_apps,
            commands::launcher::launcher_catalog,
            commands::launcher::install_launcher,
            commands::local_apps::choose_local_app,
            commands::local_apps::install_local_app,
            commands::tvs::discover_tvs,
            commands::tvs::connect_tv,
            commands::home::read_home_backup,
            commands::home::prepare_native_home,
            commands::home::apply_native_home,
            commands::home::restore_home_backup,
            commands::tvs::rename_tv,
            commands::tvs::forget_tv
        ])
        .run(tauri::generate_context!())
        .expect("could not run AeroTizen Desktop");
}
