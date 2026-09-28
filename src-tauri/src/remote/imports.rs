use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::library::analysis::stl::analyze_stl;
use crate::library::analysis::threemf::analyze_3mf;
use crate::library::analysis::thumbnail::render_mesh_webp;
use crate::library::models::is_supported_extension;

pub const IMPORTED_SUBDIR: &str = "Imported";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportsAfterAction {
    Keep,
    Move,
    Delete,
}

impl ImportsAfterAction {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "delete" => Self::Delete,
            "keep" => Self::Keep,
            _ => Self::Move,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Keep => "keep",
            Self::Move => "move",
            Self::Delete => "delete",
        }
    }
}

pub fn list_candidates(folder: &Path) -> Result<Vec<ImportCandidate>, String> {
    if folder.as_os_str().is_empty() {
        return Ok(Vec::new());
    }
    if !folder.is_dir() {
        return Err(format!(
            "Imports folder does not exist or is not a directory: {}",
            folder.display()
        ));
    }

    let mut out = Vec::new();
    let entries = fs::read_dir(folder)
        .map_err(|error| format!("Could not read imports folder: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not read folder entry: {error}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !is_supported_extension(&extension) {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
            .to_string();

        let meta = entry
            .metadata()
            .map_err(|error| format!("Could not read file metadata: {error}"))?;
        let size = meta.len() as i64;
        let modified_at = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0);

        out.push(ImportCandidate {
            path: path.to_string_lossy().into_owned(),
            name,
            extension,
            size,
            modified_at,
        });
    }

    out.sort_by(|a, b| b.modified_at.cmp(&a.modified_at).then_with(|| a.name.cmp(&b.name)));
    Ok(out)
}

pub fn finalize_candidate(path: &Path, action: ImportsAfterAction) -> Result<(), String> {
    if !path.is_file() {
        // Already gone — treat as success (idempotent).
        return Ok(());
    }

    match action {
        ImportsAfterAction::Keep => Ok(()),
        ImportsAfterAction::Delete => fs::remove_file(path)
            .map_err(|error| format!("Could not delete imported file: {error}")),
        ImportsAfterAction::Move => {
            let parent = path
                .parent()
                .ok_or_else(|| "Could not resolve imports folder.".to_string())?;
            let imported_dir = parent.join(IMPORTED_SUBDIR);
            fs::create_dir_all(&imported_dir)
                .map_err(|error| format!("Could not create Imported folder: {error}"))?;

            let file_name = path
                .file_name()
                .ok_or_else(|| "Could not read file name.".to_string())?;
            let mut dest = imported_dir.join(file_name);
            if dest.exists() {
                let stem = path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("file");
                let ext = path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| format!(".{value}"))
                    .unwrap_or_default();
                let stamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_secs())
                    .unwrap_or(0);
                dest = imported_dir.join(format!("{stem}-{stamp}{ext}"));
            }

            fs::rename(path, &dest).map_err(|error| {
                format!(
                    "Could not move file to {}: {error}",
                    dest.display()
                )
            })?;
            Ok(())
        }
    }
}

pub fn ensure_folder_is_absolute(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err("Imports folder must be an absolute path.".into());
    }
    Ok(path)
}

/// Extract a small WebP preview for an Imports candidate (cached by path + mtime + size).
/// Returns absolute path to the cached image, or `None` when no preview is available.
pub fn preview_candidate(path: &Path, cache_dir: &Path) -> Result<Option<PathBuf>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let meta = fs::metadata(path)
        .map_err(|error| format!("Could not read file metadata: {error}"))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let cache_key = {
        let mut hasher = Sha256::new();
        hasher.update(path.to_string_lossy().as_bytes());
        hasher.update(modified.to_le_bytes());
        hasher.update(meta.len().to_le_bytes());
        hasher.update(extension.as_bytes());
        hex::encode(hasher.finalize())
    };

    fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not create import preview cache: {error}"))?;
    let cached = cache_dir.join(format!("{cache_key}.webp"));
    if cached.is_file() {
        return Ok(Some(cached));
    }

    let webp = match extension.as_str() {
        "3mf" => {
            let analysis = analyze_3mf(path)?;
            analysis.thumbnail_webp
        }
        "stl" => {
            let analysis = analyze_stl(path)?;
            Some(render_mesh_webp(&analysis.mesh)?)
        }
        _ => None,
    };

    let Some(bytes) = webp else {
        return Ok(None);
    };

    fs::write(&cached, &bytes)
        .map_err(|error| format!("Could not save import preview: {error}"))?;
    Ok(Some(cached))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn lists_supported_files_only() {
        let dir = std::env::temp_dir().join(format!(
            "3d-library-imports-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.stl"), b"solid").unwrap();
        fs::write(dir.join("b.txt"), b"nope").unwrap();
        fs::create_dir_all(dir.join(IMPORTED_SUBDIR)).unwrap();
        fs::write(dir.join(IMPORTED_SUBDIR).join("old.stl"), b"solid").unwrap();

        let listed = list_candidates(&dir).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "a.stl");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn move_action_creates_imported_subdir() {
        let dir = std::env::temp_dir().join(format!(
            "3d-library-imports-move-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("model.3mf");
        let mut handle = fs::File::create(&file).unwrap();
        handle.write_all(b"zip").unwrap();
        drop(handle);

        finalize_candidate(&file, ImportsAfterAction::Move).unwrap();
        assert!(!file.exists());
        assert!(dir.join(IMPORTED_SUBDIR).join("model.3mf").exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
