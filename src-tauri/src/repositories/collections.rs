use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub updated_at: u64,
}

pub fn list_collections(conn: &Connection) -> Result<Vec<Collection>, String> {
    let mut statement = conn
        .prepare(
            "SELECT id, name, created_at, updated_at
             FROM collections
             ORDER BY name COLLATE NOCASE ASC",
        )
        .map_err(|error| format!("Could not list collections: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get::<_, i64>(2)? as u64,
                updated_at: row.get::<_, i64>(3)? as u64,
            })
        })
        .map_err(|error| format!("Could not query collections: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read collections: {error}"))
}
