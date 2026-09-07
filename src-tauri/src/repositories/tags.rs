use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::library::util::{new_id, now_ms};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub file_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTag {
    pub library_file_id: String,
    pub tag_id: String,
}

fn normalize_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("A tag name is required.".to_string());
    }
    if trimmed.len() > 64 {
        return Err("Tag names must be 64 characters or fewer.".to_string());
    }
    Ok(trimmed.to_string())
}

fn map_tag(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get::<_, i64>(2)? as u64,
        file_count: row.get::<_, i64>(3)? as u64,
    })
}

const TAG_SELECT: &str = "SELECT t.id, t.name, t.created_at,
        COUNT(ft.library_file_id) AS file_count
 FROM tags t
 LEFT JOIN file_tags ft ON ft.tag_id = t.id";

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{TAG_SELECT}
             GROUP BY t.id
             ORDER BY t.name COLLATE NOCASE ASC"
        ))
        .map_err(|error| format!("Could not list tags: {error}"))?;

    let rows = statement
        .query_map([], map_tag)
        .map_err(|error| format!("Could not query tags: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read tags: {error}"))
}

pub fn get_tag(conn: &Connection, tag_id: &str) -> Result<Option<Tag>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{TAG_SELECT}
             WHERE t.id = ?1
             GROUP BY t.id"
        ))
        .map_err(|error| format!("Could not prepare tag lookup: {error}"))?;

    statement
        .query_row(params![tag_id], map_tag)
        .optional()
        .map_err(|error| format!("Could not read tag: {error}"))
}

pub fn find_tag_by_name(conn: &Connection, name: &str) -> Result<Option<Tag>, String> {
    let normalized = normalize_name(name)?;
    let mut statement = conn
        .prepare(&format!(
            "{TAG_SELECT}
             WHERE t.name = ?1 COLLATE NOCASE
             GROUP BY t.id"
        ))
        .map_err(|error| format!("Could not prepare tag name lookup: {error}"))?;

    statement
        .query_row(params![normalized], map_tag)
        .optional()
        .map_err(|error| format!("Could not look up tag: {error}"))
}

/// Create a tag, or return the existing one when the name already matches
/// case-insensitively (PLA == pla).
pub fn create_tag(conn: &Connection, name: &str) -> Result<Tag, String> {
    let normalized = normalize_name(name)?;

    if let Some(existing) = find_tag_by_name(conn, &normalized)? {
        return Ok(existing);
    }

    let id = new_id();
    let created_at = now_ms();
    conn.execute(
        "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, normalized, created_at as i64],
    )
    .map_err(|error| format!("Could not create tag: {error}"))?;

    get_tag(conn, &id)?.ok_or_else(|| "Created tag could not be loaded.".to_string())
}

pub fn rename_tag(conn: &Connection, tag_id: &str, name: &str) -> Result<Tag, String> {
    let normalized = normalize_name(name)?;

    let current = get_tag(conn, tag_id)?
        .ok_or_else(|| "That tag no longer exists.".to_string())?;

    if let Some(existing) = find_tag_by_name(conn, &normalized)? {
        if existing.id != tag_id {
            return Err("A tag with that name already exists.".to_string());
        }
        return Ok(current);
    }

    conn.execute(
        "UPDATE tags SET name = ?2 WHERE id = ?1",
        params![tag_id, normalized],
    )
    .map_err(|error| format!("Could not rename tag: {error}"))?;

    get_tag(conn, tag_id)?.ok_or_else(|| "Renamed tag could not be loaded.".to_string())
}

/// Delete a tag and cascade its file_tags relations. Files are never deleted.
pub fn delete_tag(conn: &Connection, tag_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
        .map_err(|error| format!("Could not delete tag: {error}"))?;
    Ok(())
}

pub fn add_file_tag(
    conn: &Connection,
    library_file_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }
    if tag_id.trim().is_empty() {
        return Err("A tag id is required.".to_string());
    }

    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM tags WHERE id = ?1 LIMIT 1",
            params![tag_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Could not verify tag: {error}"))?;
    if exists.is_none() {
        return Err("That tag no longer exists.".to_string());
    }

    conn.execute(
        "INSERT OR IGNORE INTO file_tags (library_file_id, tag_id)
         VALUES (?1, ?2)",
        params![library_file_id, tag_id],
    )
    .map_err(|error| format!("Could not add tag to file: {error}"))?;

    Ok(())
}

pub fn remove_file_tag(
    conn: &Connection,
    library_file_id: &str,
    tag_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }
    if tag_id.trim().is_empty() {
        return Err("A tag id is required.".to_string());
    }

    conn.execute(
        "DELETE FROM file_tags WHERE library_file_id = ?1 AND tag_id = ?2",
        params![library_file_id, tag_id],
    )
    .map_err(|error| format!("Could not remove tag from file: {error}"))?;

    Ok(())
}

