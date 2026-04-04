use crate::app_state::{AppSettings, AppState, DashboardSnapshot};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::process::Command;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn get_dashboard_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DashboardSnapshot, String> {
    state.dashboard_snapshot(&app)
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.current_settings()
}

#[tauri::command]
pub fn save_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    state.save_settings(settings)
}

#[tauri::command]
pub fn load_image_asset_data_url(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn open_in_preview(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .args(["-a", "Preview", &path])
            .status()
            .map_err(|error| error.to_string())?;

        if status.success() {
            return Ok(());
        }

        return Err(format!("failed to open Preview for {}", path));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Open in Preview is only supported on macOS".into())
    }
}
