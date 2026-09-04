pub mod mesh;
pub mod stl;
pub mod threemf;
pub mod thumbnail;

use std::fs;
use std::path::{Path, PathBuf};

use crate::library::analysis::stl::analyze_stl;
use crate::library::analysis::threemf::analyze_3mf;
use crate::library::analysis::thumbnail::render_mesh_webp;
use crate::library::models::{
    AnalysisStatus, DerivedMetadataPayload, ANALYSIS_VERSION,
};
use crate::library::util::now_ms;
use crate::repositories::metadata::{upsert_metadata, MetadataUpsert};

#[derive(Debug)]
pub struct AnalysisOutcome {
    pub format_kind: String,
    pub payload: DerivedMetadataPayload,
    pub thumbnail_relpath: Option<String>,
}

pub fn analyze_file(
    path: &Path,
    extension: &str,
    content_hash: &str,
    thumbnails_dir: &Path,
) -> Result<AnalysisOutcome, String> {
    match extension.to_ascii_lowercase().as_str() {
        "stl" => analyze_stl_file(path, content_hash, thumbnails_dir),
        "3mf" => analyze_3mf_file(path, content_hash, thumbnails_dir),
        other => Ok(AnalysisOutcome {
            format_kind: other.to_string(),
            payload: DerivedMetadataPayload::default(),
            thumbnail_relpath: None,
        }),
    }
}

fn analyze_stl_file(
    path: &Path,
    content_hash: &str,
    thumbnails_dir: &Path,
) -> Result<AnalysisOutcome, String> {
    let analysis = analyze_stl(path)?;
    let webp = render_mesh_webp(&analysis.mesh)?;
    let relpath = write_thumbnail(thumbnails_dir, content_hash, &webp)?;

    Ok(AnalysisOutcome {
        format_kind: "stl".into(),
        payload: DerivedMetadataPayload {
            stl: Some(analysis.metadata),
            threemf: None,
        },
        thumbnail_relpath: Some(relpath),
    })
}

fn analyze_3mf_file(
    path: &Path,
    content_hash: &str,
    thumbnails_dir: &Path,
) -> Result<AnalysisOutcome, String> {
    let mut analysis = analyze_3mf(path)?;

    if let Some(project) = analysis.metadata.project.as_mut() {
        if let Some(webp) = analysis.project_thumbnail_webp.as_ref() {
            project.thumbnail_path =
                Some(write_named_thumbnail(thumbnails_dir, content_hash, "project.webp", webp)?);
        }

        for plate in &mut project.plates {
            if let Some(webp) = analysis.plate_thumbnails.get(&plate.index) {
                let filename = format!("plate-{}.webp", plate.index);
                plate.thumbnail_path =
                    Some(write_named_thumbnail(thumbnails_dir, content_hash, &filename, webp)?);
            }
        }

        if project.plates.is_empty() && project.thumbnail_path.is_none() {
            analysis.metadata.project = None;
        }
    }

    let thumbnail_relpath = if let Some(webp) = analysis.thumbnail_webp {
        Some(write_thumbnail(thumbnails_dir, content_hash, &webp)?)
    } else if let Some(mesh) = analysis.mesh.as_ref() {
        let webp = render_mesh_webp(mesh)?;
        Some(write_thumbnail(thumbnails_dir, content_hash, &webp)?)
    } else {
        None
    };

    Ok(AnalysisOutcome {
        format_kind: "3mf".into(),
        payload: DerivedMetadataPayload {
            stl: None,
            threemf: Some(analysis.metadata),
        },
        thumbnail_relpath,
    })
}

pub fn write_thumbnail(
    thumbnails_dir: &Path,
    content_hash: &str,
    webp: &[u8],
) -> Result<String, String> {
    fs::create_dir_all(thumbnails_dir)
        .map_err(|error| format!("Could not create thumbnails directory: {error}"))?;

    let filename = format!("{content_hash}.webp");
    let absolute = thumbnails_dir.join(&filename);
    fs::write(&absolute, webp)
        .map_err(|error| format!("Could not write thumbnail: {error}"))?;
    Ok(filename)
}

