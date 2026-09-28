use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CONFIG_FILENAME: &str = "remote-config.json";
const DEFAULT_CACHE_TTL_DAYS: u32 = 7;

fn default_imports_after_action() -> String {
    "move".into()
}

/// Machine-local remote library connection (never synced).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteConfig {
    /// When true, the desktop app prefers the cloud catalog over local folders.
    pub enabled: bool,
    /// Gateway base URL, e.g. `https://3d-library.example.com` (no trailing `/v1`).
    pub base_url: String,
    /// Bearer API key for `/v1/*` (except health).
    pub api_key: String,
    /// How long downloaded model files stay in the local cache (days).
    pub cache_ttl_days: u32,
    /// Local Bambu / MakerWorld download folder used as an import staging area.
    #[serde(default)]
    pub imports_folder_path: String,
    /// After a successful cloud import: `keep` | `move` (to Imported/) | `delete`.
    #[serde(default = "default_imports_after_action")]
    pub imports_after_action: String,
    /// After editing in Bambu Studio, auto `PUT` replace when returning to the app.
    #[serde(default)]
    pub auto_sync_on_return: bool,
}

impl Default for RemoteConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            base_url: String::new(),
            api_key: String::new(),
            cache_ttl_days: DEFAULT_CACHE_TTL_DAYS,
            imports_folder_path: String::new(),
            imports_after_action: default_imports_after_action(),
            auto_sync_on_return: false,
        }
    }
}

impl RemoteConfig {
    pub fn is_configured(&self) -> bool {
        !self.base_url.trim().is_empty() && !self.api_key.trim().is_empty()
    }

    /// Normalized origin without trailing slash; `/v1` suffix stripped if present.
    pub fn api_origin(&self) -> Result<String, String> {
        let trimmed = self.base_url.trim().trim_end_matches('/');
        if trimmed.is_empty() {
            return Err("Cloud URL is required.".into());
        }

        let parsed = url::Url::parse(trimmed)
            .map_err(|_| "Cloud URL must be a valid http(s) address.".to_string())?;

        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err("Cloud URL must start with http:// or https://".into());
        }

        let mut origin = trimmed.to_string();
        if let Some(stripped) = origin
            .strip_suffix("/v1")
            .or_else(|| origin.strip_suffix("/V1"))
        {
            origin = stripped.trim_end_matches('/').to_string();
        }

        Ok(origin)
    }

    pub fn v1_url(&self, path: &str) -> Result<String, String> {
        let origin = self.api_origin()?;
        let path = path.trim_start_matches('/');
        Ok(format!("{origin}/v1/{path}"))
    }
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data dir: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create app data dir: {error}"))?;
    Ok(dir.join(CONFIG_FILENAME))
}

pub fn load_config(app: &AppHandle) -> Result<RemoteConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(RemoteConfig::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read remote config: {error}"))?;
    let mut config: RemoteConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("Could not parse remote config: {error}"))?;

    if config.cache_ttl_days == 0 {
        config.cache_ttl_days = DEFAULT_CACHE_TTL_DAYS;
    }
    let action = config.imports_after_action.trim().to_ascii_lowercase();
    if action != "keep" && action != "move" && action != "delete" {
        config.imports_after_action = default_imports_after_action();
    }

    Ok(config)
}

pub fn save_config(app: &AppHandle, config: &RemoteConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Could not serialize remote config: {error}"))?;
    fs::write(&path, raw).map_err(|error| format!("Could not save remote config: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_trailing_v1_and_slash() {
        let config = RemoteConfig {
            enabled: true,
            base_url: "https://api.example.com/v1/".into(),
            api_key: "secret".into(),
            cache_ttl_days: 7,
            imports_folder_path: String::new(),
            imports_after_action: "move".into(),
            auto_sync_on_return: false,
        };
        assert_eq!(config.api_origin().unwrap(), "https://api.example.com");
        assert_eq!(
            config.v1_url("health").unwrap(),
            "https://api.example.com/v1/health"
        );
    }

    #[test]
    fn rejects_empty_url() {
        let config = RemoteConfig::default();
        assert!(config.api_origin().is_err());
    }
}
