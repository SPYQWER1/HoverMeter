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

/// Simple guard to ignore rapid consecutive tray toggles, which can deadlock
/// WebView2 on Windows when combined with transparent always-on-top windows.
struct TrayToggleGuard(AtomicBool);

impl TrayToggleGuard {
    fn new() -> Self {
        Self(AtomicBool::new(false))
    }

    fn try_acquire(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }

    fn release(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Open the directory containing the application log files.
#[tauri::command]
fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to resolve log directory: {e}"))?;

    log::info!("Opening log directory: {:?}", log_dir);

    app.opener()
        .open_path(log_dir.to_string_lossy(), None::<&str>)
        .map_err(|e| format!("Failed to open log directory: {e}"))?;

    Ok(())
}

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
                .rotation_strategy(RotationStrategy::KeepAll)
                .max_file_size(1_000_000) // 1 MB
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_positioner::init())
        .manage(TrayToggleGuard::new())
        .on_window_event(|window, event| {
            // Close hides to tray instead of quitting. Let the frontend handle the
            // actual hide so it can wait for any window animations to finish first.
            if let WindowEvent::CloseRequested { api, .. } = event {
                log::info!("Close requested; hiding to tray instead of quitting");
                api.prevent_close();
                let _ = window.emit("hide-requested", ());
            }
        })
        .setup(|app| {
            log::info!("HoverMeter starting up");

            // Build tray menu: Show Widget / Settings / --- / Quit
            let show_widget = MenuItem::with_id(app, "show", "Show Widget", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let logs = MenuItem::with_id(app, "logs", "Open Logs", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
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
                    // Left-click toggles main window visibility.
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
                            if window.is_visible().unwrap_or(false) {
                                // Ask the frontend to hide so any in-flight dock
                                // animation can settle first.
                                let _ = window.emit("hide-requested", ());
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("show-widget", ());
                            }
                        }

                        guard.release();
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            open_log_dir,
            deepseek::get_deepseek_balance,
            volcano::get_volcano_usage,
            storage::save_credentials,
            storage::load_credentials,
            storage::save_settings,
            storage::load_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
