use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

// ─── Data Structures ─────────────────────────────

/// API credentials stored in OS keyring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub volcano_ak: String,
    pub volcano_sk: String,
    pub deepseek_key: String,
}

/// Application settings persisted as JSON in app data dir
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval: i32,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
}

fn default_refresh_interval() -> i32 {
    5
}

fn default_opacity() -> f64 {
    0.85
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            refresh_interval: default_refresh_interval(),
            opacity: default_opacity(),
        }
    }
}

// ─── Keyring Constants ───────────────────────────

const KEYRING_SERVICE: &str = "hovermeter";
const KEYRING_USER_AK: &str = "volcano_ak";
const KEYRING_USER_SK: &str = "volcano_sk";
const KEYRING_USER_DEEPSEEK: &str = "deepseek_key";

// ─── Keyring Helpers ─────────────────────────────

fn set_keyring(user: &str, password: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, user).map_err(|e| format!("Failed to create keyring entry: {e}"))?;
    entry
        .set_password(password)
        .map_err(|e| format!("Failed to save credential to keyring: {e}"))
}

fn get_keyring(user: &str) -> Result<String, String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, user).map_err(|e| format!("Failed to create keyring entry: {e}"))?;
    entry
        .get_password()
        .map_err(|e| format!("Failed to read credential from keyring: {e}"))
}

fn delete_keyring(user: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, user).map_err(|e| format!("Failed to create keyring entry: {e}"))?;
    entry
        .delete_credential()
        .map_err(|e| format!("Failed to delete credential from keyring: {e}"))
}

// ─── Internal API ─────────────────────────────────

/// Save all three API credentials to the OS keyring.
fn save_creds(volcano_ak: &str, volcano_sk: &str, deepseek_key: &str) -> Result<(), String> {
    set_keyring(KEYRING_USER_AK, volcano_ak)?;
    set_keyring(KEYRING_USER_SK, volcano_sk)?;
    set_keyring(KEYRING_USER_DEEPSEEK, deepseek_key)?;
    Ok(())
}

/// Load all three API credentials from the OS keyring.
/// Returns `None` if any credential is missing or cannot be read.
fn load_creds() -> Option<Credentials> {
    let volcano_ak = get_keyring(KEYRING_USER_AK).ok()?;
    let volcano_sk = get_keyring(KEYRING_USER_SK).ok()?;
    let deepseek_key = get_keyring(KEYRING_USER_DEEPSEEK).ok()?;
    Some(Credentials {
        volcano_ak,
        volcano_sk,
        deepseek_key,
    })
}

/// Delete all three API credentials from the OS keyring.
#[allow(dead_code)]
fn delete_creds() -> Result<(), String> {
    // Ignore errors for individual deletions — some may not exist
    let _ = delete_keyring(KEYRING_USER_AK);
    let _ = delete_keyring(KEYRING_USER_SK);
    let _ = delete_keyring(KEYRING_USER_DEEPSEEK);
    Ok(())
}

// ─── Settings Path ───────────────────────────────

fn settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data directory {data_dir:?}: {e}"))?;
    Ok(data_dir.join("settings.json"))
}

/// Persist settings to a JSON file in the Tauri app data directory.
fn save_setts(refresh_interval: i32, opacity: f64, app_handle: &AppHandle) -> Result<(), String> {
    let path = settings_path(app_handle)?;
    let settings = Settings {
        refresh_interval,
        opacity,
    };
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write settings to {path:?}: {e}"))
}

/// Load settings from the JSON file in the Tauri app data directory.
/// Returns default values if the file does not exist or cannot be parsed.
fn load_setts(app_handle: &AppHandle) -> Settings {
    let path = match settings_path(app_handle) {
        Ok(p) => p,
        Err(_) => return Settings::default(),
    };
    if !path.exists() {
        return Settings::default();
    }
    let json = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Settings::default(),
    };
    serde_json::from_str(&json).unwrap_or_default()
}

// ─── Tauri Commands ──────────────────────────────

#[tauri::command]
pub fn save_credentials(
    volcano_access_key: String,
    volcano_secret_key: String,
    deepseek_api_key: String,
) -> Result<(), String> {
    save_creds(&volcano_access_key, &volcano_secret_key, &deepseek_api_key)
}

#[tauri::command]
pub fn load_credentials() -> Option<Credentials> {
    load_creds()
}

#[tauri::command]
pub fn save_settings(refresh_interval: i32, opacity: f64, app_handle: AppHandle) -> Result<(), String> {
    save_setts(refresh_interval, opacity, &app_handle)
}

#[tauri::command]
pub fn load_settings(app_handle: AppHandle) -> Settings {
    load_setts(&app_handle)
}
