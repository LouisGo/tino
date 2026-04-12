mod app_idle;
mod app_state;
mod backend;
mod capture;
mod clipboard;
mod commands;
mod error;
mod ipc_events;
pub mod ipc_schema;
mod locale;
mod native_window_macos;
mod panel_layout;
mod runtime_profile;
mod runtime_provider;
mod storage;
mod video_thumbnail;
mod vision_ocr;
mod window_state;

use app_state::AppState;
#[cfg(target_os = "macos")]
use block2::RcBlock;
use clipboard::types::ClipboardWindowTarget;
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
#[cfg(target_os = "macos")]
use std::sync::Mutex;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
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
#[cfg(target_os = "macos")]
static INITIAL_MAIN_WINDOW_PRESENTED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "macos")]
static LAST_EXTERNAL_ACTIVATION_TARGET: Mutex<Option<RecentActivationTarget>> = Mutex::new(None);

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

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PhysicalDisplayFrame {
    height: u32,
    width: u32,
    x: i32,
    y: i32,
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PhysicalWindowFrame {
    height: u32,
    width: u32,
    x: i32,
    y: i32,
}

#[derive(Debug)]
struct PanelPresentationTarget {
    anchor: Option<LogicalWindowFrame>,
    monitor: Monitor,
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy)]
struct RecentActivationTarget {
    anchor: Option<LogicalWindowFrame>,
    center_x: f64,
    center_y: f64,
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

#[cfg(test)]
fn centered_window_frame_for_display(
    width: u32,
    height: u32,
    display: PhysicalDisplayFrame,
) -> PhysicalWindowFrame {
    let width = width.max(1).min(display.width.max(1));
    let height = height.max(1).min(display.height.max(1));
    let x = i64::from(display.x) + ((i64::from(display.width) - i64::from(width)).max(0) / 2);
    let y = i64::from(display.y) + ((i64::from(display.height) - i64::from(height)).max(0) / 2);

    PhysicalWindowFrame {
        height,
        width,
        x: x as i32,
        y: y as i32,
    }
}

#[cfg(test)]
fn translate_window_frame_to_display(
    frame: PhysicalWindowFrame,
    source_display: Option<PhysicalDisplayFrame>,
    target_display: PhysicalDisplayFrame,
) -> PhysicalWindowFrame {
    let width = frame.width.max(1).min(target_display.width.max(1));
    let height = frame.height.max(1).min(target_display.height.max(1));
    let mut translated = match source_display {
        Some(source_display) if source_display != target_display => {
            let offset_x = i64::from(frame.x) - i64::from(source_display.x);
            let offset_y = i64::from(frame.y) - i64::from(source_display.y);

            PhysicalWindowFrame {
                height,
                width,
                x: (i64::from(target_display.x) + offset_x) as i32,
                y: (i64::from(target_display.y) + offset_y) as i32,
            }
        }
        Some(_) => PhysicalWindowFrame {
            height,
            width,
            x: frame.x,
            y: frame.y,
        },
        None => centered_window_frame_for_display(width, height, target_display),
    };

    let min_x = i64::from(target_display.x);
    let min_y = i64::from(target_display.y);
    let max_x = min_x + (i64::from(target_display.width) - i64::from(width)).max(0);
    let max_y = min_y + (i64::from(target_display.height) - i64::from(height)).max(0);

    translated.x = i64::from(translated.x).clamp(min_x, max_x) as i32;
    translated.y = i64::from(translated.y).clamp(min_y, max_y) as i32;
    translated
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
            return last_external_activation_target_snapshot()
                .map(|target| (target.center_x, target.center_y, target.anchor));
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

fn preferred_main_window_monitor(app: &AppHandle) -> Option<Monitor> {
    preferred_panel_target_for_frontmost_window(app)
        .map(|target| target.monitor)
        .or_else(|| preferred_monitor_for_cursor(app))
        .or_else(|| app.primary_monitor().ok().flatten())
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
        let _ = hide_window_and_clear_focus(app, spec.label, &window);
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
    let _ = hide_window_and_clear_focus(app, MAIN_WINDOW_LABEL, &window);
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
fn set_native_window_bounds(window: &WebviewWindow, x: f64, y: f64, width: f64, height: f64) {
    let window = window.clone();
    let app = window.app_handle().clone();
    let label = window.label().to_string();

    let _ = run_on_main_thread_sync(&app, move || {
        native_window_macos::set_native_window_bounds(
            &window,
            is_panel_window_label(&label),
            x,
            y,
            width,
            height,
        );
    });
}

#[cfg(not(target_os = "macos"))]
fn set_native_window_bounds(_window: &WebviewWindow, _x: f64, _y: f64, _width: f64, _height: f64) {}

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

fn logical_main_window_frame(window: &WebviewWindow) -> Option<LogicalWindowFrame> {
    logical_window_frame(window)
}

fn translate_logical_frame_to_display(
    frame: LogicalWindowFrame,
    source_display: Option<LogicalDisplayFrame>,
    target_display: LogicalDisplayFrame,
) -> LogicalWindowFrame {
    let width = frame.width.max(1.0).min(target_display.width.max(1.0));
    let height = frame.height.max(1.0).min(target_display.height.max(1.0));
    let mut translated = match source_display {
        Some(source_display)
            if source_display.x != target_display.x
                || source_display.y != target_display.y
                || source_display.width != target_display.width
                || source_display.height != target_display.height =>
        {
            LogicalWindowFrame {
                height,
                width,
                x: target_display.x + (frame.x - source_display.x),
                y: target_display.y + (frame.y - source_display.y),
            }
        }
        Some(_) => LogicalWindowFrame {
            height,
            width,
            x: frame.x,
            y: frame.y,
        },
        None => LogicalWindowFrame {
            height,
            width,
            x: target_display.x + ((target_display.width - width).max(0.0) / 2.0),
            y: target_display.y + ((target_display.height - height).max(0.0) / 2.0),
        },
    };

    let max_x = target_display.x + (target_display.width - width).max(0.0);
    let max_y = target_display.y + (target_display.height - height).max(0.0);
    translated.x = translated.x.clamp(target_display.x, max_x);
    translated.y = translated.y.clamp(target_display.y, max_y);
    translated
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

fn prepare_main_window_for_show(app: &AppHandle, window: &WebviewWindow) {
    let Some(target_monitor) = preferred_main_window_monitor(app) else {
        return;
    };
    let Some(frame) = logical_main_window_frame(window) else {
        return;
    };

    let source_display =
        current_window_monitor(window).map(|monitor| logical_display_frame_from_monitor(&monitor));
    let target_display = logical_display_frame_from_monitor(&target_monitor);
    let translated = translate_logical_frame_to_display(frame, source_display, target_display);

    if translated.x == frame.x
        && translated.y == frame.y
        && translated.width == frame.width
        && translated.height == frame.height
    {
        return;
    }

    let was_maximized = window.is_maximized().unwrap_or(false);
    if was_maximized {
        let _ = window.unmaximize();
    }

    #[cfg(target_os = "macos")]
    set_native_window_bounds(
        window,
        translated.x,
        translated.y,
        translated.width,
        translated.height,
    );

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_size(tauri::LogicalSize::new(translated.width, translated.height));
        let _ = window.set_position(tauri::LogicalPosition::new(translated.x, translated.y));
    }

    if was_maximized {
        let _ = window.maximize();
    }
}

pub(crate) fn focus_main_window(app: &AppHandle) {
    hide_panel_windows_except(app, None);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        configure_native_window(&window);
        if !window.is_visible().unwrap_or(false) {
            prepare_main_window_for_show(app, &window);
        }
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

fn record_window_focus_change(app: &AppHandle, label: &str, focused: bool) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };

    if let Err(error) = state.record_window_focus_change(label, focused) {
        log::warn!(
            "failed to record window focus change for {}: {}",
            label,
            error
        );
    }
}

fn hide_window_and_clear_focus(
    app: &AppHandle,
    label: &str,
    window: &WebviewWindow,
) -> Result<(), String> {
    record_window_focus_change(app, label, false);
    window.hide().map_err(|error| error.to_string())
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
        hide_window_and_clear_focus(app, MAIN_WINDOW_LABEL, &window)?;
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
            hide_window_and_clear_focus(app, CLIPBOARD_PANEL_LABEL, &window)?;
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

    let current_pid = NSRunningApplication::currentApplication().processIdentifier();
    let frontmost_target = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .and_then(|application| non_self_clipboard_window_target(&application, current_pid));

    if let Some(target) = frontmost_target.clone() {
        if let Err(error) = state.set_last_external_clipboard_window_target(Some(target)) {
            log::warn!(
                "failed to remember last external clipboard window target: {}",
                error
            );
        }
    }

    // Global shortcut handling can make Tino frontmost before we sample, so fall back
    // to the last external app activation instead of clearing the target.
    let target = frontmost_target.or_else(|| {
        state
            .last_external_clipboard_window_target()
            .map_err(|error| {
                log::warn!(
                    "failed to read last external clipboard window target: {}",
                    error
                );
                error
            })
            .ok()
            .flatten()
    });

    if let Err(error) = state.set_clipboard_window_target(target) {
        log::warn!("failed to record clipboard window target: {}", error);
    }
}

#[cfg(not(target_os = "macos"))]
fn record_clipboard_window_target(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
fn clipboard_window_target_from_running_application(
    application: &Retained<NSRunningApplication>,
) -> ClipboardWindowTarget {
    ClipboardWindowTarget {
        app_name: application.localizedName().map(|value| value.to_string()),
        bundle_id: application
            .bundleIdentifier()
            .map(|value| value.to_string()),
        process_id: application.processIdentifier(),
    }
}

#[cfg(target_os = "macos")]
fn non_self_clipboard_window_target(
    application: &Retained<NSRunningApplication>,
    current_pid: pid_t,
) -> Option<ClipboardWindowTarget> {
    (application.processIdentifier() != current_pid)
        .then(|| clipboard_window_target_from_running_application(application))
}

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
fn remember_external_activation_target(
    application: &Retained<NSRunningApplication>,
) -> Option<RecentActivationTarget> {
    if let Some(frame) = focused_window_frame_for_pid(application.processIdentifier()) {
        return Some(RecentActivationTarget {
            anchor: Some(frame),
            center_x: frame.x + (frame.width / 2.0),
            center_y: frame.y + (frame.height / 2.0),
        });
    }

    let mtm = MainThreadMarker::new().expect("main thread marker should exist");
    let screen = NSScreen::mainScreen(mtm)?;
    let visible_frame = screen.visibleFrame();

    Some(RecentActivationTarget {
        anchor: None,
        center_x: visible_frame.origin.x + (visible_frame.size.width / 2.0),
        center_y: visible_frame.origin.y + (visible_frame.size.height / 2.0),
    })
}

#[cfg(target_os = "macos")]
fn set_last_external_activation_target(target: Option<RecentActivationTarget>) {
    if let Ok(mut guard) = LAST_EXTERNAL_ACTIVATION_TARGET.lock() {
        *guard = target;
    }
}

#[cfg(target_os = "macos")]
fn last_external_activation_target_snapshot() -> Option<RecentActivationTarget> {
    LAST_EXTERNAL_ACTIVATION_TARGET
        .lock()
        .ok()
        .and_then(|guard| *guard)
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

        let Some(target) = non_self_clipboard_window_target(&application, current_pid) else {
            return;
        };
        set_last_external_activation_target(remember_external_activation_target(&application));

        if let Some(state) = app_handle.try_state::<AppState>() {
            if let Err(error) = state.set_last_external_clipboard_window_target(Some(target)) {
                log::warn!(
                    "failed to update last external clipboard window target: {}",
                    error
                );
            }
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

    let specta_builder = ipc_schema::builder();
    let setup_specta_builder = specta_builder.clone();

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
        .on_page_load(|webview, payload| {
            if webview.window().label() != MAIN_WINDOW_LABEL {
                return;
            }

            if payload.event() != PageLoadEvent::Finished {
                return;
            }

            if INITIAL_MAIN_WINDOW_PRESENTED.swap(true, Ordering::SeqCst) {
                return;
            }

            focus_main_window(&webview.window().app_handle());
        })
        .setup(move |app| {
            setup_specta_builder.mount_events(app);
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
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                record_window_focus_change(
                    app.handle(),
                    MAIN_WINDOW_LABEL,
                    window.is_focused().unwrap_or(false),
                );
            }
            if let Some(window) = app.get_webview_window(CLIPBOARD_PANEL_LABEL) {
                record_window_focus_change(
                    app.handle(),
                    CLIPBOARD_PANEL_LABEL,
                    window.is_focused().unwrap_or(false),
                );
            }

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
        .invoke_handler(specta_builder.invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => focus_main_window(app_handle),
        RunEvent::WindowEvent { label, event, .. } if label == MAIN_WINDOW_LABEL => match event {
            WindowEvent::Focused(focused) => {
                record_window_focus_change(app_handle, &label, focused);
            }
            WindowEvent::CloseRequested { .. } => {
                record_window_focus_change(app_handle, &label, false);
                save_main_window_state(app_handle);
            }
            WindowEvent::Moved(_)
            | WindowEvent::Resized(_)
            | WindowEvent::ScaleFactorChanged { .. } => save_main_window_state(app_handle),
            _ => {}
        },
        RunEvent::WindowEvent { label, event, .. } if is_panel_window_label(&label) => {
            match event {
                WindowEvent::Focused(focused) => {
                    record_window_focus_change(app_handle, &label, focused);
                }
                WindowEvent::CloseRequested { .. } => {
                    record_window_focus_change(app_handle, &label, false);
                    save_panel_window_state(app_handle, &label)
                }
                WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
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

    #[test]
    fn translated_main_window_frame_preserves_relative_offset_between_displays() {
        let source = PhysicalDisplayFrame {
            x: 0,
            y: 0,
            width: 1728,
            height: 1117,
        };
        let target = PhysicalDisplayFrame {
            x: 1728,
            y: 0,
            width: 1512,
            height: 982,
        };
        let frame = PhysicalWindowFrame {
            x: 164,
            y: 96,
            width: 1200,
            height: 800,
        };

        let translated = translate_window_frame_to_display(frame, Some(source), target);

        assert_eq!(
            translated,
            PhysicalWindowFrame {
                x: 1892,
                y: 96,
                width: 1200,
                height: 800,
            }
        );
    }

    #[test]
    fn translated_main_window_frame_recenters_when_source_display_is_unknown() {
        let target = PhysicalDisplayFrame {
            x: 1512,
            y: 64,
            width: 1512,
            height: 982,
        };
        let frame = PhysicalWindowFrame {
            x: 0,
            y: 0,
            width: 1480,
            height: 960,
        };

        let translated = translate_window_frame_to_display(frame, None, target);

        assert_eq!(
            translated,
            PhysicalWindowFrame {
                x: 1528,
                y: 75,
                width: 1480,
                height: 960,
            }
        );
    }

    #[test]
    fn translated_main_window_frame_is_clamped_inside_target_display() {
        let source = PhysicalDisplayFrame {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let target = PhysicalDisplayFrame {
            x: 1920,
            y: 0,
            width: 1280,
            height: 720,
        };
        let frame = PhysicalWindowFrame {
            x: 900,
            y: 300,
            width: 1600,
            height: 900,
        };

        let translated = translate_window_frame_to_display(frame, Some(source), target);

        assert_eq!(
            translated,
            PhysicalWindowFrame {
                x: 1920,
                y: 0,
                width: 1280,
                height: 720,
            }
        );
    }

    #[test]
    fn translated_logical_main_window_frame_preserves_relative_offset_between_displays() {
        let source = LogicalDisplayFrame {
            x: 0.0,
            y: 0.0,
            width: 1512.0,
            height: 982.0,
        };
        let target = LogicalDisplayFrame {
            x: 1512.0,
            y: 0.0,
            width: 1728.0,
            height: 1117.0,
        };
        let frame = LogicalWindowFrame {
            x: 120.0,
            y: 96.0,
            width: 1280.0,
            height: 840.0,
        };

        let translated = translate_logical_frame_to_display(frame, Some(source), target);

        assert_eq!(translated.x, 1632.0);
        assert_eq!(translated.y, 96.0);
        assert_eq!(translated.width, 1280.0);
        assert_eq!(translated.height, 840.0);
    }

    #[test]
    fn translated_logical_main_window_frame_recenters_when_source_display_is_unknown() {
        let target = LogicalDisplayFrame {
            x: 1728.0,
            y: 64.0,
            width: 1512.0,
            height: 982.0,
        };
        let frame = LogicalWindowFrame {
            x: 0.0,
            y: 0.0,
            width: 1480.0,
            height: 960.0,
        };

        let translated = translate_logical_frame_to_display(frame, None, target);

        assert_eq!(translated.x, 1744.0);
        assert_eq!(translated.y, 75.0);
        assert_eq!(translated.width, 1480.0);
        assert_eq!(translated.height, 960.0);
    }
}
