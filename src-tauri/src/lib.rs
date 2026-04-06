mod app_state;
mod backend;
mod capture;
mod commands;
pub mod ipc_schema;
mod locale;
mod native_window_macos;
mod panel_layout;
mod runtime_profile;
mod storage;
mod window_state;

use app_state::{AppState, ClipboardWindowTarget};
#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use libc::pid_t;
use locale::localized_shell_strings;
#[cfg(target_os = "macos")]
use objc2::{rc::Retained, runtime::AnyObject, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSRunningApplication, NSScreen, NSWorkspace, NSWorkspaceApplicationKey,
    NSWorkspaceDidActivateApplicationNotification,
};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSNotification, NSPoint, NSSize, NSString};
use panel_layout::{
    resolve_panel_window_layout as compute_panel_window_layout, LogicalDisplayFrame,
    PanelWindowLayout,
};
#[cfg(target_os = "macos")]
use std::ptr::NonNull;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, WEBVIEW_TARGET};
use window_state::{
    load_window_state_store, save_window_state_store, PersistedMainWindowState,
    PersistedPanelWindowState,
};

const LOG_MAX_FILE_SIZE_BYTES: u128 = 10_000_000;
const LOG_KEEP_COUNT: usize = 10;
const LOG_RETENTION_DAYS: u64 = 14;
const MAIN_WINDOW_LABEL: &str = "main";
const CLIPBOARD_PANEL_LABEL: &str = "clipboard";
#[cfg(target_os = "macos")]
const AX_ERROR_SUCCESS: i32 = 0;
#[cfg(target_os = "macos")]
const AX_VALUE_TYPE_CGPOINT: u32 = 1;
#[cfg(target_os = "macos")]
const AX_VALUE_TYPE_CGSIZE: u32 = 2;
#[cfg(target_os = "macos")]
static PANEL_WINDOW_TRACKER_INSTALLED: AtomicBool = AtomicBool::new(false);

pub(crate) fn format_system_time_rfc3339(timestamp: SystemTime) -> Result<String, String> {
    let datetime = chrono::DateTime::<chrono::Utc>::from(timestamp).with_timezone(&chrono::Local);
    Ok(datetime.to_rfc3339())
}

#[derive(Debug, Clone, Copy)]
struct PanelWindowSpec {
    always_on_top: bool,
    decorations: bool,
    label: &'static str,
    max_size: Option<(f64, f64)>,
    min_size: Option<(f64, f64)>,
    on_prepare_open: Option<fn(&AppHandle)>,
    resizable: bool,
    route: &'static str,
    shadow: bool,
    title: fn(locale::LocalizedShellStrings) -> &'static str,
    transparent: bool,
    window_size: (f64, f64),
}

#[derive(Debug, Clone, Copy)]
struct LogicalWindowFrame {
    height: f64,
    width: f64,
    x: f64,
    y: f64,
}

#[derive(Debug)]
struct PanelPresentationTarget {
    anchor: Option<LogicalWindowFrame>,
    monitor: Monitor,
}

#[cfg(target_os = "macos")]
type AXUIElementRef = *const std::ffi::c_void;
#[cfg(target_os = "macos")]
type AXValueRef = *const std::ffi::c_void;
#[cfg(target_os = "macos")]
type CFTypeRef = *const std::ffi::c_void;
#[cfg(target_os = "macos")]
type CFStringRef = *const std::ffi::c_void;

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateApplication(pid: pid_t) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXValueGetType(value: AXValueRef) -> u32;
    fn AXValueGetValue(value: AXValueRef, the_type: u32, value_ptr: *mut std::ffi::c_void) -> u8;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(value: CFTypeRef);
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

fn clipboard_panel_title(strings: locale::LocalizedShellStrings) -> &'static str {
    strings.clipboard_window_title
}

const PANEL_WINDOW_SPECS: [PanelWindowSpec; 1] = [PanelWindowSpec {
    always_on_top: true,
    decorations: false,
    label: CLIPBOARD_PANEL_LABEL,
    max_size: Some((800.0, 500.0)),
    min_size: Some((800.0, 500.0)),
    on_prepare_open: Some(record_clipboard_window_target),
    resizable: false,
    route: "/",
    shadow: true,
    title: clipboard_panel_title,
    transparent: true,
    window_size: (800.0, 500.0),
}];

