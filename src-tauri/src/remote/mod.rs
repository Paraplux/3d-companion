mod cache;
mod client;
mod commands;
mod config;
mod imports;

pub use commands::{
    analyze_cached_remote_file, backfill_remote_thumbnails, cache_remote_file, clear_remote_cache,
    delete_remote_file, finalize_import_candidate, get_import_preview, get_remote_cache_stats,
    get_remote_config, get_remote_files, get_remote_library, get_remote_model_geometry,
    get_remote_thumbnail, list_import_candidates, open_remote_in_bambu_studio,
    prepare_remote_file_preview, purge_remote_cache, put_remote_library, rename_remote_file,
    replace_remote_file, save_remote_config, save_remote_file, test_remote_connection,
    upload_remote_file,
};

/// Run expired-cache cleanup (startup / after TTL change). Best-effort; ignores errors.
pub fn run_startup_cache_gc(app: &tauri::AppHandle) {
    let _ = commands::purge_remote_cache_internal(app);
}
