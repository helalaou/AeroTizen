//! Guarded local receipt creation, updates and recovery history.
use super::*;
use crate::services::durable_json;
// Keep nested configuration bytes compatible when the CLI reopens this receipt.
struct StoredReceipt(Value);
impl serde::Serialize for StoredReceipt {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::{Error, SerializeMap};
        let document = self
            .0
            .as_object()
            .ok_or_else(|| S::Error::custom("invalid Root receipt"))?;
        let mut result = serializer.serialize_map(Some(document.len()))?;
        for (key, value) in document {
            if key == "public_config" {
                result
                    .serialize_entry(key, &crate::services::root_package::Configuration(value))?;
            } else {
                result.serialize_entry(key, value)?;
            }
        }
        result.end()
    }
}
fn unlinked(path: &Path) -> AppResult<()> {
    if path.is_symlink() || path.parent().is_some_and(Path::is_symlink) {
        return Err(unavailable());
    }
    Ok(())
}
fn changed() -> AppError {
    AppError::new(
        "root_state_changed",
        "Root setup changed. Refresh Root access before retrying.",
    )
}
fn current(path: &Path) -> AppResult<Option<Value>> {
    match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(unavailable()),
        Ok(_) => read_document(path, MAX_RECEIPT_BYTES).map(Some),
    }
}
pub(in crate::services) struct Store {
    directory: PathBuf,
    host: String,
    expected: String,
    pub path: PathBuf,
    pub document: Option<Value>,
}
impl Store {
    pub async fn open(directory: &Path, host: &str, expected: &str) -> AppResult<Self> {
        let directory = directory.to_owned();
        let host = host.to_owned();
        let expected = expected.to_owned();
        tokio::task::spawn_blocking(move || {
            let path = std::path::absolute(selected_path(&directory, &host)?)
                .map_err(|_| unavailable())?;
            unlinked(&path)?;
            let document = current(&path)?;
            if let Some(document) = &document {
                parse(document.clone(), &expected)?;
            }
            Ok(Self {
                directory,
                host,
                expected,
                path,
                document,
            })
        })
        .await
        .map_err(|_| unavailable())?
    }
    pub async fn save(&mut self, after: Value) -> AppResult<Receipt> {
        let parsed = parse(after.clone(), &self.expected)?;
        let directory = self.directory.clone();
        let host = self.host.clone();
        let path = self.path.clone();
        let before = self.document.clone();
        let (path, pointer) = tokio::task::spawn_blocking(move || {
            let selected = std::path::absolute(selected_path(&directory, &host)?)
                .map_err(|_| unavailable())?;
            unlinked(&path)?;
            if selected != path || current(&path)? != before {
                return Err(changed());
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
        let location = path.to_str().ok_or_else(unavailable)?.to_owned();
        let parent = path.parent().ok_or_else(unavailable)?.to_owned();
        tokio::task::spawn_blocking(move || {
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&parent).map_err(|_| unavailable())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o700))
                    .map_err(|_| unavailable())?;
            }
            Ok::<_, AppError>(())
        })
        .await
        .map_err(|_| unavailable())??;
        durable_json::write(
            path,
            StoredReceipt(after.clone()),
            self.document.is_none(),
            MAX_RECEIPT_BYTES,
        )
        .await?;
        self.document = Some(after);
        durable_json::write(
            pointer,
            serde_json::json!({"path":location}),
            false,
            MAX_POINTER_BYTES,
        )
        .await?;
        Ok(parsed)
    }
    pub async fn archive_removed(&self) -> AppResult<()> {
        let document = self.document.as_ref().ok_or_else(unavailable)?;
        if document["phase"] != "removed" {
            return Err(changed());
        }
        let id = document["installation_id"]
            .as_str()
            .ok_or_else(unavailable)?;
        let destination = self
            .path
            .parent()
            .ok_or_else(unavailable)?
            .join("history")
            .join(format!("{id}.json"));
        let path = destination.clone();
        let original = document.clone();
        let exists = tokio::task::spawn_blocking(move || {
            unlinked(&path)?;
            let existing = current(&path)?;
            if existing.as_ref().is_some_and(|value| value != &original) {
                return Err(changed());
            }
            Ok(existing.is_some())
        })
        .await
        .map_err(|_| unavailable())??;
        if !exists {
            durable_json::write(
                destination,
                StoredReceipt(document.clone()),
                true,
                MAX_RECEIPT_BYTES,
            )
            .await?;
        }
        Ok(())
    }
}
pub(in crate::services) async fn update(
    directory: &Path,
    host: &str,
    expected: &str,
    before: Value,
    after: Value,
) -> AppResult<Receipt> {
    let mut store = Store::open(directory, host, expected).await?;
    if store.document.as_ref() != Some(&before) {
        return Err(changed());
    }
    store.save(after).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn persisted_configuration_keeps_cli_field_order_for_later_upgrade_digests() {
        let directory = tempfile::tempdir().unwrap();
        let mut record = super::super::tests::document();
        let fixture: Value =
            serde_json::from_str(include_str!("../../../../tests/fixtures/root-package.json"))
                .unwrap();
        record["public_config"] = fixture["configuration"].clone();
        let mut store = Store::open(
            directory.path(),
            super::super::tests::HOST,
            super::super::tests::IDENTITY,
        )
        .await
        .unwrap();
        store.save(record).await.unwrap();
        let raw = std::fs::read_to_string(&store.path).unwrap();
        let expected = fixture["configuration_json"]
            .as_str()
            .unwrap()
            .trim_end()
            .lines()
            .enumerate()
            .map(|(index, line)| {
                if index == 0 {
                    line.to_owned()
                } else {
                    format!("  {line}")
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        assert!(raw.contains(&format!("\"public_config\": {expected}")));
    }
    #[tokio::test]
    async fn first_save_is_private_and_does_not_replace_a_concurrent_receipt() {
        let directory = tempfile::tempdir().unwrap();
        let host = super::super::tests::HOST;
        let identity = super::super::tests::IDENTITY;
        let original = super::super::tests::document();
        let mut first = Store::open(directory.path(), host, identity).await.unwrap();
        let mut stale = Store::open(directory.path(), host, identity).await.unwrap();
        assert!(first.document.is_none());
        first.save(original.clone()).await.unwrap();
        assert_eq!(selected_path(directory.path(), host).unwrap(), first.path);
        assert_eq!(
            stale.save(original.clone()).await.err().unwrap().code,
            "root_state_changed"
        );
        assert_eq!(
            read_document(&first.path, MAX_RECEIPT_BYTES).unwrap(),
            original
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&first.path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                std::fs::metadata(first.path.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
    }
    #[tokio::test]
    async fn removed_receipts_keep_original_history_and_refuse_conflicting_history() {
        let directory = tempfile::tempdir().unwrap();
        let mut original = super::super::tests::document();
        original["phase"] = serde_json::json!("removed");
        let mut store = Store::open(
            directory.path(),
            super::super::tests::HOST,
            super::super::tests::IDENTITY,
        )
        .await
        .unwrap();
        store.save(original.clone()).await.unwrap();
        store.archive_removed().await.unwrap();
        store.archive_removed().await.unwrap();
        let history = store.path.parent().unwrap().join("history").join(format!(
            "{}.json",
            original["installation_id"].as_str().unwrap()
        ));
        assert_eq!(
            read_document(&history, MAX_RECEIPT_BYTES).unwrap(),
            original
        );
        std::fs::write(&history, b"{}").unwrap();
        assert_eq!(
            store.archive_removed().await.err().unwrap().code,
            "root_state_changed"
        );
        assert_eq!(std::fs::read(&history).unwrap(), b"{}");
        assert_eq!(
            read_document(&store.path, MAX_RECEIPT_BYTES).unwrap(),
            original
        );
    }
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
