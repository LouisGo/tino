use crate::app_state::{AppSettings, AppState, DashboardSnapshot};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use std::{fs, path::Path, process::Command};
use tauri::{AppHandle, State};

#[cfg(target_os = "macos")]
use {
    chrono::Local,
    objc2_app_kit::{
        NSPasteboard, NSPasteboardTypeHTML, NSPasteboardTypePNG, NSPasteboardTypeRTF,
        NSPasteboardTypeString,
    },
    objc2_foundation::{NSData, NSString},
    sha2::{Digest, Sha256},
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReplayRequest {
    content_kind: String,
    raw_text: String,
    raw_rich: Option<String>,
    raw_rich_format: Option<String>,
    link_url: Option<String>,
    asset_path: Option<String>,
}

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
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
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

#[tauri::command]
pub fn copy_capture_to_clipboard(
    state: State<'_, AppState>,
    capture: ClipboardReplayRequest,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let replay_timestamp = Local::now().to_rfc3339();
        let replay_hash = copy_capture_to_clipboard_macos(&capture)?;
        state.register_replay_hash(replay_hash, replay_timestamp)?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        let _ = capture;
        Err("Clipboard replay is only supported on macOS".into())
    }
}

#[tauri::command]
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

#[cfg(target_os = "macos")]
fn copy_capture_to_clipboard_macos(capture: &ClipboardReplayRequest) -> Result<String, String> {
    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();

    match capture.content_kind.as_str() {
        "image" => {
            let asset_path = capture
                .asset_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "image capture is missing assetPath".to_string())?;
            let image_bytes = fs::read(asset_path).map_err(|error| error.to_string())?;
            let data = NSData::from_vec(image_bytes.clone());

            if !pasteboard.setData_forType(Some(&data), unsafe { NSPasteboardTypePNG }) {
                return Err("failed to write image to clipboard".into());
            }

            let raw_text = if capture.raw_text.trim().is_empty() {
                "Clipboard image".to_string()
            } else {
                capture.raw_text.clone()
            };

            return Ok(build_capture_hash(
                "image",
                &raw_text,
                None,
                Some(image_bytes.as_slice()),
            ));
        }
        "link" => {
            let text = capture
                .link_url
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&capture.raw_text);
            let string = NSString::from_str(text);

            if !pasteboard.setString_forType(&string, unsafe { NSPasteboardTypeString }) {
                return Err("failed to write link to clipboard".into());
            }

            return Ok(build_capture_hash("link", text, None, None::<&[u8]>));
        }
        "rich_text" => {
            let plain_text = NSString::from_str(&capture.raw_text);
            if !pasteboard.setString_forType(&plain_text, unsafe { NSPasteboardTypeString }) {
                return Err("failed to write text fallback to clipboard".into());
            }

            if let Some(raw_rich) = capture.raw_rich.as_deref() {
                let bytes = NSData::from_vec(raw_rich.as_bytes().to_vec());
                match capture.raw_rich_format.as_deref() {
                    Some("html") => {
                        let _ = pasteboard
                            .setData_forType(Some(&bytes), unsafe { NSPasteboardTypeHTML });
                    }
                    Some("rtf") => {
                        let _ = pasteboard
                            .setData_forType(Some(&bytes), unsafe { NSPasteboardTypeRTF });
                    }
                    _ => {}
                }
            }

            return Ok(build_capture_hash(
                "rich_text",
                &capture.raw_text,
                capture.raw_rich.as_deref(),
                None::<&[u8]>,
            ));
        }
        _ => {
            let string = NSString::from_str(&capture.raw_text);

            if !pasteboard.setString_forType(&string, unsafe { NSPasteboardTypeString }) {
                return Err("failed to write text to clipboard".into());
            }

            Ok(build_capture_hash(
                "plain_text",
                &capture.raw_text,
                None,
                None::<&[u8]>,
            ))
        }
    }
}

#[cfg(target_os = "macos")]
fn build_capture_hash(
    content_kind: &str,
    raw_text: &str,
    raw_rich: Option<&str>,
    image_bytes: Option<&[u8]>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content_kind.as_bytes());
    hasher.update([0]);
    hasher.update(raw_text.as_bytes());

    if let Some(raw_rich) = raw_rich {
        hasher.update([0]);
        hasher.update(raw_rich.as_bytes());
    }

    if let Some(image_bytes) = image_bytes {
        hasher.update([0]);
        hasher.update(image_bytes);
    }

    format!("{:x}", hasher.finalize())
}
