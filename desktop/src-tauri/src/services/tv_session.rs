use super::digest::sha256_hex;
use crate::models::{AppError, AppResult};
use fs2::FileExt;
use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

const SDB_PORT: u16 = 26101;

pub struct TvSessionLock {
    _file: File,
}

pub async fn acquire(directory: &Path, host: &str) -> AppResult<TvSessionLock> {
    let directory = directory.to_owned();
    let host = host.to_owned();
    tokio::task::spawn_blocking(move || acquire_blocking(&directory, &host))
        .await
        .map_err(|_| unavailable())?
}

fn unavailable() -> AppError {
    AppError::new(
        "connection_failed",
        "Could not access this TV session. Close other AeroTizen sessions and retry.",
    )
}

fn lock_path(directory: &Path, host: &str) -> PathBuf {
    directory.join("sessions").join(format!(
        "{}.lock",
        sha256_hex(format!("{host}:{SDB_PORT}").as_bytes())
    ))
}

fn acquire_blocking(directory: &Path, host: &str) -> AppResult<TvSessionLock> {
    let path = lock_path(directory, host);
    std::fs::create_dir_all(path.parent().ok_or_else(unavailable)?).map_err(|_| unavailable())?;
    match std::fs::symlink_metadata(&path) {
        Ok(metadata) if !metadata.is_file() || metadata.file_type().is_symlink() => {
            return Err(unavailable())
        }
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(unavailable()),
        _ => {}
    }
    let mut file = OpenOptions::new()
        .read(true)
        .append(true)
        .create(true)
        .open(path)
        .map_err(|_| unavailable())?;
    // Python's Windows client locks its first byte. Keep that byte and inode across sessions.
    if cfg!(windows) && file.metadata().map_err(|_| unavailable())?.len() == 0 {
        file.write_all(&[0]).map_err(|_| unavailable())?;
    }
    file.try_lock_exclusive().map_err(|_| unavailable())?;
    Ok(TvSessionLock { _file: file })
}

#[cfg(test)]
mod tests;
