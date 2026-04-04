use crate::app_state::{AppSettings, AppState, DashboardSnapshot};
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
