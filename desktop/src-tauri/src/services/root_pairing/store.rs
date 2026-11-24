//! Guarded local receipt updates. TV proof must be checked by the caller first.
use super::*;
use crate::services::durable_json;
fn unlinked(path: &Path) -> AppResult<()> {
    if path.is_symlink() || path.parent().is_some_and(Path::is_symlink) {
        return Err(unavailable());
    }
    Ok(())
}
pub(in crate::services) async fn update(
    directory: &Path,
    host: &str,
    expected: &str,
    before: Value,
    after: Value,
) -> AppResult<Receipt> {
    let parsed = parse(after.clone(), expected)?;
    let directory = directory.to_owned();
    let host = host.to_owned();
    let (path, pointer) = tokio::task::spawn_blocking(move || {
        let path = selected_path(&directory, &host)?;
        unlinked(&path)?;
        let current = read_document(&path, MAX_RECEIPT_BYTES)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                path.parent().ok_or_else(unavailable)?,
                std::fs::Permissions::from_mode(0o700),
            )
            .map_err(|_| unavailable())?;
        }
        if current != before {
            return Err(AppError::new(
                "root_state_changed",
                "Root setup changed. Refresh Root access before retrying.",
            ));
        }
        let pointer = directory
            .join("root")
            .join(sha256_hex(host.as_bytes()))
            .join("selected.json");
        unlinked(&pointer)?;
        Ok((path, pointer))
    })
    .await
    .map_err(|_| unavailable())??;
    durable_json::write(path.clone(), after, false, MAX_RECEIPT_BYTES).await?;
    let absolute = std::path::absolute(&path).map_err(|_| unavailable())?;
    let absolute = absolute.to_str().ok_or_else(unavailable)?;
    durable_json::write(
        pointer,
        serde_json::json!({"path":absolute}),
        false,
        MAX_POINTER_BYTES,
    )
    .await?;
    Ok(parsed)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn receipt_updates_preserve_secrets_and_reject_changed_or_linked_records() {
        let directory = tempfile::tempdir().unwrap();
        let original = super::super::tests::document();
        let host = "192.0.2.20";
        let path = super::super::tests::save(directory.path(), host, &original);
        let mut updated = original.clone();
        updated["verified_boot_id"] = serde_json::json!("00000000-0000-4000-8000-000000000002");
        let result = update(
            directory.path(),
            host,
            super::super::tests::IDENTITY,
            original.clone(),
            updated.clone(),
        )
        .await
        .unwrap();
        assert_eq!(result.document, updated);
        assert_eq!(result.document["token"], original["token"]);
        assert_eq!(read_document(&path, MAX_RECEIPT_BYTES).unwrap(), updated);
        assert_eq!(
            update(
                directory.path(),
                host,
                super::super::tests::IDENTITY,
                original,
                updated.clone()
            )
            .await
            .err()
            .unwrap()
            .code,
            "root_state_changed"
        );
        assert_eq!(read_document(&path, MAX_RECEIPT_BYTES).unwrap(), updated);
        #[cfg(unix)]
        {
            let backing = path.with_file_name("unlinked-original.json");
            std::fs::rename(&path, &backing).unwrap();
            std::os::unix::fs::symlink(&backing, &path).unwrap();
            assert!(update(
                directory.path(),
                host,
                super::super::tests::IDENTITY,
                updated.clone(),
                updated.clone()
            )
            .await
            .is_err());
            assert_eq!(read_document(&backing, MAX_RECEIPT_BYTES).unwrap(), updated);
        }
    }
}
