//! HoverMeter 应用入口模块
//!
//! 负责 Tauri 应用初始化：插件注册、系统托盘、窗口事件处理、命令注册。

mod deepseek;
mod storage;
mod volcano;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_autostart::ManagerExt;

/// 托盘切换守卫：防止 Windows 上快速连续点击托盘图标导致 WebView2 死锁。
///
/// 透明 always-on-top 窗口在快速 show/hide 切换时可能使 WebView2 无响应，
/// 此原子锁确保同一时间只有一个切换操作在进行。
struct TrayToggleGuard(AtomicBool);

impl TrayToggleGuard {
    fn new() -> Self {
        Self(AtomicBool::new(false))
    }

    /// 尝试获取守卫锁。返回 true 表示获取成功，可以执行切换操作。
    fn try_acquire(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }

    /// 释放守卫锁。
    fn release(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// 启用或禁用系统开机自启动。
///
/// 通过 Tauri autostart 插件操作 OS 注册表/LaunchAgent。
/// 操作完成后验证实际状态是否与请求一致。
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    log::info!("Attempting to set autostart to {enable}");
    let manager = app.autolaunch();
    if enable {
        manager.enable().map_err(|e| {
            let msg = format!("启用开机自启失败: {e}");
            log::error!("{msg}");
            msg
        })?;
    } else {
        manager.disable().map_err(|e| {
            let msg = format!("禁用开机自启失败: {e}");
            log::error!("{msg}");
            msg
        })?;
    }

    match manager.is_enabled() {
        Ok(state) => {
            log::info!("Autostart set to {enable}, verified OS state: {state}");
            if state != enable {
                log::warn!(
                    "Autostart state mismatch: requested {enable} but OS reports {state}"
                );
            }
        }
        Err(e) => {
            log::warn!("Autostart operation completed but could not verify state: {e}");
        }
    }

    Ok(())
}

/// 查询系统开机自启动状态。
#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("查询开机自启状态失败: {e}"))
}

/// 通过系统文件管理器打开应用日志目录。
#[tauri::command]
fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("无法解析日志目录: {e}"))?;

    log::info!("Opening log directory: {:?}", log_dir);

    app.opener()
        .open_path(log_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("无法打开日志目录: {e}"))?;

    Ok(())
}

/// Tauri 应用入口。
///
/// 配置日志（单文件轮转、100KB 上限、Info 级别）、
/// 注册所有插件（opener/autostart/window-state/positioner/single-instance）、
/// 设置系统托盘（左键切换显示、右键菜单）、
/// 拦截窗口关闭事件（隐藏到托盘而非退出）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir {
                        file_name: Some("hovermeter".to_string()),
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .rotation_strategy(RotationStrategy::KeepOne)
                .max_file_size(100_000) // 100 KB
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .plugin(tauri_plugin_positioner::init())
        .manage(TrayToggleGuard::new())
        .on_window_event(|window, event| {
            // 关闭窗口时拦截默认行为，发送 hide-requested 事件给前端，
            // 让前端等待停靠动画完成后再隐藏窗口。
            if let WindowEvent::CloseRequested { api, .. } = event {
                log::info!("Close requested; hiding to tray instead of quitting");
                api.prevent_close();
                let _ = window.emit("hide-requested", ());
            }
        })
        .setup(|app| {
            log::info!("HoverMeter starting up");

            // 构建托盘右键菜单：显示面板 / 设置 / 打开日志 / --- / 退出
            let show_widget = MenuItem::with_id(app, "show", "显示面板", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let logs = MenuItem::with_id(app, "logs", "打开日志", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_widget, &settings, &logs, &separator, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("default window icon missing"),
                )
                .tooltip("HoverMeter")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("show-widget", ());
                        }
                    }
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.emit("show-settings", ());
                            let _ = window.set_focus();
                        }
                    }
                    "logs" => {
                        if let Err(e) = open_log_dir(app.clone()) {
                            log::error!("Failed to open log directory from tray: {e}");
                        }
                    }
                    "quit" => {
                        log::info!("Quit requested from tray menu");
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键点击托盘图标：切换主窗口显示/隐藏
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let guard = app.state::<TrayToggleGuard>();
                        if !guard.try_acquire() {
                            return;
                        }

                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("show-widget", ());
                        }

                        guard.release();
                    }
                })
                .build(app)?;

            match app.autolaunch().is_enabled() {
                Ok(enabled) => {
                    log::info!(
                        "Autostart is currently {}enabled",
                        if enabled { "" } else { "not " }
                    );
                }
                Err(e) => {
                    log::warn!("Could not check autostart state at startup: {e}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_log_dir,
            set_autostart,
            get_autostart,
            deepseek::get_deepseek_balance,
            volcano::get_volcano_usage,
            storage::save_settings,
            storage::load_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
