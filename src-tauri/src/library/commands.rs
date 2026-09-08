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
use crate::repositories::notes::{
    delete_file_note as delete_file_note_row, get_file_note as get_file_note_row,
    list_all_file_notes, list_noted_file_ids, upsert_file_note as upsert_file_note_row, FileNote,
};
use crate::repositories::projects::{
    add_file_to_project as add_file_to_project_row, create_project as create_project_row,
    delete_project as delete_project_row, get_project as get_project_row, list_all_file_projects,
    list_file_ids_for_project, list_project_ids_for_file, list_projects,
    project_file_count, remove_file_from_project as remove_file_from_project_row,
    update_project as update_project_row, FileProject, Project,
};
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
pub fn get_project(
    state: State<'_, LibraryState>,
    project_id: String,
) -> Result<Option<Project>, String> {
    state
        .db()
        .with_conn(|conn| get_project_row(conn, &project_id))
}

#[tauri::command]
pub fn create_project(
    state: State<'_, LibraryState>,
    name: String,
    description: Option<String>,
) -> Result<Project, String> {
    state.db().with_conn(|conn| {
        create_project_row(conn, &name, description.as_deref())
    })
}

#[tauri::command]
pub fn update_project(
    state: State<'_, LibraryState>,
    project_id: String,
    name: String,
    description: Option<String>,
) -> Result<Project, String> {
    state.db().with_conn(|conn| {
        update_project_row(conn, &project_id, &name, description.as_deref())
    })
}

#[tauri::command]
pub fn delete_project(
    state: State<'_, LibraryState>,
    project_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| delete_project_row(conn, &project_id))
}

#[tauri::command]
pub fn add_file_to_project(
    state: State<'_, LibraryState>,
    library_file_id: String,
    project_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| add_file_to_project_row(conn, &library_file_id, &project_id))
}

#[tauri::command]
pub fn remove_file_from_project(
    state: State<'_, LibraryState>,
    library_file_id: String,
    project_id: String,
) -> Result<(), String> {
    state.db().with_conn(|conn| {
        remove_file_from_project_row(conn, &library_file_id, &project_id)
    })
}

#[tauri::command]
pub fn get_file_project_ids(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<Vec<String>, String> {
    state
        .db()
        .with_conn(|conn| list_project_ids_for_file(conn, &library_file_id))
}

#[tauri::command]
pub fn get_project_file_ids(
    state: State<'_, LibraryState>,
    project_id: String,
) -> Result<Vec<String>, String> {
    state
        .db()
        .with_conn(|conn| list_file_ids_for_project(conn, &project_id))
}

#[tauri::command]
pub fn get_project_file_count(
    state: State<'_, LibraryState>,
    project_id: String,
) -> Result<u64, String> {
    state
        .db()
        .with_conn(|conn| project_file_count(conn, &project_id))
}

#[tauri::command]
pub fn get_all_file_projects(
    state: State<'_, LibraryState>,
) -> Result<Vec<FileProject>, String> {
    state.db().with_conn(list_all_file_projects)
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

#[tauri::command]
pub fn get_file_note(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<Option<FileNote>, String> {
    state
        .db()
        .with_conn(|conn| get_file_note_row(conn, &library_file_id))
}

#[tauri::command]
pub fn upsert_file_note(
    state: State<'_, LibraryState>,
    library_file_id: String,
    content: String,
) -> Result<Option<FileNote>, String> {
    state
        .db()
        .with_conn(|conn| upsert_file_note_row(conn, &library_file_id, &content))
}

#[tauri::command]
pub fn delete_file_note(
    state: State<'_, LibraryState>,
    library_file_id: String,
) -> Result<(), String> {
    state
        .db()
        .with_conn(|conn| delete_file_note_row(conn, &library_file_id))
}

#[tauri::command]
pub fn get_noted_file_ids(state: State<'_, LibraryState>) -> Result<Vec<String>, String> {
    state.db().with_conn(list_noted_file_ids)
}

#[tauri::command]
pub fn get_all_file_notes(state: State<'_, LibraryState>) -> Result<Vec<FileNote>, String> {
    state.db().with_conn(list_all_file_notes)
}
