use super::{connection_failed, profile, projection, sdb, Session, TvConnection};
use crate::{
    models::{AppError, AppResult, InstalledLocalApp, LocalPackageReview},
    services::local_widget,
};
use regex::Regex;
use std::{path::PathBuf, sync::OnceLock, time::Duration};
use tokio::time::timeout;
const INSTALL_TIMEOUT: Duration = Duration::from_secs(300);
const WRITE_TIMEOUT: Duration = Duration::from_secs(120);
fn failed() -> AppError {
    AppError::new("install_failed","Could not verify installation. Refresh Apps before retrying. For an existing app, use its original signing profile.")
}
fn verify(
    app_id: &str,
    package_id: &str,
    version: &str,
    reply: &str,
    inventory: &str,
) -> AppResult<()> {
    static FAILURE: OnceLock<Regex> = OnceLock::new();
    static IDS: OnceLock<Regex> = OnceLock::new();
    static PATH: OnceLock<Regex> = OnceLock::new();
    let failure = FAILURE.get_or_init(|| {
        Regex::new(r"(?i)\b(?:fail(?:ed|ure)?|error|denied|cannot)\b|\bcan\s+not\b").unwrap()
    });
    let ids = IDS.get_or_init(|| Regex::new(r"app_id\[[A-Za-z0-9_.-]+\]").unwrap());
    let path = PATH.get_or_init(|| Regex::new(r"^\s*package_path\s+\S+\s*$").unwrap());
    let install = Regex::new(&format!(r"^\s*install\s+{}\s*$", regex::escape(app_id))).unwrap();
    let statuses = reply
        .lines()
        .filter(|line| !install.is_match(line) && !path.is_match(line))
        .map(|line| ids.replace_all(line, ""))
        .collect::<Vec<_>>()
        .join("\n");
    if failure.is_match(&statuses) {
        return Err(failed());
    }
    let (_, installed) = projection::installed(inventory, package_id, app_id)?;
    if installed.as_deref() != Some(version) {
        return Err(AppError::new(
            "version_unverified",
            "The TV did not report the selected app version. Refresh Apps to check.",
        ));
    }
    Ok(())
}
impl TvConnection {
    pub async fn install_local(
        &self,
        host: &str,
        expected: &str,
        path: PathBuf,
        review: LocalPackageReview,
        confirmed: bool,
    ) -> AppResult<InstalledLocalApp> {
        if !confirmed {
            return Err(AppError::new(
                "confirmation_required",
                "Review and confirm the app installation first.",
            ));
        }
        timeout(
            INSTALL_TIMEOUT,
            self.install_local_inner(host, expected, path, review),
        )
        .await
        .map_err(|_| {
            AppError::new(
                "connection_timeout",
                "Installation timed out. Refresh Apps before retrying.",
            )
        })?
    }
    async fn install_local_inner(
        &self,
        host: &str,
        expected: &str,
        path: PathBuf,
        review: LocalPackageReview,
    ) -> AppResult<InstalledLocalApp> {
        let checksum = review.sha256.clone();
        let widget =
            tokio::task::spawn_blocking(move || local_widget::snapshot(&path, Some(&checksum)))
                .await
                .map_err(|_| failed())??;
        let (widget, metadata) = tokio::task::spawn_blocking(move || {
            let metadata = widget.review()?;
            Ok::<_, AppError>((widget, metadata))
        })
        .await
        .map_err(|_| failed())??;
        if metadata.app_id != review.app_id
            || metadata.package_id != review.package_id
            || metadata.version != review.version
        {
            return Err(AppError::new(
                "package_changed",
                "Choose the app file again and review it.",
            ));
        }
        let mut session = self.session(host, expected).await?;
        let duid = session.identity().await?;
        let before = session.inventory().await?;
        let (current, _) = projection::installed(&before, &review.package_id, &review.app_id)?;
        if current != review.current_revision {
            return Err(AppError::new(
                "apps_changed",
                "The installed app changed. Choose the file again to review it.",
            ));
        }
        if !profile::signing_ready(&self.directory, &duid) {
            return Err(AppError::new(
                "certificates_required",
                "Set up this TV's signing certificates first.",
            ));
        }
        let certificates = self.directory.join("certs").join(duid);
        let capabilities = timeout(
            WRITE_TIMEOUT,
            session.connection.read(sdb::ReadCommand::Capabilities),
        )
        .await
        .map_err(|_| connection_failed())?
        .map_err(|_| connection_failed())?;
        let tools = sdb::sync::tools_path(&capabilities).map_err(|_| failed())?;
        let (widget, signed, certificates) = tokio::task::spawn_blocking(move || {
            let signed = super::super::widget_signer::sign(
                &widget.path(),
                &widget.path().with_file_name("signed.wgt"),
                &certificates,
            )?;
            Ok::<_, AppError>((widget, signed, certificates))
        })
        .await
        .map_err(|_| failed())??;
        // Check identity and pairing again immediately before the first write.
        session.identity().await?;
        session.unchanged().await?;
        let reply = session
            .install_once(
                &review.app_id,
                &tools,
                certificates.join("device-profile.xml"),
                signed,
            )
            .await?;
        let after = session.inventory().await?;
        verify(
            &review.app_id,
            &review.package_id,
            &review.version,
            &reply,
            &after,
        )?;
        drop(widget);
        Ok(InstalledLocalApp {
            app_id: review.app_id,
            package_id: review.package_id,
            version: review.version,
        })
    }
}
impl Session<'_> {
    async fn install_once(
        &mut self,
        app_id: &str,
        tools: &str,
        profile: PathBuf,
        widget: PathBuf,
    ) -> AppResult<String> {
        timeout(
            WRITE_TIMEOUT,
            self.connection
                .install_widget(app_id, tools, &profile, &widget),
        )
        .await
        .map_err(|_| failed())?
        .map_err(|_| failed())
    }
}
#[cfg(test)]
mod tests;
