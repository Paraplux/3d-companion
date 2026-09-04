use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut statement = conn
        .prepare(
            "SELECT id, name, created_at
             FROM tags
             ORDER BY name COLLATE NOCASE ASC",
        )
        .map_err(|error| format!("Could not list tags: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get::<_, i64>(2)? as u64,
            })
        })
        .map_err(|error| format!("Could not query tags: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read tags: {error}"))
}
