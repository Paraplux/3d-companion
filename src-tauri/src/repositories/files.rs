use rusqlite::{params, Connection, OptionalExtension};

use crate::library::models::LibraryFile;
use crate::library::util::now_ms;

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

impl From<FileRow> for LibraryFile {
    fn from(row: FileRow) -> Self {
        Self {
            library_file_id: row.library_file_id,
            content_hash: row.content_hash,
            path: row.path,
            name: row.name,
            extension: row.extension,
            size: row.size,
            modified_at: row.modified_at,
            relative_path: row.relative_path,
            location_path: row.location_path,
        }
    }
}

fn map_file(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileRow> {
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

pub fn list_files(conn: &Connection) -> Result<Vec<LibraryFile>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, content_hash, path, relative_path, location_path,
                    name, extension, size, modified_at
             FROM files
             ORDER BY relative_path COLLATE NOCASE ASC",
        )
        .map_err(|error| format!("Could not list files: {error}"))?;

    let rows = statement
        .query_map([], map_file)
        .map_err(|error| format!("Could not query files: {error}"))?;

    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read files: {error}"))?
        .into_iter()
        .map(LibraryFile::from)
        .collect())
}

pub fn list_files_for_location(
    conn: &Connection,
    location_path: &str,
) -> Result<Vec<LibraryFile>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, content_hash, path, relative_path, location_path,
                    name, extension, size, modified_at
             FROM files
             WHERE location_path = ?1
             ORDER BY relative_path COLLATE NOCASE ASC",
        )
        .map_err(|error| format!("Could not list location files: {error}"))?;

    let rows = statement
        .query_map(params![location_path], map_file)
        .map_err(|error| format!("Could not query location files: {error}"))?;

    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read location files: {error}"))?
        .into_iter()
        .map(LibraryFile::from)
        .collect())
}

pub fn find_by_path(conn: &Connection, path: &str) -> Result<Option<FileRow>, String> {
    conn.query_row(
        "SELECT library_file_id, content_hash, path, relative_path, location_path,
                name, extension, size, modified_at
         FROM files
         WHERE path = ?1",
        params![path],
        map_file,
    )
    .optional()
    .map_err(|error| format!("Could not look up file by path: {error}"))
}

pub fn find_by_content_hash(
    conn: &Connection,
    content_hash: &str,
) -> Result<Option<FileRow>, String> {
    conn.query_row(
        "SELECT library_file_id, content_hash, path, relative_path, location_path,
                name, extension, size, modified_at
         FROM files
         WHERE content_hash = ?1
         LIMIT 1",
        params![content_hash],
        map_file,
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
    for path in paths {
        conn.execute("DELETE FROM files WHERE path = ?1", params![path])
            .map_err(|error| format!("Could not remove indexed file: {error}"))?;
    }
    Ok(())
}

pub fn delete_by_location_path(conn: &Connection, location_path: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM files WHERE location_path = ?1",
        params![location_path],
    )
    .map_err(|error| format!("Could not remove indexed files for location: {error}"))?;
    Ok(())
}

pub fn search_files(conn: &Connection, query: &str) -> Result<Vec<LibraryFile>, String> {
    let needle = format!("%{}%", query.trim().to_lowercase());
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, content_hash, path, relative_path, location_path,
                    name, extension, size, modified_at
             FROM files
             WHERE lower(name) LIKE ?1
                OR lower(extension) LIKE ?1
                OR lower(relative_path) LIKE ?1
                OR lower(path) LIKE ?1
             ORDER BY name COLLATE NOCASE ASC
             LIMIT 500",
        )
        .map_err(|error| format!("Could not search files: {error}"))?;

    let rows = statement
        .query_map(params![needle], map_file)
        .map_err(|error| format!("Could not run file search: {error}"))?;

    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read search results: {error}"))?
        .into_iter()
        .map(LibraryFile::from)
        .collect())
}
