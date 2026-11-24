use super::{projection, sdb, Session, TvConnection, REMOVAL_TIMEOUT};
use crate::models::{
    AppError, AppResult, LauncherRemovalReview, LAUNCHER_APP_ID, LAUNCHER_PACKAGE_ID,
};
use serde_json::Value;
use std::time::Duration;
use tokio::time::timeout;

const REVIEW_TIMEOUT: Duration = Duration::from_secs(65);
const HOME_ASSIGNMENTS: [&str; 5] = [
    "home_button_app",
    "home_app",
    "startup_app",
    "startup_backup_app",
    "first_screen",
];

fn home_unverified() -> AppError {
    AppError::new(
        "launcher_home_unverified",
        "Could not verify all Home and startup settings. Connect through compatible paired Root access and try again.",
    )
}

fn launcher_changed() -> AppError {
    AppError::new(
        "launcher_changed",
        "The AeroTizen installation changed. Refresh the TV connection and try again.",
    )
}

fn removal_unverified() -> AppError {
    AppError::new(
        "launcher_removal_unverified",
        "Could not verify removal. Refresh the TV connection to check whether AeroTizen is still installed.",
    )
}

fn verify_home_clear(reply: &Value) -> AppResult<()> {
    let settings = &reply["home_settings"];
    let assignments = HOME_ASSIGNMENTS.map(|field| {
        settings[field]
            .as_str()
            .filter(|id| id.is_empty() || sdb::valid_identifier(id))
    });
    if assignments.iter().any(Option::is_none) || !settings["smart_hub_autostart"].is_boolean() {
        return Err(home_unverified());
    }
    if assignments
        .into_iter()
        .flatten()
        .any(|id| id.split('.').next() == Some(LAUNCHER_PACKAGE_ID))
    {
        return Err(AppError::new(
            "launcher_home_assigned",
            "AeroTizen is still assigned to Home or startup. Restore the original settings in Home and startup, fully restart the TV, then try removal again.",
        ));
    }
    Ok(())
}

impl Session<'_> {
    async fn launcher_inventory(&mut self) -> AppResult<(projection::Inventory, Option<String>)> {
        let raw = self.inventory().await?;
        tokio::task::spawn_blocking(move || {
            Ok((projection::checked(&raw)?, projection::launcher(&raw)?))
        })
        .await
        .map_err(|_| super::super::invalid_response())?
    }

    async fn check_launcher_removal(
        &mut self,
        confirmed_revision: Option<&str>,
    ) -> AppResult<(LauncherRemovalReview, projection::Inventory)> {
        let (inventory, version) = self.launcher_inventory().await?;
        let version = version.ok_or_else(launcher_changed)?;
        let revision = &inventory
            .rows
            .iter()
            .find(|row| row.id == LAUNCHER_PACKAGE_ID)
            .ok_or_else(launcher_changed)?
            .revision;
        if confirmed_revision.is_some_and(|confirmed| confirmed != revision) {
            return Err(launcher_changed());
        }

        let reply = self.home_status().await?.ok_or_else(home_unverified)?;
        verify_home_clear(&reply)?;
        Ok((
            LauncherRemovalReview {
                version,
                revision: revision.clone(),
            },
            inventory,
        ))
    }
}

impl TvConnection {
    pub async fn review_launcher_removal(
        &self,
        host: &str,
        expected: &str,
    ) -> AppResult<LauncherRemovalReview> {
        timeout(REVIEW_TIMEOUT, async {
            let mut session = self.session(host, expected).await?;
            let (review, _) = session.check_launcher_removal(None).await?;
            Ok(review)
        })
        .await
        .map_err(|_| {
            AppError::new(
                "connection_timeout",
                "Checking Home and startup timed out. Try again.",
            )
        })?
    }

    pub async fn remove_launcher(
        &self,
        host: &str,
        expected: &str,
        confirmed_revision: &str,
    ) -> AppResult<()> {
        timeout(REMOVAL_TIMEOUT, async {
            let mut session = self.session(host, expected).await?;
            let (_, before) = session
                .check_launcher_removal(Some(confirmed_revision))
                .await?;
            session
                .uninstall_once(LAUNCHER_APP_ID)
                .await
                .map_err(|_| removal_unverified())?;
            let (after, version) = session
                .launcher_inventory()
                .await
                .map_err(|_| removal_unverified())?;
            if version.is_some() || after.rows.iter().any(|row| row.id == LAUNCHER_PACKAGE_ID) {
                return Err(AppError::new(
                    "launcher_still_installed",
                    "The TV did not remove AeroTizen. It is still installed.",
                ));
            }
            if before.rows.iter().any(|row| {
                row.id != LAUNCHER_PACKAGE_ID
                    && !after.rows.iter().any(|current| current.id == row.id)
            }) {
                return Err(removal_unverified());
            }
            Ok(())
        })
        .await
        .map_err(|_| removal_unverified())?
    }
}

#[cfg(test)]
mod tests;
