use super::*;
use crate::services::digest::sha256_hex;
pub(in crate::services) struct Original {
    pub path: PathBuf,
    pub raw: Vec<u8>,
    pub document: Value,
    pub digest: String,
}
impl Original {
    pub async fn unchanged(&self) -> AppResult<()> {
        let path = self.path.clone();
        let digest = self.digest.clone();
        tokio::task::spawn_blocking(move || {
            if sha256_hex(&read_bytes(&path)?) != digest {
                return Err(AppError::new(
                    "backup_changed",
                    "The original backup changed. Preserve the transaction receipt for recovery.",
                ));
            }
            Ok(())
        })
        .await
        .map_err(|_| unreadable())?
    }
}
impl HomeBackups {
    pub(in crate::services) async fn original(
        &self,
        identity: &str,
        digest: Option<&str>,
        captured_at: Option<&str>,
    ) -> AppResult<Original> {
        if !valid_identity(identity) {
            return Err(unreadable());
        }
        let path = self.directory.join(identity).join("original-home.json");
        let identity = identity.to_owned();
        let digest = digest.map(str::to_owned);
        let captured = captured_at.map(str::to_owned);
        tokio::task::spawn_blocking(move || {
            let raw = read_bytes(&path)?;
            let document: Value = serde_json::from_slice(&raw).map_err(|_| unreadable())?;
            verified_settings(&document, &identity).ok_or_else(unreadable)?;
            let timestamp = document["captured_at"]
                .as_str()
                .and_then(capture_timestamp)
                .ok_or_else(unreadable)?;
            let actual = sha256_hex(&raw);
            if digest.as_ref().is_some_and(|expected| expected != &actual)
                || captured
                    .as_ref()
                    .is_some_and(|expected| expected != &timestamp)
            {
                return Err(AppError::new(
                    "backup_changed",
                    "The backup changed. Refresh the TV connection to review it.",
                ));
            }
            Ok(Original {
                path,
                raw,
                document,
                digest: actual,
            })
        })
        .await
        .map_err(|_| unreadable())?
    }
}
