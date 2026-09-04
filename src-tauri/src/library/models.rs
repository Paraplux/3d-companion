use serde::{Deserialize, Serialize};

/// Bump when parsers / thumbnail pipeline change so stale cache is regenerated.
pub const ANALYSIS_VERSION: i64 = 1;

pub const SUPPORTED_EXTENSIONS: &[&str] = &["stl", "3mf", "obj", "step", "stp"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AnalysisStatus {
    Pending,
    Analyzing,
    Ready,
    Error,
}

impl AnalysisStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Analyzing => "analyzing",
            Self::Ready => "ready",
            Self::Error => "error",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "analyzing" => Self::Analyzing,
            "ready" => Self::Ready,
            "error" => Self::Error,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundTaskType {
    Hashing,
    Analyzing,
    Thumbnail,
}

impl BackgroundTaskType {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Hashing => "hashing",
            Self::Analyzing => "analyzing",
            Self::Thumbnail => "thumbnail",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundTaskStatus {
    Queued,
    Running,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTask {
    pub id: String,
    #[serde(rename = "type")]
    pub task_type: BackgroundTaskType,
    pub status: BackgroundTaskStatus,
    pub progress: Option<f32>,
    pub label: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTasksEvent {
    pub tasks: Vec<BackgroundTask>,
    pub active_count: usize,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundingBox {
    pub min: Vec3,
    pub max: Vec3,
}

impl BoundingBox {
    pub fn dimensions_mm(&self) -> Vec3 {
        Vec3 {
            x: (self.max.x - self.min.x).abs(),
            y: (self.max.y - self.min.y).abs(),
            z: (self.max.z - self.min.z).abs(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StlMetadata {
    pub encoding: String,
    pub triangle_count: u64,
    pub bounding_box: BoundingBox,
    pub dimensions_mm: Vec3,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume_mm3: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilamentInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BambuMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nozzle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer_height: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filament: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colors: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filaments: Option<Vec<FilamentInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub infill: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plate_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_time_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight_grams: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreeMfMetadata {
    pub is_bambu: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bambu: Option<BambuMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DerivedMetadataPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stl: Option<StlMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threemf: Option<ThreeMfMetadata>,
}

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
    pub analysis_status: AnalysisStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub analysis_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stl: Option<StlMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub threemf: Option<ThreeMfMetadata>,
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
    #[serde(rename_all = "camelCase")]
    FileAnalyzed {
        file: LibraryFile,
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
