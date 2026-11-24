pub(super) mod projection;

use super::{root_bridge, root_pairing as records, tv_session};
use crate::models::{AppResult, RootAccessStatus, RootPhase};
use std::path::PathBuf;

pub(super) const TARGET_RUNTIME_VERSION: &str = env!("ROOT_RUNTIME_VERSION");

pub struct RootStatus {
    directory: PathBuf,
}

impl RootStatus {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub async fn read(&self, host: &str, expected: &str) -> AppResult<RootAccessStatus> {
        let address = records::address(host, expected)?;
        let before = records::load(&self.directory, host, expected).await?;
        let _ownership;
        let live = if let Some(receipt) = before
            .as_ref()
            .filter(|receipt| receipt.phase != RootPhase::Removed)
        {
            _ownership = tv_session::acquire(&self.directory, host).await?;
            let locked = records::load(&self.directory, host, expected).await?;
            records::unchanged(before.as_ref(), locked.as_ref())?;
            root_bridge::status(address, &receipt.pairing).await.ok()
        } else {
            None
        };
        let current = records::load(&self.directory, host, expected).await?;
        records::unchanged(before.as_ref(), current.as_ref())?;
        projection::public_status(current.as_ref(), live.as_ref(), TARGET_RUNTIME_VERSION)
    }
}

#[cfg(test)]
mod tests;
