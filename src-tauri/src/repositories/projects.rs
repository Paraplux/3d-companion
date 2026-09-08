use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::library::util::{new_id, now_ms};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub file_count: u64,
    /// Up to four library file ids for thumbnail previews (existing files preferred).
    pub preview_file_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProject {
    pub library_file_id: String,
    pub project_id: String,
}

fn normalize_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("A project name is required.".to_string());
    }
    if trimmed.len() > 80 {
        return Err("Project names must be 80 characters or fewer.".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_description(description: Option<&str>) -> Option<String> {
    let Some(raw) = description else {
        return None;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

fn map_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get::<_, i64>(3)? as u64,
        updated_at: row.get::<_, i64>(4)? as u64,
        file_count: row.get::<_, i64>(5)? as u64,
        preview_file_ids: Vec::new(),
    })
}

const PROJECT_SELECT: &str = "SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
        COUNT(pf.library_file_id) AS file_count
 FROM projects p
 LEFT JOIN project_files pf ON pf.project_id = p.id";

fn load_previews(conn: &Connection) -> Result<HashMap<String, Vec<String>>, String> {
    let mut statement = conn
        .prepare(
            "SELECT project_id, library_file_id FROM (
                SELECT pf.project_id AS project_id,
                       pf.library_file_id AS library_file_id,
                       ROW_NUMBER() OVER (
                           PARTITION BY pf.project_id
                           ORDER BY
                             CASE
                               WHEN m.thumbnail_relpath IS NOT NULL
                                    AND length(trim(m.thumbnail_relpath)) > 0
                               THEN 0 ELSE 1
                             END,
                             COALESCE(f.name, pf.library_file_id) COLLATE NOCASE ASC
                       ) AS rn
                FROM project_files pf
                LEFT JOIN files f ON f.library_file_id = pf.library_file_id
                LEFT JOIN file_metadata m ON m.library_file_id = pf.library_file_id
             )
             WHERE rn <= 4
             ORDER BY project_id ASC, rn ASC",
        )
        .map_err(|error| format!("Could not list project previews: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("Could not query project previews: {error}"))?;

    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (project_id, library_file_id) =
            row.map_err(|error| format!("Could not read project preview: {error}"))?;
        map.entry(project_id).or_default().push(library_file_id);
    }
    Ok(map)
}

fn attach_previews(mut projects: Vec<Project>, previews: &HashMap<String, Vec<String>>) -> Vec<Project> {
    for project in &mut projects {
        if let Some(ids) = previews.get(&project.id) {
            project.preview_file_ids = ids.clone();
        }
    }
    projects
}

pub fn list_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{PROJECT_SELECT}
             GROUP BY p.id
             ORDER BY p.name COLLATE NOCASE ASC"
        ))
        .map_err(|error| format!("Could not list projects: {error}"))?;

    let rows = statement
        .query_map([], map_project)
        .map_err(|error| format!("Could not query projects: {error}"))?;

    let projects = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read projects: {error}"))?;

    let previews = load_previews(conn)?;
    Ok(attach_previews(projects, &previews))
}

pub fn get_project(conn: &Connection, project_id: &str) -> Result<Option<Project>, String> {
    let mut statement = conn
        .prepare(&format!(
            "{PROJECT_SELECT}
             WHERE p.id = ?1
             GROUP BY p.id"
        ))
        .map_err(|error| format!("Could not prepare project lookup: {error}"))?;

    let project = statement
        .query_row(params![project_id], map_project)
        .optional()
        .map_err(|error| format!("Could not read project: {error}"))?;

    let Some(mut project) = project else {
        return Ok(None);
    };

    let previews = load_previews(conn)?;
    if let Some(ids) = previews.get(&project.id) {
        project.preview_file_ids = ids.clone();
    }
    Ok(Some(project))
}

pub fn find_project_by_name(conn: &Connection, name: &str) -> Result<Option<Project>, String> {
    let normalized = normalize_name(name)?;
    let mut statement = conn
        .prepare(&format!(
            "{PROJECT_SELECT}
             WHERE p.name = ?1 COLLATE NOCASE
             GROUP BY p.id"
        ))
        .map_err(|error| format!("Could not prepare project name lookup: {error}"))?;

    let project = statement
        .query_row(params![normalized], map_project)
        .optional()
        .map_err(|error| format!("Could not look up project: {error}"))?;

    Ok(project)
}

/// Create a project. Case-insensitive duplicate names are rejected.
pub fn create_project(
    conn: &Connection,
    name: &str,
    description: Option<&str>,
) -> Result<Project, String> {
    let normalized = normalize_name(name)?;
    let description = normalize_description(description);

    if find_project_by_name(conn, &normalized)?.is_some() {
        return Err("A project with that name already exists.".to_string());
    }

    let id = new_id();
    let now = now_ms();
    conn.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, normalized, description, now as i64, now as i64],
    )
    .map_err(|error| {
        let message = error.to_string();
        if message.contains("UNIQUE") || message.contains("unique") {
            "A project with that name already exists.".to_string()
        } else {
            format!("Could not create project: {error}")
        }
    })?;

    get_project(conn, &id)?.ok_or_else(|| "Created project could not be loaded.".to_string())
}

