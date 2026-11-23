mod projection;
mod records;

use super::{root_bridge, tv_session};
use crate::models::{valid_identity, AppError, AppResult, RootAccessStatus, RootPhase};
use records::Receipt;
use std::{net::Ipv4Addr, path::PathBuf};

const TARGET_RUNTIME_VERSION: &str = env!("ROOT_RUNTIME_VERSION");

pub struct RootStatus {
    directory: PathBuf,
}

fn invalid_address() -> AppError {
    AppError::new("invalid_address", "Enter a valid TV IPv4 address.")
}

fn unchanged(before: Option<&Receipt>, after: Option<&Receipt>) -> AppResult<()> {
    if before.map(|receipt| &receipt.document) != after.map(|receipt| &receipt.document) {
        return Err(AppError::new(
            "root_state_changed",
            "Root setup changed. Refresh Root access to check its current status.",
        ));
    }
    Ok(())
}

impl RootStatus {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub async fn read(&self, host: &str, expected: &str) -> AppResult<RootAccessStatus> {
        let address: Ipv4Addr = host.parse().map_err(|_| invalid_address())?;
        if address.is_unspecified() || address.is_multicast() || address == Ipv4Addr::BROADCAST {
            return Err(invalid_address());
        }
        if !valid_identity(expected) {
            return Err(AppError::new(
                "invalid_request",
                "The saved TV identity is invalid.",
            ));
        }
        let before = records::load(&self.directory, host, expected).await?;
        let _ownership;
        let live = if let Some(receipt) = before
            .as_ref()
            .filter(|receipt| receipt.phase != RootPhase::Removed)
        {
            _ownership = tv_session::acquire(&self.directory, host).await?;
            let locked = records::load(&self.directory, host, expected).await?;
            unchanged(before.as_ref(), locked.as_ref())?;
            root_bridge::status(address, &receipt.pairing).await.ok()
        } else {
            None
        };
        let current = records::load(&self.directory, host, expected).await?;
        unchanged(before.as_ref(), current.as_ref())?;
        projection::public_status(current.as_ref(), live.as_ref(), TARGET_RUNTIME_VERSION)
    }
}

#[cfg(test)]
mod tests;
