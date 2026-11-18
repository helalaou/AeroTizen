use crate::models::{valid_identity, AppError, AppResult, SavedTv, VerifiedTv};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;

pub struct Profiles {
    path: PathBuf,
}

const SCHEMA_VERSION: u32 = 1;

fn storage_error(_: impl std::fmt::Debug) -> AppError {
    AppError::new(
        "storage_failed",
        "Could not read or save TV profiles. Check the app's storage permissions.",
    )
}

impl Profiles {
    pub fn new(path: PathBuf) -> AppResult<Self> {
        let store = Self { path };
        let connection = store.open()?;
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(storage_error)?;
        if version > SCHEMA_VERSION {
            return Err(AppError::new(
                "storage_incompatible",
                "These TV profiles need a newer version of AeroTizen Desktop.",
            ));
        }
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS tvs (identity TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL);
             "
        ).map_err(storage_error)?;
        connection
            .pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(storage_error)?;
        Ok(store)
    }

    fn open(&self) -> AppResult<Connection> {
        Connection::open(&self.path).map_err(storage_error)
    }

    pub fn list(&self) -> AppResult<Vec<SavedTv>> {
        let connection = self.open()?;
        let mut statement = connection
            .prepare("SELECT name, data FROM tvs ORDER BY name COLLATE NOCASE")
            .map_err(storage_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(storage_error)?;
        rows.map(|row| {
            let (name, data) = row.map_err(storage_error)?;
            let mut tv: VerifiedTv = serde_json::from_str(&data).map_err(storage_error)?;
            tv.name = name;
            Ok(SavedTv {
                id: tv.identity_sha256.clone(),
                tv,
            })
        })
        .collect()
    }

    pub fn get(&self, id: &str) -> AppResult<SavedTv> {
        self.list()?
            .into_iter()
            .find(|profile| profile.id == id)
            .ok_or_else(|| {
                AppError::new("profile_missing", "This saved TV is no longer available.")
            })
    }

    pub fn save(&self, tv: VerifiedTv) -> AppResult<SavedTv> {
        if !valid_identity(&tv.identity_sha256) {
            return Err(AppError::new(
                "invalid_identity",
                "The worker returned an invalid TV identity.",
            ));
        }
        let connection = self.open()?;
        let name: Option<String> = connection
            .query_row(
                "SELECT name FROM tvs WHERE identity = ?1",
                [&tv.identity_sha256],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage_error)?;
        let saved = VerifiedTv {
            name: name.unwrap_or_else(|| tv.name.clone()),
            ..tv
        };
        let data = serde_json::to_string(&saved).map_err(storage_error)?;
        connection.execute(
            "INSERT INTO tvs(identity, name, data) VALUES (?1, ?2, ?3) ON CONFLICT(identity) DO UPDATE SET data = excluded.data",
            params![saved.identity_sha256, saved.name, data],
        ).map_err(storage_error)?;
        Ok(SavedTv {
            id: saved.identity_sha256.clone(),
            tv: saved,
        })
    }

    pub fn rename(&self, id: &str, name: &str) -> AppResult<()> {
        self.get(id)?;
        let trimmed = name.trim();
        if trimmed.is_empty()
            || trimmed.chars().count() > 80
            || trimmed.chars().any(char::is_control)
        {
            return Err(AppError::new(
                "invalid_name",
                "Use a TV name with 1 to 80 characters.",
            ));
        }
        self.open()?
            .execute(
                "UPDATE tvs SET name = ?1 WHERE identity = ?2",
                params![trimmed, id],
            )
            .map_err(storage_error)?;
        Ok(())
    }

    pub fn forget(&self, id: &str) -> AppResult<()> {
        self.open()?
            .execute("DELETE FROM tvs WHERE identity = ?1", [id])
            .map_err(storage_error)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tv(host: &str) -> VerifiedTv {
        VerifiedTv {
            identity_sha256: "a".repeat(64),
            host: host.into(),
            name: "Samsung TV".into(),
            model: "Frame".into(),
            launcher_version: None,
            launcher_signing_ready: false,
            transport: "developer".into(),
            developer_mode: "1".into(),
            developer_host: "192.0.2.1".into(),
            checked_at: "2026-11-14T10:00:00Z".into(),
            technical_details: Default::default(),
            home_backup: None,
            home_routing_mode: None,
            native_home_settings: None,
        }
    }

    #[test]
    fn reconnect_keeps_name_and_updates_address_without_a_duplicate() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("profiles.sqlite3");
        let store = Profiles::new(path.clone()).unwrap();
        let first = store.save(tv("192.0.2.20")).unwrap();
        store.rename(&first.id, "Living room").unwrap();
        store.save(tv("192.0.2.21")).unwrap();
        let reopened = Profiles::new(path).unwrap();
        let saved = reopened.list().unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].tv.host, "192.0.2.21");
        assert_eq!(saved[0].tv.name, "Living room");
        reopened.forget(&first.id).unwrap();
        assert!(reopened.list().unwrap().is_empty());
    }

    #[test]
    fn invalid_identity_or_name_does_not_change_profiles() {
        let directory = tempfile::tempdir().unwrap();
        let store = Profiles::new(directory.path().join("profiles.sqlite3")).unwrap();
        let saved = store.save(tv("192.0.2.20")).unwrap();
        assert!(store.rename(&saved.id, "\n").is_err());
        let invalid = VerifiedTv {
            identity_sha256: "invalid".into(),
            ..tv("192.0.2.30")
        };
        assert!(store.save(invalid).is_err());
        assert_eq!(store.get(&saved.id).unwrap().tv.host, "192.0.2.20");
    }
}
