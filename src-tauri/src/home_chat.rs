use serde::{Deserialize, Serialize};
use specta::Type;

const CHAT_PREVIEW_LIMIT: usize = 120;
const CHAT_TITLE_LIMIT: usize = 80;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HomeChatMessageRole {
    User,
    Assistant,
}

impl HomeChatMessageRole {
    pub fn as_storage_label(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }

    pub fn from_storage_label(value: &str) -> Self {
        match value.trim() {
            "assistant" => Self::Assistant,
            _ => Self::User,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HomeChatMessageStatus {
    Completed,
    Failed,
    Stopped,
}

impl HomeChatMessageStatus {
    pub fn as_storage_label(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Stopped => "stopped",
        }
    }

    pub fn from_storage_label(value: &str) -> Self {
        match value.trim() {
            "failed" => Self::Failed,
            "stopped" => Self::Stopped,
            _ => Self::Completed,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HomeChatConversationTitleStatus {
    Pending,
    Ready,
    Failed,
    Fallback,
}

impl HomeChatConversationTitleStatus {
    pub fn as_storage_label(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Ready => "ready",
            Self::Failed => "failed",
            Self::Fallback => "fallback",
        }
    }

    pub fn from_storage_label(value: &str) -> Self {
        match value.trim() {
            "ready" => Self::Ready,
            "failed" => Self::Failed,
            "fallback" => Self::Fallback,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum HomeChatConversationTitleSource {
    Model,
    Fallback,
    Manual,
}

impl HomeChatConversationTitleSource {
    pub fn as_storage_label(self) -> &'static str {
        match self {
            Self::Model => "model",
            Self::Fallback => "fallback",
            Self::Manual => "manual",
        }
    }

    pub fn from_storage_label(value: &str) -> Option<Self> {
        match value.trim() {
            "model" => Some(Self::Model),
            "fallback" => Some(Self::Fallback),
            "manual" => Some(Self::Manual),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HomeChatConversationSummary {
    pub id: String,
    pub title: Option<String>,
    pub title_status: HomeChatConversationTitleStatus,
    pub title_source: Option<HomeChatConversationTitleSource>,
    pub is_pinned: bool,
    pub pinned_at: Option<String>,
    pub preview_text: Option<String>,
    pub message_count: usize,
    pub created_at: String,
    pub updated_at: String,
    pub last_message_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HomeChatMessage {
    pub id: String,
    pub conversation_id: String,
    pub ordinal: usize,
    pub role: HomeChatMessageRole,
    pub content: String,
    pub reasoning_text: Option<String>,
    pub status: HomeChatMessageStatus,
    pub error_message: Option<String>,
    pub provider_label: Option<String>,
    pub response_model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HomeChatConversationDetail {
    pub conversation: HomeChatConversationSummary,
    pub messages: Vec<HomeChatMessage>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateHomeChatConversationRequest {
    pub initial_user_message: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppendHomeChatUserMessageRequest {
    pub conversation_id: String,
    pub user_message: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceLatestHomeChatAssistantMessageRequest {
    pub conversation_id: String,
    pub content: String,
    pub reasoning_text: Option<String>,
    pub status: HomeChatMessageStatus,
    pub error_message: Option<String>,
    pub provider_label: Option<String>,
    pub response_model: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RewriteLatestHomeChatUserMessageRequest {
    pub conversation_id: String,
    pub user_message: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetHomeChatConversationPinnedRequest {
    pub conversation_id: String,
    pub pinned: bool,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHomeChatConversationTitleRequest {
    pub conversation_id: String,
    pub title: String,
    pub title_status: HomeChatConversationTitleStatus,
    pub title_source: HomeChatConversationTitleSource,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteHomeChatConversationRequest {
    pub conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteHomeChatConversationResult {
    pub conversation_id: String,
    pub deleted: bool,
}

pub fn normalize_home_chat_content(input: &str) -> String {
    input.trim().replace("\r\n", "\n")
}

pub fn normalize_home_chat_optional_content(input: Option<&str>) -> Option<String> {
    let normalized = input.map(normalize_home_chat_content).unwrap_or_default();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub fn normalize_home_chat_title(input: &str) -> String {
    collapse_whitespace(input.trim(), CHAT_TITLE_LIMIT)
}

pub fn build_home_chat_preview(content: &str) -> Option<String> {
    let preview = collapse_whitespace(content.trim(), CHAT_PREVIEW_LIMIT);

    if preview.is_empty() {
        None
    } else {
        Some(preview)
    }
}

fn collapse_whitespace(input: &str, limit: usize) -> String {
    let collapsed = input.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut value = collapsed.trim().to_string();
    if value.chars().count() <= limit {
        return value;
    }

    value = value
        .chars()
        .take(limit.saturating_sub(1))
        .collect::<String>();
    format!("{value}…")
}
