use rusqlite::{params, Connection, OptionalExtension};

use crate::library::util::now_ms;

/// Add a file to favorites by stable `library_file_id`.
/// Idempotent: inserting an existing favorite is a no-op.
pub fn add_favorite(conn: &Connection, library_file_id: &str) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }

    conn.execute(
        "INSERT OR IGNORE INTO favorites (library_file_id, created_at)
         VALUES (?1, ?2)",
        params![library_file_id, now_ms() as i64],
    )
    .map_err(|error| format!("Could not add favorite: {error}"))?;

    Ok(())
}

/// Remove a file from favorites by stable `library_file_id`.
/// Idempotent: removing a non-favorite is a no-op.
pub fn remove_favorite(conn: &Connection, library_file_id: &str) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }

    conn.execute(
        "DELETE FROM favorites WHERE library_file_id = ?1",
        params![library_file_id],
    )
    .map_err(|error| format!("Could not remove favorite: {error}"))?;

    Ok(())
}

pub fn is_favorite(conn: &Connection, library_file_id: &str) -> Result<bool, String> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM favorites WHERE library_file_id = ?1 LIMIT 1",
            params![library_file_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Could not check favorite: {error}"))?;

    Ok(exists.is_some())
}

/// Favorite ids ordered by most recently favorited first.
pub fn list_favorite_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id
             FROM favorites
             ORDER BY created_at DESC, library_file_id ASC",
        )
        .map_err(|error| format!("Could not list favorites: {error}"))?;

    let rows = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| format!("Could not query favorites: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read favorites: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE favorites (
                library_file_id TEXT PRIMARY KEY NOT NULL,
                created_at INTEGER NOT NULL
            );",
        )
        .expect("create favorites");
        conn
    }

    #[test]
    fn add_and_list_favorites_uses_file_id() {
        let conn = setup();
        add_favorite(&conn, "file-a").unwrap();
        add_favorite(&conn, "file-b").unwrap();

        let ids = list_favorite_ids(&conn).unwrap();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"file-a".to_string()));
        assert!(ids.contains(&"file-b".to_string()));
        assert!(is_favorite(&conn, "file-a").unwrap());
        assert!(!is_favorite(&conn, "file-missing").unwrap());
    }

    #[test]
    fn add_favorite_is_idempotent() {
        let conn = setup();
        add_favorite(&conn, "file-a").unwrap();
        add_favorite(&conn, "file-a").unwrap();

        let ids = list_favorite_ids(&conn).unwrap();
        assert_eq!(ids, vec!["file-a".to_string()]);
    }

    #[test]
    fn remove_favorite_is_idempotent() {
        let conn = setup();
        add_favorite(&conn, "file-a").unwrap();
        remove_favorite(&conn, "file-a").unwrap();
        remove_favorite(&conn, "file-a").unwrap();
        remove_favorite(&conn, "never-favorited").unwrap();

        assert!(list_favorite_ids(&conn).unwrap().is_empty());
        assert!(!is_favorite(&conn, "file-a").unwrap());
    }

    #[test]
    fn favorites_survive_without_files_row() {
        // No FK to files — organizational data is independent of physical presence.
        let conn = setup();
        add_favorite(&conn, "orphaned-id").unwrap();
        assert!(is_favorite(&conn, "orphaned-id").unwrap());
        assert_eq!(
            list_favorite_ids(&conn).unwrap(),
            vec!["orphaned-id".to_string()]
        );
    }
}
