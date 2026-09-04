use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::library::analysis::thumbnail_absolute;
use crate::library::models::{AnalysisStatus, LibraryFile};
use crate::library::util::now_ms;
use crate::repositories::metadata::{parse_payload, split_payload};

#[derive(Debug, Clone)]
pub struct FileRow {
    pub library_file_id: String,
    pub content_hash: String,
    pub path: String,
    pub relative_path: String,
    pub location_path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified_at: u64,
}

fn map_file_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRow> {
    Ok(FileRow {
        library_file_id: row.get(0)?,
        content_hash: row.get(1)?,
        path: row.get(2)?,
        relative_path: row.get(3)?,
        location_path: row.get(4)?,
        name: row.get(5)?,
        extension: row.get(6)?,
        size: row.get::<_, i64>(7)? as u64,
        modified_at: row.get::<_, i64>(8)? as u64,
    })
}

fn map_library_file(
    row: &rusqlite::Row<'_>,
    thumbnails_dir: &Path,
) -> rusqlite::Result<LibraryFile> {
    let analysis_status = row
        .get::<_, Option<String>>(9)?
        .map(|value| AnalysisStatus::parse(&value))
        .unwrap_or(AnalysisStatus::Pending);
    let analysis_error: Option<String> = row.get(10)?;
    let thumbnail_relpath: Option<String> = row.get(11)?;
    let metadata_json: Option<String> = row.get(12)?;
    let payload = parse_payload(metadata_json.as_deref().unwrap_or("{}"));
    let (stl, threemf) = split_payload(payload);

    Ok(LibraryFile {
        library_file_id: row.get(0)?,
        content_hash: row.get(1)?,
        path: row.get(2)?,
        name: row.get(5)?,
        extension: row.get(6)?,
        size: row.get::<_, i64>(7)? as u64,
        modified_at: row.get::<_, i64>(8)? as u64,
        relative_path: row.get(3)?,
        location_path: row.get(4)?,
        analysis_status,
        analysis_error,
        thumbnail_path: thumbnail_relpath
            .map(|rel| thumbnail_absolute(thumbnails_dir, &rel).to_string_lossy().to_string()),
        stl,
        threemf,
    })
}

const FILE_SELECT: &str = "SELECT f.library_file_id, f.content_hash, f.path, f.relative_path,
        f.location_path, f.name, f.extension, f.size, f.modified_at,
        m.analysis_status, m.analysis_error, m.thumbnail_relpath, m.metadata_json
 FROM files f
 LEFT JOIN file_metadata m ON m.library_file_id = f.library_file_id";

pub fn list_files(conn: &Connection, thumbnails_dir: &Path) -> Result<Vec<LibraryFile>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{FILE_SELECT}
             ORDER BY f.relative_path COLLATE NOCASE ASC"
        ))
        .map_err(|error| format!("Could not list files: {error}"))?;

    let rows = statement
        .query_map([], |row| map_library_file(row, thumbnails_dir))
        .map_err(|error| format!("Could not query files: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read files: {error}"))
}

pub fn list_files_for_location(
    conn: &Connection,
    location_path: &str,
    thumbnails_dir: &Path,
) -> Result<Vec<LibraryFile>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{FILE_SELECT}
             WHERE f.location_path = ?1
             ORDER BY f.relative_path COLLATE NOCASE ASC"
        ))
        .map_err(|error| format!("Could not list location files: {error}"))?;

    let rows = statement
        .query_map(params![location_path], |row| map_library_file(row, thumbnails_dir))
        .map_err(|error| format!("Could not query location files: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read location files: {error}"))
}

pub fn get_file(
    conn: &Connection,
    library_file_id: &str,
    thumbnails_dir: &Path,
) -> Result<Option<LibraryFile>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{FILE_SELECT}
             WHERE f.library_file_id = ?1
             LIMIT 1"
        ))
        .map_err(|error| format!("Could not prepare file lookup: {error}"))?;

    let mut rows = statement
        .query_map(params![library_file_id], |row| map_library_file(row, thumbnails_dir))
        .map_err(|error| format!("Could not look up file: {error}"))?;

    rows.next()
        .transpose()
        .map_err(|error| format!("Could not read file: {error}"))
}

pub fn find_by_path(conn: &Connection, path: &str) -> Result<Option<FileRow>, String> {
    conn.query_row(
        "SELECT library_file_id, content_hash, path, relative_path, location_path,
                name, extension, size, modified_at
         FROM files
         WHERE path = ?1",
        params![path],
        map_file_row,
    )
    .optional()
    .map_err(|error| format!("Could not look up file by path: {error}"))
}

