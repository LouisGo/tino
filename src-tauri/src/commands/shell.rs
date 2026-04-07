use crate::app_state::{
    AppSettings, AppState, CapturePreview, ClipboardPage, ClipboardPageRequest,
    ClipboardWindowTarget, DashboardSnapshot, DeleteClipboardCaptureResult, PinnedClipboardCapture,
    UpdateClipboardPinResult,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "macos")]
use {
    chrono::Local,
    libc::pid_t,
    objc2_app_kit::{
        NSApplicationActivationOptions, NSPasteboard, NSPasteboardTypeHTML, NSPasteboardTypePNG,
        NSPasteboardTypeRTF, NSPasteboardTypeString, NSRunningApplication, NSWorkspace,
    },
    objc2_core_graphics::{
        CGEvent, CGEventFlags, CGEventSource, CGEventSourceStateID, CGEventTapLocation,
    },
    objc2_foundation::{NSData, NSString},
    sha2::{Digest, Sha256},
    std::{
        ffi::{c_char, c_void, CStr},
        sync::atomic::{AtomicBool, Ordering},
        thread,
        time::{Duration, Instant},
    },
};

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReplayRequest {
    capture_id: Option<String>,
    content_kind: String,
    raw_text: String,
    raw_rich: Option<String>,
    raw_rich_format: Option<String>,
    link_url: Option<String>,
    asset_path: Option<String>,
}

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

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReturnResult {
    pub pasted: bool,
}

#[cfg(target_os = "macos")]
fn current_executable_path() -> Option<PathBuf> {
    std::env::current_exe().ok()
}

#[cfg(target_os = "macos")]
fn current_app_bundle_path() -> Option<PathBuf> {
    let executable = current_executable_path()?;
    let macos_dir = executable.parent()?;
    let contents_dir = macos_dir.parent()?;
    let app_bundle = contents_dir.parent()?;

    (app_bundle.extension().and_then(|value| value.to_str()) == Some("app"))
        .then(|| app_bundle.to_path_buf())
}

#[cfg(target_os = "macos")]
fn current_app_authorization_target() -> String {
    current_app_bundle_path()
        .map(|path| path.display().to_string())
        .or_else(|| current_executable_path().map(|path| path.display().to_string()))
        .unwrap_or_else(|| "the currently running Tino app".to_string())
}

#[cfg(target_os = "macos")]
fn summarize_codesign_output(output: &[u8]) -> String {
    String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("unknown codesign failure")
        .to_string()
}

#[cfg(target_os = "macos")]
fn read_codesign_details(bundle_path: &Path) -> Result<(Option<String>, Option<String>), String> {
    let output = Command::new("codesign")
        .args(["-dv", "--verbose=4"])
        .arg(bundle_path)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let message = if output.stderr.is_empty() {
            summarize_codesign_output(&output.stdout)
        } else {
            summarize_codesign_output(&output.stderr)
        };
        return Err(message);
    }

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let identifier = combined.lines().find_map(|line| {
        line.strip_prefix("Identifier=")
            .map(str::trim)
            .map(ToOwned::to_owned)
    });
    let signature = combined.lines().find_map(|line| {
        line.strip_prefix("Signature=")
            .map(str::trim)
            .map(ToOwned::to_owned)
    });

    Ok((identifier, signature))
}

#[cfg(target_os = "macos")]
fn verify_codesign_bundle(bundle_path: &Path) -> Result<(), String> {
    let output = Command::new("codesign")
        .args(["--verify", "--deep", "--strict", "--verbose=4"])
        .arg(bundle_path)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        return Ok(());
    }

    let message = if output.stderr.is_empty() {
        summarize_codesign_output(&output.stdout)
    } else {
        summarize_codesign_output(&output.stderr)
    };
    Err(message)
}

