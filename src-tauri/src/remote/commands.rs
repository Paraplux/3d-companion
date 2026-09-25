use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::client::{
    delete_file, download_file_to_path, download_thumbnail, ensure_cached_file, get_library,
    list_files, put_library, rename_file, test_connection, upload_file,
    RemoteConnectionTestResult, RemoteFileSummary, RemoteIngestResult, RemoteLibraryResponse,
};
use super::config::{load_config, save_config, RemoteConfig};
use crate::library::bambu_studio::{
    is_bambu_studio_compatible_extension, open_path_in_bambu_studio,
};

fn remote_files_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?
        .join("remote-files"))
}

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
pub async fn delete_remote_file(app: AppHandle, file_id: String) -> Result<(), String> {
    let config = load_config(&app)?;
    delete_file(&config, &file_id).await
}

#[tauri::command]
pub async fn rename_remote_file(
    app: AppHandle,
    file_id: String,
    name: String,
) -> Result<RemoteFileSummary, String> {
    let config = load_config(&app)?;
    rename_file(&config, &file_id, &name).await
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

/// Ensure a cloud object is in the local cache; returns absolute path.
#[tauri::command]
pub async fn cache_remote_file(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
) -> Result<String, String> {
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let path =
        ensure_cached_file(&config, &file_id, &content_hash, &filename, &cache_dir).await?;
    Ok(path.to_string_lossy().into_owned())
}

/// Download a cloud object to a user-chosen absolute path (Save As).
#[tauri::command]
pub async fn save_remote_file(
    app: AppHandle,
    file_id: String,
    dest_path: String,
) -> Result<(), String> {
    let config = load_config(&app)?;
    let dest = std::path::Path::new(&dest_path);
    if dest_path.trim().is_empty() {
        return Err("A destination path is required.".into());
    }
    download_file_to_path(&config, &file_id, dest).await
}

/// Cache a cloud STL/3MF then open it in Bambu Studio.
#[tauri::command]
pub async fn open_remote_in_bambu_studio(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
    extension: String,
) -> Result<(), String> {
    if !is_bambu_studio_compatible_extension(&extension) {
        return Err("Only STL and 3MF files can be opened in Bambu Studio.".into());
    }
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let path =
        ensure_cached_file(&config, &file_id, &content_hash, &filename, &cache_dir).await?;
    open_path_in_bambu_studio(&path)
}
