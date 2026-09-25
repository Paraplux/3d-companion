use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, ETAG, IF_MATCH, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

use super::config::RemoteConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileSummary {
    pub id: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    #[serde(alias = "content_hash")]
    pub content_hash: String,
    #[serde(alias = "created_at")]
    pub created_at: String,
    #[serde(alias = "updated_at")]
    pub updated_at: String,
    /// Present once the gateway ships thumbnail support; default false for older APIs.
    #[serde(default, alias = "has_thumbnail")]
    pub has_thumbnail: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteIngestResult {
    pub id: String,
    pub name: String,
    pub extension: String,
    pub size: i64,
    #[serde(alias = "content_hash")]
    pub content_hash: String,
    #[serde(default)]
    pub deduplicated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConnectionTestResult {
    pub ok: bool,
    pub message: String,
    pub file_count: Option<u32>,
    pub health_ok: bool,
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteLibraryResponse {
    pub document: Value,
    pub etag: Option<String>,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Could not create HTTP client: {error}"))
}

fn auth_headers(api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    let value = HeaderValue::from_str(&format!("Bearer {}", api_key.trim()))
        .map_err(|_| "API key contains invalid characters.".to_string())?;
    headers.insert(AUTHORIZATION, value);
    Ok(headers)
}

pub async fn test_connection(config: &RemoteConfig) -> Result<RemoteConnectionTestResult, String> {
    if !config.is_configured() {
        return Ok(RemoteConnectionTestResult {
            ok: false,
            message: "Enter a cloud URL and API key first.".into(),
            file_count: None,
            health_ok: false,
            authenticated: false,
        });
    }

    let client = http_client()?;
    let health_url = config.v1_url("health")?;

    let health_response = client
        .get(&health_url)
        .send()
        .await
        .map_err(|error| format!("Could not reach cloud API: {error}"))?;

    let health_ok = health_response.status().is_success();
    if !health_ok {
        return Ok(RemoteConnectionTestResult {
            ok: false,
            message: format!(
                "Health check failed (HTTP {}). Check the URL.",
                health_response.status().as_u16()
            ),
            file_count: None,
            health_ok: false,
            authenticated: false,
        });
    }

    let files_url = config.v1_url("files")?;
    let files_response = client
        .get(&files_url)
        .headers(auth_headers(&config.api_key)?)
        .send()
        .await
        .map_err(|error| format!("Authenticated request failed: {error}"))?;

    let status = files_response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Ok(RemoteConnectionTestResult {
            ok: false,
            message: "API key rejected by the server.".into(),
            file_count: None,
            health_ok: true,
            authenticated: false,
        });
    }

    if !status.is_success() {
        let body = files_response.text().await.unwrap_or_default();
        return Ok(RemoteConnectionTestResult {
            ok: false,
            message: format!(
                "List files failed (HTTP {}). {}",
                status.as_u16(),
                truncate(&body, 160)
            ),
            file_count: None,
            health_ok: true,
            authenticated: false,
        });
    }

    #[derive(Deserialize)]
    struct FilesPayload {
        files: Vec<RemoteFileSummary>,
    }

    let payload: FilesPayload = files_response
        .json()
        .await
        .map_err(|error| format!("Could not parse file list: {error}"))?;

    let count = payload.files.len() as u32;
    Ok(RemoteConnectionTestResult {
        ok: true,
        message: format!("Connected — {count} file(s) in the cloud catalog."),
        file_count: Some(count),
        health_ok: true,
        authenticated: true,
    })
}

pub async fn list_files(config: &RemoteConfig) -> Result<Vec<RemoteFileSummary>, String> {
    ensure_ready(config)?;
    let client = http_client()?;
    let response = client
        .get(config.v1_url("files")?)
        .headers(auth_headers(&config.api_key)?)
        .send()
        .await
        .map_err(|error| format!("Could not list remote files: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "List files failed (HTTP {}).",
            response.status().as_u16()
        ));
    }

    #[derive(Deserialize)]
    struct FilesPayload {
        files: Vec<RemoteFileSummary>,
    }

    let payload: FilesPayload = response
        .json()
        .await
        .map_err(|error| format!("Could not parse file list: {error}"))?;
    Ok(payload.files)
}

pub async fn get_library(config: &RemoteConfig) -> Result<RemoteLibraryResponse, String> {
    ensure_ready(config)?;
    let client = http_client()?;
    let response = client
        .get(config.v1_url("library")?)
        .headers(auth_headers(&config.api_key)?)
        .send()
        .await
        .map_err(|error| format!("Could not fetch library.json: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Get library failed (HTTP {}).",
            response.status().as_u16()
        ));
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim_matches('"').to_string());

    let document: Value = response
        .json()
        .await
        .map_err(|error| format!("Could not parse library.json: {error}"))?;

    Ok(RemoteLibraryResponse { document, etag })
}

