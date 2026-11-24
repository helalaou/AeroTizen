use super::{connection_failed, invalid_response, TvConnection};
use crate::{models::AppResult, services::http::sdb_json};
use serde_json::Value;
use std::time::Duration;
use tokio::time::timeout;

const MAX_LOG_BODY_BYTES: usize = 256 * 1024;
const MAX_HTTP_HEADER_BYTES: usize = 8192;
const LOG_REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
const COLLECTION_TIMEOUT: Duration = Duration::from_secs(20);

impl TvConnection {
    pub(in crate::services) async fn diagnostic_logs(
        &self,
        host: &str,
        expected: &str,
    ) -> AppResult<Value> {
        timeout(COLLECTION_TIMEOUT, async {
            let mut session = self.session(host, expected).await?;
            session.identity().await?;
            session.unchanged().await?;
            let raw = timeout(
                LOG_REQUEST_TIMEOUT,
                session
                    .connection
                    .diagnostics(MAX_LOG_BODY_BYTES + MAX_HTTP_HEADER_BYTES),
            )
            .await
            .map_err(|_| connection_failed())?
            .map_err(|_| connection_failed())?;
            session.unchanged().await?;
            sdb_json(&raw, MAX_LOG_BODY_BYTES).ok_or_else(invalid_response)
        })
        .await
        .map_err(|_| connection_failed())?
    }

    pub(in crate::services) async fn diagnostic_home(
        &self,
        host: &str,
        expected: &str,
    ) -> AppResult<Option<Value>> {
        timeout(COLLECTION_TIMEOUT, async {
            let mut session = self.session(host, expected).await?;
            session.identity().await?;
            session.home_status().await
        })
        .await
        .map_err(|_| connection_failed())?
    }
}
