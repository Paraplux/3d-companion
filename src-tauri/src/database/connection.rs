use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use super::migrations::run_migrations;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let path = database_path(app)?;
        let conn = Connection::open(&path)
            .map_err(|error| format!("Could not open library database: {error}"))?;

        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;",
        )
        .map_err(|error| format!("Could not configure database: {error}"))?;

        run_migrations(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn with_conn<T>(
        &self,
        work: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "Could not access the library database.".to_string())?;
        work(&conn)
    }
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    Ok(data_dir.join("library.db"))
}
