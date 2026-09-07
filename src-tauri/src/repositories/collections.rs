use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::library::util::{new_id, now_ms};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub file_count: u64,
    /// Up to four library file ids for thumbnail previews (existing files preferred).
    pub preview_file_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCollection {
    pub library_file_id: String,
    pub collection_id: String,
}

fn normalize_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("A collection name is required.".to_string());
    }
    if trimmed.len() > 80 {
        return Err("Collection names must be 80 characters or fewer.".to_string());
    }
    Ok(trimmed.to_string())
}

fn map_collection(row: &rusqlite::Row<'_>) -> rusqlite::Result<Collection> {
    Ok(Collection {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get::<_, i64>(2)? as u64,
        updated_at: row.get::<_, i64>(3)? as u64,
        file_count: row.get::<_, i64>(4)? as u64,
        preview_file_ids: Vec::new(),
    })
}

const COLLECTION_SELECT: &str = "SELECT c.id, c.name, c.created_at, c.updated_at,
        COUNT(cf.library_file_id) AS file_count
 FROM collections c
 LEFT JOIN collection_files cf ON cf.collection_id = c.id";

fn load_previews(conn: &Connection) -> Result<HashMap<String, Vec<String>>, String> {
    let mut statement = conn
        .prepare(
            "SELECT collection_id, library_file_id FROM (
                SELECT cf.collection_id AS collection_id,
                       cf.library_file_id AS library_file_id,
                       ROW_NUMBER() OVER (
                           PARTITION BY cf.collection_id
                           ORDER BY
                             CASE
                               WHEN m.thumbnail_relpath IS NOT NULL
                                    AND length(trim(m.thumbnail_relpath)) > 0
                               THEN 0 ELSE 1
                             END,
                             COALESCE(f.name, cf.library_file_id) COLLATE NOCASE ASC
                       ) AS rn
                FROM collection_files cf
                LEFT JOIN files f ON f.library_file_id = cf.library_file_id
                LEFT JOIN file_metadata m ON m.library_file_id = cf.library_file_id
             )
             WHERE rn <= 4
             ORDER BY collection_id ASC, rn ASC",
        )
        .map_err(|error| format!("Could not list collection previews: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("Could not query collection previews: {error}"))?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (collection_id, library_file_id) =
            row.map_err(|error| format!("Could not read collection preview: {error}"))?;
        map.entry(collection_id)
            .or_default()
            .push(library_file_id);
    }
    Ok(map)
}

fn attach_previews(
    mut collections: Vec<Collection>,
    previews: &HashMap<String, Vec<String>>,
) -> Vec<Collection> {
    for collection in &mut collections {
        if let Some(ids) = previews.get(&collection.id) {
            collection.preview_file_ids = ids.clone();
        }
    }
    collections
}

pub fn list_collections(conn: &Connection) -> Result<Vec<Collection>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{COLLECTION_SELECT}
             GROUP BY c.id
             ORDER BY c.name COLLATE NOCASE ASC"
        ))
        .map_err(|error| format!("Could not list collections: {error}"))?;

    let rows = statement
        .query_map([], map_collection)
        .map_err(|error| format!("Could not query collections: {error}"))?;

    let collections = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read collections: {error}"))?;

    let previews = load_previews(conn)?;
    Ok(attach_previews(collections, &previews))
}

pub fn get_collection(conn: &Connection, collection_id: &str) -> Result<Option<Collection>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{COLLECTION_SELECT}
             WHERE c.id = ?1
             GROUP BY c.id"
        ))
        .map_err(|error| format!("Could not prepare collection lookup: {error}"))?;

    let collection = statement
        .query_row(params![collection_id], map_collection)
        .optional()
        .map_err(|error| format!("Could not read collection: {error}"))?;

    let Some(mut collection) = collection else {
        return Ok(None);
    };

    let previews = load_previews(conn)?;
    if let Some(ids) = previews.get(&collection.id) {
        collection.preview_file_ids = ids.clone();
    }
    Ok(Some(collection))
}

