use super::{connection_failed, root_pairing, TvConnection};
use crate::{
    models::{AppError, AppResult, PreparedHomeApply},
    services::home_backups::HomeBackups,
};
use std::time::Duration;
use tokio::time::timeout;

const PREPARE_TIMEOUT: Duration = Duration::from_secs(120);

fn unavailable() -> AppError {
    AppError::new("backup_unavailable","The TV could not verify every original Home setting. Keep any existing backup and check Root access before retrying.")
}

impl TvConnection {
    pub async fn prepare_home_backup(
        &self,
        host: &str,
        expected: &str,
    ) -> AppResult<PreparedHomeApply> {
        timeout(PREPARE_TIMEOUT, async {
            let mut session = self.session(host, expected).await?;
            session.identity().await?;
            let backups = HomeBackups::new(self.directory.clone());
            if let Some(prepared) = backups.prepared(expected).await? {
                session.unchanged().await?;
                return Ok(prepared);
            }
            let info = session.info.as_ref().ok_or_else(unavailable)?.clone();
            let reply = session.home_status().await?.ok_or_else(unavailable)?;
            let document = HomeBackups::paired_document(expected, &info, &reply)?;
            session.identity().await?;
            session.unchanged().await?;
            let result = backups.save_original(expected, document).await?;
            // A concurrent CLI must not change pairing while this baseline is reviewed.
            let current = root_pairing::load(&self.directory, host, expected).await?;
            root_pairing::unchanged(session.receipt.as_ref(), current.as_ref())?;
            Ok(result)
        })
        .await
        .map_err(|_| connection_failed())?
    }
}

#[cfg(test)]
mod tests;
