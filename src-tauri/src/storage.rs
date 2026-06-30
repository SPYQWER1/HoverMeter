use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

// ─── Data Structures ─────────────────────────────

/// Application settings persisted as JSON in app data dir
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub deepseek_api_key: String,
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
            deepseek_api_key: String::new(),
            refresh_interval: default_refresh_interval(),
            opacity: default_opacity(),
        }
    }
}

// ─── Settings Path ───────────────────────────────

fn settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| {
            let msg = format!("无法解析应用数据目录: {e}");
            log::error!("{msg}");
            msg
        })?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| {
            let msg = format!("无法创建应用数据目录 {data_dir:?}: {e}");
            log::error!("{msg}");
            msg
        })?;
    Ok(data_dir.join("settings.json"))
}

/// Persist settings to a JSON file in the Tauri app data directory.
fn save_setts(
    deepseek_api_key: &str,
    refresh_interval: i32,
    opacity: f64,
    app_handle: &AppHandle,
) -> Result<(), String> {
    log::info!(
        "Saving settings: refresh_interval={refresh_interval}, opacity={opacity}, key_len={}",
        deepseek_api_key.len()
    );
    let path = settings_path(app_handle)?;
    let settings = Settings {
        deepseek_api_key: deepseek_api_key.to_string(),
        refresh_interval,
        opacity,
    };
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| {
            let msg = format!("序列化设置失败: {e}");
            log::error!("{msg}");
            msg
        })?;
    std::fs::write(&path, json).map_err(|e| {
        let msg = format!("写入设置到 {path:?} 失败: {e}");
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
pub fn save_settings(
    deepseek_api_key: String,
    refresh_interval: i32,
    opacity: f64,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("save_settings command invoked");
    save_setts(&deepseek_api_key, refresh_interval, opacity, &app_handle)
}

#[tauri::command]
pub fn load_settings(app_handle: AppHandle) -> Settings {
    log::info!("load_settings command invoked");
    load_setts(&app_handle)
}
