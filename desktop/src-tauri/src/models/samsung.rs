use serde::{Deserialize, Serialize};
#[derive(Debug, Serialize, Deserialize)]
pub struct SigningProfile {
    pub identity_sha256: String,
    pub launcher_signing_ready: bool,
}
