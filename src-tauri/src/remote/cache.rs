//! Local download-cache maintenance for cloud objects.
//!
//! Layout under app data:
//! - `remote-files/{fileId}/{contentHash}/{filename}`
//! - `remote-thumbnails/{fileId}.{ext}`
//!
//! TTL is measured from **last access** (mtime refreshed on every hit).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use walkdir::WalkDir;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCacheStats {
    pub bytes: u64,
    pub file_count: u32,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCacheMaintenanceResult {
    pub removed_files: u32,
    pub removed_bytes: u64,
    pub bytes: u64,
    pub file_count: u32,
}

pub fn touch_file(path: &Path) -> Result<(), String> {
    let file = fs::OpenOptions::new()
        .write(true)
        .open(path)
        .map_err(|error| format!("Could not touch cache file: {error}"))?;
    file.set_modified(SystemTime::now())
        .map_err(|error| format!("Could not update cache timestamp: {error}"))?;
    Ok(())
}

pub fn cache_entry_expired(path: &Path, ttl_days: u32) -> Result<bool, String> {
    if ttl_days == 0 {
        return Ok(false);
    }
    let meta = fs::metadata(path)
        .map_err(|error| format!("Could not read cache metadata: {error}"))?;
    let modified = meta
        .modified()
        .map_err(|error| format!("Could not read cache mtime: {error}"))?;
    let age = SystemTime::now()
        .duration_since(modified)
        .unwrap_or_default();
    let ttl = Duration::from_secs(u64::from(ttl_days) * 24 * 60 * 60);
    Ok(age > ttl)
}

/// Measure total size of files under `roots` (missing roots are skipped).
pub fn measure_cache(roots: &[&Path]) -> Result<RemoteCacheStats, String> {
    let mut stats = RemoteCacheStats::default();
    for root in roots {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root).follow_links(false) {
            let entry = entry.map_err(|error| format!("Could not scan cache: {error}"))?;
            if !entry.file_type().is_file() {
                continue;
            }
            let meta = entry
                .metadata()
                .map_err(|error| format!("Could not read cache file: {error}"))?;
            stats.bytes = stats.bytes.saturating_add(meta.len());
            stats.file_count = stats.file_count.saturating_add(1);
        }
    }
    Ok(stats)
}

/// Delete expired files under `roots`, then prune empty directories.
pub fn purge_expired(roots: &[&Path], ttl_days: u32) -> Result<RemoteCacheMaintenanceResult, String> {
    let mut removed_files: u32 = 0;
    let mut removed_bytes: u64 = 0;

    for root in roots {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root).follow_links(false) {
            let entry = entry.map_err(|error| format!("Could not scan cache: {error}"))?;
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let should_remove = if is_partial_download(path) {
                // Abandoned uploads: drop after 1 day regardless of TTL.
                cache_entry_expired(path, 1)?
            } else {
                cache_entry_expired(path, ttl_days)?
            };
            if !should_remove {
                continue;
            }
            let len = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
            match fs::remove_file(path) {
                Ok(()) => {
                    removed_files = removed_files.saturating_add(1);
                    removed_bytes = removed_bytes.saturating_add(len);
                }
                Err(error) => {
                    return Err(format!("Could not remove expired cache file: {error}"));
                }
            }
        }
        remove_empty_dirs(root)?;
    }

    let remaining = measure_cache(roots)?;
    Ok(RemoteCacheMaintenanceResult {
        removed_files,
        removed_bytes,
        bytes: remaining.bytes,
        file_count: remaining.file_count,
    })
}

/// Delete every file under `roots` and prune empty directories.
pub fn clear_cache(roots: &[&Path]) -> Result<RemoteCacheMaintenanceResult, String> {
    let before = measure_cache(roots)?;
    for root in roots {
        if !root.exists() {
            continue;
        }
        for entry in WalkDir::new(root)
            .follow_links(false)
            .contents_first(true)
        {
            let entry = entry.map_err(|error| format!("Could not scan cache: {error}"))?;
            let path = entry.path();
            if path == *root {
                continue;
            }
            if entry.file_type().is_dir() {
                let _ = fs::remove_dir(path);
            } else if entry.file_type().is_file() {
                fs::remove_file(path)
                    .map_err(|error| format!("Could not clear cache file: {error}"))?;
            }
        }
    }
    let remaining = measure_cache(roots)?;
    Ok(RemoteCacheMaintenanceResult {
        removed_files: before.file_count.saturating_sub(remaining.file_count),
        removed_bytes: before.bytes.saturating_sub(remaining.bytes),
        bytes: remaining.bytes,
        file_count: remaining.file_count,
    })
}

fn is_partial_download(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.') && name.ends_with(".partial"))
        .unwrap_or(false)
}

fn remove_empty_dirs(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }
    let mut dirs: Vec<PathBuf> = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_dir())
        .map(|entry| entry.path().to_path_buf())
        .collect();
    // Deepest first.
    dirs.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
    for dir in dirs {
        if dir == root {
            continue;
        }
        let _ = fs::remove_dir(dir);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::OpenOptions;

    fn temp_root(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "3d-companion-cache-{}-{}",
            label,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn write_aged(path: &Path, contents: &[u8], age_days: u64) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
        let past = SystemTime::now() - Duration::from_secs(age_days * 24 * 60 * 60);
        let file = OpenOptions::new().write(true).open(path).unwrap();
        file.set_modified(past).unwrap();
    }

    #[test]
    fn purge_removes_expired_keeps_fresh() {
        let root = temp_root("purge");
        let fresh = root.join("fresh.bin");
        let stale = root.join("stale.bin");
        write_aged(&fresh, b"fresh", 1);
        write_aged(&stale, b"stale-bytes", 10);

        let result = purge_expired(&[&root], 7).unwrap();
        assert!(fresh.is_file());
        assert!(!stale.exists());
        assert_eq!(result.removed_files, 1);
        assert_eq!(result.removed_bytes, b"stale-bytes".len() as u64);
        assert_eq!(result.file_count, 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn clear_removes_nested_layout() {
        let root = temp_root("clear");
        let nested = root
            .join("11111111-1111-4111-8111-111111111111")
            .join("abc")
            .join("robot.3mf");
        write_aged(&nested, b"model", 0);
        let result = clear_cache(&[&root]).unwrap();
        assert_eq!(result.removed_files, 1);
        assert!(!nested.exists());
        assert_eq!(result.file_count, 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn touch_refreshes_mtime() {
        let root = temp_root("touch");
        let path = root.join("file.bin");
        write_aged(&path, b"x", 5);
        assert!(cache_entry_expired(&path, 3).unwrap());
        touch_file(&path).unwrap();
        assert!(!cache_entry_expired(&path, 3).unwrap());
        let _ = fs::remove_dir_all(&root);
    }
}