pub fn update_project(
    conn: &Connection,
    project_id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<Project, String> {
    let normalized = normalize_name(name)?;
    let description = normalize_description(description);

    if get_project(conn, project_id)?.is_none() {
        return Err("That project no longer exists.".to_string());
    }

    if let Some(existing) = find_project_by_name(conn, &normalized)? {
        if existing.id != project_id {
            return Err("A project with that name already exists.".to_string());
        }
    }

    let now = now_ms();
    conn.execute(
        "UPDATE projects SET name = ?2, description = ?3, updated_at = ?4 WHERE id = ?1",
        params![project_id, normalized, description, now as i64],
    )
    .map_err(|error| {
        let message = error.to_string();
        if message.contains("UNIQUE") || message.contains("unique") {
            "A project with that name already exists.".to_string()
        } else {
            format!("Could not update project: {error}")
        }
    })?;

    get_project(conn, project_id)?.ok_or_else(|| "Updated project could not be loaded.".to_string())
}

/// Delete a project and cascade its project_files relations. Files are never deleted.
pub fn delete_project(conn: &Connection, project_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])
        .map_err(|error| format!("Could not delete project: {error}"))?;
    Ok(())
}

pub fn add_file_to_project(
    conn: &Connection,
    library_file_id: &str,
    project_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }
    if project_id.trim().is_empty() {
        return Err("A project id is required.".to_string());
    }

    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM projects WHERE id = ?1 LIMIT 1",
            params![project_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Could not verify project: {error}"))?;
    if exists.is_none() {
        return Err("That project no longer exists.".to_string());
    }

    conn.execute(
        "INSERT OR IGNORE INTO project_files (project_id, library_file_id)
         VALUES (?1, ?2)",
        params![project_id, library_file_id],
    )
    .map_err(|error| format!("Could not add file to project: {error}"))?;

    let now = now_ms();
    let _ = conn.execute(
        "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
        params![project_id, now as i64],
    );

    Ok(())
}

pub fn remove_file_from_project(
    conn: &Connection,
    library_file_id: &str,
    project_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }
    if project_id.trim().is_empty() {
        return Err("A project id is required.".to_string());
    }

    conn.execute(
        "DELETE FROM project_files
         WHERE project_id = ?1 AND library_file_id = ?2",
        params![project_id, library_file_id],
    )
    .map_err(|error| format!("Could not remove file from project: {error}"))?;

    let now = now_ms();
    let _ = conn.execute(
        "UPDATE projects SET updated_at = ?2 WHERE id = ?1",
        params![project_id, now as i64],
    );

    Ok(())
}

pub fn list_project_ids_for_file(
    conn: &Connection,
    library_file_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT project_id
             FROM project_files
             WHERE library_file_id = ?1
             ORDER BY project_id ASC",
        )
        .map_err(|error| format!("Could not list file projects: {error}"))?;

    let rows = statement
        .query_map(params![library_file_id], |row| row.get(0))
        .map_err(|error| format!("Could not query file projects: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read file projects: {error}"))
}

pub fn list_file_ids_for_project(
    conn: &Connection,
    project_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id
             FROM project_files
             WHERE project_id = ?1
             ORDER BY library_file_id ASC",
        )
        .map_err(|error| format!("Could not list project files: {error}"))?;

    let rows = statement
        .query_map(params![project_id], |row| row.get(0))
        .map_err(|error| format!("Could not query project files: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read project files: {error}"))
}

pub fn project_file_count(conn: &Connection, project_id: &str) -> Result<u64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM project_files WHERE project_id = ?1",
        params![project_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count as u64)
    .map_err(|error| format!("Could not count project files: {error}"))
}

