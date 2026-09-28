use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::cache::{
    clear_cache, measure_cache, purge_expired, RemoteCacheMaintenanceResult, RemoteCacheStats,
};
use super::client::{
    backfill_thumbnails, delete_file, download_file_to_path, download_thumbnail, ensure_cached_file,
    find_cached_file, get_library, list_files, put_library, rename_file, replace_file,
    test_connection, upload_file, RemoteConnectionTestResult, RemoteFileSummary,
    RemoteIngestResult, RemoteLibraryResponse, RemoteThumbnailBackfillResult,
};
use super::config::{load_config, save_config, RemoteConfig};
use super::imports::{
    ensure_folder_is_absolute, finalize_candidate, list_candidates, preview_candidate,
    ImportCandidate, ImportsAfterAction,
};
use crate::library::analysis::{analyze_file, resolve_threemf_paths, thumbnail_absolute};
use crate::library::bambu_studio::{
    is_bambu_studio_compatible_extension, open_path_in_bambu_studio,
};
use crate::library::geometry::{geometry_cache_dir, load_model_geometry};
use crate::library::models::{
    AnalysisStatus, LibraryFile, StlMetadata, ThreeMfMetadata,
};
use crate::library::util::hash_file;

fn remote_files_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?
        .join("remote-files"))
}

fn remote_thumbnails_cache_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?
        .join("remote-thumbnails"))
}

fn remote_cache_roots(app: &AppHandle) -> Result<[std::path::PathBuf; 2], String> {
    Ok([
        remote_files_cache_dir(app)?,
        remote_thumbnails_cache_dir(app)?,
    ])
}

/// Best-effort GC used at startup and after TTL changes.
pub fn purge_remote_cache_internal(app: &AppHandle) -> Result<RemoteCacheMaintenanceResult, String> {
    let config = load_config(app)?;
    let roots = remote_cache_roots(app)?;
    let root_refs: Vec<&std::path::Path> = roots.iter().map(|path| path.as_path()).collect();
    purge_expired(&root_refs, config.cache_ttl_days)
}

fn thumbnails_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?
        .join("thumbnails");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create thumbnails directory: {error}"))?;
    Ok(dir)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRemoteAnalysis {
    /// False when the object is not present in the local download cache.
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threemf: Option<ThreeMfMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stl: Option<StlMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
}

#[tauri::command]
pub fn get_remote_config(app: AppHandle) -> Result<RemoteConfig, String> {
    load_config(&app)
}

#[tauri::command]
pub fn save_remote_config(app: AppHandle, config: RemoteConfig) -> Result<RemoteConfig, String> {
    let mut next = config;
    if next.cache_ttl_days == 0 {
        next.cache_ttl_days = 7;
    }
    // Validate URL when enabled or when fields are partially filled.
    if next.enabled || next.is_configured() {
        let _ = next.api_origin()?;
    }

    let imports_path = ensure_folder_is_absolute(&next.imports_folder_path)?;
    next.imports_folder_path = if imports_path.as_os_str().is_empty() {
        String::new()
    } else {
        imports_path.to_string_lossy().into_owned()
    };
    next.imports_after_action = ImportsAfterAction::parse(&next.imports_after_action)
        .as_str()
        .to_string();

    save_config(&app, &next)?;
    // Lowering TTL should free disk promptly.
    let _ = purge_remote_cache_internal(&app);
    Ok(next)
}

#[tauri::command]
pub fn get_remote_cache_stats(app: AppHandle) -> Result<RemoteCacheStats, String> {
    let roots = remote_cache_roots(&app)?;
    let root_refs: Vec<&std::path::Path> = roots.iter().map(|path| path.as_path()).collect();
    measure_cache(&root_refs)
}

#[tauri::command]
pub fn purge_remote_cache(app: AppHandle) -> Result<RemoteCacheMaintenanceResult, String> {
    purge_remote_cache_internal(&app)
}

#[tauri::command]
pub fn clear_remote_cache(app: AppHandle) -> Result<RemoteCacheMaintenanceResult, String> {
    let roots = remote_cache_roots(&app)?;
    let root_refs: Vec<&std::path::Path> = roots.iter().map(|path| path.as_path()).collect();
    clear_cache(&root_refs)
}

#[tauri::command]
pub fn list_import_candidates(app: AppHandle) -> Result<Vec<ImportCandidate>, String> {
    let config = load_config(&app)?;
    let folder = ensure_folder_is_absolute(&config.imports_folder_path)?;
    if folder.as_os_str().is_empty() {
        return Ok(Vec::new());
    }
    list_candidates(&folder)
}

#[tauri::command]
pub fn finalize_import_candidate(app: AppHandle, path: String) -> Result<(), String> {
    let config = load_config(&app)?;
    let action = ImportsAfterAction::parse(&config.imports_after_action);
    finalize_candidate(std::path::Path::new(&path), action)
}