/// Writes `{contentHash}/{filename}` and returns the relative path.
pub fn write_named_thumbnail(
    thumbnails_dir: &Path,
    content_hash: &str,
    filename: &str,
    webp: &[u8],
) -> Result<String, String> {
    let dir = thumbnails_dir.join(content_hash);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create thumbnails directory: {error}"))?;
    let absolute = dir.join(filename);
    fs::write(&absolute, webp)
        .map_err(|error| format!("Could not write thumbnail: {error}"))?;
    Ok(format!("{content_hash}/{filename}"))
}

pub fn thumbnail_absolute(thumbnails_dir: &Path, relpath: &str) -> PathBuf {
    thumbnails_dir.join(relpath)
}

/// Resolve stored relative thumbnail paths to absolute paths for the frontend DTO.
pub fn resolve_threemf_paths(
    mut metadata: crate::library::models::ThreeMfMetadata,
    thumbnails_dir: &Path,
) -> crate::library::models::ThreeMfMetadata {
    if let Some(project) = metadata.project.as_mut() {
        if let Some(rel) = project.thumbnail_path.as_ref() {
            project.thumbnail_path = Some(
                thumbnail_absolute(thumbnails_dir, rel)
                    .to_string_lossy()
                    .to_string(),
            );
        }
        for plate in &mut project.plates {
            if let Some(rel) = plate.thumbnail_path.as_ref() {
                plate.thumbnail_path = Some(
                    thumbnail_absolute(thumbnails_dir, rel)
                        .to_string_lossy()
                        .to_string(),
                );
            }
        }
    }
    metadata
}

pub fn mark_ready(
    conn: &rusqlite::Connection,
    library_file_id: &str,
    content_hash: &str,
    outcome: &AnalysisOutcome,
) -> Result<(), String> {
    let metadata_json = serde_json::to_string(&outcome.payload)
        .map_err(|error| format!("Could not serialize metadata: {error}"))?;

    upsert_metadata(
        conn,
        &MetadataUpsert {
            library_file_id: library_file_id.to_string(),
            content_hash: content_hash.to_string(),
            analysis_status: AnalysisStatus::Ready,
            analysis_version: ANALYSIS_VERSION,
            analysis_error: None,
            thumbnail_relpath: outcome.thumbnail_relpath.clone(),
            format_kind: Some(outcome.format_kind.clone()),
            metadata_json,
            analyzed_at: Some(now_ms()),
        },
    )
}

pub fn mark_error(
    conn: &rusqlite::Connection,
    library_file_id: &str,
    content_hash: &str,
    error: &str,
) -> Result<(), String> {
    upsert_metadata(
        conn,
        &MetadataUpsert {
            library_file_id: library_file_id.to_string(),
            content_hash: content_hash.to_string(),
            analysis_status: AnalysisStatus::Error,
            analysis_version: ANALYSIS_VERSION,
            analysis_error: Some(error.to_string()),
            thumbnail_relpath: None,
            format_kind: None,
            metadata_json: "{}".into(),
            analyzed_at: Some(now_ms()),
        },
    )
}

pub fn mark_pending(
    conn: &rusqlite::Connection,
    library_file_id: &str,
    content_hash: &str,
) -> Result<(), String> {
    upsert_metadata(
        conn,
        &MetadataUpsert {
            library_file_id: library_file_id.to_string(),
            content_hash: content_hash.to_string(),
            analysis_status: AnalysisStatus::Pending,
            analysis_version: ANALYSIS_VERSION,
            analysis_error: None,
            thumbnail_relpath: None,
            format_kind: None,
            metadata_json: "{}".into(),
            analyzed_at: None,
        },
    )
}

pub fn mark_analyzing(
    conn: &rusqlite::Connection,
    library_file_id: &str,
    content_hash: &str,
) -> Result<(), String> {
    upsert_metadata(
        conn,
        &MetadataUpsert {
            library_file_id: library_file_id.to_string(),
            content_hash: content_hash.to_string(),
            analysis_status: AnalysisStatus::Analyzing,
            analysis_version: ANALYSIS_VERSION,
            analysis_error: None,
            thumbnail_relpath: None,
            format_kind: None,
            metadata_json: "{}".into(),
            analyzed_at: None,
        },
    )
}