#[cfg(target_os = "macos")]
fn current_app_bundle_signature_issue(expected_identifier: &str) -> Option<String> {
    let bundle_path = current_app_bundle_path()?;
    let bundle_display = bundle_path.display().to_string();
    let code_resources_path = bundle_path.join("Contents/_CodeSignature/CodeResources");

    if !code_resources_path.exists() {
        return Some(format!(
            "The running Tino app at {} is missing its macOS signature files. Reinstall the latest Preview app and reopen it before trying paste back again.",
            bundle_display
        ));
    }

    match read_codesign_details(&bundle_path) {
        Ok((Some(actual_identifier), _)) if actual_identifier != expected_identifier => {
            return Some(format!(
                "The running Tino app at {} has the wrong macOS signing identifier (`{}` instead of `{}`). Reinstall the latest Preview app and reopen it before trying paste back again.",
                bundle_display,
                actual_identifier,
                expected_identifier
            ));
        }
        Ok(_) => {}
        Err(error) => {
            return Some(format!(
                "Tino could not inspect the macOS signature for {} ({}). Reinstall the latest Preview app and reopen it before trying paste back again.",
                bundle_display,
                error
            ));
        }
    }

    if let Err(error) = verify_codesign_bundle(&bundle_path) {
        return Some(format!(
            "The running Tino app at {} has an invalid macOS bundle signature ({}). Reinstall the latest Preview app and reopen it before trying paste back again.",
            bundle_display,
            error
        ));
    }

    None
}

