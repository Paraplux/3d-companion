use tauri::{AppHandle, State};

use crate::library::models::{
    AddLibraryLocationResult, BackgroundTasksEvent, LibraryFile, LibraryLocation, LibrarySnapshot,
};
use crate::library::state::LibraryState;
use crate::repositories::collections::{list_collections, Collection};
use crate::repositories::favorites::{
    add_favorite as add_favorite_row, is_favorite as is_favorite_row, list_favorite_ids,
    remove_favorite as remove_favorite_row,
};
use crate::repositories::projects::{list_projects, Project};
use crate::repositories::tags::{list_tags, Tag};

#[tauri::command]
pub fn get_library_snapshot(
    app: AppHandle,
    state: State<'_, LibraryState>,
) -> Result<LibrarySnapshot, String> {
    state.bootstrap(&app)
}

#[tauri::command]
pub fn get_library_locations(
    state: State<'_, LibraryState>,
) -> Result<Vec<LibraryLocation>, String> {
    state.list_locations()
}

#[tauri::command]
pub fn get_library_files(state: State<'_, LibraryState>) -> Result<Vec<LibraryFile>, String> {
    state.list_files()
}

#[tauri::command]
pub fn add_library_location(
    app: AppHandle,
    state: State<'_, LibraryState>,
    path: String,
) -> Result<AddLibraryLocationResult, String> {
    state.add_location(&app, path)
}

#[tauri::command]
pub fn remove_library_location(
    app: AppHandle,
    state: State<'_, LibraryState>,
    path: String,
) -> Result<(), String> {
    state.remove_location(&app, path)
}

#[tauri::command]
pub fn scan_library_location(
    app: AppHandle,
    state: State<'_, LibraryState>,
    path: String,
) -> Result<Vec<LibraryFile>, String> {
    state.rescan_location(&app, &path)
}

#[tauri::command]
pub fn scan_library(
    app: AppHandle,
    state: State<'_, LibraryState>,
) -> Result<Vec<LibraryFile>, String> {
    state.rescan_all(&app)
}

#[tauri::command]
pub fn search_library_files(
    state: State<'_, LibraryState>,
    query: String,
) -> Result<Vec<LibraryFile>, String> {
    state.search_files(&query)
}

#[tauri::command]
pub fn get_background_tasks(
    state: State<'_, LibraryState>,
) -> Result<BackgroundTasksEvent, String> {
    Ok(state.background_tasks())
}

#[tauri::command]
pub fn get_projects(state: State<'_, LibraryState>) -> Result<Vec<Project>, String> {
    state.db().with_conn(list_projects)
}

#[tauri::command]
pub fn get_collections(state: State<'_, LibraryState>) -> Result<Vec<Collection>, String> {
    state.db().with_conn(list_collections)
}

#[tauri::command]
pub fn get_tags(state: State<'_, LibraryState>) -> Result<Vec<Tag>, String> {
    state.db().with_conn(list_tags)
}

#[tauri::command]
pub fn get_model_geometry(
    app: AppHandle,
    state: State<'_, LibraryState>,
    library_file_id: String,
    plate_id: Option<String>,
) -> Result<crate::library::geometry::ModelGeometryResponse, String> {
    state.get_model_geometry(&app, &library_file_id, plate_id)
}

#[tauri::command]
pub fn get_favorite_ids(state: State<'_, LibraryState>) -> Result<Vec<String>, String> {
    state.db().with_conn(list_favorite_ids)
}

#[tauri::command]
pub fn add_favorite(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| add_favorite_row(conn, &library_file_id))
}

#[tauri::command]
pub fn remove_favorite(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| remove_favorite_row(conn, &library_file_id))
}

#[tauri::command]
pub fn is_favorite(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<bool, String> {
    state
        .db()
        .with_conn(|conn| is_favorite_row(conn, &library_file_id))
}
