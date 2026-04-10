use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct CapturePreview {
    pub id: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub source_app_icon_path: Option<String>,
    pub content_kind: String,
    pub preview: String,
    pub secondary_preview: Option<String>,
    pub captured_at: String,
    pub status: String,
    pub raw_text: String,
    pub ocr_text: Option<String>,
    #[serde(default)]
    pub file_missing: bool,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(default, rename_all = "camelCase")]
pub struct PinnedClipboardCapture {
    pub capture: CapturePreview,
    pub pinned_at: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPageSummary {
    pub total: usize,
    pub text: usize,
    pub links: usize,
    pub images: usize,
    pub videos: usize,
    pub files: usize,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPage {
    pub captures: Vec<CapturePreview>,
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub has_more: bool,
    pub history_days: u16,
    pub summary: ClipboardPageSummary,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardBoardBootstrap {
    pub page: ClipboardPage,
    pub pinned_captures: Vec<PinnedClipboardCapture>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteClipboardCaptureResult {
    pub id: String,
    pub removed_from_history: bool,
    pub removed_from_store: bool,
    pub removed_from_pinned: bool,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateClipboardPinResult {
    pub capture_id: String,
    pub pinned: bool,
    pub changed: bool,
    pub replaced_capture_id: Option<String>,
    pub pinned_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClipboardWindowTarget {
    pub app_name: Option<String>,
    pub bundle_id: Option<String>,
    pub process_id: i32,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPageRequest {
    pub page: usize,
    pub page_size: usize,
    pub search: Option<String>,
    pub filter: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReplayRequest {
    pub capture_id: Option<String>,
    pub content_kind: String,
    pub raw_text: String,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardReturnResult {
    pub pasted: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CaptureRecord {
    pub id: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub source_app_icon_path: Option<String>,
    pub captured_at: String,
    pub content_kind: String,
    pub raw_text: String,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
    pub hash: String,
    #[serde(skip, default)]
    pub image_bytes: Option<Vec<u8>>,
    #[serde(skip, default)]
    pub source_app_icon_bytes: Option<Vec<u8>>,
}
