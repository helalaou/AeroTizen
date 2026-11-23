use crate::models::AppError;
use crate::services::{home_backups::HomeBackups, local_apps, profiles::Profiles, samsung};
use std::path::PathBuf;
use tokio::sync::watch;

pub struct AppState {
    pub profiles: Profiles,
    pub home_backups: HomeBackups,
    pub worker_path: PathBuf,
    pub operation: tokio::sync::Mutex<()>,
    pub cancelled_tv_read: watch::Sender<String>,
    pub samsung: samsung::SamsungState,
    pub local_apps: local_apps::LocalAppsState,
}

pub fn busy() -> AppError {
    AppError::new(
        "operation_busy",
        "Wait for the current TV action to finish.",
    )
}
