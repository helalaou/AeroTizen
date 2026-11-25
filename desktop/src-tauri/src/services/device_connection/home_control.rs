use super::{root_pairing, sdb::ReadCommand, Session, TvConnection};
use crate::{
    models::{AppError, AppResult},
    services::{
        digest::sha256_hex,
        helper_payloads,
        home_backups::HomeBackups,
        home_control::{self, Action, Device},
        home_protocol,
        sdk::{self, Completion, PayloadFile},
    },
};
use serde_json::{json, Value};
use std::{net::Ipv4Addr, time::Duration};
use tokio::time::timeout;
const HOME_TIMEOUT: Duration = Duration::from_secs(120);
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_LAUNCH_BYTES: usize = 8192;
struct HomeDevice<'a> {
    session: Session<'a>,
    query: Vec<PayloadFile>,
    fallback: Value,
}
impl Device for HomeDevice<'_> {
    async fn status(&mut self) -> AppResult<Value> {
        self.session.query_home(&self.query, &self.fallback).await
    }

    async fn start_launcher(&mut self) -> AppResult<()> {
        self.session.identity().await?;
        self.session.unchanged().await?;
        let address = root_pairing::host_address(self.session.host)?;
        if !launch_http(address, self.session.owner.options.info_port).await {
            timeout(LAUNCH_TIMEOUT, self.session.connection.launch_launcher())
                .await
                .map_err(|_| {
                    home_protocol::failed(
                        "Could not start AeroTizen. Open it on the TV, then retry.",
                    )
                })?
                .map_err(|_| {
                    home_protocol::failed(
                        "Could not start AeroTizen. Open it on the TV, then retry.",
                    )
                })?;
        }
        Ok(())
    }
    async fn write(&mut self, files: Vec<PayloadFile>) -> AppResult<Completion> {
        self.session.identity().await?;
        self.session.unchanged().await?;
        let host = root_pairing::host_address(self.session.host)?;
        sdk::run(
            &mut self.session.connection,
            host,
            &files,
            helper_payloads::CONTROL_ENTRYPOINT,
            &["request.json"],
        )
        .await
    }
}
impl Session<'_> {
    pub(super) async fn query_home(
        &mut self,
        query_files: &[PayloadFile],
        fallback: &Value,
    ) -> AppResult<Value> {
        self.identity().await?;
        self.unchanged().await?;
        let capabilities = self
            .connection
            .read(ReadCommand::Capabilities)
            .await
            .map_err(|_| super::connection_failed())?;
        let cpu = capabilities
            .lines()
            .filter_map(|line| line.split_once(':'))
            .find(|(key, _)| key.trim_matches([' ', '\0', '�']) == "cpu_arch")
            .map(|(_, value)| value.trim());
        let host = root_pairing::host_address(self.host)?;
        let result = sdk::run(
            &mut self.connection,
            host,
            query_files,
            helper_payloads::QUERY_ENTRYPOINT,
            &[],
        )
        .await?;
        if result.exit_code != 0 {
            return Err(AppError::new(
                "home_query_failed",
                "The SDK Home query failed. Check the TV's current settings before retrying.",
            ));
        }
        let query = home_protocol::query(&result.stdout)?;
        self.identity().await?;
        self.unchanged().await?;
        let info = self.info.as_ref().unwrap_or(fallback);
        Ok(home_protocol::status(
            query,
            self.expected
                .as_deref()
                .ok_or_else(super::invalid_response)?,
            info,
            cpu,
            &sha256_hex(&query_files[0].bytes),
        ))
    }
}
async fn launch_http(address: Ipv4Addr, port: u16) -> bool {
    let Ok(client) = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .timeout(LAUNCH_TIMEOUT)
        .build()
    else {
        return false;
    };
    let Ok(response) = client
        .post(format!(
            "http://{address}:{port}/api/v2/applications/{}",
            crate::models::LAUNCHER_APP_ID
        ))
        .body("")
        .send()
        .await
    else {
        return false;
    };
    if response.status() != reqwest::StatusCode::OK {
        return false;
    }
    super::super::http::bounded_body(response, MAX_LAUNCH_BYTES)
        .await
        .is_some_and(|body| String::from_utf8_lossy(&body).trim() == "true")
}
impl TvConnection {
    pub(in crate::services) async fn change_home(
        &self,
        host: &str,
        expected: &str,
        action: Action,
        digest: Option<&str>,
        captured_at: Option<&str>,
    ) -> AppResult<Value> {
        // Validate the reviewed original and both compiled payloads before connecting.
        let original = HomeBackups::new(self.directory.clone())
            .original(expected, digest, captured_at)
            .await?;
        let query = helper_payloads::home_query()?;
        let writer = helper_payloads::home_control()?;
        self.change_home_with(host, expected, action, original, query, writer)
            .await
    }
    async fn change_home_with(
        &self,
        host: &str,
        expected: &str,
        action: Action,
        original: crate::services::home_backups::Original,
        query: Vec<PayloadFile>,
        writer: Vec<PayloadFile>,
    ) -> AppResult<Value> {
        let fallback = json!({"modelName":original.document["device"]["model"],"model":original.document["device"]["platform"]});
        timeout(HOME_TIMEOUT, async {
            let session = self.open(host, Some(expected), true).await?;
            let mut device = HomeDevice {
                session,
                query,
                fallback,
            };
            home_control::change(&mut device, original, action, writer).await
        })
        .await
        .map_err(|_| {
            AppError::new(
                "connection_timeout",
                "Home settings timed out. Refresh the current settings before retrying.",
            )
        })?
    }
}

#[cfg(test)]
mod tests;
