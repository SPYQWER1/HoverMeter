//! 应用设置持久化模块
//!
//! 使用 JSON 文件存储用户设置（API Key、刷新间隔、不透明度、开机自启）。
//! 文件位于 Tauri 应用数据目录下的 `settings.json`。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

// ─── 数据结构 ────────────────────────────────────

/// 应用设置，以 JSON 格式持久化在应用数据目录中
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// DeepSeek API 密钥
    #[serde(default)]
    pub deepseek_api_key: String,
    /// 数据刷新间隔（分钟）
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval: i32,
    /// 窗口不透明度（0.0–1.0）
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    /// 是否启用开机自启
    #[serde(default)]
    pub autostart: bool,
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
            autostart: false,
        }
    }
}

// ─── 设置文件路径 ────────────────────────────────

/// 获取 `settings.json` 的完整路径。
///
/// 如果应用数据目录不存在则自动创建。
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

/// 将设置序列化为 JSON 并写入 `settings.json`。
fn save_settings_inner(
    deepseek_api_key: &str,
    refresh_interval: i32,
    opacity: f64,
    autostart: bool,
    app_handle: &AppHandle,
) -> Result<(), String> {
    log::info!(
        "Saving settings: refresh_interval={refresh_interval}, opacity={opacity}, autostart={autostart}, key_len={}",
        deepseek_api_key.len()
    );
    let path = settings_path(app_handle)?;
    let settings = Settings {
        deepseek_api_key: deepseek_api_key.to_string(),
        refresh_interval,
        opacity,
        autostart,
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

/// 从 `settings.json` 加载设置。
///
/// 文件不存在或解析失败时返回默认值。
fn load_settings_inner(app_handle: &AppHandle) -> Settings {
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

// ─── Tauri 命令 ──────────────────────────────────

/// 保存应用设置到 JSON 文件。
#[tauri::command]
pub fn save_settings(
    deepseek_api_key: String,
    refresh_interval: i32,
    opacity: f64,
    autostart: bool,
    app_handle: AppHandle,
) -> Result<(), String> {
    log::info!("save_settings command invoked");
    save_settings_inner(&deepseek_api_key, refresh_interval, opacity, autostart, &app_handle)
}

/// 从 JSON 文件加载应用设置。
#[tauri::command]
pub fn load_settings(app_handle: AppHandle) -> Settings {
    log::info!("load_settings command invoked");
    load_settings_inner(&app_handle)
}
