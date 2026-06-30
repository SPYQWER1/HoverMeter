use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

// ─── Data Structures ─────────────────────────────

/// API credentials stored in OS keyring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
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
const KEYRING_USER_DEEPSEEK: &str = "deepseek_key";

// ─── Keyring Helpers ─────────────────────────────

fn set_keyring(user: &str, password: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, user)
        .map_err(|e| {
            let msg = format!("Failed to create keyring entry: {e}");
            log::error!("{msg}");
            msg
        })?;
    entry
        .set_password(password)
        .map_err(|e| {
            let msg = format!("Failed to save credential to keyring: {e}");
            log::error!("{msg}");
            msg
        })
}

fn get_keyring(user: &str) -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, user)
        .map_err(|e| {
            let msg = format!("Failed to create keyring entry: {e}");
            log::error!("{msg}");
            msg
        })?;
    entry
        .get_password()
        .map_err(|e| {
            let msg = format!("Failed to read credential from keyring: {e}");
            log::warn!("{msg}");
            msg
        })
}

fn delete_keyring(user: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, user)
        .map_err(|e| {
            let msg = format!("Failed to create keyring entry: {e}");
            log::error!("{msg}");
            msg
        })?;
    entry
        .delete_credential()
        .map_err(|e| {
            let msg = format!("Failed to delete credential from keyring: {e}");
            log::error!("{msg}");
            msg
        })
}

// ─── Internal API ─────────────────────────────────

fn save_creds(deepseek_key: &str) -> Result<(), String> {
    log::info!("Saving DeepSeek credentials");
    set_keyring(KEYRING_USER_DEEPSEEK, deepseek_key)
}

fn load_creds() -> Option<Credentials> {
    log::info!("Loading DeepSeek credentials");
    let deepseek_key = get_keyring(KEYRING_USER_DEEPSEEK).ok()?;
    log::info!("DeepSeek credentials loaded");
    Some(Credentials { deepseek_key })
}

#[allow(dead_code)]
fn delete_creds() -> Result<(), String> {
    log::info!("Deleting DeepSeek credentials");
    delete_keyring(KEYRING_USER_DEEPSEEK)
}

// ─── Settings Path ───────────────────────────────

fn settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            let msg = format!("Failed to resolve app data directory: {e}");
            log::error!("{msg}");
            msg
        })?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| {
            let msg = format!("Failed to create app data directory {data_dir:?}: {e}");
            log::error!("{msg}");
            msg
        })?;
    Ok(data_dir.join("settings.json"))
}

/// Persist settings to a JSON file in the Tauri app data directory.
fn save_setts(refresh_interval: i32, opacity: f64, app_handle: &AppHandle) -> Result<(), String> {
    log::info!("Saving settings: refresh_interval={refresh_interval}, opacity={opacity}");
    let path = settings_path(app_handle)?;
    let settings = Settings {
        refresh_interval,
        opacity,
    };
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| {
            let msg = format!("Failed to serialize settings: {e}");
            log::error!("{msg}");
            msg
        })?;
    std::fs::write(&path, json).map_err(|e| {
        let msg = format!("Failed to write settings to {path:?}: {e}");
        log::error!("{msg}");
        msg
    })
}

/// Load settings from the JSON file in the Tauri app data directory.
/// Returns default values if the file does not exist or cannot be parsed.
fn load_setts(app_handle: &AppHandle) -> Settings {
    log::info!("Loading settings");
    let path = match settings_path(app_handle) {
        Ok(p) => p,
        Err(_) => {
            log::warn!("Using default settings because settings path could not be resolved");
            return Settings::default();
        }
    };
    if !path.exists() {
        log::info!("Settings file does not exist; using defaults");
        return Settings::default();
    }
    let json = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Failed to read settings file: {e}; using defaults");
            return Settings::default();
        }
    };
    match serde_json::from_str::<Settings>(&json) {
        Ok(settings) => {
            log::info!("Settings loaded successfully");
            settings
        }
        Err(e) => {
            log::warn!("Failed to parse settings file: {e}; using defaults");
            Settings::default()
        }
    }
}

// ─── Tauri Commands ──────────────────────────────

#[tauri::command]
pub fn save_credentials(deepseek_api_key: String) -> Result<(), String> {
    log::info!("save_credentials command invoked");
    save_creds(&deepseek_api_key)
}

#[tauri::command]
pub fn load_credentials() -> Option<Credentials> {
    log::info!("load_credentials command invoked");
    load_creds()
}

#[tauri::command]
pub fn save_settings(
    refresh_interval: i32,
    opacity: f64,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("save_settings command invoked");
    save_setts(refresh_interval, opacity, &app_handle)
}

#[tauri::command]
pub fn load_settings(app_handle: AppHandle) -> Settings {
    log::info!("load_settings command invoked");
    load_setts(&app_handle)
}
