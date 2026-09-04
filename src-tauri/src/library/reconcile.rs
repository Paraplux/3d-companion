use std::collections::HashSet;
use std::path::Path;

use crate::database::Database;
use crate::library::analysis::mark_pending;
use crate::library::models::{AnalysisStatus, LibraryFile, ScannedFile};
use crate::library::util::new_id;
use crate::repositories::files::{
    delete_by_paths, find_by_path, list_files_for_location, upsert_file,
};
use crate::repositories::metadata::find_metadata;

/// Files that should be hashed / analyzed in the background after reconcile.
#[derive(Debug, Clone)]
pub struct AnalysisRequest {
    pub library_file_id: String,
    pub path: String,
    pub extension: String,
    pub name: String,
}

pub fn reconcile_location(
    db: &Database,
    location_path: &str,
    thumbnails_dir: &Path,
) -> Result<(Vec<LibraryFile>, Vec<AnalysisRequest>), String> {
    let scanned = crate::library::scan::scan_location(location_path)?;
    let mut requests = Vec::new();

    db.with_conn(|conn| {
        let mut seen_paths = HashSet::new();

        for scanned_file in &scanned {
            seen_paths.insert(scanned_file.path.clone());
            if let Some(request) = index_scanned_file(conn, scanned_file)? {
                requests.push(request);
            }
        }

        let indexed = list_files_for_location(conn, location_path, thumbnails_dir)?;
        let stale_paths: Vec<String> = indexed
            .into_iter()
            .filter(|file| !seen_paths.contains(&file.path))
            .map(|file| file.path)
            .collect();

        // Remove missing physical files from the index only.
        // User data (projects, favorites, tags, notes) is intentionally kept.
        delete_by_paths(conn, &stale_paths)?;

        let files = list_files_for_location(conn, location_path, thumbnails_dir)?;
        Ok((files, requests))
    })
}

fn index_scanned_file(
    conn: &rusqlite::Connection,
    scanned: &ScannedFile,
) -> Result<Option<AnalysisRequest>, String> {
    if let Some(existing) = find_by_path(conn, &scanned.path)? {
        let unchanged = existing.size == scanned.size
            && existing.modified_at == scanned.modified_at
            && !existing.content_hash.is_empty();

        let file = to_library_file(
            scanned,
            existing.library_file_id.clone(),
            existing.content_hash.clone(),
        );
        upsert_file(conn, &file)?;

        if unchanged {
            let needs = match find_metadata(conn, &existing.library_file_id)? {
                Some(meta) => crate::repositories::metadata::needs_analysis(&meta, &existing.content_hash),
                None => true,
            };
            if needs {
                mark_pending(conn, &existing.library_file_id, &existing.content_hash)?;
                return Ok(Some(AnalysisRequest {
                    library_file_id: existing.library_file_id,
                    path: scanned.path.clone(),
                    extension: scanned.extension.clone(),
                    name: scanned.name.clone(),
                }));
            }
            return Ok(None);
        }

        // Content likely changed — keep library_file_id, invalidate derived cache.
        mark_pending(conn, &existing.library_file_id, &existing.content_hash)?;
        return Ok(Some(AnalysisRequest {
            library_file_id: existing.library_file_id,
            path: scanned.path.clone(),
            extension: scanned.extension.clone(),
            name: scanned.name.clone(),
        }));
    }

    let library_file_id = new_id();
    let file = to_library_file(scanned, library_file_id.clone(), String::new());
    upsert_file(conn, &file)?;
    mark_pending(conn, &library_file_id, "")?;

    Ok(Some(AnalysisRequest {
        library_file_id,
        path: scanned.path.clone(),
        extension: scanned.extension.clone(),
        name: scanned.name.clone(),
    }))
}

fn to_library_file(
    scanned: &ScannedFile,
    library_file_id: String,
    content_hash: String,
) -> LibraryFile {
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
        analysis_status: AnalysisStatus::Pending,
        analysis_error: None,
        thumbnail_path: None,
        stl: None,
        threemf: None,
    }
}