fn current_executable_path() -> Option<PathBuf> {
    std::env::current_exe().ok()
}

fn current_app_bundle_path() -> Option<PathBuf> {
    let executable = current_executable_path()?;
    let macos_dir = executable.parent()?;
    let contents_dir = macos_dir.parent()?;
    let app_bundle = contents_dir.parent()?;

    (app_bundle.extension().and_then(|value| value.to_str()) == Some("app"))
        .then(|| app_bundle.to_path_buf())
}

fn panel_window_spec(label: &str) -> Option<&'static PanelWindowSpec> {
    PANEL_WINDOW_SPECS.iter().find(|spec| spec.label == label)
}

fn is_panel_window_label(label: &str) -> bool {
    panel_window_spec(label).is_some()
}

fn localized_panel_title(app: &AppHandle, spec: &PanelWindowSpec) -> &'static str {
    (spec.title)(current_shell_strings(app))
}

fn logical_display_frame_from_monitor(monitor: &Monitor) -> LogicalDisplayFrame {
    let work_area = monitor.work_area();
    let position = work_area.position.to_logical::<f64>(monitor.scale_factor());
    let size = work_area.size.to_logical::<f64>(monitor.scale_factor());

    LogicalDisplayFrame {
        height: size.height,
        width: size.width,
        x: position.x,
        y: position.y,
    }
}

fn resolve_panel_window_layout(
    spec: &PanelWindowSpec,
    display: &LogicalDisplayFrame,
    persisted: Option<&PersistedPanelWindowState>,
) -> PanelWindowLayout {
    compute_panel_window_layout(
        spec.window_size,
        spec.min_size,
        spec.max_size,
        display,
        persisted,
    )
}

#[cfg(not(target_os = "macos"))]
fn apply_panel_window_layout(window: &WebviewWindow, layout: PanelWindowLayout) {
    let _ = window.set_size(tauri::LogicalSize::new(layout.width, layout.height));
    let _ = window.set_position(tauri::LogicalPosition::new(layout.x, layout.y));
}

fn run_on_main_thread_sync<T, F>(app: &AppHandle, operation: F) -> Result<T, String>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    #[cfg(target_os = "macos")]
    if MainThreadMarker::new().is_some() {
        return Ok(operation());
    }

    let (sender, receiver) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(operation());
    })
    .map_err(|error| error.to_string())?;
    receiver.recv().map_err(|error| error.to_string())
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
fn ax_point_value(value: &CfOwned) -> Option<NSPoint> {
    if unsafe { AXValueGetType(value.0.cast()) } != AX_VALUE_TYPE_CGPOINT {
        return None;
    }

    let mut point = NSPoint::new(0.0, 0.0);
    (unsafe {
        AXValueGetValue(
            value.0.cast(),
            AX_VALUE_TYPE_CGPOINT,
            (&mut point as *mut NSPoint).cast(),
        ) != 0
    })
    .then_some(point)
}

#[cfg(target_os = "macos")]
fn ax_size_value(value: &CfOwned) -> Option<NSSize> {
    if unsafe { AXValueGetType(value.0.cast()) } != AX_VALUE_TYPE_CGSIZE {
        return None;
    }

    let mut size = NSSize::new(0.0, 0.0);
    (unsafe {
        AXValueGetValue(
            value.0.cast(),
            AX_VALUE_TYPE_CGSIZE,
            (&mut size as *mut NSSize).cast(),
        ) != 0
    })
    .then_some(size)
}

#[cfg(target_os = "macos")]
fn focused_window_frame_for_pid(pid: pid_t) -> Option<LogicalWindowFrame> {
    let application = CfOwned::new(unsafe { AXUIElementCreateApplication(pid).cast() })?;
    let focused_window = ax_copy_attribute_value(application.as_ax_ui_element(), "AXFocusedWindow")
        .or_else(|| {
            let focused_element =
                ax_copy_attribute_value(application.as_ax_ui_element(), "AXFocusedUIElement")?;
            ax_copy_attribute_value(focused_element.as_ax_ui_element(), "AXWindow")
        })?;
    let position = ax_copy_attribute_value(focused_window.as_ax_ui_element(), "AXPosition")
        .as_ref()
        .and_then(ax_point_value)?;
    let size = ax_copy_attribute_value(focused_window.as_ax_ui_element(), "AXSize")
        .as_ref()
        .and_then(ax_size_value)?;

    Some(LogicalWindowFrame {
        height: size.height.max(0.0),
        width: size.width.max(0.0),
        x: position.x,
        y: position.y,
    })
}

