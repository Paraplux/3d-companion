use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use walkdir::WalkDir;

use super::models::{is_supported_extension, ScannedFile};

pub fn scan_location(location_path: &str) -> Result<Vec<ScannedFile>, String> {
    let root = PathBuf::from(location_path);

    if !root.exists() {
        return Err("This library folder is no longer available.".into());
    }
    if !root.is_dir() {
        return Err("This library path is not a folder.".into());
    }

    let mut files = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|result| match result {
            Ok(entry) => Some(entry),
            Err(_) => None,
        })
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let Some(extension) = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
        else {
            continue;
        };

        if !is_supported_extension(&extension) {
            continue;
        }

        match scanned_file_from_path(location_path, path, &extension) {
            Ok(file) => files.push(file),
            Err(_) => continue,
        }
    }

    files.sort_by(|left, right| {
        left.relative_path
            .to_ascii_lowercase()
            .cmp(&right.relative_path.to_ascii_lowercase())
    });

    Ok(files)
}

pub fn scanned_file_from_path(
    location_path: &str,
    path: &Path,
    extension: &str,
) -> Result<ScannedFile, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Could not read file metadata: {error}"))?;

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();

    let relative_path = path
        .strip_prefix(location_path)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| name.clone());

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as u64)
                .unwrap_or(0)
        });

    Ok(ScannedFile {
        path: path.to_string_lossy().to_string(),
        name,
        extension: extension.to_string(),
        size: metadata.len(),
        modified_at,
        relative_path,
        location_path: location_path.to_string(),
    })
}