pub async fn put_library(
    config: &RemoteConfig,
    document: &Value,
    if_match: &str,
) -> Result<String, String> {
    ensure_ready(config)?;
    let client = http_client()?;
    let mut headers = auth_headers(&config.api_key)?;
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    let etag_value = HeaderValue::from_str(if_match.trim())
        .map_err(|_| "Invalid If-Match ETag.".to_string())?;
    headers.insert(IF_MATCH, etag_value);

    let response = client
        .put(config.v1_url("library")?)
        .headers(headers)
        .json(document)
        .send()
        .await
        .map_err(|error| format!("Could not save library.json: {error}"))?;

    let status = response.status();
    if status.as_u16() == 409 {
        return Err("Library was updated elsewhere — refresh and try again.".into());
    }
    if status.as_u16() == 428 {
        return Err("Missing If-Match ETag for library update.".into());
    }
    if !status.is_success() {
        return Err(format!(
            "Save library failed (HTTP {}).",
            status.as_u16()
        ));
    }

    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim_matches('"').to_string())
        .unwrap_or_default();

    Ok(etag)
}

pub async fn upload_file(
    config: &RemoteConfig,
    path: &Path,
) -> Result<RemoteIngestResult, String> {
    ensure_ready(config)?;

    if !path.is_file() {
        return Err("Selected path is not a file.".into());
    }

    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Could not read file name.".to_string())?
        .to_string();

    let bytes = tokio::fs::read(path)
        .await
        .map_err(|error| format!("Could not read file: {error}"))?;

    let size = bytes.len() as u64;
    let max_bytes: u64 = 512 * 1024 * 1024;
    if size > max_bytes {
        return Err("File is larger than the 512 MB upload limit.".into());
    }

    let client = http_client()?;
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(filename.clone())
        .mime_str("application/octet-stream")
        .map_err(|error| format!("Could not build upload part: {error}"))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("filename", filename);

    let response = client
        .post(config.v1_url("files")?)
        .headers(auth_headers(&config.api_key)?)
        .multipart(form)
        .send()
        .await
        .map_err(|error| format!("Upload failed: {error}"))?;

    let status = response.status();
    if !(status.is_success() || status.as_u16() == 201) {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Upload failed (HTTP {}). {}",
            status.as_u16(),
            truncate(&body, 160)
        ));
    }

    response
        .json::<RemoteIngestResult>()
        .await
        .map_err(|error| format!("Could not parse upload response: {error}"))
}

/// Download a remote thumbnail into `cache_dir`, returning the local file path.
/// Idempotent when the cached file already exists.
pub async fn download_thumbnail(
    config: &RemoteConfig,
    file_id: &str,
    cache_dir: &Path,
) -> Result<std::path::PathBuf, String> {
    ensure_ready(config)?;
    validate_file_id(file_id)?;

    std::fs::create_dir_all(cache_dir)
        .map_err(|error| format!("Could not create thumbnail cache: {error}"))?;

    // Prefer existing webp/png cache hit.
    for ext in ["webp", "png", "jpg", "jpeg"] {
        let candidate = cache_dir.join(format!("{file_id}.{ext}"));
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let client = http_client()?;
    let response = client
        .get(config.v1_url(&format!("files/{file_id}/thumbnail"))?)
        .headers(auth_headers(&config.api_key)?)
        .send()
        .await
        .map_err(|error| format!("Could not download thumbnail: {error}"))?;

    let status = response.status();
    if status.as_u16() == 404 {
        return Err("No thumbnail available for this file.".into());
    }
    if !status.is_success() {
        return Err(format!(
            "Thumbnail download failed (HTTP {}).",
            status.as_u16()
        ));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/webp")
        .to_ascii_lowercase();

    let ext = if content_type.contains("png") {
        "png"
    } else if content_type.contains("jpeg") || content_type.contains("jpg") {
        "jpg"
    } else {
        "webp"
    };

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not read thumbnail bytes: {error}"))?;

    if bytes.is_empty() {
        return Err("Thumbnail response was empty.".into());
    }

    let path = cache_dir.join(format!("{file_id}.{ext}"));
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|error| format!("Could not save thumbnail: {error}"))?;

    Ok(path)
}

fn validate_file_id(file_id: &str) -> Result<(), String> {
    let ok = uuid::Uuid::parse_str(file_id).is_ok();
    if ok {
        Ok(())
    } else {
        Err("Invalid file id.".into())
    }
}

fn ensure_ready(config: &RemoteConfig) -> Result<(), String> {
    if !config.is_configured() {
        return Err("Cloud library is not configured.".into());
    }
    let _ = config.api_origin()?;
    Ok(())
}

fn truncate(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    let shortened: String = trimmed.chars().take(max).collect();
    format!("{shortened}…")
}
