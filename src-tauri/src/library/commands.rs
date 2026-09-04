use tauri::{AppHandle, State};

use crate::library::models::{AddLibraryLocationResult, LibraryFile, LibraryLocation, LibrarySnapshot};
use crate::library::state::LibraryState;
use crate::repositories::collections::{list_collections, Collection};
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
    state: State<'_, LibraryState>,
    path: String,
) -> Result<Vec<LibraryFile>, String> {
    state.rescan_location(&path)
}

#[tauri::command]
pub fn scan_library(state: State<'_, LibraryState>) -> Result<Vec<LibraryFile>, String> {
    state.rescan_all()
}

#[tauri::command]
pub fn search_library_files(
    state: State<'_, LibraryState>,
    query: String,
) -> Result<Vec<LibraryFile>, String> {
    state.search_files(&query)
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
