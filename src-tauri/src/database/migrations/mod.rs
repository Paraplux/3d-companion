use rusqlite::Connection;

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("001_initial.sql")),
    (2, include_str!("002_file_metadata.sql")),
    (3, include_str!("003_tags_name_nocase.sql")),
    (4, include_str!("004_collections_name_nocase.sql")),
    (5, include_str!("005_projects_description_name_nocase.sql")),
];

pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY NOT NULL,
            applied_at INTEGER NOT NULL
        );",
    )
    .map_err(|error| format!("Could not initialize migrations table: {error}"))?;

    let applied = applied_versions(conn)?;

    for (version, sql) in MIGRATIONS {
        if applied.contains(version) {
            continue;
        }

        conn.execute_batch("BEGIN IMMEDIATE;")
            .map_err(|error| format!("Could not start migration {version}: {error}"))?;

        let result = (|| {
            conn.execute_batch(sql)
                .map_err(|error| format!("Migration {version} failed: {error}"))?;

            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                rusqlite::params![version, now_ms()],
            )
            .map_err(|error| format!("Could not record migration {version}: {error}"))?;

            Ok::<(), String>(())
        })();

        match result {
            Ok(()) => {
                conn.execute_batch("COMMIT;")
                    .map_err(|error| format!("Could not commit migration {version}: {error}"))?;
            }
            Err(error) => {
                let _ = conn.execute_batch("ROLLBACK;");
                return Err(error);
            }
        }
    }

    Ok(())
}

fn applied_versions(conn: &Connection) -> Result<Vec<i64>, String> {
    let mut statement = conn
        .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
        .map_err(|error| format!("Could not read migrations: {error}"))?;

    let versions = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| format!("Could not query migrations: {error}"))?
        .collect::<Result<Vec<i64>, _>>()
        .map_err(|error| format!("Could not parse migrations: {error}"))?;

    Ok(versions)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
