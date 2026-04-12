use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::app_state::AppSettings;

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsChanged {
    pub previous: Option<AppSettings>,
    pub saved: AppSettings,
    pub source_window_label: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ClipboardCapturesUpdatedReason {
    HistoryChanged,
    PinsChanged,
    CaptureDeleted,
    OcrUpdated,
    RuntimeStateChanged,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardCapturesUpdated {
    pub reason: ClipboardCapturesUpdatedReason,
    pub refresh_history: bool,
    pub refresh_pinned: bool,
    pub refresh_dashboard: bool,
}

impl ClipboardCapturesUpdated {
    pub fn history_changed() -> Self {
        Self {
            reason: ClipboardCapturesUpdatedReason::HistoryChanged,
            refresh_history: true,
            refresh_pinned: false,
            refresh_dashboard: true,
        }
    }

    pub fn pins_changed() -> Self {
        Self {
            reason: ClipboardCapturesUpdatedReason::PinsChanged,
            refresh_history: true,
            refresh_pinned: true,
            refresh_dashboard: false,
        }
    }

    pub fn capture_deleted() -> Self {
        Self {
            reason: ClipboardCapturesUpdatedReason::CaptureDeleted,
            refresh_history: true,
            refresh_pinned: true,
            refresh_dashboard: true,
        }
    }

    pub fn ocr_updated() -> Self {
        Self {
            reason: ClipboardCapturesUpdatedReason::OcrUpdated,
            refresh_history: true,
            refresh_pinned: false,
            refresh_dashboard: false,
        }
    }

    pub fn runtime_state_changed() -> Self {
        Self {
            reason: ClipboardCapturesUpdatedReason::RuntimeStateChanged,
            refresh_history: false,
            refresh_pinned: false,
            refresh_dashboard: true,
        }
    }
}
