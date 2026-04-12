use std::{collections::BTreeMap, fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::storage::app_paths::resolve_durable_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedMainWindowState {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedPanelWindowState {
    pub(crate) height: f64,
    pub(crate) offset_x: f64,
    pub(crate) offset_y: f64,
    pub(crate) width: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PersistedWindowStateStore {
    pub(crate) main: Option<PersistedMainWindowState>,
    pub(crate) panels: BTreeMap<String, PersistedPanelWindowState>,
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

fn window_state_path(app: &AppHandle) -> Option<PathBuf> {
    resolve_durable_app_paths(app)
        .ok()
        .map(|paths| paths.window_state_path)
}

pub(crate) fn load_window_state_store(app: &AppHandle) -> PersistedWindowStateStore {
    let Some(path) = window_state_path(app) else {
        return PersistedWindowStateStore::default();
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        log::warn!("failed to read window state from {}", path.display());
        return PersistedWindowStateStore::default();
    };

    match serde_json::from_str::<PersistedWindowStateFile>(&raw) {
        Ok(file) => file.into(),
        Err(error) => {
            log::warn!("failed to parse window state: {}", error);
            PersistedWindowStateStore::default()
        }
    }
}

pub(crate) fn save_window_state_store(app: &AppHandle, store: &PersistedWindowStateStore) {
    let Some(path) = window_state_path(app) else {
        return;
    };

    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            log::warn!("failed to create window state directory: {}", error);
            return;
        }
    }

    let Ok(raw) = serde_json::to_string_pretty(store) else {
        log::warn!("failed to serialize window state");
        return;
    };

    if let Err(error) = fs::write(&path, raw) {
        log::warn!(
            "failed to write window state to {}: {}",
            path.display(),
            error
        );
    }
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
}
