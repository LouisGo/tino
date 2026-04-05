mod app_state;
mod capture;
mod commands;
pub mod ipc_schema;
mod locale;
mod runtime_profile;
mod storage;

use app_state::{AppState, ClipboardWindowTarget};
#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use libc::pid_t;
use locale::localized_shell_strings;
#[cfg(target_os = "macos")]
use objc2::{rc::Retained, runtime::AnyClass, runtime::AnyObject, ClassType, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApplicationActivationOptions, NSPanel, NSResponder, NSRunningApplication, NSScreen, NSWindow,
    NSWindowAnimationBehavior, NSWindowCollectionBehavior, NSWindowStyleMask, NSWorkspace,
    NSWorkspaceApplicationKey, NSWorkspaceDidActivateApplicationNotification,
};
#[cfg(target_os = "macos")]
use objc2_core_graphics::{CGDisplayPixelsHigh, CGMainDisplayID};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSNotification, NSObject, NSObjectProtocol, NSPoint, NSSize, NSString};
use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use std::ptr::NonNull;
#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};
use std::{
    collections::BTreeMap,
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

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
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
struct TinoPanelIvars;

#[cfg(target_os = "macos")]
objc2::define_class!(
    // `nonactivatingPanel` 的语义是围绕 `NSPanel` 设计的。
    // 这里把通用小窗抽成独立的 panel 子类，确保它可以拿到键盘焦点，
    // 同时又不把当前前台应用从 Cursor / Ghostty 等切走。
    #[unsafe(super = NSPanel)]
    #[name = "TinoPanelWindow"]
    #[ivars = TinoPanelIvars]
    struct RawTinoPanelWindow;

    unsafe impl NSObjectProtocol for RawTinoPanelWindow {}

    impl RawTinoPanelWindow {
        #[unsafe(method(canBecomeKeyWindow))]
        fn __can_become_key_window(&self) -> bool {
            true
        }

        #[unsafe(method(canBecomeMainWindow))]
        fn __can_become_main_window(&self) -> bool {
            false
        }
    }
);

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn object_setClass(obj: *mut NSObject, cls: *const AnyClass) -> *const AnyClass;
}

