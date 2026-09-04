use std::collections::HashSet;
use std::path::Path;

use crate::database::Database;
use crate::repositories::files::{
    delete_by_paths, find_by_content_hash, find_by_path, list_files_for_location, upsert_file,
    update_file_identity_and_path,
};
use crate::library::models::{LibraryFile, ScannedFile};
use crate::library::scan::scan_location;
use crate::library::util::{hash_file, new_id};

pub fn reconcile_location(
    db: &Database,
    location_path: &str,
) -> Result<Vec<LibraryFile>, String> {
    let scanned = scan_location(location_path)?;

    db.with_conn(|conn| {
        let mut seen_paths = HashSet::new();

        for scanned_file in &scanned {
            seen_paths.insert(scanned_file.path.clone());
            index_scanned_file(conn, scanned_file)?;
        }

        let indexed = list_files_for_location(conn, location_path)?;
        let stale_paths: Vec<String> = indexed
            .into_iter()
            .filter(|file| !seen_paths.contains(&file.path))
            .map(|file| file.path)
            .collect();

        // Remove missing physical files from the index only.
        // User data (projects, favorites, tags, notes) is intentionally kept.
        delete_by_paths(conn, &stale_paths)?;

        list_files_for_location(conn, location_path)
    })
}

fn index_scanned_file(
    conn: &rusqlite::Connection,
    scanned: &ScannedFile,
) -> Result<(), String> {
    if let Some(existing) = find_by_path(conn, &scanned.path)? {
        let content_hash = if existing.size == scanned.size
            && existing.modified_at == scanned.modified_at
            && !existing.content_hash.is_empty()
        {
            existing.content_hash.clone()
        } else {
            hash_file(Path::new(&scanned.path))?
        };

        let file = to_library_file(scanned, existing.library_file_id, content_hash);
        upsert_file(conn, &file)?;
        return Ok(());
    }

    let content_hash = hash_file(Path::new(&scanned.path))?;

    if let Some(by_hash) = find_by_content_hash(conn, &content_hash)? {
        let old_path_missing = !Path::new(&by_hash.path).exists();
        if old_path_missing {
            let file = to_library_file(scanned, by_hash.library_file_id, content_hash);
            update_file_identity_and_path(conn, &file.library_file_id, &file)?;
            return Ok(());
        }
    }

    let file = to_library_file(scanned, new_id(), content_hash);
    upsert_file(conn, &file)?;
    Ok(())
}

fn to_library_file(scanned: &ScannedFile, library_file_id: String, content_hash: String) -> LibraryFile {
    LibraryFile {
        library_file_id,
        content_hash,
        path: scanned.path.clone(),
        name: scanned.name.clone(),
        extension: scanned.extension.clone(),
        size: scanned.size,
        modified_at: scanned.modified_at,
        relative_path: scanned.relative_path.clone(),
        location_path: scanned.location_path.clone(),
    }
}
