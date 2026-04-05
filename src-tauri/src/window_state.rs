use std::{collections::BTreeMap, fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const WINDOW_STATE_FILE_NAME: &str = "window-state.json";

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
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join(WINDOW_STATE_FILE_NAME))
}

pub(crate) fn load_window_state_store(app: &AppHandle) -> PersistedWindowStateStore {
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

pub(crate) fn save_window_state_store(app: &AppHandle, store: &PersistedWindowStateStore) {
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
