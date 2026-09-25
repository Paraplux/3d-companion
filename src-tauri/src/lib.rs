mod database;
mod library;
mod remote;
mod repositories;

use database::Database;
use library::{
    add_favorite, add_file_tag, add_file_to_collection, add_file_to_project, add_library_location,
    create_collection, create_project, create_tag, delete_collection, delete_file_note,
    delete_project, delete_tag, get_all_file_collections, get_all_file_notes, get_all_file_projects,
    get_all_file_tags, get_background_tasks, get_collection, get_collection_file_count,
    get_collection_file_ids, get_collections, get_favorite_ids, get_file_collection_ids,
    get_file_note, get_file_project_ids, get_file_tag_ids, get_library_files, get_library_locations,
    get_library_snapshot, get_model_geometry, get_noted_file_ids, get_project,
    get_project_file_count, get_project_file_ids, get_projects, get_tag_file_ids, get_tags,
    is_favorite, open_in_bambu_studio, remove_favorite, remove_file_from_collection,
    remove_file_from_project, remove_file_tag, remove_library_location, rename_collection,
    rename_tag, scan_library, scan_library_location, search_library_files, update_project,
    upsert_file_note, LibraryState,
};
use remote::{
    delete_remote_file, get_remote_config, get_remote_files, get_remote_library,
    get_remote_thumbnail, put_remote_library, save_remote_config, test_remote_connection,
    upload_remote_file,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db = Database::open(app.handle())
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            let state = LibraryState::new(app.handle(), db)
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_library_snapshot,
            get_library_locations,
            get_library_files,
            add_library_location,
            remove_library_location,
            scan_library_location,
            scan_library,
            search_library_files,
            get_background_tasks,
            get_projects,
            get_project,
            create_project,
            update_project,
            delete_project,
            add_file_to_project,
            remove_file_from_project,
            get_file_project_ids,
            get_project_file_ids,
            get_project_file_count,
            get_all_file_projects,
            get_collections,
            get_collection,
            create_collection,
            rename_collection,
            delete_collection,
            add_file_to_collection,
            remove_file_from_collection,
            get_file_collection_ids,
            get_collection_file_ids,
            get_collection_file_count,
            get_all_file_collections,
            get_tags,
            create_tag,
            rename_tag,
            delete_tag,
            add_file_tag,
            remove_file_tag,
            get_file_tag_ids,
            get_tag_file_ids,
            get_all_file_tags,
            get_model_geometry,
            open_in_bambu_studio,
            get_favorite_ids,
            add_favorite,
            remove_favorite,
            is_favorite,
            get_file_note,
            upsert_file_note,
            delete_file_note,
            get_noted_file_ids,
            get_all_file_notes,
            get_remote_config,
            save_remote_config,
            test_remote_connection,
            get_remote_files,
            get_remote_library,
            put_remote_library,
            upload_remote_file,
            delete_remote_file,
            get_remote_thumbnail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
