mod library;

use library::{
    add_library_location, get_library_locations, get_library_snapshot, remove_library_location,
    scan_library, scan_library_location, LibraryState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(LibraryState::new())
        .invoke_handler(tauri::generate_handler![
            get_library_snapshot,
            get_library_locations,
            add_library_location,
            remove_library_location,
            scan_library_location,
            scan_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