#[cfg(target_os = "macos")]
fn preferred_panel_target_for_frontmost_window(app: &AppHandle) -> Option<PanelPresentationTarget> {
    let target = run_on_main_thread_sync(app, || {
        let workspace = NSWorkspace::sharedWorkspace();
        let frontmost = workspace.frontmostApplication()?;
        let current = NSRunningApplication::currentApplication();
        if frontmost.processIdentifier() == current.processIdentifier() {
            return None;
        }

        if let Some(frame) = focused_window_frame_for_pid(frontmost.processIdentifier()) {
            let center_x = frame.x + (frame.width / 2.0);
            let center_y = frame.y + (frame.height / 2.0);
            return Some((center_x, center_y, Some(frame)));
        }

        let mtm = MainThreadMarker::new().expect("main thread marker should exist");
        let screen = NSScreen::mainScreen(mtm)?;
        let visible_frame = screen.visibleFrame();
        Some((
            visible_frame.origin.x + (visible_frame.size.width / 2.0),
            visible_frame.origin.y + (visible_frame.size.height / 2.0),
            None,
        ))
    })
    .ok()
    .flatten()?;
    let monitor = app.monitor_from_point(target.0, target.1).ok().flatten()?;

    Some(PanelPresentationTarget {
        anchor: target.2,
        monitor,
    })
}

#[cfg(not(target_os = "macos"))]
fn preferred_panel_target_for_frontmost_window(
    _app: &AppHandle,
) -> Option<PanelPresentationTarget> {
    None
}

fn logical_window_frame(window: &WebviewWindow) -> Option<LogicalWindowFrame> {
    let monitor = current_window_monitor(window)?;
    let position = window
        .outer_position()
        .ok()?
        .to_logical::<f64>(monitor.scale_factor());
    let size = window
        .inner_size()
        .ok()?
        .to_logical::<f64>(monitor.scale_factor());

    Some(LogicalWindowFrame {
        height: size.height,
        width: size.width,
        x: position.x,
        y: position.y,
    })
}

fn preferred_monitor_for_cursor(app: &AppHandle) -> Option<Monitor> {
    let position = app.cursor_position().ok()?;
    app.monitor_from_point(position.x, position.y)
        .ok()
        .flatten()
}

fn preferred_panel_target(app: &AppHandle) -> Option<PanelPresentationTarget> {
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let is_visible = main_window.is_visible().unwrap_or(false);
        let is_focused = main_window.is_focused().unwrap_or(false);
        if is_visible && is_focused {
            if let Ok(Some(monitor)) = main_window.current_monitor() {
                return Some(PanelPresentationTarget {
                    anchor: logical_window_frame(&main_window),
                    monitor,
                });
            }
        }
    }

    preferred_panel_target_for_frontmost_window(app)
        .or_else(|| {
            preferred_monitor_for_cursor(app).map(|monitor| PanelPresentationTarget {
                anchor: None,
                monitor,
            })
        })
        .or_else(|| {
            app.primary_monitor()
                .ok()
                .flatten()
                .map(|monitor| PanelPresentationTarget {
                    anchor: None,
                    monitor,
                })
        })
}

fn current_window_monitor(window: &WebviewWindow) -> Option<Monitor> {
    if let Ok(Some(monitor)) = window.current_monitor() {
        return Some(monitor);
    }

    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let center_x = f64::from(position.x) + (f64::from(size.width) / 2.0);
    let center_y = f64::from(position.y) + (f64::from(size.height) / 2.0);
    window.monitor_from_point(center_x, center_y).ok().flatten()
}

fn capture_panel_window_state(window: &WebviewWindow) -> Option<PersistedPanelWindowState> {
    let monitor = current_window_monitor(window)?;
    let display = logical_display_frame_from_monitor(&monitor);
    let position = window
        .outer_position()
        .ok()?
        .to_logical::<f64>(monitor.scale_factor());
    let size = window
        .inner_size()
        .ok()?
        .to_logical::<f64>(monitor.scale_factor());

    Some(PersistedPanelWindowState {
        height: size.height,
        offset_x: position.x - display.x,
        offset_y: position.y - display.y,
        width: size.width,
    })
}

