mod app_state;
mod capture;
mod commands;
pub mod ipc_schema;
mod storage;

use app_state::AppState;
#[cfg(target_os = "macos")]
use objc2_app_kit::NSWindow;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, WEBVIEW_TARGET};

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
const CLIPBOARD_WINDOW_WIDTH: f64 = 800.0;
const CLIPBOARD_WINDOW_HEIGHT: f64 = 500.0;
const LOG_MAX_FILE_SIZE_BYTES: u128 = 10_000_000;
const LOG_KEEP_COUNT: usize = 10;
const LOG_RETENTION_DAYS: u64 = 14;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

fn window_state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(WINDOW_STATE_FILE_NAME))
}

fn load_window_state(app: &AppHandle) -> Option<PersistedWindowState> {
    let path = window_state_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_main_window_state(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };

    let state = PersistedWindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
    };

    let Some(path) = window_state_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(raw) = serde_json::to_string_pretty(&state) {
        let _ = fs::write(path, raw);
    }
}

fn restore_main_window_state(app: &AppHandle) {
    let Some(state) = load_window_state(app) else {
        return;
    };
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));

    if state.maximized {
        let _ = window.maximize();
    }
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn focus_window(window: &tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn open_clipboard_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("clipboard") {
        focus_window(&window);
        return;
    }

    match WebviewWindowBuilder::new(app, "clipboard", WebviewUrl::App("/".into()))
        .title("Clipboard")
        .inner_size(CLIPBOARD_WINDOW_WIDTH, CLIPBOARD_WINDOW_HEIGHT)
        .min_inner_size(CLIPBOARD_WINDOW_WIDTH, CLIPBOARD_WINDOW_HEIGHT)
        .max_inner_size(CLIPBOARD_WINDOW_WIDTH, CLIPBOARD_WINDOW_HEIGHT)
        .center()
        .resizable(false)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .shadow(true)
        .build()
    {
        Ok(window) => focus_window(&window),
        Err(error) => log::error!("failed to open clipboard window: {}", error),
    }
}

fn prune_expired_logs(app: &AppHandle) {
    let Ok(log_dir) = app.path().app_log_dir() else {
        return;
    };

    if let Err(error) = prune_expired_log_files(
        &log_dir,
        Duration::from_secs(60 * 60 * 24 * LOG_RETENTION_DAYS),
    ) {
        log::warn!(
            "failed to prune expired logs in {}: {}",
            log_dir.display(),
            error
        );
    }
}

fn prune_expired_log_files(log_dir: &Path, max_age: Duration) -> Result<(), String> {
    if !log_dir.exists() {
        return Ok(());
    }

    let now = SystemTime::now();

    for entry in fs::read_dir(log_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|value| value.to_str()) != Some("log") {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let Ok(modified_at) = metadata.modified() else {
            continue;
        };
        let Ok(age) = now.duration_since(modified_at) else {
            continue;
        };

        if age <= max_age {
            continue;
        }

        fs::remove_file(&path).map_err(|error| error.to_string())?;
        log::info!("pruned expired log {}", path.display());
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn configure_native_macos_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let Ok(ns_window) = window.ns_window() else {
        return;
    };

    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
    ns_window.setMovableByWindowBackground(false);
}

#[cfg(not(target_os = "macos"))]
fn configure_native_macos_window(_app: &AppHandle) {}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Tino", true, None::<&str>)?;
    let clipboard_item = MenuItem::with_id(app, "clipboard", "Clipboard", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &clipboard_item, &quit_item])?;
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default Tauri icon should exist");

    let _ = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Tino")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => focus_main_window(app),
            "clipboard" => open_clipboard_window(app),
            "quit" => {
                save_main_window_state(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut log_targets = vec![
        Target::new(TargetKind::LogDir {
            file_name: Some("rust".into()),
        })
        .filter(|metadata| !metadata.target().starts_with(WEBVIEW_TARGET)),
        Target::new(TargetKind::LogDir {
            file_name: Some("renderer".into()),
        })
        .filter(|metadata| metadata.target().starts_with(WEBVIEW_TARGET)),
    ];

    if cfg!(debug_assertions) {
        log_targets.push(Target::new(TargetKind::Stdout));
    }

    #[cfg(debug_assertions)]
    ipc_schema::export_typescript_bindings()
        .expect("failed to export TypeScript bindings from Rust schema");

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .max_file_size(LOG_MAX_FILE_SIZE_BYTES)
                .rotation_strategy(RotationStrategy::KeepSome(LOG_KEEP_COUNT))
                .targets(log_targets)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            prune_expired_logs(app.handle());

            if let Ok(log_dir) = app.path().app_log_dir() {
                log::info!("log directory initialized at {}", log_dir.display());
            }

            create_tray(app.handle())?;
            restore_main_window_state(app.handle());
            configure_native_macos_window(app.handle());

            let app_state = AppState::new(app.handle())?;
            capture::spawn_clipboard_watcher(app_state.clone());
            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(ipc_schema::builder().invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => focus_main_window(app_handle),
        RunEvent::WindowEvent { label, event, .. } if label == "main" => match event {
            WindowEvent::Moved(_)
            | WindowEvent::Resized(_)
            | WindowEvent::CloseRequested { .. }
            | WindowEvent::ScaleFactorChanged { .. } => save_main_window_state(app_handle),
            _ => {}
        },
        _ => {}
    });
}
