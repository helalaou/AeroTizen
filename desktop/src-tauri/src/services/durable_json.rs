//! Atomic, synced JSON receipts shared by guarded TV operations.
use crate::models::{AppError, AppResult};
use serde_json::Value;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};
fn failed() -> AppError {
    AppError::new(
        "recovery_unavailable",
        "The recovery receipt could not be saved or verified. Keep the existing recovery files.",
    )
}
pub(super) fn read(path: &Path, maximum: u64) -> AppResult<Value> {
    let file = std::fs::File::open(path).map_err(|_| failed())?;
    let metadata = file.metadata().map_err(|_| failed())?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(failed());
    }
    let mut bytes = Vec::new();
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failed())?;
    if bytes.len() as u64 > maximum {
        return Err(failed());
    }
    serde_json::from_slice(&bytes).map_err(|_| failed())
}
pub(super) async fn write(
    path: PathBuf,
    document: Value,
    create: bool,
    maximum: u64,
) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        let mut bytes = serde_json::to_vec_pretty(&document).map_err(|_| failed())?;
        bytes.push(b'\n');
        if bytes.len() as u64 > maximum {
            return Err(failed());
        }
        let parent = path.parent().ok_or_else(failed)?;
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(parent).map_err(|_| failed())?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| failed())?;
        temporary.write_all(&bytes).map_err(|_| failed())?;
        temporary.as_file().sync_all().map_err(|_| failed())?;
        if create {
            temporary.persist_noclobber(&path).map_err(|_| failed())?;
        } else {
            temporary.persist(&path).map_err(|_| failed())?;
        }
        #[cfg(unix)]
        {
            std::fs::File::open(parent)
                .and_then(|folder| folder.sync_all())
                .map_err(|_| failed())?;
        }
        Ok(())
    })
    .await
    .map_err(|_| failed())?
}
