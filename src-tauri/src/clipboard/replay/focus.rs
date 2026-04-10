use crate::clipboard::types::ClipboardWindowTarget;

#[cfg(target_os = "macos")]
use {
    libc::pid_t,
    objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace},
    objc2_core_graphics::{
        CGEvent, CGEventFlags, CGEventSource, CGEventSourceStateID, CGEventTapLocation,
    },
    objc2_foundation::NSString,
    std::{
        ffi::{c_char, c_void, CStr},
        thread,
        time::{Duration, Instant},
    },
};

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
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum TargetFocusState {
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
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
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
}

#[cfg(target_os = "macos")]
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
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
pub(super) fn resolve_clipboard_window_target(
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
pub(super) fn activate_target_application(application: &NSRunningApplication) -> bool {
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
pub(super) fn wait_for_target_focus_state(pid: pid_t) -> TargetFocusState {
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
pub(super) fn post_command_v() -> Result<(), String> {
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
