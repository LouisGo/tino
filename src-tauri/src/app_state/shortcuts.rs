use log::warn;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use super::AppSettings;

pub(crate) const GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID: &str = "shell.toggleMainWindow";
pub(crate) const GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_DEFAULT: &str = "CommandOrControl+Alt+T";
pub(crate) const GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID: &str = "shell.toggleClipboardWindow";
pub(crate) const GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_DEFAULT: &str = "CommandOrControl+Alt+V";

#[derive(Debug, Clone, Copy)]
struct AppGlobalShortcutSpec {
    id: &'static str,
    default_accelerator: &'static str,
}

const APP_GLOBAL_SHORTCUT_SPECS: [AppGlobalShortcutSpec; 2] = [
    AppGlobalShortcutSpec {
        id: GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID,
        default_accelerator: GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_DEFAULT,
    },
    AppGlobalShortcutSpec {
        id: GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID,
        default_accelerator: GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_DEFAULT,
    },
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ResolvedAppGlobalShortcut {
    pub(crate) id: &'static str,
    pub(crate) accelerator: String,
}

pub(crate) fn resolve_app_global_shortcuts(
    settings: &AppSettings,
) -> Vec<ResolvedAppGlobalShortcut> {
    APP_GLOBAL_SHORTCUT_SPECS
        .iter()
        .filter_map(|shortcut| {
            let accelerator = match settings.shortcut_overrides.get(shortcut.id) {
                Some(shortcut_override) => shortcut_override.accelerator.clone(),
                None => Some(shortcut.default_accelerator.to_string()),
            }?;

            Some(ResolvedAppGlobalShortcut {
                id: shortcut.id,
                accelerator,
            })
        })
        .collect()
}

fn execute_app_global_shortcut(app: &AppHandle, shortcut_id: &str) -> Result<(), String> {
    match shortcut_id {
        GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID => {
            crate::toggle_main_window_visibility(app).map(|_| ())
        }
        GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID => {
            crate::toggle_clipboard_window_visibility(app).map(|_| ())
        }
        _ => Err(format!("unknown app global shortcut: {shortcut_id}")),
    }
}

fn register_app_global_shortcut(
    app: &AppHandle,
    shortcut: &ResolvedAppGlobalShortcut,
) -> Result<(), String> {
    let shortcut_id = shortcut.id;
    let accelerator = shortcut.accelerator.clone();
    let accelerator_for_log = accelerator.clone();

    app.global_shortcut()
        .on_shortcut(accelerator.as_str(), move |app_handle, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            if let Err(error) = execute_app_global_shortcut(app_handle, shortcut_id) {
                warn!(
                    "failed to execute app global shortcut {} ({}): {}",
                    shortcut_id, accelerator_for_log, error
                );
            }
        })
        .map_err(|error| error.to_string())
}

pub(crate) fn sync_app_global_shortcuts(
    app: &AppHandle,
    previous: Option<&AppSettings>,
    next: &AppSettings,
) -> Result<(), String> {
    let previous_shortcuts = previous
        .map(resolve_app_global_shortcuts)
        .unwrap_or_default();
    let next_shortcuts = resolve_app_global_shortcuts(next);
    let shortcut_manager = app.global_shortcut();
    let mut register_errors = Vec::new();

    for shortcut in previous_shortcuts.iter().filter(|shortcut| {
        !next_shortcuts
            .iter()
            .any(|candidate| candidate == *shortcut)
    }) {
        if let Err(error) = shortcut_manager.unregister(shortcut.accelerator.as_str()) {
            warn!(
                "failed to unregister app global shortcut {} ({}): {}",
                shortcut.id, shortcut.accelerator, error
            );
        }
    }

    for shortcut in next_shortcuts.iter().filter(|shortcut| {
        !previous_shortcuts
            .iter()
            .any(|candidate| candidate == *shortcut)
    }) {
        if let Err(error) = register_app_global_shortcut(app, shortcut) {
            register_errors.push(format!(
                "{} ({}): {}",
                shortcut.id, shortcut.accelerator, error
            ));
        }
    }

    if register_errors.is_empty() {
        Ok(())
    } else {
        Err(register_errors.join("; "))
    }
}
