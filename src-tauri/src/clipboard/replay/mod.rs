//! Clipboard replay and macOS paste-back helpers.

use crate::{
    app_state::AppState,
    clipboard::types::{ClipboardReplayRequest, ClipboardReturnResult},
};
use tauri::AppHandle;

mod authorization;
mod focus;
mod pasteboard;

#[cfg(target_os = "macos")]
use {
    self::{
        authorization::{
            current_app_authorization_target, current_app_bundle_path,
            current_app_bundle_signature_issue, current_app_uses_adhoc_signature,
            is_accessibility_trusted, open_accessibility_settings_impl,
        },
        focus::{
            activate_target_application, post_command_v, resolve_clipboard_window_target,
            wait_for_target_focus_state, TargetFocusState,
        },
        pasteboard::copy_capture_to_clipboard_macos,
    },
    chrono::Local,
    tauri::Manager,
};

pub(crate) fn copy_capture_to_clipboard(
    state: &AppState,
    capture: &ClipboardReplayRequest,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return write_capture_to_pasteboard(state, capture);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        let _ = capture;
        Err("Clipboard replay is only supported on macOS".into())
    }
}

pub(crate) fn return_capture_to_previous_app(
    app: &AppHandle,
    state: &AppState,
    capture: &ClipboardReplayRequest,
) -> Result<ClipboardReturnResult, String> {
    #[cfg(target_os = "macos")]
    {
        let Some(target) = state.clipboard_window_target()? else {
            log::warn!("clipboard return skipped because no previous app target was recorded");
            return Ok(ClipboardReturnResult { pasted: false });
        };
        let target_name = target
            .app_name
            .as_deref()
            .or(target.bundle_id.as_deref())
            .unwrap_or("the previous app");
        let Some(application) = resolve_clipboard_window_target(&target) else {
            log::warn!(
                "clipboard return skipped because the previous app target could not be resolved for {}",
                target_name
            );
            return Ok(ClipboardReturnResult { pasted: false });
        };

        if current_app_bundle_path().is_none() {
            let authorization_target = current_app_authorization_target();
            log::warn!(
                "clipboard return skipped because the current runtime is not a packaged app bundle: {}",
                authorization_target
            );
            return Err(format!(
                "Tino paste back requires the packaged Preview app. The current process is the unbundled development runtime at {} launched by `pnpm tauri dev`, and macOS cannot grant Accessibility permission to that copy from System Settings. Build/install and run the Preview app instead.",
                authorization_target
            ));
        }

        if let Some(signature_issue) = current_app_bundle_signature_issue(&app.config().identifier)
        {
            log::warn!(
                "clipboard return skipped because the current app bundle signature is invalid: {}",
                signature_issue
            );
            return Err(signature_issue);
        }

        if current_app_uses_adhoc_signature().unwrap_or(false) && !is_accessibility_trusted() {
            log::warn!(
                "clipboard return skipped because the current app is still ad-hoc signed, so Accessibility trust will not stick across rebuilds"
            );
            return Err(
                "Tino Preview is still using ad-hoc macOS signing. Accessibility permission can reset after every rebuild for ad-hoc signed apps, so repeating the authorization flow is not a stable fix. Set up local signing with `pnpm macos:setup-local-signing`, rebuild/install the app, then grant Accessibility once for that rebuilt copy."
                    .into(),
            );
        }

        if !is_accessibility_trusted() {
            if let Err(error) = open_accessibility_settings_impl() {
                log::warn!("failed to open Accessibility settings: {}", error);
            }
            let authorization_target = current_app_authorization_target();
            log::warn!(
                "clipboard return skipped because Accessibility access is not granted for {} (current app target: {})",
                target_name,
                authorization_target
            );
            return Err(format!(
                "Tino needs macOS Accessibility permission before it can paste back into {}. Make sure you enabled the same app copy that is currently running: {}. After you turn that checkbox on in System Settings, fully quit and reopen that same Tino app before trying again. On some Macs the permission does not take effect until the app is restarted.",
                target_name,
                authorization_target
            ));
        }

        if let Some(window) = app.get_webview_window("clipboard") {
            let _ = window.hide();
        }

        if !activate_target_application(&application) {
            log::warn!(
                "clipboard return failed because the previous app could not be reactivated for {}",
                target_name
            );
            return Err("failed to reactivate the previous app".into());
        }

        let target_pid = application.processIdentifier();
        let focus_state = wait_for_target_focus_state(target_pid);
        if focus_state == TargetFocusState::Unavailable {
            log::warn!(
                "clipboard return skipped because no usable paste target could be restored in {}",
                target_name
            );
            return Ok(ClipboardReturnResult { pasted: false });
        }
        if focus_state != TargetFocusState::EditableFocusedElement {
            log::info!(
                "clipboard return proceeding with fallback paste into {} using focus state {:?}",
                target_name,
                focus_state
            );
        }

        write_capture_to_pasteboard(state, capture)?;
        post_command_v()?;
        log::info!("clipboard return pasted successfully into {}", target_name);

        return Ok(ClipboardReturnResult { pasted: true });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = state;
        let _ = capture;
        Err("Clipboard return is only supported on macOS".into())
    }
}

pub(crate) fn accessibility_permission_status() -> bool {
    authorization::is_accessibility_trusted()
}

pub(crate) fn open_accessibility_settings() -> Result<(), String> {
    authorization::open_accessibility_settings_impl()
}

#[cfg(target_os = "macos")]
fn write_capture_to_pasteboard(
    state: &AppState,
    capture: &ClipboardReplayRequest,
) -> Result<(), String> {
    let replay_timestamp = Local::now().to_rfc3339();
    let replay_hash = copy_capture_to_clipboard_macos(capture)?;
    state.register_replay_hash(replay_hash, replay_timestamp, capture.capture_id.clone())?;
    Ok(())
}
