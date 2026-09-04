use rusqlite::{params, Connection, OptionalExtension};

use crate::library::models::{
    AnalysisStatus, DerivedMetadataPayload, StlMetadata, ThreeMfMetadata, ANALYSIS_VERSION,
};
use crate::library::util::now_ms;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct MetadataRow {
    pub library_file_id: String,
    pub content_hash: String,
    pub analysis_status: AnalysisStatus,
    pub analysis_version: i64,
    pub analysis_error: Option<String>,
    pub thumbnail_relpath: Option<String>,
    pub format_kind: Option<String>,
    pub metadata_json: String,
}

#[derive(Debug, Clone)]
pub struct MetadataUpsert {
    pub library_file_id: String,
    pub content_hash: String,
    pub analysis_status: AnalysisStatus,
    pub analysis_version: i64,
    pub analysis_error: Option<String>,
    pub thumbnail_relpath: Option<String>,
    pub format_kind: Option<String>,
    pub metadata_json: String,
    pub analyzed_at: Option<u64>,
}

pub fn upsert_metadata(conn: &Connection, row: &MetadataUpsert) -> Result<(), String> {
    conn.execute(
        "INSERT INTO file_metadata (
            library_file_id, content_hash, analysis_status, analysis_version,
            analysis_error, thumbnail_relpath, format_kind, metadata_json,
            analyzed_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(library_file_id) DO UPDATE SET
            content_hash = excluded.content_hash,
            analysis_status = excluded.analysis_status,
            analysis_version = excluded.analysis_version,
            analysis_error = excluded.analysis_error,
            thumbnail_relpath = excluded.thumbnail_relpath,
            format_kind = excluded.format_kind,
            metadata_json = excluded.metadata_json,
            analyzed_at = excluded.analyzed_at,
            updated_at = excluded.updated_at",
        params![
            row.library_file_id,
            row.content_hash,
            row.analysis_status.as_str(),
            row.analysis_version,
            row.analysis_error,
            row.thumbnail_relpath,
            row.format_kind,
            row.metadata_json,
            row.analyzed_at.map(|value| value as i64),
            now_ms() as i64,
        ],
    )
    .map_err(|error| format!("Could not upsert file metadata: {error}"))?;
    Ok(())
}

pub fn find_metadata(
    conn: &Connection,
    library_file_id: &str,
) -> Result<Option<MetadataRow>, String> {
    conn.query_row(
        "SELECT library_file_id, content_hash, analysis_status, analysis_version,
                analysis_error, thumbnail_relpath, format_kind, metadata_json
         FROM file_metadata
         WHERE library_file_id = ?1",
        params![library_file_id],
        map_metadata,
    )
    .optional()
    .map_err(|error| format!("Could not read file metadata: {error}"))
}

pub fn delete_metadata(conn: &Connection, library_file_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM file_metadata WHERE library_file_id = ?1",
        params![library_file_id],
    )
    .map_err(|error| format!("Could not delete file metadata: {error}"))?;
    Ok(())
}

pub fn delete_metadata_for_paths(conn: &Connection, paths: &[String]) -> Result<(), String> {
    for path in paths {
        conn.execute(
            "DELETE FROM file_metadata
             WHERE library_file_id IN (
                SELECT library_file_id FROM files WHERE path = ?1
             )",
            params![path],
        )
        .map_err(|error| format!("Could not delete metadata for path: {error}"))?;
    }
    Ok(())
}

pub fn delete_metadata_for_location(conn: &Connection, location_path: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM file_metadata
         WHERE library_file_id IN (
            SELECT library_file_id FROM files WHERE location_path = ?1
         )",
        params![location_path],
    )
    .map_err(|error| format!("Could not delete metadata for location: {error}"))?;
    Ok(())
}

pub fn needs_analysis(row: &MetadataRow, content_hash: &str) -> bool {
    if content_hash.is_empty() {
        return true;
    }

    match row.analysis_status {
        AnalysisStatus::Ready => {
            row.content_hash != content_hash || row.analysis_version != ANALYSIS_VERSION
        }
        AnalysisStatus::Analyzing => false,
        AnalysisStatus::Pending | AnalysisStatus::Error => true,
    }
}

pub fn parse_payload(json: &str) -> DerivedMetadataPayload {
    serde_json::from_str(json).unwrap_or_default()
}

pub fn split_payload(payload: DerivedMetadataPayload) -> (Option<StlMetadata>, Option<ThreeMfMetadata>) {
    (payload.stl, payload.threemf)
}

fn map_metadata(row: &rusqlite::Row<'_>) -> rusqlite::Result<MetadataRow> {
    let status: String = row.get(2)?;
    Ok(MetadataRow {
        library_file_id: row.get(0)?,
        content_hash: row.get(1)?,
        analysis_status: AnalysisStatus::parse(&status),
        analysis_version: row.get(3)?,
        analysis_error: row.get(4)?,
        thumbnail_relpath: row.get(5)?,
        format_kind: row.get(6)?,
        metadata_json: row.get(7)?,
    })
}