#[cfg(target_os = "macos")]
fn current_app_uses_adhoc_signature() -> Result<bool, String> {
    let Some(bundle_path) = current_app_bundle_path() else {
        return Ok(false);
    };

    let (_, signature) = read_codesign_details(&bundle_path)?;
    Ok(signature.as_deref() == Some("adhoc"))
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
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let replay_timestamp = Local::now().to_rfc3339();
        let replay_hash = copy_capture_to_clipboard_macos(&capture)?;
        state.register_replay_hash(replay_hash, replay_timestamp, capture.capture_id.clone())?;
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
#[specta::specta]
pub fn return_capture_to_previous_app(
    app: AppHandle,
    state: State<'_, AppState>,
    capture: ClipboardReplayRequest,
) -> Result<ClipboardReturnResult, String> {
    #[cfg(target_os = "macos")]
    {
        return return_capture_to_previous_app_macos(&app, state.inner(), &capture);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = state;
        let _ = capture;
        Err("Clipboard return is only supported on macOS".into())
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_accessibility_permission_status() -> bool {
    #[cfg(target_os = "macos")]
    {
        return is_accessibility_trusted();
    }

    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[tauri::command]
#[specta::specta]
pub fn open_accessibility_settings() -> Result<(), String> {
    open_accessibility_settings_impl()
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
fn return_capture_to_previous_app_macos(
    app: &AppHandle,
    state: &AppState,
    capture: &ClipboardReplayRequest,
) -> Result<ClipboardReturnResult, String> {
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

    if let Some(signature_issue) = current_app_bundle_signature_issue(&app.config().identifier) {
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

    let replay_timestamp = Local::now().to_rfc3339();
    let replay_hash = copy_capture_to_clipboard_macos(capture)?;
    state.register_replay_hash(replay_hash, replay_timestamp, capture.capture_id.clone())?;
    post_command_v()?;
    log::info!("clipboard return pasted successfully into {}", target_name);

    Ok(ClipboardReturnResult { pasted: true })
}

#[cfg(target_os = "macos")]
const AX_ERROR_SUCCESS: i32 = 0;
#[cfg(target_os = "macos")]
const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
#[cfg(target_os = "macos")]
const KEYCODE_V: u16 = 9;
#[cfg(target_os = "macos")]
const TARGET_FOCUS_POLL_ATTEMPTS: usize = 24;
#[cfg(target_os = "macos")]
const TARGET_FOCUS_POLL_INTERVAL_MS: u64 = 25;
#[cfg(target_os = "macos")]
const EDITABLE_ANCESTOR_DEPTH_LIMIT: usize = 8;
#[cfg(target_os = "macos")]
const TARGET_ACTIVATION_SETTLE_MS: u64 = 80;
#[cfg(target_os = "macos")]
const TARGET_FRONTMOST_EARLY_EXIT_POLLS: usize = 3;
#[cfg(target_os = "macos")]
const TARGET_FOCUSED_EARLY_EXIT_POLLS: usize = 2;
#[cfg(target_os = "macos")]
static ACCESSIBILITY_PROMPT_REQUESTED_THIS_LAUNCH: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum TargetFocusState {
    Unavailable,
    FrontmostApplication,
    FocusedElement,
    EditableFocusedElement,
}

#[cfg(target_os = "macos")]
type AXUIElementRef = *const c_void;
#[cfg(target_os = "macos")]
type CFTypeRef = *const c_void;
#[cfg(target_os = "macos")]
type CFStringRef = *const c_void;
#[cfg(target_os = "macos")]
type CFDictionaryRef = *const c_void;

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCreateApplication(pid: pid_t) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementSetAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: CFTypeRef,
    ) -> i32;
    fn AXUIElementIsAttributeSettable(
        element: AXUIElementRef,
        attribute: CFStringRef,
        settable: *mut u8,
    ) -> i32;
    fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut pid_t) -> i32;
    static kAXTrustedCheckOptionPrompt: CFStringRef;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFDictionaryCreate(
        allocator: *const c_void,
        keys: *const CFTypeRef,
        values: *const CFTypeRef,
        num_values: isize,
        key_callbacks: *const c_void,
        value_callbacks: *const c_void,
    ) -> CFDictionaryRef;
    fn CFRelease(value: CFTypeRef);
    fn CFGetTypeID(value: CFTypeRef) -> usize;
    fn CFBooleanGetTypeID() -> usize;
    fn CFBooleanGetValue(value: CFTypeRef) -> u8;
    static kCFBooleanTrue: CFTypeRef;
    fn CFStringGetTypeID() -> usize;
    fn CFStringGetLength(value: CFStringRef) -> isize;
    fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
    fn CFStringGetCString(
        value: CFStringRef,
        buffer: *mut c_char,
        buffer_size: isize,
        encoding: u32,
    ) -> u8;
}

#[cfg(target_os = "macos")]
struct CfOwned(CFTypeRef);

#[cfg(target_os = "macos")]
impl CfOwned {
    fn new(value: CFTypeRef) -> Option<Self> {
        (!value.is_null()).then_some(Self(value))
    }

    fn as_ax_ui_element(&self) -> AXUIElementRef {
        self.0.cast()
    }
}

#[cfg(target_os = "macos")]
impl Drop for CfOwned {
    fn drop(&mut self) {
        unsafe {
            CFRelease(self.0);
        }
    }
}

#[cfg(target_os = "macos")]
fn resolve_clipboard_window_target(
    target: &ClipboardWindowTarget,
) -> Option<objc2::rc::Retained<NSRunningApplication>> {
    if target.process_id > 0 {
        if let Some(application) =
            NSRunningApplication::runningApplicationWithProcessIdentifier(target.process_id)
        {
            return Some(application);
        }
    }

    let bundle_id = target.bundle_id.as_deref()?.trim();
    if bundle_id.is_empty() {
        return None;
    }

    let applications = NSRunningApplication::runningApplicationsWithBundleIdentifier(
        &NSString::from_str(bundle_id),
    );
    applications.firstObject()
}

#[cfg(target_os = "macos")]
fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

#[cfg(target_os = "macos")]
fn request_accessibility_trust_prompt_if_needed() {
    if is_accessibility_trusted() {
        return;
    }

    if ACCESSIBILITY_PROMPT_REQUESTED_THIS_LAUNCH.swap(true, Ordering::Relaxed) {
        return;
    }

    let keys = [unsafe { kAXTrustedCheckOptionPrompt }.cast()];
    let values = [unsafe { kCFBooleanTrue }];
    let options = unsafe {
        CFDictionaryCreate(
            std::ptr::null(),
            keys.as_ptr(),
            values.as_ptr(),
            1,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    let Some(options) = CfOwned::new(options) else {
        log::warn!("failed to build Accessibility trust prompt options");
        return;
    };

    let _ = unsafe { AXIsProcessTrustedWithOptions(options.0.cast()) };
}

#[cfg(target_os = "macos")]
fn open_accessibility_settings_impl() -> Result<(), String> {
    request_accessibility_trust_prompt_if_needed();

    let status = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| error.to_string())?;

    if !status.success() {
        return Err(format!(
            "failed to open Accessibility settings (exit code {})",
            status.code().unwrap_or_default()
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn open_accessibility_settings_impl() -> Result<(), String> {
    Err("Accessibility settings are only available on macOS".into())
}

#[cfg(target_os = "macos")]
fn activate_target_application(application: &NSRunningApplication) -> bool {
    #[allow(deprecated)]
    let activation_options = NSApplicationActivationOptions::ActivateAllWindows
        | NSApplicationActivationOptions::ActivateIgnoringOtherApps;

    let _ = application.unhide();
    let activated = application.activateWithOptions(activation_options);
    if activated {
        thread::sleep(Duration::from_millis(TARGET_ACTIVATION_SETTLE_MS));
    }
    activated
}

#[cfg(target_os = "macos")]
fn wait_for_target_focus_state(pid: pid_t) -> TargetFocusState {
    enable_manual_accessibility(pid);
    let mut best_state = TargetFocusState::Unavailable;
    let mut frontmost_streak = 0;
    let mut focused_streak = 0;
    let wait_started_at = Instant::now();

    for attempt in 0..TARGET_FOCUS_POLL_ATTEMPTS {
        let state = detect_target_focus_state(pid);
        if state > best_state {
            best_state = state;
        }
        match state {
            TargetFocusState::EditableFocusedElement => {
                log::info!(
                    "clipboard return target became editable after {}ms",
                    wait_started_at.elapsed().as_millis()
                );
                return state;
            }
            TargetFocusState::FocusedElement => {
                focused_streak += 1;
                frontmost_streak = 0;

                if focused_streak >= TARGET_FOCUSED_EARLY_EXIT_POLLS {
                    log::info!(
                        "clipboard return using focused target after {}ms",
                        wait_started_at.elapsed().as_millis()
                    );
                    return state;
                }
            }
            TargetFocusState::FrontmostApplication => {
                frontmost_streak += 1;
                focused_streak = 0;

                if frontmost_streak >= TARGET_FRONTMOST_EARLY_EXIT_POLLS {
                    log::info!(
                        "clipboard return using frontmost app fallback after {}ms",
                        wait_started_at.elapsed().as_millis()
                    );
                    return state;
                }
            }
            TargetFocusState::Unavailable => {
                frontmost_streak = 0;
                focused_streak = 0;
            }
        }

        if attempt + 1 < TARGET_FOCUS_POLL_ATTEMPTS {
            thread::sleep(Duration::from_millis(TARGET_FOCUS_POLL_INTERVAL_MS));
        }
    }

    log::info!(
        "clipboard return focus wait exhausted after {}ms with best state {:?}",
        wait_started_at.elapsed().as_millis(),
        best_state
    );
    best_state
}

#[cfg(target_os = "macos")]
fn detect_target_focus_state(pid: pid_t) -> TargetFocusState {
    let is_frontmost = frontmost_application_matches_pid(pid);
    let focused_element =
        focused_element_for_application(pid).or_else(|| system_wide_focused_element_for_pid(pid));

    let Some(focused_element) = focused_element else {
        return if is_frontmost {
            TargetFocusState::FrontmostApplication
        } else {
            TargetFocusState::Unavailable
        };
    };

    if ax_element_or_ancestor_is_editable(focused_element) {
        return TargetFocusState::EditableFocusedElement;
    }

    if is_frontmost {
        TargetFocusState::FocusedElement
    } else {
        TargetFocusState::Unavailable
    }
}

#[cfg(target_os = "macos")]
fn enable_manual_accessibility(pid: pid_t) {
    let Some(application) = CfOwned::new(unsafe { AXUIElementCreateApplication(pid).cast() })
    else {
        return;
    };

    let attribute = NSString::from_str("AXManualAccessibility");
    let _ = unsafe {
        AXUIElementSetAttributeValue(
            application.as_ax_ui_element(),
            (&*attribute as *const NSString).cast(),
            kCFBooleanTrue,
        )
    };
}

#[cfg(target_os = "macos")]
fn frontmost_application_matches_pid(pid: pid_t) -> bool {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .is_some_and(|application| application.processIdentifier() == pid)
}

#[cfg(target_os = "macos")]
fn focused_element_for_application(pid: pid_t) -> Option<CfOwned> {
    let application = CfOwned::new(unsafe { AXUIElementCreateApplication(pid).cast() })?;
    ax_copy_attribute_value(application.as_ax_ui_element(), "AXFocusedUIElement")
}

#[cfg(target_os = "macos")]
fn system_wide_focused_element_for_pid(pid: pid_t) -> Option<CfOwned> {
    let system_wide = CfOwned::new(unsafe { AXUIElementCreateSystemWide().cast() })?;
    let focused_element =
        ax_copy_attribute_value(system_wide.as_ax_ui_element(), "AXFocusedUIElement")?;
    let focused_element_ref = focused_element.as_ax_ui_element();
    let mut focused_pid: pid_t = 0;
    if unsafe { AXUIElementGetPid(focused_element_ref, &mut focused_pid) } != AX_ERROR_SUCCESS
        || focused_pid != pid
    {
        return None;
    }

    Some(focused_element)
}

#[cfg(target_os = "macos")]
fn ax_element_or_ancestor_is_editable(element: CfOwned) -> bool {
    let mut current = Some(element);

    for _ in 0..EDITABLE_ANCESTOR_DEPTH_LIMIT {
        let Some(candidate) = current.take() else {
            return false;
        };
        let candidate_ref = candidate.as_ax_ui_element();

        if ax_element_looks_editable(candidate_ref) {
            return true;
        }

        let Some(parent) = ax_copy_attribute_value(candidate_ref, "AXParent") else {
            return false;
        };
        if parent.as_ax_ui_element() == candidate_ref {
            return false;
        }

        current = Some(parent);
    }

    false
}

#[cfg(target_os = "macos")]
fn ax_element_looks_editable(element: AXUIElementRef) -> bool {
    let is_editable = ax_copy_attribute_value(element, "AXEditable")
        .as_ref()
        .and_then(cf_bool_value)
        .unwrap_or(false);
    if is_editable {
        return true;
    }

    if ax_attribute_is_settable(element, "AXValue") {
        return true;
    }

    if ax_attribute_is_settable(element, "AXSelectedTextRange")
        || ax_copy_attribute_value(element, "AXSelectedTextRange").is_some()
    {
        return true;
    }

    ax_copy_attribute_value(element, "AXRole")
        .as_ref()
        .and_then(cf_string_value)
        .is_some_and(|role| is_text_input_role(role.as_str()))
}

#[cfg(target_os = "macos")]
fn ax_copy_attribute_value(element: AXUIElementRef, attribute: &str) -> Option<CfOwned> {
    let attribute = NSString::from_str(attribute);
    let mut value: CFTypeRef = std::ptr::null();
    let status = unsafe {
        AXUIElementCopyAttributeValue(element, (&*attribute as *const NSString).cast(), &mut value)
    };

    if status != AX_ERROR_SUCCESS {
        return None;
    }

    CfOwned::new(value)
}

#[cfg(target_os = "macos")]
fn ax_attribute_is_settable(element: AXUIElementRef, attribute: &str) -> bool {
    let attribute = NSString::from_str(attribute);
    let mut settable = 0;
    (unsafe {
        AXUIElementIsAttributeSettable(
            element,
            (&*attribute as *const NSString).cast(),
            &mut settable,
        )
    }) == AX_ERROR_SUCCESS
        && settable != 0
}

#[cfg(target_os = "macos")]
fn cf_bool_value(value: &CfOwned) -> Option<bool> {
    if unsafe { CFGetTypeID(value.0) } != unsafe { CFBooleanGetTypeID() } {
        return None;
    }

    Some(unsafe { CFBooleanGetValue(value.0) != 0 })
}

#[cfg(target_os = "macos")]
fn cf_string_value(value: &CfOwned) -> Option<String> {
    if unsafe { CFGetTypeID(value.0) } != unsafe { CFStringGetTypeID() } {
        return None;
    }

    cf_string_ref_to_string(value.0.cast())
}

#[cfg(target_os = "macos")]
fn cf_string_ref_to_string(value: CFStringRef) -> Option<String> {
    let length = unsafe { CFStringGetLength(value) };
    if length == 0 {
        return Some(String::new());
    }

    let capacity = unsafe { CFStringGetMaximumSizeForEncoding(length, CF_STRING_ENCODING_UTF8) };
    if capacity <= 0 {
        return None;
    }

    let mut buffer = vec![0; capacity as usize + 1];
    let converted = unsafe {
        CFStringGetCString(
            value,
            buffer.as_mut_ptr().cast(),
            buffer.len() as isize,
            CF_STRING_ENCODING_UTF8,
        ) != 0
    };
    if !converted {
        return None;
    }

    unsafe { CStr::from_ptr(buffer.as_ptr().cast()) }
        .to_str()
        .ok()
        .map(ToOwned::to_owned)
}

#[cfg(target_os = "macos")]
fn is_text_input_role(role: &str) -> bool {
    matches!(
        role,
        "AXComboBox"
            | "AXSearchField"
            | "AXSecureTextField"
            | "AXTextArea"
            | "AXTextField"
            | "AXTextView"
    )
}

#[cfg(target_os = "macos")]
fn post_command_v() -> Result<(), String> {
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .ok_or_else(|| "failed to create keyboard event source".to_string())?;
    let key_down = CGEvent::new_keyboard_event(Some(&source), KEYCODE_V, true)
        .ok_or_else(|| "failed to create paste key-down event".to_string())?;
    let key_up = CGEvent::new_keyboard_event(Some(&source), KEYCODE_V, false)
        .ok_or_else(|| "failed to create paste key-up event".to_string())?;

    CGEvent::set_flags(Some(&key_down), CGEventFlags::MaskCommand);
    CGEvent::set_flags(Some(&key_up), CGEventFlags::MaskCommand);
    CGEvent::post(CGEventTapLocation::HIDEventTap, Some(&key_down));
    thread::sleep(Duration::from_millis(8));
    CGEvent::post(CGEventTapLocation::HIDEventTap, Some(&key_up));

    Ok(())
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

    let normalized_text = normalize_capture_hash_text(raw_text);
    hasher.update(normalized_text.as_bytes());

    if normalized_text.is_empty() {
        if let Some(raw_rich) = raw_rich {
            hasher.update([0]);
            hasher.update(normalize_capture_hash_text(raw_rich).as_bytes());
        }
    }

    if let Some(image_bytes) = image_bytes {
        hasher.update([0]);
        hasher.update(image_bytes);
    }

    format!("{:x}", hasher.finalize())
}

#[cfg(target_os = "macos")]
fn normalize_capture_hash_text(input: &str) -> String {
    input
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}
