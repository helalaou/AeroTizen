use crate::models::AppError;
use crate::services::{
    button_edits::ButtonEdits, button_reads::ButtonReads, device_connection::TvConnection,
    home_backups::HomeBackups, local_apps, profiles::Profiles, root_status::RootStatus, samsung,
};
use std::path::PathBuf;
use tokio::sync::watch;

pub struct AppState {
    pub profiles: Profiles,
    pub home_backups: HomeBackups,
    pub root_status: RootStatus,
    pub button_reads: ButtonReads,
    pub button_edits: ButtonEdits,
    pub device_connection: TvConnection,
    pub worker_path: PathBuf,
    pub operation: tokio::sync::Mutex<()>,
    pub cancelled_tv_read: watch::Sender<String>,
    pub samsung: samsung::SamsungState,
    pub local_apps: local_apps::LocalAppsState,
}

#[cfg(test)]
impl AppState {
    pub fn for_test(directory: &std::path::Path) -> Self {
        Self {
            profiles: Profiles::new(directory.join("profiles.sqlite3")).unwrap(),
            home_backups: HomeBackups::new(directory.join("cli-state")),
            root_status: RootStatus::new(directory.join("cli-state")),
            button_reads: ButtonReads::new(directory.join("cli-state")),
            button_edits: ButtonEdits::new(directory.join("cli-state")),
            device_connection: TvConnection::new(directory.join("cli-state")),
            worker_path: directory.join("no-worker-in-unit-tests"),
            operation: Default::default(),
            cancelled_tv_read: watch::Sender::new(String::new()),
            samsung: Default::default(),
            local_apps: Default::default(),
        }
    }
}

pub fn busy() -> AppError {
    AppError::new(
        "operation_busy",
        "Wait for the current TV action to finish.",
    )
}
