use super::{
    button_rules::{self, BUTTON_PROTOCOL_VERSION},
    json::truthy,
    root_bridge::{self, ReadRequest},
    root_pairing, tv_session,
};
use crate::models::{AppError, AppResult, ButtonMappings, RootPhase};
use std::path::PathBuf;

pub struct ButtonReads {
    directory: PathBuf,
}

impl ButtonReads {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub async fn read(&self, host: &str, expected: &str) -> AppResult<ButtonMappings> {
        let address = root_pairing::address(host, expected)?;
        let before = root_pairing::load(&self.directory, host, expected).await?;
        let Some(receipt) = before
            .as_ref()
            .filter(|receipt| receipt.phase == RootPhase::Active)
        else {
            return Ok(ButtonMappings::PairingRequired);
        };
        let _ownership = tv_session::acquire(&self.directory, host).await?;
        let locked = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), locked.as_ref())?;
        let connection_failed = |_| {
            AppError::new(
                "connection_failed",
                "Could not read the TV's paired button mappings. Check the connection and refresh.",
            )
        };
        let capabilities = root_bridge::status(address, &receipt.pairing)
            .await
            .map_err(connection_failed)?;
        let mut result = Ok(ButtonMappings::HelperUpdateRequired);
        if capabilities["buttons_protocol"].as_u64() == Some(BUTTON_PROTOCOL_VERSION) {
            let discovery = truthy(&capabilities["buttons_discovery"]);
            let operation = if discovery {
                ReadRequest::DiscoverButtons
            } else {
                ReadRequest::SavedButtons
            };
            let reply = root_bridge::read(address, &receipt.pairing, operation)
                .await
                .map_err(connection_failed)?;
            result = button_rules::mappings(&reply["buttons"], discovery);
        }
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), current.as_ref())?;
        result
    }
}

#[cfg(test)]
mod tests;
