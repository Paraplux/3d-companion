use serde::{Deserialize, Serialize};

pub const SUPPORTED_EXTENSIONS: &[&str] = &["stl", "3mf", "obj", "step", "stp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLocation {
    pub id: String,
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified_at: u64,
    pub relative_path: String,
    pub location_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFile {
    pub library_file_id: String,
    pub content_hash: String,
    pub path: String,
    pub name: String,
    pub extension: String,
    pub size: u64,
    pub modified_at: u64,
    pub relative_path: String,
    pub location_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub locations: Vec<LibraryLocation>,
    pub files: Vec<LibraryFile>,
    pub reconciling: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddLibraryLocationResult {
    pub location: LibraryLocation,
    pub files: Vec<LibraryFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LibraryEvent {
    #[serde(rename_all = "camelCase")]
    LocationUpdated {
        location_path: String,
        files: Vec<LibraryFile>,
    },
    #[serde(rename_all = "camelCase")]
    LocationRemoved {
        location_path: String,
    },
    #[serde(rename_all = "camelCase")]
    ReconciliationFinished {
        files: Vec<LibraryFile>,
    },
}

pub fn is_supported_extension(extension: &str) -> bool {
    SUPPORTED_EXTENSIONS
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(extension))
}

pub fn location_name_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_string()
}