#[tauri::command]
pub fn get_import_preview(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?
        .join("import-previews");
    let preview = preview_candidate(std::path::Path::new(&path), &cache_dir)?;
    Ok(preview.map(|value| value.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn test_remote_connection(
    app: AppHandle,
    config: Option<RemoteConfig>,
) -> Result<RemoteConnectionTestResult, String> {
    let effective = match config {
        Some(value) => value,
        None => load_config(&app)?,
    };
    test_connection(&effective).await
}

#[tauri::command]
pub async fn backfill_remote_thumbnails(
    app: AppHandle,
) -> Result<RemoteThumbnailBackfillResult, String> {
    let config = load_config(&app)?;
    backfill_thumbnails(&config).await
}

#[tauri::command]
pub async fn get_remote_files(app: AppHandle) -> Result<Vec<RemoteFileSummary>, String> {
    let config = load_config(&app)?;
    list_files(&config).await
}

#[tauri::command]
pub async fn get_remote_library(app: AppHandle) -> Result<RemoteLibraryResponse, String> {
    let config = load_config(&app)?;
    get_library(&config).await
}

#[tauri::command]
pub async fn put_remote_library(
    app: AppHandle,
    document: Value,
    if_match: String,
) -> Result<String, String> {
    let config = load_config(&app)?;
    put_library(&config, &document, &if_match).await
}

#[tauri::command]
pub async fn upload_remote_file(app: AppHandle, path: String) -> Result<RemoteIngestResult, String> {
    let config = load_config(&app)?;
    upload_file(&config, std::path::Path::new(&path)).await
}

/// Push the locally cached (possibly Bambu-edited) bytes back to the cloud.
/// Uses `PUT /v1/files/{id}` so `fileId` / library relations stay stable.
#[tauri::command]
pub async fn replace_remote_file(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
) -> Result<RemoteIngestResult, String> {
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let Some(path) = find_cached_file(
        &file_id,
        &content_hash,
        &filename,
        &cache_dir,
        config.cache_ttl_days,
    )?
    else {
        return Err(
            "No local cache for this file. Open it in Bambu Studio (or download it) first, edit, then sync."
                .into(),
        );
    };

    let local_hash = hash_file(&path)?;
    if local_hash == content_hash.trim() {
        // Cache still matches cloud — nothing to push.
        let meta = tokio::fs::metadata(&path)
            .await
            .map_err(|error| format!("Could not read cached file: {error}"))?;
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        return Ok(RemoteIngestResult {
            id: file_id,
            name: filename,
            extension,
            size: meta.len() as i64,
            content_hash: local_hash,
            deduplicated: true,
        });
    }

    let result = replace_file(&config, &file_id, &path).await?;

    // Remap cache folder to the new content hash so the edited bytes stay addressable.
    let new_hash = result.content_hash.trim();
    if !new_hash.is_empty() && new_hash != content_hash.trim() {
        let safe_name = path
            .file_name()
            .ok_or_else(|| "Could not read cached file name.".to_string())?;
        let new_dir = cache_dir.join(&file_id).join(new_hash);
        std::fs::create_dir_all(&new_dir)
            .map_err(|error| format!("Could not create updated cache folder: {error}"))?;
        let new_path = new_dir.join(safe_name);
        if path != new_path {
            std::fs::rename(&path, &new_path).or_else(|_| {
                std::fs::copy(&path, &new_path).and_then(|_| std::fs::remove_file(&path))
            }).map_err(|error| format!("Could not update local cache path: {error}"))?;
        }
        // Drop the old hash directory when empty.
        if let Some(old_dir) = path.parent() {
            let _ = std::fs::remove_dir(old_dir);
        }
    }

    // Cloud thumbs live under remote-thumbnails/{fileId}.* — drop them so the
    // next GET re-downloads the server-regenerated preview for the new bytes.
    if let Ok(thumbs) = remote_thumbnails_cache_dir(&app) {
        for ext in ["webp", "png", "jpg", "jpeg"] {
            let stale = thumbs.join(format!("{file_id}.{ext}"));
            let _ = std::fs::remove_file(stale);
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn delete_remote_file(app: AppHandle, file_id: String) -> Result<(), String> {
    let config = load_config(&app)?;
    delete_file(&config, &file_id).await
}

#[tauri::command]
pub async fn rename_remote_file(
    app: AppHandle,
    file_id: String,
    name: String,
) -> Result<RemoteFileSummary, String> {
    let config = load_config(&app)?;
    rename_file(&config, &file_id, &name).await
}

#[tauri::command]
pub async fn get_remote_thumbnail(app: AppHandle, file_id: String) -> Result<String, String> {
    let config = load_config(&app)?;
    let cache_dir = remote_thumbnails_cache_dir(&app)?;
    let path = download_thumbnail(&config, &file_id, &cache_dir).await?;
    Ok(path.to_string_lossy().into_owned())
}

/// Ensure a cloud object is in the local cache; returns absolute path.
#[tauri::command]
pub async fn cache_remote_file(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
) -> Result<String, String> {
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let path =
        ensure_cached_file(&config, &file_id, &content_hash, &filename, &cache_dir).await?;
    Ok(path.to_string_lossy().into_owned())
}

/// Download a cloud object to a user-chosen absolute path (Save As).
#[tauri::command]
pub async fn save_remote_file(
    app: AppHandle,
    file_id: String,
    dest_path: String,
) -> Result<(), String> {
    let config = load_config(&app)?;
    let dest = std::path::Path::new(&dest_path);
    if dest_path.trim().is_empty() {
        return Err("A destination path is required.".into());
    }
    download_file_to_path(&config, &file_id, dest).await
}

/// Cache a cloud STL/3MF then open it in Bambu Studio.
#[tauri::command]
pub async fn open_remote_in_bambu_studio(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
    extension: String,
) -> Result<(), String> {
    if !is_bambu_studio_compatible_extension(&extension) {
        return Err("Only STL and 3MF files can be opened in Bambu Studio.".into());
    }
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let path =
        ensure_cached_file(&config, &file_id, &content_hash, &filename, &cache_dir).await?;
    open_path_in_bambu_studio(&path)
}

/// Analyze a cloud object **only if** it is already in the local download cache.
/// Used for plate previews without forcing a download.
#[tauri::command]
pub async fn analyze_cached_remote_file(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
    extension: String,
) -> Result<CachedRemoteAnalysis, String> {
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let Some(path) = find_cached_file(
        &file_id,
        &content_hash,
        &filename,
        &cache_dir,
        config.cache_ttl_days,
    )?
    else {
        return Ok(CachedRemoteAnalysis {
            available: false,
            threemf: None,
            stl: None,
            thumbnail_path: None,
        });
    };

    analyze_path_blocking(app, path, content_hash, extension).await
}

/// Ensure the cloud object is cached, then analyze it (plates / metadata).
#[tauri::command]
pub async fn prepare_remote_file_preview(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
    extension: String,
) -> Result<CachedRemoteAnalysis, String> {
    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let path =
        ensure_cached_file(&config, &file_id, &content_hash, &filename, &cache_dir).await?;
    analyze_path_blocking(app, path, content_hash, extension).await
}

async fn analyze_path_blocking(
    app: AppHandle,
    path: std::path::PathBuf,
    content_hash: String,
    extension: String,
) -> Result<CachedRemoteAnalysis, String> {
    let thumbs = thumbnails_dir(&app)?;
    let ext = extension.clone();
    let hash = content_hash.clone();
    let path_for_job = path;
    let thumbs_for_job = thumbs.clone();

    let outcome = tokio::task::spawn_blocking(move || {
        analyze_file(&path_for_job, &ext, &hash, &thumbs_for_job)
    })
    .await
    .map_err(|error| format!("Analysis task failed: {error}"))??;

    let threemf = outcome
        .payload
        .threemf
        .map(|meta| resolve_threemf_paths(meta, &thumbs));
    let thumbnail_path = outcome
        .thumbnail_relpath
        .as_ref()
        .map(|rel| thumbnail_absolute(&thumbs, rel).to_string_lossy().into_owned());

    Ok(CachedRemoteAnalysis {
        available: true,
        threemf,
        stl: outcome.payload.stl,
        thumbnail_path,
    })
}

/// Cache a cloud STL/3MF if needed, then extract geometry for the 3D viewer.
/// Geometry triangle soups are stored under the shared geometry disk cache (by contentHash).
#[tauri::command]
pub async fn get_remote_model_geometry(
    app: AppHandle,
    file_id: String,
    content_hash: String,
    filename: String,
    extension: String,
    plate_id: Option<String>,
    threemf: Option<ThreeMfMetadata>,
    stl: Option<StlMetadata>,
) -> Result<crate::library::geometry::ModelGeometryResponse, String> {
    let ext = extension.trim().to_ascii_lowercase();
    if ext != "stl" && ext != "3mf" {
        return Err(format!("3D preview unavailable for {ext} files."));
    }

    let config = load_config(&app)?;
    let cache_dir = remote_files_cache_dir(&app)?;
    let path =
        ensure_cached_file(&config, &file_id, &content_hash, &filename, &cache_dir).await?;

    let mut meta_threemf = threemf;
    let mut meta_stl = stl;
    if ext == "3mf" && meta_threemf.is_none() {
        let analyzed =
            analyze_path_blocking(app.clone(), path.clone(), content_hash.clone(), extension.clone())
                .await?;
        meta_threemf = analyzed.threemf;
        meta_stl = analyzed.stl.or(meta_stl);
    }

    let file = LibraryFile {
        library_file_id: file_id,
        content_hash: content_hash.clone(),
        path: path.to_string_lossy().into_owned(),
        name: filename,
        extension: ext,
        size: std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
        modified_at: 0,
        relative_path: String::new(),
        location_path: "remote://cloud".into(),
        analysis_status: AnalysisStatus::Ready,
        analysis_error: None,
        thumbnail_path: None,
        stl: meta_stl,
        threemf: meta_threemf,
    };

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    let geometry_dir = geometry_cache_dir(&data_dir);
    std::fs::create_dir_all(&geometry_dir)
        .map_err(|error| format!("Could not create geometry cache: {error}"))?;

    let plate = plate_id.clone();
    tokio::task::spawn_blocking(move || load_model_geometry(&file, plate.as_deref(), &geometry_dir))
        .await
        .map_err(|error| format!("Geometry task failed: {error}"))?
}