fn save_panel_window_state(app: &AppHandle, label: &str) {
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    let Some(state) = capture_panel_window_state(&window) else {
        return;
    };

    let mut store = load_window_state_store(app);
    store.panels.insert(label.to_string(), state);
    save_window_state_store(app, &store);
}

fn hide_panel_windows_except(app: &AppHandle, active_label: Option<&str>) {
    for spec in PANEL_WINDOW_SPECS {
        if Some(spec.label) == active_label {
            continue;
        }

        let Some(window) = app.get_webview_window(spec.label) else {
            continue;
        };

        if !window.is_visible().unwrap_or(false) {
            continue;
        }

        save_panel_window_state(app, spec.label);
        let _ = window.hide();
    }
}

fn hide_main_window_if_visible(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    if !window.is_visible().unwrap_or(false) {
        return;
    }

    save_main_window_state(app);
    let _ = window.hide();
}

fn resolve_panel_layout_for_target(
    spec: &PanelWindowSpec,
    target: &PanelPresentationTarget,
    persisted: Option<&PersistedPanelWindowState>,
) -> PanelWindowLayout {
    let display = logical_display_frame_from_monitor(&target.monitor);
    let _ = target.anchor.as_ref();
    resolve_panel_window_layout(spec, &display, persisted)
}

#[cfg(target_os = "macos")]
fn configure_native_window(window: &WebviewWindow) {
    let window = window.clone();
    let app = window.app_handle().clone();
    let label = window.label().to_string();

    let _ = run_on_main_thread_sync(&app, move || {
        let is_panel = is_panel_window_label(&label);
        native_window_macos::configure_native_window(&window, is_panel);
    });
}

#[cfg(not(target_os = "macos"))]
fn configure_native_window(_window: &WebviewWindow) {}

#[cfg(target_os = "macos")]
fn present_native_window(
    window: &WebviewWindow,
    layout: Option<PanelWindowLayout>,
    request_focus: bool,
) {
    let window = window.clone();
    let app = window.app_handle().clone();
    let label = window.label().to_string();

    let _ = run_on_main_thread_sync(&app, move || {
        let is_panel = is_panel_window_label(&label);
        native_window_macos::present_native_window(&window, is_panel, layout, request_focus);
    });
}

#[cfg(not(target_os = "macos"))]
fn present_native_window(
    _window: &WebviewWindow,
    _layout: Option<PanelWindowLayout>,
    _request_focus: bool,
) {
}

fn focus_window_with_layout(window: &tauri::WebviewWindow, layout: Option<PanelWindowLayout>) {
    #[cfg(target_os = "macos")]
    {
        present_native_window(window, layout, true);
        return;
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(layout) = layout {
            apply_panel_window_layout(window, layout);
        }
        let _ = window.show();
        let _ = window.unminimize();
        focus_native_window(window, false);
        let _ = window.set_focus();
    }
}

fn retarget_visible_panel_windows(app: &AppHandle) {
    let Some(target) = preferred_panel_target_for_frontmost_window(app) else {
        return;
    };
    let persisted_store = load_window_state_store(app);

    for spec in PANEL_WINDOW_SPECS {
        let Some(window) = app.get_webview_window(spec.label) else {
            continue;
        };

        if !window.is_visible().unwrap_or(false) {
            continue;
        }

        let layout =
            resolve_panel_layout_for_target(&spec, &target, persisted_store.panels.get(spec.label));

        #[cfg(target_os = "macos")]
        present_native_window(&window, Some(layout), false);

        #[cfg(not(target_os = "macos"))]
        apply_panel_window_layout(&window, layout);
    }
}

