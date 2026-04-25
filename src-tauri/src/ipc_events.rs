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
pub enum AiSystemUpdatedReason {
    BackgroundCompileRan,
    FeedbackRecorded,
    LegacyReviewPersisted,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct AiSystemUpdated {
    pub reason: AiSystemUpdatedReason,
    pub refresh_snapshot: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ClipboardCapturesUpdatedReason {
    HistoryChanged,
    PinsChanged,
    CaptureDeleted,
    OcrUpdated,
    LinkMetadataUpdated,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HomeChatConversationsUpdatedReason {
    ConversationCreated,
    MessagesChanged,
    TitleChanged,
    PinnedChanged,
    ConversationDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct HomeChatConversationsUpdated {
    pub reason: HomeChatConversationsUpdatedReason,
    pub conversation_id: Option<String>,
    pub refresh_list: bool,
    pub refresh_conversation: bool,
}

impl HomeChatConversationsUpdated {
    pub fn conversation_created(conversation_id: String) -> Self {
        Self {
            reason: HomeChatConversationsUpdatedReason::ConversationCreated,
            conversation_id: Some(conversation_id),
            refresh_list: true,
            refresh_conversation: true,
        }
    }

    pub fn messages_changed(conversation_id: String) -> Self {
        Self {
            reason: HomeChatConversationsUpdatedReason::MessagesChanged,
            conversation_id: Some(conversation_id),
            refresh_list: true,
            refresh_conversation: true,
        }
    }

    pub fn title_changed(conversation_id: String) -> Self {
        Self {
            reason: HomeChatConversationsUpdatedReason::TitleChanged,
            conversation_id: Some(conversation_id),
            refresh_list: true,
            refresh_conversation: false,
        }
    }

    pub fn pinned_changed(conversation_id: String) -> Self {
        Self {
            reason: HomeChatConversationsUpdatedReason::PinnedChanged,
            conversation_id: Some(conversation_id),
            refresh_list: true,
            refresh_conversation: true,
        }
    }

    pub fn conversation_deleted(conversation_id: String) -> Self {
        Self {
            reason: HomeChatConversationsUpdatedReason::ConversationDeleted,
            conversation_id: Some(conversation_id),
            refresh_list: true,
            refresh_conversation: false,
        }
    }
}

impl AiSystemUpdated {
    pub fn background_compile_ran() -> Self {
        Self {
            reason: AiSystemUpdatedReason::BackgroundCompileRan,
            refresh_snapshot: true,
        }
    }

    pub fn feedback_recorded() -> Self {
        Self {
            reason: AiSystemUpdatedReason::FeedbackRecorded,
            refresh_snapshot: true,
        }
    }

    pub fn legacy_review_persisted() -> Self {
        Self {
            reason: AiSystemUpdatedReason::LegacyReviewPersisted,
            refresh_snapshot: true,
        }
    }
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

    pub fn link_metadata_updated(refresh_pinned: bool) -> Self {
        Self {
            reason: ClipboardCapturesUpdatedReason::LinkMetadataUpdated,
            refresh_history: true,
            refresh_pinned,
            refresh_dashboard: true,
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
