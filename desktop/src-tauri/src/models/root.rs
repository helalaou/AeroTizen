use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RootPhase {
    NotConfigured,
    Prepared,
    Installed,
    RootRequested,
    WaitingBoot,
    Active,
    Removing,
    Removed,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct RootAccessStatus {
    pub phase: RootPhase,
    pub root_available: bool,
    pub setup_complete: bool,
    pub runtime_version: Option<String>,
    pub target_runtime_version: String,
    pub update_available: bool,
    pub update_pending: bool,
    pub automatic_startup: Option<bool>,
    pub automatic_boot_verified: bool,
    pub bootstrap_completed: bool,
    pub recovery_saved: bool,
    pub original_pc_host: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RootSetupAction {
    Start,
    Verify,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RootUpdateAction {
    Start,
    Resume,
}
