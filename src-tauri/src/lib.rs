mod app_state;
mod capture;
mod commands;

use app_state::AppState;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, RunEvent, WindowEvent,
};

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";

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

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Tino", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
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
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            create_tray(app.handle())?;
            restore_main_window_state(app.handle());

            let app_state = AppState::new(app.handle())?;
            capture::spawn_clipboard_watcher(app_state.clone());
            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::shell::get_dashboard_snapshot,
            commands::shell::get_app_settings,
            commands::shell::save_app_settings,
            commands::shell::load_image_asset_data_url
        ])
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
