use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::library::util::now_ms;

const MAX_NOTE_LENGTH: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNote {
    pub library_file_id: String,
    pub content: String,
    pub updated_at: u64,
}

fn normalize_content(content: &str) -> Result<Option<String>, String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > MAX_NOTE_LENGTH {
        return Err(format!(
            "Notes must be {MAX_NOTE_LENGTH} characters or fewer."
        ));
    }
    Ok(Some(trimmed.to_string()))
}

pub fn get_file_note(
    conn: &Connection,
    library_file_id: &str,
) -> Result<Option<FileNote>, String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }

    conn.query_row(
        "SELECT library_file_id, content, updated_at
         FROM file_notes
         WHERE library_file_id = ?1",
        params![library_file_id],
        |row| {
            Ok(FileNote {
                library_file_id: row.get(0)?,
                content: row.get(1)?,
                updated_at: row.get::<_, i64>(2)? as u64,
            })
        },
    )
    .optional()
    .map_err(|error| format!("Could not read note: {error}"))
}

/// Insert or update a note. Empty/whitespace content deletes the note instead.
/// Returns the saved note, or `None` when the note was removed.
pub fn upsert_file_note(
    conn: &Connection,
    library_file_id: &str,
    content: &str,
) -> Result<Option<FileNote>, String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }

    let Some(normalized) = normalize_content(content)? else {
        delete_file_note(conn, library_file_id)?;
        return Ok(None);
    };

    let now = now_ms();
    conn.execute(
        "INSERT INTO file_notes (library_file_id, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(library_file_id) DO UPDATE SET
           content = excluded.content,
           updated_at = excluded.updated_at",
        params![library_file_id, normalized, now as i64],
    )
    .map_err(|error| format!("Could not save note: {error}"))?;

    get_file_note(conn, library_file_id)?
        .ok_or_else(|| "Saved note could not be loaded.".to_string())
        .map(Some)
}

pub fn delete_file_note(conn: &Connection, library_file_id: &str) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }

    conn.execute(
        "DELETE FROM file_notes WHERE library_file_id = ?1",
        params![library_file_id],
    )
    .map_err(|error| format!("Could not delete note: {error}"))?;

    Ok(())
}

/// Library file ids that currently have a note (for list indicators).
pub fn list_noted_file_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id
             FROM file_notes
             ORDER BY library_file_id ASC",
        )
        .map_err(|error| format!("Could not list noted files: {error}"))?;

    let rows = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| format!("Could not query noted files: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read noted files: {error}"))
}

/// All notes in one query (content available for future search indexing).
pub fn list_all_file_notes(conn: &Connection) -> Result<Vec<FileNote>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, content, updated_at
             FROM file_notes
             ORDER BY library_file_id ASC",
        )
        .map_err(|error| format!("Could not list notes: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(FileNote {
                library_file_id: row.get(0)?,
                content: row.get(1)?,
                updated_at: row.get::<_, i64>(2)? as u64,
            })
        })
        .map_err(|error| format!("Could not query notes: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read notes: {error}"))
}

pub fn delete_notes_for_paths(conn: &Connection, paths: &[String]) -> Result<(), String> {
    for path in paths {
        conn.execute(
            "DELETE FROM file_notes
             WHERE library_file_id IN (
                SELECT library_file_id FROM files WHERE path = ?1
             )",
            params![path],
        )
        .map_err(|error| format!("Could not delete notes for path: {error}"))?;
    }
    Ok(())
}

pub fn delete_notes_for_location(conn: &Connection, location_path: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM file_notes
         WHERE library_file_id IN (
            SELECT library_file_id FROM files WHERE location_path = ?1
         )",
        params![location_path],
    )
    .map_err(|error| format!("Could not delete notes for location: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE file_notes (
                library_file_id TEXT PRIMARY KEY NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
             );",
        )
        .expect("create file_notes");
        conn
    }

    #[test]
    fn upsert_creates_and_updates() {
        let conn = setup();
        let created = upsert_file_note(&conn, "file-a", "  Print with PLA Silk  ")
            .unwrap()
            .unwrap();
        assert_eq!(created.library_file_id, "file-a");
        assert_eq!(created.content, "Print with PLA Silk");

        let updated = upsert_file_note(&conn, "file-a", "Use 0.6 nozzle")
            .unwrap()
            .unwrap();
        assert_eq!(updated.content, "Use 0.6 nozzle");
        assert_eq!(list_all_file_notes(&conn).unwrap().len(), 1);
    }

    #[test]
    fn empty_upsert_deletes_note() {
        let conn = setup();
        upsert_file_note(&conn, "file-a", "Keep").unwrap();
        let cleared = upsert_file_note(&conn, "file-a", "   ").unwrap();
        assert!(cleared.is_none());
        assert!(get_file_note(&conn, "file-a").unwrap().is_none());
        assert!(list_noted_file_ids(&conn).unwrap().is_empty());
    }

    #[test]
    fn delete_is_idempotent() {
        let conn = setup();
        upsert_file_note(&conn, "file-a", "Note").unwrap();
        delete_file_note(&conn, "file-a").unwrap();
        delete_file_note(&conn, "file-a").unwrap();
        assert!(get_file_note(&conn, "file-a").unwrap().is_none());
    }

    #[test]
    fn notes_keyed_by_library_file_id_only() {
        let conn = setup();
        upsert_file_note(&conn, "stable-id", "Survives path/hash changes").unwrap();
        assert_eq!(
            get_file_note(&conn, "stable-id")
                .unwrap()
                .unwrap()
                .content,
            "Survives path/hash changes"
        );
        assert!(list_noted_file_ids(&conn).unwrap().contains(&"stable-id".to_string()));
    }

    #[test]
    fn rejects_oversized_content() {
        let conn = setup();
        let huge = "x".repeat(MAX_NOTE_LENGTH + 1);
        let err = upsert_file_note(&conn, "file-a", &huge).unwrap_err();
        assert!(err.contains("characters or fewer"));
    }

    #[test]
    fn delete_notes_for_paths_cleans_index_removal() {
        let conn = setup();
        conn.execute_batch(
            "CREATE TABLE files (
                library_file_id TEXT PRIMARY KEY NOT NULL,
                path TEXT NOT NULL UNIQUE
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO files (library_file_id, path) VALUES ('a', '/a.stl'), ('b', '/b.stl')",
            [],
        )
        .unwrap();
        upsert_file_note(&conn, "a", "A").unwrap();
        upsert_file_note(&conn, "b", "B").unwrap();
        delete_notes_for_paths(&conn, &["/a.stl".to_string()]).unwrap();
        assert!(get_file_note(&conn, "a").unwrap().is_none());
        assert!(get_file_note(&conn, "b").unwrap().is_some());
    }
}
