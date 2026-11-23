use super::{connection_failed, projection, sdb, Session, TvConnection};
use crate::models::{
    AppError, AppPackageSelection, AppRemovalOutcome, AppRemovalResult, AppRemovalStatus, AppResult,
};
use regex::Regex;
use std::{collections::HashSet, sync::OnceLock, time::Duration};
use tokio::time::timeout;

const MAX_SELECTED_PACKAGES: usize = 128;
const REMOVAL_TIMEOUT: Duration = Duration::from_secs(300);
const UNINSTALL_TIMEOUT: Duration = Duration::from_secs(120);

fn validate(selected: &[AppPackageSelection]) -> AppResult<()> {
    let mut ids = HashSet::new();
    if selected.is_empty()
        || selected.len() > MAX_SELECTED_PACKAGES
        || selected.iter().any(|item| {
            !sdb::valid_identifier(&item.id)
                || !ids.insert(&item.id)
                || item.revision.len() != 64
                || !item
                    .revision
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
    {
        return Err(AppError::new(
            "invalid_request",
            "Review the installed packages and select them again.",
        ));
    }
    Ok(())
}

fn refused(reply: &str) -> bool {
    static REFUSAL: OnceLock<Regex> = OnceLock::new();
    let pattern =
        REFUSAL.get_or_init(|| Regex::new(r"(?i)^can\s*not\s+uninstall\s+app[.!]?$").unwrap());
    reply
        .lines()
        .any(|line| pattern.is_match(line.trim_matches([' ', '\t', '\0', '\r'])))
}

fn failure_detail(reply: &str) -> Option<String> {
    static FAILURE: OnceLock<Regex> = OnceLock::new();
    let pattern = FAILURE.get_or_init(|| {
        Regex::new(r"(?i)\b(?:fail(?:ed|ure)?|can\s*not|denied|not (?:allowed|permitted)|1009)\b")
            .unwrap()
    });
    reply
        .lines()
        .find(|line| pattern.is_match(line))
        .and_then(|line| {
            super::super::text::display_text(Some(&serde_json::Value::String(line.into())), 256)
        })
}

impl Session<'_> {
    async fn checked_inventory(&mut self) -> AppResult<projection::Inventory> {
        let raw = self.inventory().await?;
        tokio::task::spawn_blocking(move || projection::checked(&raw))
            .await
            .map_err(|_| super::invalid_response())?
    }

    async fn uninstall_once(&mut self, id: &str) -> AppResult<String> {
        self.unchanged().await?;
        timeout(UNINSTALL_TIMEOUT, self.connection.uninstall(id))
            .await
            .map_err(|_| connection_failed())?
            .map_err(|_| connection_failed())
    }
}

impl TvConnection {
    pub async fn remove(
        &self,
        host: &str,
        expected: &str,
        selected: Vec<AppPackageSelection>,
    ) -> AppResult<AppRemovalResult> {
        validate(&selected)?;
        timeout(REMOVAL_TIMEOUT, self.remove_inner(host, expected, selected))
            .await
            .map_err(|_| {
                AppError::new(
                    "connection_timeout",
                    "Removal timed out. Check the installed apps before retrying.",
                )
            })?
    }

    async fn remove_inner(
        &self,
        host: &str,
        expected: &str,
        selected: Vec<AppPackageSelection>,
    ) -> AppResult<AppRemovalResult> {
        let mut session = self.session(host, expected).await?;
        let before = session.checked_inventory().await?;
        // Validate the whole reviewed batch before sending the first uninstall.
        for item in &selected {
            before.removal_target(&item.id, &item.revision)?;
        }
        let mut current = Some(before);
        let mut results = Vec::new();
        for item in selected {
            let mut result = AppRemovalOutcome {
                id: item.id.clone(),
                status: AppRemovalStatus::NotAttempted,
                detail: None,
            };
            if let Some(inventory) = current.as_ref() {
                if let Ok(target) = inventory.removal_target(&item.id, &item.revision) {
                    let reply = session.uninstall_once(target).await;
                    let after = if reply.is_ok() {
                        session.checked_inventory().await
                    } else {
                        Err(connection_failed())
                    };
                    match (reply, after) {
                        (Ok(reply), Ok(after))
                            if !inventory.rows.iter().any(|old| {
                                old.id != item.id && !after.rows.iter().any(|row| row.id == old.id)
                            }) =>
                        {
                            result.status = if after.rows.iter().any(|row| row.id == item.id) {
                                if refused(&reply) {
                                    AppRemovalStatus::Refused
                                } else {
                                    result.detail = failure_detail(&reply);
                                    AppRemovalStatus::StillInstalled
                                }
                            } else {
                                AppRemovalStatus::Removed
                            };
                            current = Some(after);
                        }
                        _ => {
                            current = None;
                            result.status = AppRemovalStatus::Unverified;
                        }
                    }
                }
            }
            results.push(result);
        }
        Ok(AppRemovalResult {
            apps: current.map(|inventory| inventory.rows),
            results,
        })
    }
}

#[cfg(test)]
mod tests;
