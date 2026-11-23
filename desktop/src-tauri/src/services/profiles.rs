use crate::models::{valid_identity, AppError, AppResult, SavedTv, VerifiedTv};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;

#[derive(Clone)]
pub struct Profiles {
    path: PathBuf,
}

const SCHEMA_VERSION: u32 = 1;
const MAX_TV_NAME_CHARACTERS: usize = 80;

fn storage_error(_: impl std::fmt::Debug) -> AppError {
    AppError::new(
        "storage_failed",
        "Could not read or save TV profiles. Check the app's storage permissions.",
    )
}

impl Profiles {
    /// Create or validate the schema during app startup, before views begin reading profiles.
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

    // Each runtime operation owns its blocking work; no SQLite connection crosses an await.
    async fn run<T: Send + 'static>(
        &self,
        operation: impl FnOnce(&Self) -> AppResult<T> + Send + 'static,
    ) -> AppResult<T> {
        let store = self.clone();
        tokio::task::spawn_blocking(move || operation(&store))
            .await
            .map_err(storage_error)?
    }

    pub async fn list(&self) -> AppResult<Vec<SavedTv>> {
        self.run(Self::list_blocking).await
    }

    pub async fn get(&self, id: &str) -> AppResult<SavedTv> {
        let id = id.to_owned();
        self.run(move |store| store.get_blocking(&id)).await
    }

    pub async fn save(&self, tv: VerifiedTv) -> AppResult<SavedTv> {
        self.run(move |store| store.save_blocking(tv)).await
    }

    pub async fn rename(&self, id: &str, name: &str) -> AppResult<()> {
        let id = id.to_owned();
        let name = name.to_owned();
        self.run(move |store| store.rename_blocking(&id, &name))
            .await
    }

    pub async fn forget(&self, id: &str) -> AppResult<()> {
        let id = id.to_owned();
        self.run(move |store| store.forget_blocking(&id)).await
    }

    fn open(&self) -> AppResult<Connection> {
        Connection::open(&self.path).map_err(storage_error)
    }

    fn list_blocking(&self) -> AppResult<Vec<SavedTv>> {
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

    fn get_blocking(&self, id: &str) -> AppResult<SavedTv> {
        self.list_blocking()?
            .into_iter()
            .find(|profile| profile.id == id)
            .ok_or_else(|| {
                AppError::new("profile_missing", "This saved TV is no longer available.")
            })
    }

    fn save_blocking(&self, tv: VerifiedTv) -> AppResult<SavedTv> {
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

    fn rename_blocking(&self, id: &str, name: &str) -> AppResult<()> {
        self.get_blocking(id)?;
        let trimmed = name.trim();
        if trimmed.is_empty()
            || trimmed.chars().count() > MAX_TV_NAME_CHARACTERS
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

    fn forget_blocking(&self, id: &str) -> AppResult<()> {
        self.open()?
            .execute("DELETE FROM tvs WHERE identity = ?1", [id])
            .map_err(storage_error)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
