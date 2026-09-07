mod database;
mod library;
mod repositories;

use database::Database;
use library::{
    add_favorite, add_library_location, get_background_tasks, get_collections, get_favorite_ids,
    get_library_files, get_library_locations, get_library_snapshot, get_model_geometry,
    get_projects, get_tags, is_favorite, remove_favorite, remove_library_location, scan_library,
    scan_library_location, search_library_files, LibraryState,
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
            get_collections,
            get_tags,
            get_model_geometry,
            get_favorite_ids,
            add_favorite,
            remove_favorite,
            is_favorite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