pub fn find_by_content_hash(
    conn: &Connection,
    content_hash: &str,
) -> Result<Option<FileRow>, String> {
    if content_hash.is_empty() {
        return Ok(None);
    }

    conn.query_row(
        "SELECT library_file_id, content_hash, path, relative_path, location_path,
                name, extension, size, modified_at
         FROM files
         WHERE content_hash = ?1
         LIMIT 1",
        params![content_hash],
        map_file_row,
    )
    .optional()
    .map_err(|error| format!("Could not look up file by content hash: {error}"))
}

pub fn upsert_file(conn: &Connection, file: &LibraryFile) -> Result<(), String> {
    conn.execute(
        "INSERT INTO files (
            library_file_id, content_hash, path, relative_path, location_path,
            name, extension, size, modified_at, indexed_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(path) DO UPDATE SET
            library_file_id = excluded.library_file_id,
            content_hash = excluded.content_hash,
            relative_path = excluded.relative_path,
            location_path = excluded.location_path,
            name = excluded.name,
            extension = excluded.extension,
            size = excluded.size,
            modified_at = excluded.modified_at,
            indexed_at = excluded.indexed_at",
        params![
            file.library_file_id,
            file.content_hash,
            file.path,
            file.relative_path,
            file.location_path,
            file.name,
            file.extension,
            file.size as i64,
            file.modified_at as i64,
            now_ms() as i64,
        ],
    )
    .map_err(|error| format!("Could not index file: {error}"))?;

    Ok(())
}

pub fn update_content_hash(
    conn: &Connection,
    library_file_id: &str,
    content_hash: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE files SET content_hash = ?2, indexed_at = ?3 WHERE library_file_id = ?1",
        params![library_file_id, content_hash, now_ms() as i64],
    )
    .map_err(|error| format!("Could not update content hash: {error}"))?;
    Ok(())
}

pub fn update_file_identity_and_path(
    conn: &Connection,
    library_file_id: &str,
    file: &LibraryFile,
) -> Result<(), String> {
    conn.execute(
        "UPDATE files SET
            content_hash = ?2,
            path = ?3,
            relative_path = ?4,
            location_path = ?5,
            name = ?6,
            extension = ?7,
            size = ?8,
            modified_at = ?9,
            indexed_at = ?10
         WHERE library_file_id = ?1",
        params![
            library_file_id,
            file.content_hash,
            file.path,
            file.relative_path,
            file.location_path,
            file.name,
            file.extension,
            file.size as i64,
            file.modified_at as i64,
            now_ms() as i64,
        ],
    )
    .map_err(|error| format!("Could not update indexed file: {error}"))?;

    Ok(())
}

pub fn delete_by_paths(conn: &Connection, paths: &[String]) -> Result<(), String> {
    crate::repositories::metadata::delete_metadata_for_paths(conn, paths)?;
    for path in paths {
        conn.execute("DELETE FROM files WHERE path = ?1", params![path])
            .map_err(|error| format!("Could not remove indexed file: {error}"))?;
    }
    Ok(())
}

pub fn delete_by_location_path(conn: &Connection, location_path: &str) -> Result<(), String> {
    crate::repositories::metadata::delete_metadata_for_location(conn, location_path)?;
    conn.execute(
        "DELETE FROM files WHERE location_path = ?1",
        params![location_path],
    )
    .map_err(|error| format!("Could not remove indexed files for location: {error}"))?;
    Ok(())
}

pub fn search_files(
    conn: &Connection,
    query: &str,
    thumbnails_dir: &Path,
) -> Result<Vec<LibraryFile>, String> {
    let needle = format!("%{}%", query.trim().to_lowercase());
    let mut statement = conn
        .prepare(&format!(
            "{FILE_SELECT}
             WHERE lower(f.name) LIKE ?1
                OR lower(f.extension) LIKE ?1
                OR lower(f.relative_path) LIKE ?1
                OR lower(f.path) LIKE ?1
             ORDER BY f.name COLLATE NOCASE ASC
             LIMIT 500"
        ))
        .map_err(|error| format!("Could not search files: {error}"))?;

    let rows = statement
        .query_map(params![needle], |row| map_library_file(row, thumbnails_dir))
        .map_err(|error| format!("Could not run file search: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read search results: {error}"))
}

pub fn files_needing_analysis(conn: &Connection) -> Result<Vec<(String, String, String, String)>, String> {
    let mut statement = conn
        .prepare(
            "SELECT f.library_file_id, f.path, f.extension, f.content_hash, f.name
             FROM files f
             LEFT JOIN file_metadata m ON m.library_file_id = f.library_file_id
             WHERE m.library_file_id IS NULL
                OR m.analysis_status IN ('pending', 'error')
                OR m.analysis_version != ?1
                OR (m.analysis_status = 'ready' AND m.content_hash != f.content_hash)
                OR f.content_hash = ''",
        )
        .map_err(|error| format!("Could not query analysis queue: {error}"))?;

    let rows = statement
        .query_map(
            params![crate::library::models::ANALYSIS_VERSION],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .map_err(|error| format!("Could not read analysis queue: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not collect analysis queue: {error}"))
}
