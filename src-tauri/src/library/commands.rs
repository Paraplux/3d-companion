use tauri::{AppHandle, Emitter, State};

use super::models::{
    AddLibraryLocationResult, LibraryEvent, LibraryFile, LibraryLocation, LibrarySnapshot,
};
use super::state::LibraryState;

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
pub fn add_library_location(
    app: AppHandle,
    state: State<'_, LibraryState>,
    path: String,
) -> Result<AddLibraryLocationResult, String> {
    let (location, files) = state.add_location(&app, path)?;
    Ok(AddLibraryLocationResult { location, files })
}

#[tauri::command]
pub fn remove_library_location(
    app: AppHandle,
    state: State<'_, LibraryState>,
    path: String,
) -> Result<(), String> {
    state.remove_location(&app, path.clone())?;
    let _ = app.emit(
        "library://changed",
        LibraryEvent::LocationRemoved {
            location_path: path,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn scan_library_location(
    state: State<'_, LibraryState>,
    path: String,
) -> Result<Vec<LibraryFile>, String> {
    state.scan_one(&path)
}

#[tauri::command]
pub fn scan_library(state: State<'_, LibraryState>) -> Result<Vec<LibraryFile>, String> {
    state.scan_all()
}
