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
    #[cfg(feature = "bundled-worker")]
    let context = tauri::generate_context!();
    #[cfg(not(feature = "bundled-worker"))]
    let context = tauri::generate_context!("tests/tauri.conf.json");
    commands::register(
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
                let cli_directory = app.path().home_dir()?.join(".config").join("aerotizen");
                app.manage(AppState {
                    profiles,
                    home_backups: services::home_backups::HomeBackups::new(cli_directory.clone()),
                    root_status: services::root_status::RootStatus::new(cli_directory.clone()),
                    button_reads: services::button_reads::ButtonReads::new(cli_directory),
                    worker_path,
                    operation: tokio::sync::Mutex::new(()),
                    cancelled_tv_read: watch::Sender::new(String::new()),
                    samsung: services::samsung::SamsungState::default(),
                    local_apps: services::local_apps::LocalAppsState::default(),
                });
                Ok(())
            }),
    )
    .run(context)
    .expect("could not run AeroTizen Desktop");
}