pub fn find_collection_by_name(conn: &Connection, name: &str) -> Result<Option<Collection>, String> {
    let normalized = normalize_name(name)?;
    let mut statement = conn
        .prepare(&format!(
            "{COLLECTION_SELECT}
             WHERE c.name = ?1 COLLATE NOCASE
             GROUP BY c.id"
        ))
        .map_err(|error| format!("Could not prepare collection name lookup: {error}"))?;

    let collection = statement
        .query_row(params![normalized], map_collection)
        .optional()
        .map_err(|error| format!("Could not look up collection: {error}"))?;

    Ok(collection)
}

/// Create a collection. Case-insensitive duplicate names are rejected.
pub fn create_collection(conn: &Connection, name: &str) -> Result<Collection, String> {
    let normalized = normalize_name(name)?;

    if find_collection_by_name(conn, &normalized)?.is_some() {
        return Err("A collection with that name already exists.".to_string());
    }

    let id = new_id();
    let now = now_ms();
    conn.execute(
        "INSERT INTO collections (id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, normalized, now as i64, now as i64],
    )
    .map_err(|error| {
        let message = error.to_string();
        if message.contains("UNIQUE") || message.contains("unique") {
            "A collection with that name already exists.".to_string()
        } else {
            format!("Could not create collection: {error}")
        }
    })?;

    get_collection(conn, &id)?.ok_or_else(|| "Created collection could not be loaded.".to_string())
}

pub fn rename_collection(
    conn: &Connection,
    collection_id: &str,
    name: &str,
) -> Result<Collection, String> {
    let normalized = normalize_name(name)?;

    let current = get_collection(conn, collection_id)?
        .ok_or_else(|| "That collection no longer exists.".to_string())?;

    if let Some(existing) = find_collection_by_name(conn, &normalized)? {
        if existing.id != collection_id {
            return Err("A collection with that name already exists.".to_string());
        }
        return Ok(current);
    }

    let now = now_ms();
    conn.execute(
        "UPDATE collections SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![collection_id, normalized, now as i64],
    )
    .map_err(|error| {
        let message = error.to_string();
        if message.contains("UNIQUE") || message.contains("unique") {
            "A collection with that name already exists.".to_string()
        } else {
            format!("Could not rename collection: {error}")
        }
    })?;

    get_collection(conn, collection_id)?
        .ok_or_else(|| "Renamed collection could not be loaded.".to_string())
}

/// Delete a collection and cascade its collection_files relations. Files are never deleted.
pub fn delete_collection(conn: &Connection, collection_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM collections WHERE id = ?1", params![collection_id])
        .map_err(|error| format!("Could not delete collection: {error}"))?;
    Ok(())
}

pub fn add_file_to_collection(
    conn: &Connection,
    library_file_id: &str,
    collection_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }
    if collection_id.trim().is_empty() {
        return Err("A collection id is required.".to_string());
    }

    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM collections WHERE id = ?1 LIMIT 1",
            params![collection_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Could not verify collection: {error}"))?;
    if exists.is_none() {
        return Err("That collection no longer exists.".to_string());
    }

    conn.execute(
        "INSERT OR IGNORE INTO collection_files (collection_id, library_file_id)
         VALUES (?1, ?2)",
        params![collection_id, library_file_id],
    )
    .map_err(|error| format!("Could not add file to collection: {error}"))?;

    let now = now_ms();
    let _ = conn.execute(
        "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
        params![collection_id, now as i64],
    );

    Ok(())
}

pub fn remove_file_from_collection(
    conn: &Connection,
    library_file_id: &str,
    collection_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }
    if collection_id.trim().is_empty() {
        return Err("A collection id is required.".to_string());
    }

    conn.execute(
        "DELETE FROM collection_files
         WHERE collection_id = ?1 AND library_file_id = ?2",
        params![collection_id, library_file_id],
    )
    .map_err(|error| format!("Could not remove file from collection: {error}"))?;

    let now = now_ms();
    let _ = conn.execute(
        "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
        params![collection_id, now as i64],
    );

    Ok(())
}