fn open_panel_window(app: &AppHandle, label: &str) {
    let Some(spec) = panel_window_spec(label) else {
        log::warn!("attempted to open unknown panel window: {}", label);
        return;
    };

    if let Some(prepare_open) = spec.on_prepare_open {
        prepare_open(app);
    }

    let persisted_state = load_window_state_store(app).panels.get(spec.label).cloned();
    let layout = preferred_panel_target(app)
        .as_ref()
        .map(|target| resolve_panel_layout_for_target(spec, target, persisted_state.as_ref()));

    hide_main_window_if_visible(app);
    hide_panel_windows_except(app, Some(spec.label));

    let title = localized_panel_title(app, spec);

    if let Some(window) = app.get_webview_window(spec.label) {
        configure_native_window(&window);
        let _ = window.set_title(title);
        focus_window_with_layout(&window, layout);
        return;
    }

    let mut builder =
        WebviewWindowBuilder::new(app, spec.label, WebviewUrl::App(spec.route.into()))
            .title(title)
            .inner_size(spec.window_size.0, spec.window_size.1)
            .resizable(spec.resizable)
            .focused(false)
            .visible(false)
            .transparent(spec.transparent)
            .decorations(spec.decorations)
            .always_on_top(spec.always_on_top)
            .skip_taskbar(true)
            .shadow(spec.shadow)
            .prevent_overflow();

    if let Some((min_width, min_height)) = spec.min_size {
        builder = builder.min_inner_size(min_width, min_height);
    }

    if let Some((max_width, max_height)) = spec.max_size {
        builder = builder.max_inner_size(max_width, max_height);
    }

    match builder.build() {
        Ok(window) => {
            configure_native_window(&window);
            focus_window_with_layout(&window, layout);
        }
        Err(error) => log::error!("failed to open panel window {}: {}", spec.label, error),
    }
}

fn save_main_window_state(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };

    let state = PersistedMainWindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
    };

    let mut store = load_window_state_store(app);
    store.main = Some(state);
    save_window_state_store(app, &store);
}

fn restore_main_window_state(app: &AppHandle) {
    let Some(state) = load_window_state_store(app).main else {
        return;
    };
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));

    if state.maximized {
        let _ = window.maximize();
    }
}

pub(crate) fn focus_main_window(app: &AppHandle) {
    hide_panel_windows_except(app, None);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        configure_native_window(&window);
        focus_native_window(&window, true);
    }
}

#[cfg(target_os = "macos")]
fn focus_native_window(window: &tauri::WebviewWindow, activate_all_windows: bool) {
    let _ = activate_all_windows;
    present_native_window(window, None, true);
}

#[cfg(not(target_os = "macos"))]
fn focus_native_window(_window: &tauri::WebviewWindow, _activate_all_windows: bool) {}

fn current_shell_strings(app: &AppHandle) -> locale::LocalizedShellStrings {
    let locale = app
        .try_state::<AppState>()
        .and_then(|state| state.current_settings().ok())
        .map(|settings| settings.locale_preference.resolved())
        .unwrap_or(locale::AppLocale::EnUs);

    localized_shell_strings(locale)
}

pub(crate) fn open_clipboard_window(app: &AppHandle) {
    open_panel_window(app, CLIPBOARD_PANEL_LABEL);
}

pub(crate) fn toggle_main_window_visibility(app: &AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window is not available".to_string())?;

    let is_visible = window.is_visible().map_err(|error| error.to_string())?;

    if is_visible {
        window.hide().map_err(|error| error.to_string())?;
        return Ok(false);
    }

    focus_main_window(app);
    Ok(true)
}

pub(crate) fn toggle_clipboard_window_visibility(app: &AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(CLIPBOARD_PANEL_LABEL) {
        let is_visible = window.is_visible().map_err(|error| error.to_string())?;

        if is_visible {
            save_panel_window_state(app, CLIPBOARD_PANEL_LABEL);
            window.hide().map_err(|error| error.to_string())?;
            return Ok(false);
        }

        open_clipboard_window(app);
        return Ok(true);
    }

    open_clipboard_window(app);

    let window = app
        .get_webview_window(CLIPBOARD_PANEL_LABEL)
        .ok_or_else(|| "clipboard window is not available".to_string())?;

    Ok(window.is_visible().unwrap_or(true))
}

#[cfg(target_os = "macos")]
fn record_clipboard_window_target(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    let workspace = NSWorkspace::sharedWorkspace();
    let frontmost = workspace.frontmostApplication();
    let current = NSRunningApplication::currentApplication();

    let target = frontmost.and_then(|application| {
        if application.processIdentifier() == current.processIdentifier() {
            return None;
        }

        Some(ClipboardWindowTarget {
            app_name: application.localizedName().map(|value| value.to_string()),
            bundle_id: application
                .bundleIdentifier()
                .map(|value| value.to_string()),
            process_id: application.processIdentifier(),
        })
    });

    if let Err(error) = state.set_clipboard_window_target(target) {
        log::warn!("failed to record clipboard window target: {}", error);
    }
}