pub(crate) fn format_system_time_rfc3339(timestamp: SystemTime) -> Result<String, String> {
    let datetime = chrono::DateTime::<chrono::Utc>::from(timestamp).with_timezone(&chrono::Local);
    Ok(datetime.to_rfc3339())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedMainWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPanelWindowState {
    height: f64,
    offset_x: f64,
    offset_y: f64,
    width: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct PersistedWindowStateStore {
    main: Option<PersistedMainWindowState>,
    panels: BTreeMap<String, PersistedPanelWindowState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum PersistedWindowStateFile {
    LegacyMain(PersistedMainWindowState),
    Store(PersistedWindowStateStore),
}

impl From<PersistedWindowStateFile> for PersistedWindowStateStore {
    fn from(value: PersistedWindowStateFile) -> Self {
        match value {
            PersistedWindowStateFile::LegacyMain(state) => Self {
                main: Some(state),
                panels: BTreeMap::new(),
            },
            PersistedWindowStateFile::Store(store) => store,
        }
    }
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
struct LogicalDisplayFrame {
    height: f64,
    width: f64,
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Copy)]
struct LogicalWindowFrame {
    height: f64,
    width: f64,
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Copy)]
struct PanelWindowLayout {
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

fn window_state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(WINDOW_STATE_FILE_NAME))
}

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

fn load_window_state_store(app: &AppHandle) -> PersistedWindowStateStore {
    let Some(path) = window_state_path(app) else {
        return PersistedWindowStateStore::default();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return PersistedWindowStateStore::default();
    };

    serde_json::from_str::<PersistedWindowStateFile>(&raw)
        .ok()
        .map(Into::into)
        .unwrap_or_default()
}

fn save_window_state_store(app: &AppHandle, store: &PersistedWindowStateStore) {
    let Some(path) = window_state_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(raw) = serde_json::to_string_pretty(store) {
        let _ = fs::write(path, raw);
    }
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
    _anchor: Option<&LogicalWindowFrame>,
    persisted: Option<&PersistedPanelWindowState>,
) -> PanelWindowLayout {
    let default_width = spec.window_size.0.min(display.width);
    let default_height = spec.window_size.1.min(display.height);

    let min_width = spec.min_size.map(|size| size.0).unwrap_or(200.0);
    let min_height = spec.min_size.map(|size| size.1).unwrap_or(120.0);
    let max_width = spec.max_size.map(|size| size.0).unwrap_or(display.width);
    let max_height = spec.max_size.map(|size| size.1).unwrap_or(display.height);

    let width = persisted
        .map(|state| state.width)
        .unwrap_or(default_width)
        .clamp(min_width.min(display.width), max_width.min(display.width));
    let height = persisted
        .map(|state| state.height)
        .unwrap_or(default_height)
        .clamp(
            min_height.min(display.height),
            max_height.min(display.height),
        );
    let max_offset_x = (display.width - width).max(0.0);
    let max_offset_y = (display.height - height).max(0.0);
    let default_offset_x = ((display.width - width) / 2.0)
        .max(0.0)
        .clamp(0.0, max_offset_x);
    let default_offset_y = ((display.height - height) / 2.0)
        .max(0.0)
        .clamp(0.0, max_offset_y);

    let offset_x = persisted
        .map(|state| state.offset_x)
        .unwrap_or(default_offset_x)
        .clamp(0.0, max_offset_x);
    let offset_y = persisted
        .map(|state| state.offset_y)
        .unwrap_or(default_offset_y)
        .clamp(0.0, max_offset_y);

    PanelWindowLayout {
        height,
        width,
        x: display.x + offset_x,
        y: display.y + offset_y,
    }
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
fn macos_window_position_for_layout(layout: &PanelWindowLayout) -> NSPoint {
    NSPoint::new(layout.x, macos_y_for_tauri_top(layout.y))
}

#[cfg(target_os = "macos")]
fn macos_y_for_tauri_top(y: f64) -> f64 {
    macos_y_for_tauri_top_with_display_height(y, CGDisplayPixelsHigh(CGMainDisplayID()) as f64)
}

#[cfg(target_os = "macos")]
fn macos_y_for_tauri_top_with_display_height(y: f64, display_height: f64) -> f64 {
    display_height - y
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
    resolve_panel_window_layout(spec, &display, target.anchor.as_ref(), persisted)
}

#[cfg(target_os = "macos")]
fn panel_window_handle(window: &WebviewWindow) -> Option<Retained<RawTinoPanelWindow>> {
    let ns_window = window.ns_window().ok()? as *mut NSObject;

    unsafe {
        let window_object: &AnyObject = &*ns_window.cast();
        if window_object.class() != RawTinoPanelWindow::class() {
            // Tauri 当前创建出来的是普通 `NSWindow`。
            // 对 panel 来说，只补一个 style mask 不够，所以这里在原生层把它切成
            // 真正的 `NSPanel` 子类，再复用现有的 Tauri webview 和窗口生命周期。
            let _ = object_setClass(ns_window, RawTinoPanelWindow::class());
        }

        Retained::retain(ns_window.cast::<RawTinoPanelWindow>())
    }
}

#[cfg(target_os = "macos")]
fn with_native_window_handles<R>(
    window: &WebviewWindow,
    label: &str,
    operation: impl FnOnce(&NSWindow, Option<&NSPanel>) -> R,
) -> Option<R> {
    if is_panel_window_label(label) {
        let panel = panel_window_handle(window)?;
        let ns_panel: &NSPanel = unsafe { &*(&*panel as *const RawTinoPanelWindow).cast() };
        let ns_window: &NSWindow = unsafe { &*(ns_panel as *const NSPanel).cast() };
        return Some(operation(ns_window, Some(ns_panel)));
    }

    let ns_window = window.ns_window().ok()?;
    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
    Some(operation(ns_window, None))
}

#[cfg(target_os = "macos")]
fn apply_native_window_configuration(
    ns_window: &NSWindow,
    ns_panel: Option<&NSPanel>,
    is_panel: bool,
) {
    // 主窗口和 panel 共用一套入口，但 panel 必须显式声明为 non-activating，
    // 否则会重新抢占应用激活状态，回到左上角切成 Towary 的旧问题。
    let mut style_mask = ns_window.styleMask();
    if is_panel {
        style_mask |= NSWindowStyleMask::NonactivatingPanel;
    } else {
        style_mask &= !NSWindowStyleMask::NonactivatingPanel;
    }
    ns_window.setStyleMask(style_mask);

    let mut collection_behavior =
        ns_window.collectionBehavior() | NSWindowCollectionBehavior::MoveToActiveSpace;

    if is_panel {
        collection_behavior |= NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::IgnoresCycle
            | NSWindowCollectionBehavior::FullScreenAuxiliary;
    }

    ns_window.setCollectionBehavior(collection_behavior);
    ns_window.setAnimationBehavior(NSWindowAnimationBehavior::None);
    ns_window.setHidesOnDeactivate(false);

    if let Some(ns_panel) = ns_panel {
        // 这些 panel 标志一起决定了它的 Cocoa 行为:
        // 浮层展示、按需成为 key、以及在切换空间/全屏辅助窗口场景下保持稳定。
        ns_panel.setFloatingPanel(true);
        ns_panel.setBecomesKeyOnlyIfNeeded(false);
        ns_panel.setWorksWhenModal(true);
    }
}

#[cfg(target_os = "macos")]
fn configure_native_window(window: &WebviewWindow) {
    let window = window.clone();
    let app = window.app_handle().clone();
    let label = window.label().to_string();

    let _ = run_on_main_thread_sync(&app, move || {
        let is_panel = is_panel_window_label(&label);
        let Some(()) = with_native_window_handles(&window, &label, |ns_window, ns_panel| {
            apply_native_window_configuration(ns_window, ns_panel, is_panel);
        }) else {
            return;
        };
    });
}

#[cfg(not(target_os = "macos"))]
fn configure_native_window(_window: &WebviewWindow) {}

#[cfg(target_os = "macos")]
fn focus_window_webview_content(window: &WebviewWindow) {
    let label = window.label().to_string();
    let _ = window.with_webview(move |webview| unsafe {
        let ns_window: &NSWindow = &*webview.ns_window().cast();
        let webview: &NSResponder = &*webview.inner().cast();

        if !ns_window.makeFirstResponder(Some(webview)) {
            log::warn!("failed to focus webview content for window {}", label);
        }
    });
}

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
        let Some(()) = with_native_window_handles(&window, &label, |ns_window, ns_panel| {
            apply_native_window_configuration(ns_window, ns_panel, is_panel);

            if let Some(layout) = layout {
                if request_focus && ns_window.isVisible() {
                    ns_window.orderOut(None);
                }

                ns_window.setContentSize(NSSize::new(layout.width, layout.height));
                ns_window.setFrameTopLeftPoint(macos_window_position_for_layout(&layout));
            }

            if ns_window.isMiniaturized() {
                ns_window.deminiaturize(None);
            }

            if request_focus {
                if is_panel {
                    // panel 的聚焦链路必须和主窗口分开:
                    // 只把 panel 提到前面并让 webview 成为 first responder，
                    // 不能走 app activate，否则菜单栏前台应用会被切成 Towary。
                    ns_window.orderFrontRegardless();
                    if let Some(content_view) = ns_window.contentView() {
                        ns_window.makeFirstResponder(Some(&content_view));
                    }
                    ns_window.makeKeyWindow();
                    focus_window_webview_content(&window);
                } else {
                    ns_window.makeKeyAndOrderFront(None);
                    #[allow(deprecated)]
                    let _ = NSRunningApplication::currentApplication().activateWithOptions(
                        NSApplicationActivationOptions::ActivateIgnoringOtherApps,
                    );
                    ns_window.makeKeyWindow();
                    ns_window.makeMainWindow();
                }
                return;
            }

            if layout.is_some() || !ns_window.isVisible() || !ns_window.isOnActiveSpace() {
                if is_panel {
                    ns_window.orderFrontRegardless();
                } else {
                    ns_window.orderFront(None);
                }
            }
        }) else {
            return;
        };
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

#[cfg(target_os = "macos")]
fn configure_native_macos_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };

    configure_native_window(&window);

    let Ok(ns_window) = window.ns_window() else {
        return;
    };

    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
    ns_window.setMovableByWindowBackground(false);
}

#[cfg(not(target_os = "macos"))]
fn configure_native_macos_window(_app: &AppHandle) {}

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
    fn legacy_window_state_file_migrates_into_store() {
        let legacy = PersistedWindowStateFile::LegacyMain(PersistedMainWindowState {
            x: 12,
            y: 24,
            width: 1280,
            height: 900,
            maximized: false,
        });

        let store = PersistedWindowStateStore::from(legacy);

        assert_eq!(store.main.as_ref().map(|state| state.x), Some(12));
        assert!(store.panels.is_empty());
    }

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

        let layout = resolve_panel_window_layout(&spec, &display, None, Some(&persisted));

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
        let anchor = LogicalWindowFrame {
            x: 1260.0,
            y: 180.0,
            width: 520.0,
            height: 720.0,
        };

        let layout = resolve_panel_window_layout(&spec, &display, Some(&anchor), None);

        assert_eq!(layout.width, 800.0);
        assert_eq!(layout.height, 500.0);
        assert_eq!(layout.x, 560.0);
        assert_eq!(layout.y, 290.0);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_window_position_converts_from_tauri_top_left_space() {
        assert_eq!(
            macos_y_for_tauri_top_with_display_height(290.0, 1080.0),
            790.0
        );
    }
}
