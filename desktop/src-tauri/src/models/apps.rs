use super::SavedTv;
use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize, Deserialize)]
pub struct TvAppPackage {
    pub id: String,
    pub name: String,
    pub apps: Vec<String>,
    pub protected: bool,
    pub revision: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct AppPackageSelection {
    pub id: String,
    pub revision: String,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppRemovalStatus {
    Removed,
    Refused,
    StillInstalled,
    Unverified,
    NotAttempted,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct AppRemovalOutcome {
    pub id: String,
    pub status: AppRemovalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct AppRemovalResult {
    pub apps: Option<Vec<TvAppPackage>>,
    pub results: Vec<AppRemovalOutcome>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct LocalAppPackage {
    pub selection_id: String,
    pub name: String,
    pub app_id: String,
    pub package_id: String,
    pub version: String,
    pub current_version: Option<String>,
    pub replacing: bool,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct LocalAppInstallResult {
    pub profile: SavedTv,
    pub app_id: String,
    pub version: String,
}
#[derive(Debug, Clone, Deserialize)]
pub struct LocalPackageReview {
    pub sha256: String,
    pub name: String,
    pub app_id: String,
    pub package_id: String,
    pub version: String,
    pub current_revision: Option<String>,
    pub current_version: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct InstalledLocalApp {
    pub app_id: String,
    pub package_id: String,
    pub version: String,
}
