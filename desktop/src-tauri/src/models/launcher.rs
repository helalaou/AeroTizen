use serde::{Deserialize, Serialize};
pub const LAUNCHER_APP_ID: &str = "DclHome001.Home";
pub const LAUNCHER_PACKAGE_ID: &str = "DclHome001";
#[derive(Debug, Serialize, Deserialize)]
pub struct BackendStatus {
    pub name: String,
    pub version: String,
    pub operations: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseSection {
    pub heading: Option<String>,
    pub changes: Vec<String>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct LauncherRelease {
    pub version: String,
    pub sections: Vec<ReleaseSection>,
}