pub fn list_tag_ids_for_file(
    conn: &Connection,
    library_file_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT tag_id
             FROM file_tags
             WHERE library_file_id = ?1
             ORDER BY tag_id ASC",
        )
        .map_err(|error| format!("Could not list file tags: {error}"))?;

    let rows = statement
        .query_map(params![library_file_id], |row| row.get(0))
        .map_err(|error| format!("Could not query file tags: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read file tags: {error}"))
}

pub fn list_file_ids_for_tag(conn: &Connection, tag_id: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id
             FROM file_tags
             WHERE tag_id = ?1
             ORDER BY library_file_id ASC",
        )
        .map_err(|error| format!("Could not list tagged files: {error}"))?;

    let rows = statement
        .query_map(params![tag_id], |row| row.get(0))
        .map_err(|error| format!("Could not query tagged files: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read tagged files: {error}"))
}

/// All file↔tag relations in one query (avoids N+1 on the Library).
pub fn list_all_file_tags(conn: &Connection) -> Result<Vec<FileTag>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, tag_id
             FROM file_tags
             ORDER BY library_file_id ASC, tag_id ASC",
        )
        .map_err(|error| format!("Could not list file tags: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(FileTag {
                library_file_id: row.get(0)?,
                tag_id: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query file tags: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read file tags: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE tags (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL
             );
             CREATE UNIQUE INDEX idx_tags_name_nocase ON tags(name COLLATE NOCASE);
             CREATE TABLE file_tags (
                library_file_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (library_file_id, tag_id),
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
             );",
        )
        .expect("create tags schema");
        conn
    }

    #[test]
    fn create_tag_and_list() {
        let conn = setup();
        let tag = create_tag(&conn, "  PLA  ").unwrap();
        assert_eq!(tag.name, "PLA");
        assert_eq!(tag.file_count, 0);

        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].id, tag.id);
    }

    #[test]
    fn create_tag_is_case_insensitive_unique() {
        let conn = setup();
        let first = create_tag(&conn, "PLA").unwrap();
        let second = create_tag(&conn, "pla").unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(list_tags(&conn).unwrap().len(), 1);
    }

    #[test]
    fn rename_tag_rejects_case_insensitive_conflict() {
        let conn = setup();
        let pla = create_tag(&conn, "PLA").unwrap();
        let petg = create_tag(&conn, "PETG").unwrap();
        let err = rename_tag(&conn, &petg.id, "pla").unwrap_err();
        assert!(err.contains("already exists"));
        assert_eq!(get_tag(&conn, &pla.id).unwrap().unwrap().name, "PLA");
    }

    #[test]
    fn rename_tag_updates_name() {
        let conn = setup();
        let tag = create_tag(&conn, "Dragon").unwrap();
        let renamed = rename_tag(&conn, &tag.id, "Dragons").unwrap();
        assert_eq!(renamed.name, "Dragons");
        assert_eq!(renamed.id, tag.id);
    }

    #[test]
    fn delete_tag_cascades_relations_not_files() {
        let conn = setup();
        let tag = create_tag(&conn, "Figurine").unwrap();
        add_file_tag(&conn, "file-a", &tag.id).unwrap();
        delete_tag(&conn, &tag.id).unwrap();
        assert!(list_tags(&conn).unwrap().is_empty());
        assert!(list_all_file_tags(&conn).unwrap().is_empty());
    }

    #[test]
    fn add_file_tag_is_idempotent_and_multi_tag() {
        let conn = setup();
        let pla = create_tag(&conn, "PLA").unwrap();
        let dragon = create_tag(&conn, "Dragon").unwrap();

        add_file_tag(&conn, "file-a", &pla.id).unwrap();
        add_file_tag(&conn, "file-a", &pla.id).unwrap();
        add_file_tag(&conn, "file-a", &dragon.id).unwrap();

        let tags = list_tag_ids_for_file(&conn, "file-a").unwrap();
        assert_eq!(tags.len(), 2);
        assert!(tags.contains(&pla.id));
        assert!(tags.contains(&dragon.id));

        let files = list_file_ids_for_tag(&conn, &pla.id).unwrap();
        assert_eq!(files, vec!["file-a".to_string()]);

        let pla_listed = get_tag(&conn, &pla.id).unwrap().unwrap();
        assert_eq!(pla_listed.file_count, 1);
    }

    #[test]
    fn remove_file_tag_is_idempotent() {
        let conn = setup();
        let tag = create_tag(&conn, "Bambu").unwrap();
        add_file_tag(&conn, "file-a", &tag.id).unwrap();
        remove_file_tag(&conn, "file-a", &tag.id).unwrap();
        remove_file_tag(&conn, "file-a", &tag.id).unwrap();
        assert!(list_tag_ids_for_file(&conn, "file-a").unwrap().is_empty());
        assert!(list_tag_ids_for_file(&conn, "file-none").unwrap().is_empty());
    }

    #[test]
    fn file_tags_survive_without_files_row() {
        let conn = setup();
        let tag = create_tag(&conn, "Orphan").unwrap();
        add_file_tag(&conn, "missing-file-id", &tag.id).unwrap();
        assert_eq!(
            list_file_ids_for_tag(&conn, &tag.id).unwrap(),
            vec!["missing-file-id".to_string()]
        );
    }
}