#[cfg(not(target_os = "macos"))]
fn record_clipboard_window_target(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
fn running_application_from_notification(
    notification: &NSNotification,
) -> Option<Retained<NSRunningApplication>> {
    let user_info = notification.userInfo()?;
    let typed_user_info = unsafe { user_info.cast_unchecked::<NSString, AnyObject>() };
    let application = typed_user_info.objectForKey(unsafe { NSWorkspaceApplicationKey })?;

    application.downcast::<NSRunningApplication>().ok()
}

#[cfg(target_os = "macos")]
fn install_panel_window_tracker(app: &AppHandle) -> Result<(), String> {
    if PANEL_WINDOW_TRACKER_INSTALLED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let app_handle = app.clone();
    let current_pid = NSRunningApplication::currentApplication().processIdentifier();
    let notification_center = NSWorkspace::sharedWorkspace().notificationCenter();
    let activation_block = RcBlock::new(move |notification: NonNull<NSNotification>| {
        let notification = unsafe { notification.as_ref() };
        let Some(application) = running_application_from_notification(notification) else {
            return;
        };

        if application.processIdentifier() == current_pid {
            return;
        }

        retarget_visible_panel_windows(&app_handle);
    });

    unsafe {
        let _ = notification_center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceDidActivateApplicationNotification),
            None,
            None,
            &activation_block,
        );
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn install_panel_window_tracker(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

fn prune_expired_logs(app: &AppHandle) {
    let Ok(log_dir) = app.path().app_log_dir() else {
        return;
    };

    if let Err(error) = prune_expired_log_files(
        &log_dir,
        Duration::from_secs(60 * 60 * 24 * LOG_RETENTION_DAYS),
    ) {
        log::warn!(
            "failed to prune expired logs in {}: {}",
            log_dir.display(),
            error
        );
    }
}

fn prune_expired_log_files(log_dir: &Path, max_age: Duration) -> Result<(), String> {
    if !log_dir.exists() {
        return Ok(());
    }

    let now = SystemTime::now();

    for entry in fs::read_dir(log_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|value| value.to_str()) != Some("log") {
            continue;
        }

        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let Ok(modified_at) = metadata.modified() else {
            continue;
        };
        let Ok(age) = now.duration_since(modified_at) else {
            continue;
        };

        if age <= max_age {
            continue;
        }

        fs::remove_file(&path).map_err(|error| error.to_string())?;
        log::info!("pruned expired log {}", path.display());
    }

    Ok(())
}

fn configure_native_macos_window(app: &AppHandle) {
    native_window_macos::configure_native_macos_window(app, MAIN_WINDOW_LABEL)
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let shell_strings = current_shell_strings(app);
    let open_item = MenuItem::with_id(app, "open", shell_strings.tray_open, true, None::<&str>)?;
    let clipboard_item = MenuItem::with_id(
        app,
        "clipboard",
        shell_strings.tray_clipboard,
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", shell_strings.tray_quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &clipboard_item, &quit_item])?;
    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default Tauri icon should exist");

    let _ = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip(shell_strings.tray_tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => focus_main_window(app),
            "clipboard" => open_clipboard_window(app),
            "quit" => {
                save_main_window_state(app);
                hide_panel_windows_except(app, None);
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
    let mut log_targets = vec![
        Target::new(TargetKind::LogDir {
            file_name: Some("rust".into()),
        })
        .filter(|metadata| !metadata.target().starts_with(WEBVIEW_TARGET)),
        Target::new(TargetKind::LogDir {
            file_name: Some("renderer".into()),
        })
        .filter(|metadata| metadata.target().starts_with(WEBVIEW_TARGET)),
    ];

    if cfg!(debug_assertions) {
        log_targets.push(Target::new(TargetKind::Stdout));
    }

    #[cfg(debug_assertions)]
    ipc_schema::export_typescript_bindings()
        .expect("failed to export TypeScript bindings from Rust schema");

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .max_file_size(LOG_MAX_FILE_SIZE_BYTES)
                .rotation_strategy(RotationStrategy::KeepSome(LOG_KEEP_COUNT))
                .targets(log_targets)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            prune_expired_logs(app.handle());

            if let Ok(log_dir) = app.path().app_log_dir() {
                log::info!("log directory initialized at {}", log_dir.display());
            }
            log::info!(
                "runtime profile: env={} data_channel={}",
                runtime_profile::app_env(),
                runtime_profile::data_channel()
            );
            log::info!("tauri identifier: {}", app.config().identifier);
            if let Some(path) = current_executable_path() {
                log::info!("current executable path: {}", path.display());
            }
            if let Some(path) = current_app_bundle_path() {
                log::info!("current app bundle path: {}", path.display());
            }

            let app_state = AppState::new(app.handle())?;
            app.manage(app_state.clone());

            if let Err(error) = app_state.sync_current_global_shortcuts() {
                log::warn!(
                    "failed to register app global shortcuts during startup: {}",
                    error
                );
            }

            create_tray(app.handle())?;
            restore_main_window_state(app.handle());
            configure_native_macos_window(app.handle());

            if let Err(error) = install_panel_window_tracker(app.handle()) {
                log::warn!("failed to install panel window tracker: {}", error);
            }

            #[cfg(target_os = "macos")]
            if let Err(error) =
                capture::install_source_app_tracker(Some(app.config().identifier.as_str()))
            {
                log::warn!("failed to install source app tracker: {}", error);
            }
            capture::spawn_clipboard_watcher(app_state.clone());

            Ok(())
        })
        .plugin(tauri_plugin_http::init())
        .invoke_handler(ipc_schema::builder().invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => focus_main_window(app_handle),
        RunEvent::WindowEvent { label, event, .. } if label == MAIN_WINDOW_LABEL => match event {
            WindowEvent::Moved(_)
            | WindowEvent::Resized(_)
            | WindowEvent::CloseRequested { .. }
            | WindowEvent::ScaleFactorChanged { .. } => save_main_window_state(app_handle),
            _ => {}
        },
        RunEvent::WindowEvent { label, event, .. } if is_panel_window_label(&label) => {
            match event {
                WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::CloseRequested { .. }
                | WindowEvent::ScaleFactorChanged { .. } => {
                    save_panel_window_state(app_handle, &label)
                }
                _ => {}
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn panel_layout_is_clamped_to_target_display() {
        let spec = PANEL_WINDOW_SPECS[0];
        let display = LogicalDisplayFrame {
            x: 0.0,
            y: 0.0,
            width: 1280.0,
            height: 720.0,
        };
        let persisted = PersistedPanelWindowState {
            width: 1600.0,
            height: 900.0,
            offset_x: 900.0,
            offset_y: 500.0,
        };

        let layout = resolve_panel_window_layout(&spec, &display, Some(&persisted));

        assert_eq!(layout.width, 800.0);
        assert_eq!(layout.height, 500.0);
        assert!(layout.x >= display.x);
        assert!(layout.y >= display.y);
        assert!(layout.x + layout.width <= display.x + display.width);
        assert!(layout.y + layout.height <= display.y + display.height);
    }

    #[test]
    fn panel_layout_defaults_to_target_display_center_when_unpersisted() {
        let spec = PANEL_WINDOW_SPECS[0];
        let display = LogicalDisplayFrame {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        let layout = resolve_panel_window_layout(&spec, &display, None);

        assert_eq!(layout.width, 800.0);
        assert_eq!(layout.height, 500.0);
        assert_eq!(layout.x, 560.0);
        assert_eq!(layout.y, 290.0);
    }

    #[test]
    fn panel_layout_preserves_target_display_origin() {
        let spec = PANEL_WINDOW_SPECS[0];
        let display = LogicalDisplayFrame {
            x: 1728.0,
            y: 64.0,
            width: 1512.0,
            height: 982.0,
        };

        let layout = resolve_panel_window_layout(&spec, &display, None);

        assert_eq!(layout.width, 800.0);
        assert_eq!(layout.height, 500.0);
        assert_eq!(layout.x, 2084.0);
        assert_eq!(layout.y, 305.0);
    }
}
