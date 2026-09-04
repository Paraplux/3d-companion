use rusqlite::{params, Connection, OptionalExtension};

use crate::library::models::LibraryLocation;
use crate::library::util::{new_id, now_ms};

pub fn list_locations(conn: &Connection) -> Result<Vec<LibraryLocation>, String> {
    let mut statement = conn
        .prepare(
            "SELECT id, path, name
             FROM library_locations
             ORDER BY name COLLATE NOCASE ASC, path ASC",
        )
        .map_err(|error| format!("Could not list library locations: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(LibraryLocation {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|error| format!("Could not query library locations: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read library locations: {error}"))
}

pub fn find_location_by_path(
    conn: &Connection,
    path: &str,
) -> Result<Option<LibraryLocation>, String> {
    conn.query_row(
        "SELECT id, path, name FROM library_locations WHERE path = ?1",
        params![path],
        |row| {
            Ok(LibraryLocation {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(|error| format!("Could not look up library location: {error}"))
}

pub fn insert_location(
    conn: &Connection,
    path: &str,
    name: &str,
) -> Result<LibraryLocation, String> {
    let location = LibraryLocation {
        id: new_id(),
        path: path.to_string(),
        name: name.to_string(),
    };

    conn.execute(
        "INSERT INTO library_locations (id, path, name, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![location.id, location.path, location.name, now_ms() as i64],
    )
    .map_err(|error| format!("Could not save library location: {error}"))?;

    Ok(location)
}

pub fn delete_location_by_path(conn: &Connection, path: &str) -> Result<bool, String> {
    let changed = conn
        .execute(
            "DELETE FROM library_locations WHERE path = ?1",
            params![path],
        )
        .map_err(|error| format!("Could not remove library location: {error}"))?;

    Ok(changed > 0)
}
