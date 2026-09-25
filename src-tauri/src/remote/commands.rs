use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::client::{
    download_thumbnail, get_library, list_files, put_library, test_connection, upload_file,
    RemoteConnectionTestResult, RemoteFileSummary, RemoteIngestResult, RemoteLibraryResponse,
};
use super::config::{load_config, save_config, RemoteConfig};

#[tauri::command]
pub fn get_remote_config(app: AppHandle) -> Result<RemoteConfig, String> {
    load_config(&app)
}

#[tauri::command]
pub fn save_remote_config(app: AppHandle, config: RemoteConfig) -> Result<RemoteConfig, String> {
    let mut next = config;
    if next.cache_ttl_days == 0 {
        next.cache_ttl_days = 7;
    }
    // Validate URL when enabled or when fields are partially filled.
    if next.enabled || next.is_configured() {
        let _ = next.api_origin()?;
    }
    save_config(&app, &next)?;
    Ok(next)
}

#[tauri::command]
pub async fn test_remote_connection(
    app: AppHandle,
    config: Option<RemoteConfig>,
) -> Result<RemoteConnectionTestResult, String> {
    let effective = match config {
        Some(value) => value,
        None => load_config(&app)?,
    };
    test_connection(&effective).await
}

#[tauri::command]
pub async fn get_remote_files(app: AppHandle) -> Result<Vec<RemoteFileSummary>, String> {
    let config = load_config(&app)?;
    list_files(&config).await
}

#[tauri::command]
pub async fn get_remote_library(app: AppHandle) -> Result<RemoteLibraryResponse, String> {
    let config = load_config(&app)?;
    get_library(&config).await
}

#[tauri::command]
pub async fn put_remote_library(
    app: AppHandle,
    document: Value,
    if_match: String,
) -> Result<String, String> {
    let config = load_config(&app)?;
    put_library(&config, &document, &if_match).await
}

#[tauri::command]
pub async fn upload_remote_file(app: AppHandle, path: String) -> Result<RemoteIngestResult, String> {
    let config = load_config(&app)?;
    upload_file(&config, std::path::Path::new(&path)).await
}

#[tauri::command]
pub async fn get_remote_thumbnail(app: AppHandle, file_id: String) -> Result<String, String> {
    let config = load_config(&app)?;
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?
        .join("remote-thumbnails");
    let path = download_thumbnail(&config, &file_id, &cache_dir).await?;
    Ok(path.to_string_lossy().into_owned())
}
