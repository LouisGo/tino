use std::path::Path;

use log::warn;

use crate::app_state::{
    load_recent_clipboard_captures_from_store, load_recent_clipboard_captures_legacy,
    query_capture_history_page_from_store, query_clipboard_history_page_legacy, CapturePreview,
    ClipboardPage, ClipboardPageRequest,
};

pub(crate) fn query_clipboard_history_page(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    history_days: u16,
    request: &ClipboardPageRequest,
) -> Result<ClipboardPage, String> {
    match query_capture_history_page_from_store(
        knowledge_root,
        clipboard_cache_root,
        history_days,
        request,
    ) {
        Ok(page) => Ok(page),
        Err(error) => {
            warn!(
                "failed to read capture history from sqlite store, falling back to jsonl: {error}"
            );
            query_clipboard_history_page_legacy(clipboard_cache_root, history_days, request)
        }
    }
}

pub(crate) fn load_recent_clipboard_captures(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    history_days: u16,
    limit: usize,
) -> Result<Vec<CapturePreview>, String> {
    match load_recent_clipboard_captures_from_store(
        knowledge_root,
        clipboard_cache_root,
        history_days,
        limit,
    ) {
        Ok(captures) => Ok(captures),
        Err(error) => {
            warn!(
                "failed to read recent captures from sqlite store, falling back to jsonl: {error}"
            );
            load_recent_clipboard_captures_legacy(clipboard_cache_root, history_days, limit)
        }
    }
}
