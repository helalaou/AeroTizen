use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;

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
    pub checked_at: String,
    #[serde(default)]
    pub technical_details: TechnicalDetails,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_backup: Option<HomeBackup>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedTv {
    pub id: String,
    #[serde(flatten)]
    pub tv: VerifiedTv,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AppPackageSelection {
    id: String,
    revision: String,
}

pub fn valid_identity(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}
