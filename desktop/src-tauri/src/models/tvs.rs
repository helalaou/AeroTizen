use serde::{Deserialize, Serialize};
use std::net::Ipv4Addr;
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TechnicalDetails {
    pub model_code: Option<String>,
    pub tizen_version: Option<String>,
    pub architecture: Option<String>,
    pub platform: Option<String>,
    pub root_runtime_version: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum HomeBackup {
    Saved { captured_at: String },
    Missing,
    Unreadable,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PreparedHomeApply {
    pub id: String,
    pub captured_at: String,
    pub backup_sha256: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum HomeRoutingMode {
    Watcher,
    Native,
    Hold,
    Blocked,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NativeHomeSettings {
    pub home_button_app: Option<String>,
    pub home_app: Option<String>,
    pub startup_app: Option<String>,
    pub startup_backup_app: Option<String>,
    pub smart_hub_autostart: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VerifiedTv {
    pub identity_sha256: String,
    pub host: String,
    pub name: String,
    pub model: String,
    pub launcher_version: Option<String>,
    #[serde(default)]
    pub launcher_signing_ready: bool,
    pub transport: String,
    pub developer_mode: String,
    pub developer_host: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub computer_ip: Option<Ipv4Addr>,
    pub checked_at: String,
    #[serde(default)]
    pub technical_details: TechnicalDetails,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_backup: Option<HomeBackup>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_routing_mode: Option<HomeRoutingMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_home_settings: Option<NativeHomeSettings>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedTv {
    pub id: String,
    #[serde(flatten)]
    pub tv: VerifiedTv,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TvCandidate {
    pub host: String,
    pub name: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HomeBackupSettings {
    #[serde(flatten)]
    pub settings: NativeHomeSettings,
    pub first_screen: String,
}
