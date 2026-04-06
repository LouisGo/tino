#[cfg(target_os = "macos")]
use objc2::{rc::Retained, runtime::AnyClass, runtime::AnyObject, ClassType};
#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApplicationActivationOptions, NSPanel, NSResponder, NSRunningApplication, NSWindow,
    NSWindowAnimationBehavior, NSWindowCollectionBehavior, NSWindowStyleMask,
};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSObject, NSObjectProtocol};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow};

use crate::panel_layout::PanelWindowLayout;

#[cfg(target_os = "macos")]
struct TinoPanelIvars;

#[cfg(target_os = "macos")]
objc2::define_class!(
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

#[cfg(target_os = "macos")]
fn panel_window_handle(
    window: &WebviewWindow,
    is_panel: bool,
) -> Option<Retained<RawTinoPanelWindow>> {
    if !is_panel {
        return None;
    }

    let ns_window = window.ns_window().ok()? as *mut NSObject;

    unsafe {
        let window_object: &AnyObject = &*ns_window.cast();
        if window_object.class() != RawTinoPanelWindow::class() {
            let _ = object_setClass(ns_window, RawTinoPanelWindow::class());
        }

        Retained::retain(ns_window.cast::<RawTinoPanelWindow>())
    }
}

#[cfg(target_os = "macos")]
fn with_native_window_handles<R>(
    window: &WebviewWindow,
    is_panel: bool,
    operation: impl FnOnce(&NSWindow, Option<&NSPanel>) -> R,
) -> Option<R> {
    if let Some(panel) = panel_window_handle(window, is_panel) {
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
        ns_panel.setFloatingPanel(true);
        ns_panel.setBecomesKeyOnlyIfNeeded(false);
        ns_panel.setWorksWhenModal(true);
    }
}

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
pub(crate) fn configure_native_window(window: &WebviewWindow, is_panel: bool) {
    let Some(()) = with_native_window_handles(window, is_panel, |ns_window, ns_panel| {
        apply_native_window_configuration(ns_window, ns_panel, is_panel);
    }) else {
        return;
    };
}

#[cfg(target_os = "macos")]
pub(crate) fn present_native_window(
    window: &WebviewWindow,
    is_panel: bool,
    layout: Option<PanelWindowLayout>,
    request_focus: bool,
) {
    let Some(()) = with_native_window_handles(window, is_panel, |ns_window, ns_panel| {
        apply_native_window_configuration(ns_window, ns_panel, is_panel);

        if let Some(layout) = layout {
            if request_focus && ns_window.isVisible() {
                ns_window.orderOut(None);
            }

            // Let Tauri own global logical positioning so panel placement stays correct on
            // non-primary displays instead of re-deriving AppKit screen coordinates here.
            let _ = window.set_size(LogicalSize::new(layout.width, layout.height));
            let _ = window.set_position(LogicalPosition::new(layout.x, layout.y));
        }

        if ns_window.isMiniaturized() {
            ns_window.deminiaturize(None);
        }

        if request_focus {
            if is_panel {
                ns_window.orderFrontRegardless();
                if let Some(content_view) = ns_window.contentView() {
                    ns_window.makeFirstResponder(Some(&content_view));
                }
                ns_window.makeKeyWindow();
                focus_window_webview_content(window);
            } else {
                ns_window.makeKeyAndOrderFront(None);
                #[allow(deprecated)]
                let _ = NSRunningApplication::currentApplication()
                    .activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
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
}

#[cfg(target_os = "macos")]
pub(crate) fn configure_native_macos_window(app: &AppHandle, main_window_label: &str) {
    let Some(window) = app.get_webview_window(main_window_label) else {
        return;
    };

    configure_native_window(&window, false);

    let Ok(ns_window) = window.ns_window() else {
        return;
    };

    let ns_window: &NSWindow = unsafe { &*ns_window.cast() };
    ns_window.setMovableByWindowBackground(false);
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn configure_native_window(_window: &WebviewWindow, _is_panel: bool) {}

#[cfg(not(target_os = "macos"))]
pub(crate) fn present_native_window(
    _window: &WebviewWindow,
    _is_panel: bool,
    _layout: Option<PanelWindowLayout>,
    _request_focus: bool,
) {
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn configure_native_macos_window(_app: &AppHandle, _main_window_label: &str) {}
