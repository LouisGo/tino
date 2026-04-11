use crate::error::{AppError, AppResult};

#[cfg(target_os = "macos")]
use std::{
    ffi::c_void,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
};

#[cfg(target_os = "macos")]
type CFTypeRef = *const c_void;
#[cfg(target_os = "macos")]
type CFStringRef = *const c_void;
#[cfg(target_os = "macos")]
type CFDictionaryRef = *const c_void;

#[cfg(target_os = "macos")]
static ACCESSIBILITY_PROMPT_REQUESTED_THIS_LAUNCH: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
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
    static kCFBooleanTrue: CFTypeRef;
}

#[cfg(target_os = "macos")]
pub(super) fn current_app_bundle_path() -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let macos_dir = executable.parent()?;
    let contents_dir = macos_dir.parent()?;
    let app_bundle = contents_dir.parent()?;

    (app_bundle.extension().and_then(|value| value.to_str()) == Some("app"))
        .then(|| app_bundle.to_path_buf())
}

#[cfg(target_os = "macos")]
pub(super) fn current_app_authorization_target() -> String {
    current_app_bundle_path()
        .map(|path| path.display().to_string())
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .map(|path| path.display().to_string())
        })
        .unwrap_or_else(|| "the currently running Tino app".to_string())
}

#[cfg(target_os = "macos")]
pub(super) fn current_app_bundle_signature_issue(expected_identifier: &str) -> Option<String> {
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
pub(super) fn current_app_uses_adhoc_signature() -> AppResult<bool> {
    let Some(bundle_path) = current_app_bundle_path() else {
        return Ok(false);
    };

    let (_, signature) = read_codesign_details(&bundle_path)?;
    Ok(signature.as_deref() == Some("adhoc"))
}

#[cfg(target_os = "macos")]
pub(super) fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

#[cfg(target_os = "macos")]
pub(super) fn open_accessibility_settings_impl() -> AppResult<()> {
    request_accessibility_trust_prompt_if_needed();

    let status = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| AppError::io("failed to open Accessibility settings", error))?;

    if !status.success() {
        return Err(AppError::platform(format!(
            "failed to open Accessibility settings (exit code {})",
            status.code().unwrap_or_default()
        )));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(super) fn is_accessibility_trusted() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub(super) fn open_accessibility_settings_impl() -> AppResult<()> {
    Err(AppError::platform(
        "Accessibility settings are only available on macOS",
    ))
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
fn read_codesign_details(bundle_path: &Path) -> AppResult<(Option<String>, Option<String>)> {
    let output = Command::new("codesign")
        .args(["-dv", "--verbose=4"])
        .arg(bundle_path)
        .output()
        .map_err(|error| AppError::io("failed to inspect macOS signature", error))?;

    if !output.status.success() {
        let message = if output.stderr.is_empty() {
            summarize_codesign_output(&output.stdout)
        } else {
            summarize_codesign_output(&output.stderr)
        };
        return Err(AppError::platform(message));
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
fn verify_codesign_bundle(bundle_path: &Path) -> AppResult<()> {
    let output = Command::new("codesign")
        .args(["--verify", "--deep", "--strict", "--verbose=4"])
        .arg(bundle_path)
        .output()
        .map_err(|error| AppError::io("failed to verify macOS app signature", error))?;

    if output.status.success() {
        return Ok(());
    }

    let message = if output.stderr.is_empty() {
        summarize_codesign_output(&output.stdout)
    } else {
        summarize_codesign_output(&output.stderr)
    };
    Err(AppError::platform(message))
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
    if options.is_null() {
        log::warn!("failed to build Accessibility trust prompt options");
        return;
    }

    let _ = unsafe { AXIsProcessTrustedWithOptions(options.cast()) };
    unsafe {
        CFRelease(options.cast());
    }
}
