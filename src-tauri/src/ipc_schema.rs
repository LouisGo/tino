use std::{fs, path::PathBuf};

use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

use crate::commands::shell;

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        shell::get_dashboard_snapshot,
        shell::get_clipboard_page,
        shell::delete_clipboard_capture,
        shell::get_app_settings,
        shell::save_app_settings,
        shell::toggle_main_window_visibility,
        shell::toggle_clipboard_window_visibility,
        shell::get_log_directory,
        shell::open_in_preview,
        shell::copy_capture_to_clipboard,
        shell::reveal_in_file_manager,
    ])
}

pub fn bindings_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings/tauri.ts")
}

pub fn export_typescript_bindings() -> Result<(), String> {
    let path = bindings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    builder()
        .export(Typescript::default(), &path)
        .map_err(|error| error.to_string())
}
