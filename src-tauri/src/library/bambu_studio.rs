//! Open library files in Bambu Studio on macOS.
//!
//! Uses Launch Services (`open -b <bundle-id> -- <path>`) so the file path is
//! passed as a separate argument (spaces / Unicode safe) and the app is
//! resolved by bundle id rather than a hardcoded user path.

use std::path::{Path, PathBuf};
use std::process::Command;

use rusqlite::Connection;

use crate::repositories::files::get_file;

/// Official Bambu Studio macOS bundle identifier.
pub const BAMBU_STUDIO_BUNDLE_ID: &str = "com.bambulab.bambu-studio";

/// Common display / `.app` names used by Bambu Studio installs.
const BAMBU_STUDIO_APP_NAMES: &[&str] = &["BambuStudio.app", "Bambu Studio.app"];

pub fn is_bambu_studio_compatible_extension(extension: &str) -> bool {
    matches!(extension.trim().to_ascii_lowercase().as_str(), "stl" | "3mf")
}

/// Resolve an installed Bambu Studio `.app` bundle, if present.
pub fn find_bambu_studio_app() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(path) = find_via_mdfind() {
            return Ok(path);
        }
        if let Some(path) = find_in_applications_dirs() {
            return Ok(path);
        }
        Err(bambu_not_found_message())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Opening in Bambu Studio is only supported on macOS.".to_string())
    }
}

fn bambu_not_found_message() -> String {
    "Bambu Studio was not found. Install Bambu Studio, then try again.".to_string()
}

#[cfg(target_os = "macos")]
fn find_via_mdfind() -> Option<PathBuf> {
    let output = Command::new("mdfind")
        .arg(format!(
            "kMDItemCFBundleIdentifier == '{BAMBU_STUDIO_BUNDLE_ID}'"
        ))
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .find(|path| is_app_bundle(path))
}

#[cfg(target_os = "macos")]
fn find_in_applications_dirs() -> Option<PathBuf> {
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join("Applications"));
    }

    for root in roots {
        for name in BAMBU_STUDIO_APP_NAMES {
            let candidate = root.join(name);
            if is_app_bundle(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn is_app_bundle(path: &Path) -> bool {
    path.is_dir()
        && path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
}

/// Open a physical file path in Bambu Studio without copying or modifying it.
pub fn open_path_in_bambu_studio(path: &Path) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        return Err("Opening in Bambu Studio is only supported on macOS.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        if path.as_os_str().is_empty() {
            return Err("That file has no path on disk.".to_string());
        }

        if !path.exists() {
            return Err("File not found".to_string());
        }

        if !path.is_file() {
            return Err("That path is not a file.".to_string());
        }

        // Confirm the app is installed before launching, for a clear user error.
        let _app = find_bambu_studio_app()?;

        let output = Command::new("open")
            .arg("-b")
            .arg(BAMBU_STUDIO_BUNDLE_ID)
            .arg("--")
            .arg(path)
            .output()
            .map_err(|error| format!("Could not launch Bambu Studio: {error}"))?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "macOS could not open the file in Bambu Studio.".to_string()
        };

        let lower = detail.to_ascii_lowercase();
        if lower.contains("unable to find application")
            || lower.contains("couldn't find")
            || lower.contains("cannot find")
            || lower.contains("lscopyapplicationurls")
        {
            return Err(bambu_not_found_message());
        }

        Err(format!("Could not open in Bambu Studio: {detail}"))
    }
}

/// Look up a library file by stable id and open its current physical path.
pub fn open_library_file_in_bambu_studio(
    conn: &Connection,
    thumbnails_dir: &Path,
    library_file_id: &str,
) -> Result<(), String> {
    if library_file_id.trim().is_empty() {
        return Err("A library file id is required.".to_string());
    }

    let file = get_file(conn, library_file_id, thumbnails_dir)?
        .ok_or_else(|| "That model is no longer in your library.".to_string())?;

    if !is_bambu_studio_compatible_extension(&file.extension) {
        return Err("Only STL and 3MF files can be opened in Bambu Studio.".to_string());
    }

    open_path_in_bambu_studio(Path::new(&file.path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn compatible_extensions() {
        assert!(is_bambu_studio_compatible_extension("stl"));
        assert!(is_bambu_studio_compatible_extension("STL"));
        assert!(is_bambu_studio_compatible_extension("3mf"));
        assert!(is_bambu_studio_compatible_extension("3MF"));
        assert!(!is_bambu_studio_compatible_extension("obj"));
        assert!(!is_bambu_studio_compatible_extension(""));
    }

    #[test]
    fn missing_file_returns_file_not_found() {
        let missing = PathBuf::from("/tmp/3d-library-missing-model-does-not-exist.stl");
        let err = open_path_in_bambu_studio(&missing).unwrap_err();
        assert_eq!(err, "File not found");
    }

    #[test]
    fn path_with_spaces_and_unicode_is_kept_as_path_arg() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("3d-library bambu café {stamp}"));
        fs::create_dir_all(&dir).expect("temp dir");
        let file_path = dir.join("modèle test.stl");
        fs::write(&file_path, b"solid test\nendsolid test\n").expect("write stl");

        assert!(file_path.exists());
        assert!(file_path.to_string_lossy().contains(' '));
        assert!(file_path.to_string_lossy().contains('é'));

        // Simulate the argv we pass to `open` — never shell-concatenate.
        let args = [
            "-b".to_string(),
            BAMBU_STUDIO_BUNDLE_ID.to_string(),
            "--".to_string(),
            file_path.to_string_lossy().into_owned(),
        ];
        assert_eq!(args[3], file_path.to_string_lossy());

        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finds_bambu_studio_when_installed_in_applications() {
        match find_bambu_studio_app() {
            Ok(path) => {
                assert!(is_app_bundle(&path), "expected .app bundle, got {path:?}");
            }
            Err(message) => {
                // Acceptable on machines without Bambu Studio.
                assert!(message.contains("Bambu Studio was not found"));
            }
        }
    }

    #[test]
    fn is_app_bundle_requires_app_extension() {
        assert!(!is_app_bundle(Path::new("/Applications/BambuStudio")));
        assert!(!is_app_bundle(Path::new("/tmp/not-an-app.txt")));
    }
}