pub fn list_collection_ids_for_file(
    conn: &Connection,
    library_file_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT collection_id
             FROM collection_files
             WHERE library_file_id = ?1
             ORDER BY collection_id ASC",
        )
        .map_err(|error| format!("Could not list file collections: {error}"))?;

    let rows = statement
        .query_map(params![library_file_id], |row| row.get(0))
        .map_err(|error| format!("Could not query file collections: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read file collections: {error}"))
}

pub fn list_file_ids_for_collection(
    conn: &Connection,
    collection_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id
             FROM collection_files
             WHERE collection_id = ?1
             ORDER BY library_file_id ASC",
        )
        .map_err(|error| format!("Could not list collection files: {error}"))?;

    let rows = statement
        .query_map(params![collection_id], |row| row.get(0))
        .map_err(|error| format!("Could not query collection files: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read collection files: {error}"))
}

pub fn collection_file_count(conn: &Connection, collection_id: &str) -> Result<u64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM collection_files WHERE collection_id = ?1",
        params![collection_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count as u64)
    .map_err(|error| format!("Could not count collection files: {error}"))
}

/// All file↔collection relations in one query (avoids N+1 on the Library).
pub fn list_all_file_collections(conn: &Connection) -> Result<Vec<FileCollection>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, collection_id
             FROM collection_files
             ORDER BY library_file_id ASC, collection_id ASC",
        )
        .map_err(|error| format!("Could not list file collections: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(FileCollection {
                library_file_id: row.get(0)?,
                collection_id: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query file collections: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read file collections: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE collections (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
             );
             CREATE UNIQUE INDEX idx_collections_name_nocase
                ON collections(name COLLATE NOCASE);
             CREATE TABLE collection_files (
                collection_id TEXT NOT NULL,
                library_file_id TEXT NOT NULL,
                PRIMARY KEY (collection_id, library_file_id),
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
             );
             CREATE TABLE files (
                library_file_id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL
             );
             CREATE TABLE file_metadata (
                library_file_id TEXT PRIMARY KEY NOT NULL,
                thumbnail_relpath TEXT
             );",
        )
        .expect("create collections schema");
        conn
    }

    #[test]
    fn create_collection_and_list() {
        let conn = setup();
        let collection = create_collection(&conn, "  Ghostface  ").unwrap();
        assert_eq!(collection.name, "Ghostface");
        assert_eq!(collection.file_count, 0);
        assert!(collection.preview_file_ids.is_empty());

        let collections = list_collections(&conn).unwrap();
        assert_eq!(collections.len(), 1);
        assert_eq!(collections[0].id, collection.id);
    }

    #[test]
    fn create_collection_rejects_case_insensitive_duplicate() {
        let conn = setup();
        let first = create_collection(&conn, "Ghostface").unwrap();
        let err = create_collection(&conn, "ghostface").unwrap_err();
        assert!(err.contains("already exists"));
        assert_eq!(list_collections(&conn).unwrap().len(), 1);
        assert_eq!(list_collections(&conn).unwrap()[0].id, first.id);
    }

    #[test]
    fn rename_collection_keeps_id_and_rejects_conflict() {
        let conn = setup();
        let ghost = create_collection(&conn, "Ghostface").unwrap();
        let print = create_collection(&conn, "À imprimer").unwrap();

        let renamed = rename_collection(&conn, &ghost.id, "Ghost Face").unwrap();
        assert_eq!(renamed.id, ghost.id);
        assert_eq!(renamed.name, "Ghost Face");

        let err = rename_collection(&conn, &print.id, "ghost face").unwrap_err();
        assert!(err.contains("already exists"));
    }

    #[test]
    fn delete_empty_and_non_empty_collection() {
        let conn = setup();
        let empty = create_collection(&conn, "Empty").unwrap();
        delete_collection(&conn, &empty.id).unwrap();
        assert!(list_collections(&conn).unwrap().is_empty());

        let filled = create_collection(&conn, "Filled").unwrap();
        add_file_to_collection(&conn, "file-a", &filled.id).unwrap();
        delete_collection(&conn, &filled.id).unwrap();
        assert!(list_collections(&conn).unwrap().is_empty());
        assert!(list_all_file_collections(&conn).unwrap().is_empty());
    }

    #[test]
    fn add_file_is_idempotent_and_multi_collection() {
        let conn = setup();
        let figs = create_collection(&conn, "Figurines").unwrap();
        let print = create_collection(&conn, "À imprimer").unwrap();

        add_file_to_collection(&conn, "file-a", &figs.id).unwrap();
        add_file_to_collection(&conn, "file-a", &figs.id).unwrap();
        add_file_to_collection(&conn, "file-a", &print.id).unwrap();

        let collections = list_collection_ids_for_file(&conn, "file-a").unwrap();
        assert_eq!(collections.len(), 2);
        assert!(collections.contains(&figs.id));
        assert!(collections.contains(&print.id));

        let files = list_file_ids_for_collection(&conn, &figs.id).unwrap();
        assert_eq!(files, vec!["file-a".to_string()]);
        assert_eq!(collection_file_count(&conn, &figs.id).unwrap(), 1);
        assert_eq!(get_collection(&conn, &figs.id).unwrap().unwrap().file_count, 1);
    }

    #[test]
    fn remove_file_is_idempotent() {
        let conn = setup();
        let collection = create_collection(&conn, "Dragons").unwrap();
        add_file_to_collection(&conn, "file-a", &collection.id).unwrap();
        remove_file_from_collection(&conn, "file-a", &collection.id).unwrap();
        remove_file_from_collection(&conn, "file-a", &collection.id).unwrap();
        assert!(list_file_ids_for_collection(&conn, &collection.id)
            .unwrap()
            .is_empty());
        assert_eq!(
            get_collection(&conn, &collection.id).unwrap().unwrap().file_count,
            0
        );
    }

    #[test]
    fn empty_collection_stays_listed() {
        let conn = setup();
        let collection = create_collection(&conn, "Ideas").unwrap();
        add_file_to_collection(&conn, "file-a", &collection.id).unwrap();
        remove_file_from_collection(&conn, "file-a", &collection.id).unwrap();
        let listed = list_collections(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].file_count, 0);
    }

    #[test]
    fn orphan_relations_survive_without_files_row() {
        let conn = setup();
        let collection = create_collection(&conn, "Orphan").unwrap();
        add_file_to_collection(&conn, "missing-file-id", &collection.id).unwrap();
        assert_eq!(
            list_file_ids_for_collection(&conn, &collection.id).unwrap(),
            vec!["missing-file-id".to_string()]
        );
        assert_eq!(
            get_collection(&conn, &collection.id).unwrap().unwrap().file_count,
            1
        );
    }

    #[test]
    fn previews_prefer_thumbnailed_files() {
        let conn = setup();
        let collection = create_collection(&conn, "Previews").unwrap();
        conn.execute(
            "INSERT INTO files (library_file_id, name) VALUES ('a', 'alpha'), ('b', 'bravo')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO file_metadata (library_file_id, thumbnail_relpath)
             VALUES ('b', 'thumbs/b.webp')",
            [],
        )
        .unwrap();
        add_file_to_collection(&conn, "a", &collection.id).unwrap();
        add_file_to_collection(&conn, "b", &collection.id).unwrap();

        let listed = get_collection(&conn, &collection.id).unwrap().unwrap();
        assert_eq!(listed.preview_file_ids.first().map(String::as_str), Some("b"));
    }
}