/// All file↔project relations in one query (avoids N+1 on the Library).
pub fn list_all_file_projects(conn: &Connection) -> Result<Vec<FileProject>, String> {
    let mut statement = conn
        .prepare(
            "SELECT library_file_id, project_id
             FROM project_files
             ORDER BY library_file_id ASC, project_id ASC",
        )
        .map_err(|error| format!("Could not list file projects: {error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(FileProject {
                library_file_id: row.get(0)?,
                project_id: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query file projects: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read file projects: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
             );
             CREATE UNIQUE INDEX idx_projects_name_nocase
                ON projects(name COLLATE NOCASE);
             CREATE TABLE project_files (
                project_id TEXT NOT NULL,
                library_file_id TEXT NOT NULL,
                PRIMARY KEY (project_id, library_file_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
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
        .expect("create projects schema");
        conn
    }

    #[test]
    fn create_project_and_list() {
        let conn = setup();
        let project = create_project(&conn, "  Robot Arm  ", Some("  Prototype  ")).unwrap();
        assert_eq!(project.name, "Robot Arm");
        assert_eq!(project.description.as_deref(), Some("Prototype"));
        assert_eq!(project.file_count, 0);
        assert!(project.preview_file_ids.is_empty());

        let projects = list_projects(&conn).unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, project.id);
    }

    #[test]
    fn create_project_rejects_case_insensitive_duplicate() {
        let conn = setup();
        let first = create_project(&conn, "Robot", None).unwrap();
        let err = create_project(&conn, "robot", None).unwrap_err();
        assert!(err.contains("already exists"));
        assert_eq!(list_projects(&conn).unwrap().len(), 1);
        assert_eq!(list_projects(&conn).unwrap()[0].id, first.id);
    }

    #[test]
    fn update_project_keeps_id_and_rejects_conflict() {
        let conn = setup();
        let robot = create_project(&conn, "Robot", Some("v1")).unwrap();
        let drone = create_project(&conn, "Drone", None).unwrap();

        let updated = update_project(&conn, &robot.id, "Robot Arm", Some("v2")).unwrap();
        assert_eq!(updated.id, robot.id);
        assert_eq!(updated.name, "Robot Arm");
        assert_eq!(updated.description.as_deref(), Some("v2"));

        let err = update_project(&conn, &drone.id, "robot arm", None).unwrap_err();
        assert!(err.contains("already exists"));
    }

    #[test]
    fn delete_empty_and_non_empty_project() {
        let conn = setup();
        let empty = create_project(&conn, "Empty", None).unwrap();
        delete_project(&conn, &empty.id).unwrap();
        assert!(list_projects(&conn).unwrap().is_empty());

        let filled = create_project(&conn, "Filled", None).unwrap();
        add_file_to_project(&conn, "file-a", &filled.id).unwrap();
        delete_project(&conn, &filled.id).unwrap();
        assert!(list_projects(&conn).unwrap().is_empty());
        assert!(list_all_file_projects(&conn).unwrap().is_empty());
    }

    #[test]
    fn add_file_is_idempotent_and_multi_project() {
        let conn = setup();
        let robot = create_project(&conn, "Robot", None).unwrap();
        let print = create_project(&conn, "Print Queue", None).unwrap();

        add_file_to_project(&conn, "file-a", &robot.id).unwrap();
        add_file_to_project(&conn, "file-a", &robot.id).unwrap();
        add_file_to_project(&conn, "file-a", &print.id).unwrap();

        let projects = list_project_ids_for_file(&conn, "file-a").unwrap();
        assert_eq!(projects.len(), 2);
        assert!(projects.contains(&robot.id));
        assert!(projects.contains(&print.id));

        let files = list_file_ids_for_project(&conn, &robot.id).unwrap();
        assert_eq!(files, vec!["file-a".to_string()]);
        assert_eq!(project_file_count(&conn, &robot.id).unwrap(), 1);
        assert_eq!(get_project(&conn, &robot.id).unwrap().unwrap().file_count, 1);
    }

    #[test]
    fn remove_file_is_idempotent() {
        let conn = setup();
        let project = create_project(&conn, "Dragons", None).unwrap();
        add_file_to_project(&conn, "file-a", &project.id).unwrap();
        remove_file_from_project(&conn, "file-a", &project.id).unwrap();
        remove_file_from_project(&conn, "file-a", &project.id).unwrap();
        assert!(list_file_ids_for_project(&conn, &project.id)
            .unwrap()
            .is_empty());
        assert_eq!(
            get_project(&conn, &project.id).unwrap().unwrap().file_count,
            0
        );
    }

    #[test]
    fn empty_project_stays_listed() {
        let conn = setup();
        let project = create_project(&conn, "Ideas", None).unwrap();
        add_file_to_project(&conn, "file-a", &project.id).unwrap();
        remove_file_from_project(&conn, "file-a", &project.id).unwrap();
        let listed = list_projects(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].file_count, 0);
    }

    #[test]
    fn orphan_relations_survive_without_files_row() {
        let conn = setup();
        let project = create_project(&conn, "Orphan", None).unwrap();
        add_file_to_project(&conn, "missing-file-id", &project.id).unwrap();
        assert_eq!(
            list_file_ids_for_project(&conn, &project.id).unwrap(),
            vec!["missing-file-id".to_string()]
        );
        assert_eq!(
            get_project(&conn, &project.id).unwrap().unwrap().file_count,
            1
        );
    }

    #[test]
    fn previews_prefer_thumbnailed_files() {
        let conn = setup();
        let project = create_project(&conn, "Previews", None).unwrap();
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
        add_file_to_project(&conn, "a", &project.id).unwrap();
        add_file_to_project(&conn, "b", &project.id).unwrap();

        let listed = get_project(&conn, &project.id).unwrap().unwrap();
        assert_eq!(listed.preview_file_ids.first().map(String::as_str), Some("b"));
    }

    #[test]
    fn blank_description_is_stored_as_none() {
        let conn = setup();
        let project = create_project(&conn, "Blank", Some("   ")).unwrap();
        assert_eq!(project.description, None);
        let updated = update_project(&conn, &project.id, "Blank", Some("")).unwrap();
        assert_eq!(updated.description, None);
    }
}
