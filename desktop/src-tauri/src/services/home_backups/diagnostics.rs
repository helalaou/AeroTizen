use super::HomeBackups;
use crate::services::durable_json;
use serde_json::Value;
use std::{fs, path::Path};

const MAX_RECEIPTS: usize = 20;
const MAX_RECEIPT_BYTES: u64 = 2 * 1024 * 1024;

fn ordinary_directory(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_dir())
}

fn recent_receipts(backups: &Path) -> Vec<Value> {
    if !ordinary_directory(backups) {
        return Vec::new();
    }
    let mut newest = Vec::new();
    for device in fs::read_dir(backups).into_iter().flatten().flatten() {
        let directory = device.path().join("transactions");
        if !device.file_type().is_ok_and(|kind| kind.is_dir()) || !ordinary_directory(&directory) {
            continue;
        }
        for file in fs::read_dir(directory).into_iter().flatten().flatten() {
            if file
                .path()
                .extension()
                .is_none_or(|extension| extension != "json")
            {
                continue;
            }
            let Ok(metadata) = file.metadata() else {
                continue;
            };
            if !metadata.is_file() || metadata.len() > MAX_RECEIPT_BYTES {
                continue;
            }
            let Ok(modified) = metadata.modified() else {
                continue;
            };
            newest.push((modified, file.path()));
            newest.sort_unstable_by(|left, right| right.cmp(left));
            newest.truncate(MAX_RECEIPTS);
        }
    }
    newest
        .into_iter()
        .filter_map(|(_, path)| durable_json::read(&path, MAX_RECEIPT_BYTES).ok())
        .filter(Value::is_object)
        .collect()
}

impl HomeBackups {
    pub(in crate::services) async fn diagnostic_receipts(&self) -> Vec<Value> {
        let directory = self.directory.clone();
        tokio::task::spawn_blocking(move || recent_receipts(&directory))
            .await
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_linked_backup_folders_and_unrelated_files() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("backups/tv/transactions");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("receipt.json"), r#"{"state":"restored"}"#).unwrap();
        fs::write(directory.join("broken.json"), "invalid").unwrap();
        fs::write(directory.join("other.txt"), r#"{"secret":"private"}"#).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(directory.join("receipt.json"), directory.join("link.json"))
            .unwrap();

        let receipts = recent_receipts(&root.path().join("backups"));
        assert_eq!(receipts, [serde_json::json!({"state":"restored"})]);
    }
}
