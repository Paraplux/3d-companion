use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::database::Database;
use crate::library::models::{location_name_from_path, LibraryLocation};
use crate::repositories::locations::{find_location_by_path, insert_location, list_locations};

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct StoredLocations {
    locations: Vec<String>,
}

fn legacy_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Could not resolve app config directory: {error}"))?;

    Ok(config_dir.join("library-locations.json"))
}

/// One-time import of Phase 2 JSON locations into SQLite.
pub fn migrate_legacy_locations(app: &AppHandle, db: &Database) -> Result<(), String> {
    let path = legacy_store_path(app)?;
    if !path.exists() {
        return Ok(());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read legacy library locations: {error}"))?;
    let stored: StoredLocations = serde_json::from_str(&raw)
        .map_err(|error| format!("Could not parse legacy library locations: {error}"))?;

    db.with_conn(|conn| {
        for location_path in stored.locations {
            if find_location_by_path(conn, &location_path)?.is_some() {
                continue;
            }
            let name = location_name_from_path(&location_path);
            let _ = insert_location(conn, &location_path, &name)?;
        }
        Ok(())
    })?;

    let _ = fs::remove_file(path);
    Ok(())
}

pub fn canonicalize_dir(path: &str) -> Result<String, String> {
    let candidate = Path::new(path);
    if !candidate.exists() {
        return Err("The selected folder could not be found.".into());
    }
    if !candidate.is_dir() {
        return Err("The selected path is not a folder.".into());
    }

    candidate
        .canonicalize()
        .map(|canonical| canonical.to_string_lossy().to_string())
        .map_err(|error| format!("Could not access the selected folder: {error}"))
}

pub fn load_locations(db: &Database) -> Result<Vec<LibraryLocation>, String> {
    db.with_conn(list_locations)
}
