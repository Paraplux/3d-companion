use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::models::{location_name_from_path, LibraryLocation};

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct StoredLocations {
    locations: Vec<String>,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Could not resolve app config directory: {error}"))?;

    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("Could not create config directory: {error}"))?;

    Ok(config_dir.join("library-locations.json"))
}

pub fn load_locations(app: &AppHandle) -> Result<Vec<LibraryLocation>, String> {
    let path = store_path(app)?;

    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read library locations: {error}"))?;

    let stored: StoredLocations = serde_json::from_str(&raw)
        .map_err(|error| format!("Could not parse library locations: {error}"))?;

    Ok(stored
        .locations
        .into_iter()
        .map(|location_path| LibraryLocation {
            name: location_name_from_path(&location_path),
            path: location_path,
        })
        .collect())
}

pub fn save_locations(app: &AppHandle, locations: &[LibraryLocation]) -> Result<(), String> {
    let path = store_path(app)?;
    let stored = StoredLocations {
        locations: locations.iter().map(|location| location.path.clone()).collect(),
    };

    let raw = serde_json::to_string_pretty(&stored)
        .map_err(|error| format!("Could not serialize library locations: {error}"))?;

    fs::write(&path, raw).map_err(|error| format!("Could not save library locations: {error}"))
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
