use tauri::{AppHandle, State};

use crate::library::models::{
    AddLibraryLocationResult, BackgroundTasksEvent, LibraryFile, LibraryLocation, LibrarySnapshot,
};
use crate::library::state::LibraryState;
use crate::repositories::collections::{
    add_file_to_collection as add_file_to_collection_row, collection_file_count,
    create_collection as create_collection_row, delete_collection as delete_collection_row,
    get_collection as get_collection_row, list_all_file_collections,
    list_collection_ids_for_file, list_collections, list_file_ids_for_collection,
    remove_file_from_collection as remove_file_from_collection_row,
    rename_collection as rename_collection_row, Collection, FileCollection,
};
use crate::repositories::favorites::{
    add_favorite as add_favorite_row, is_favorite as is_favorite_row, list_favorite_ids,
    remove_favorite as remove_favorite_row,
};
use crate::repositories::projects::{list_projects, Project};
use crate::repositories::tags::{
    add_file_tag as add_file_tag_row, create_tag as create_tag_row, delete_tag as delete_tag_row,
    list_all_file_tags, list_file_ids_for_tag, list_tag_ids_for_file, list_tags,
    remove_file_tag as remove_file_tag_row, rename_tag as rename_tag_row, FileTag, Tag,
};

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
pub fn get_collection(
    state: State<'_, LibraryState>,
    collection_id: String,
) -> Result<Option<Collection>, String> {
    state
        .db()
        .with_conn(|conn| get_collection_row(conn, &collection_id))
}

#[tauri::command]
pub fn create_collection(
    state: State<'_, LibraryState>,
    name: String,
) -> Result<Collection, String> {
    state
        .db()
        .with_conn(|conn| create_collection_row(conn, &name))
}

#[tauri::command]
pub fn rename_collection(
    state: State<'_, LibraryState>,
    collection_id: String,
    name: String,
) -> Result<Collection, String> {
    state
        .db()
        .with_conn(|conn| rename_collection_row(conn, &collection_id, &name))
}

#[tauri::command]
pub fn delete_collection(
    state: State<'_, LibraryState>,
    collection_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| delete_collection_row(conn, &collection_id))
}

#[tauri::command]
pub fn add_file_to_collection(
    state: State<'_, LibraryState>,
    library_file_id: String,
    collection_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| add_file_to_collection_row(conn, &library_file_id, &collection_id))
}

#[tauri::command]
pub fn remove_file_from_collection(
    state: State<'_, LibraryState>,
    library_file_id: String,
    collection_id: String,
) -> Result<(), String> {
    state.db().with_conn(|conn| {
        remove_file_from_collection_row(conn, &library_file_id, &collection_id)
    })
}

#[tauri::command]
pub fn get_file_collection_ids(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<Vec<String>, String> {
    state
        .db()
        .with_conn(|conn| list_collection_ids_for_file(conn, &library_file_id))
}

#[tauri::command]
pub fn get_collection_file_ids(
    state: State<'_, LibraryState>,
    collection_id: String,
) -> Result<Vec<String>, String> {
    state
        .db()
        .with_conn(|conn| list_file_ids_for_collection(conn, &collection_id))
}

#[tauri::command]
pub fn get_collection_file_count(
    state: State<'_, LibraryState>,
    collection_id: String,
) -> Result<u64, String> {
    state
        .db()
        .with_conn(|conn| collection_file_count(conn, &collection_id))
}

#[tauri::command]
pub fn get_all_file_collections(
    state: State<'_, LibraryState>,
) -> Result<Vec<FileCollection>, String> {
    state.db().with_conn(list_all_file_collections)
}

#[tauri::command]
pub fn get_tags(state: State<'_, LibraryState>) -> Result<Vec<Tag>, String> {
    state.db().with_conn(list_tags)
}

#[tauri::command]
pub fn create_tag(state: State<'_, LibraryState>, name: String) -> Result<Tag, String> {
    state.db().with_conn(|conn| create_tag_row(conn, &name))
}

#[tauri::command]
pub fn rename_tag(
    state: State<'_, LibraryState>,
    tag_id: String,
    name: String,
) -> Result<Tag, String> {
    state
        .db()
        .with_conn(|conn| rename_tag_row(conn, &tag_id, &name))
}

#[tauri::command]
pub fn delete_tag(state: State<'_, LibraryState>, tag_id: String) -> Result<(), String> {
    state.db().with_conn(|conn| delete_tag_row(conn, &tag_id))
}

#[tauri::command]
pub fn add_file_tag(
    state: State<'_, LibraryState>,
    library_file_id: String,
    tag_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| add_file_tag_row(conn, &library_file_id, &tag_id))
}

#[tauri::command]
pub fn remove_file_tag(
    state: State<'_, LibraryState>,
    library_file_id: String,
    tag_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| remove_file_tag_row(conn, &library_file_id, &tag_id))
}

#[tauri::command]
pub fn get_file_tag_ids(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<Vec<String>, String> {
    state
        .db()
        .with_conn(|conn| list_tag_ids_for_file(conn, &library_file_id))
}

#[tauri::command]
pub fn get_tag_file_ids(
    state: State<'_, LibraryState>,
    tag_id: String,
) -> Result<Vec<String>, String> {
    state
        .db()
        .with_conn(|conn| list_file_ids_for_tag(conn, &tag_id))
}

#[tauri::command]
pub fn get_all_file_tags(state: State<'_, LibraryState>) -> Result<Vec<FileTag>, String> {
    state.db().with_conn(list_all_file_tags)
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
pub fn open_in_bambu_studio(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<(), String> {
    state.open_in_bambu_studio(&library_file_id)
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
