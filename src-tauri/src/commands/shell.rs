use crate::app_state::{AppSettings, AppState, ClipboardSourceAppOption, DashboardSnapshot};
use crate::clipboard::types::{
    CapturePreview, ClipboardBoardBootstrap, ClipboardPage, ClipboardPageRequest,
    ClipboardReplayRequest, ClipboardReturnResult, DeleteClipboardCaptureResult,
    PinnedClipboardCapture, UpdateClipboardPinResult,
};
use crate::clipboard::{
    replay,
    source_apps::{self, ClipboardSourceAppIconResult},
};
use crate::error::{IpcError, IpcResult};
use serde::Deserialize;
use specta::Type;
use std::{path::Path, process::Command};
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteClipboardCaptureRequest {
    id: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetClipboardCapturePinnedRequest {
    capture: CapturePreview,
    pinned: bool,
    #[serde(default)]
    replace_oldest: bool,
}

#[tauri::command]
#[specta::specta]
pub fn get_dashboard_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DashboardSnapshot, String> {
    state.dashboard_snapshot(&app)
}

#[tauri::command]
#[specta::specta]
pub fn get_clipboard_page(
    state: State<'_, AppState>,
    request: ClipboardPageRequest,
) -> Result<ClipboardPage, String> {
    state.clipboard_page(request)
}

#[tauri::command]
#[specta::specta]
pub fn get_clipboard_board_bootstrap(
    state: State<'_, AppState>,
) -> Result<ClipboardBoardBootstrap, String> {
    state.clipboard_board_bootstrap()
}

#[tauri::command]
#[specta::specta]
pub fn get_pinned_clipboard_captures(
    state: State<'_, AppState>,
) -> Result<Vec<PinnedClipboardCapture>, String> {
    state.pinned_clipboard_captures()
}

#[tauri::command]
#[specta::specta]
pub fn set_clipboard_capture_pinned(
    state: State<'_, AppState>,
    request: SetClipboardCapturePinnedRequest,
) -> Result<UpdateClipboardPinResult, String> {
    state.set_clipboard_capture_pinned(request.capture, request.pinned, request.replace_oldest)
}

#[tauri::command]
#[specta::specta]
pub fn delete_clipboard_capture(
    state: State<'_, AppState>,
    request: DeleteClipboardCaptureRequest,
) -> Result<DeleteClipboardCaptureResult, String> {
    state.delete_clipboard_capture(request.id)
}

#[tauri::command]
#[specta::specta]
pub fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.current_settings()
}

#[tauri::command]
#[specta::specta]
pub async fn list_clipboard_source_apps(
    state: State<'_, AppState>,
) -> Result<Vec<ClipboardSourceAppOption>, String> {
    source_apps::list_clipboard_source_apps(state.inner()).await
}

#[tauri::command]
#[specta::specta]
pub fn get_clipboard_source_app_icons(
    app: AppHandle,
    state: State<'_, AppState>,
    app_paths: Vec<String>,
) -> Result<Vec<ClipboardSourceAppIconResult>, String> {
    source_apps::get_clipboard_source_app_icons(&app, state.inner(), app_paths)
}

#[tauri::command]
#[specta::specta]
pub fn report_app_activity(state: State<'_, AppState>) -> Result<(), String> {
    state.record_app_activity()
}

#[tauri::command]
#[specta::specta]
pub fn save_app_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    state.save_settings(settings)
}

#[tauri::command]
#[specta::specta]
pub fn toggle_main_window_visibility(app: AppHandle) -> Result<bool, String> {
    crate::toggle_main_window_visibility(&app)
}

#[tauri::command]
#[specta::specta]
pub fn toggle_clipboard_window_visibility(app: AppHandle) -> Result<bool, String> {
    crate::toggle_clipboard_window_visibility(&app)
}

#[tauri::command]
#[specta::specta]
pub fn get_clipboard_window_target_app_name(
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    Ok(state.clipboard_window_target()?.and_then(|target| {
        target
            .app_name
            .or(target.bundle_id)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }))
}

#[tauri::command]
#[specta::specta]
pub fn get_log_directory(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_log_dir()
        .map(|path| path.display().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
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

#[tauri::command]
#[specta::specta]
pub fn copy_capture_to_clipboard(
    state: State<'_, AppState>,
    capture: ClipboardReplayRequest,
) -> IpcResult<()> {
    replay::copy_capture_to_clipboard(state.inner(), &capture).map_err(IpcError::from)
}

#[tauri::command]
#[specta::specta]
pub fn return_capture_to_previous_app(
    app: AppHandle,
    state: State<'_, AppState>,
    capture: ClipboardReplayRequest,
) -> IpcResult<ClipboardReturnResult> {
    replay::return_capture_to_previous_app(&app, state.inner(), &capture).map_err(IpcError::from)
}

#[tauri::command]
#[specta::specta]
pub fn get_accessibility_permission_status() -> bool {
    replay::accessibility_permission_status()
}

#[tauri::command]
#[specta::specta]
pub fn open_accessibility_settings() -> IpcResult<()> {
    replay::open_accessibility_settings().map_err(IpcError::from)
}

#[tauri::command]
#[specta::specta]
pub fn request_app_restart(app: AppHandle) -> Result<(), String> {
    app.request_restart();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("path is required".into());
    }

    let target = Path::new(trimmed);

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        if target.is_file() {
            command.arg("-R");
        }
        let status = command
            .arg(trimmed)
            .status()
            .map_err(|error| error.to_string())?;

        if status.success() {
            return Ok(());
        }

        return Err(format!("failed to reveal {}", trimmed));
    }

    #[cfg(target_os = "windows")]
    {
        let status = if target.is_file() {
            Command::new("explorer")
                .args(["/select,", trimmed])
                .status()
                .map_err(|error| error.to_string())?
        } else {
            Command::new("explorer")
                .arg(trimmed)
                .status()
                .map_err(|error| error.to_string())?
        };

        if status.success() {
            return Ok(());
        }

        return Err(format!("failed to reveal {}", trimmed));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let open_target = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(target)
        };

        let status = Command::new("xdg-open")
            .arg(open_target)
            .status()
            .map_err(|error| error.to_string())?;

        if status.success() {
            return Ok(());
        }

        return Err(format!("failed to reveal {}", trimmed));
    }
}
