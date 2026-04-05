use std::path::Path;

use log::warn;

use crate::{
    app_state::{
        append_clipboard_history_entry, delete_clipboard_history_entry,
        promote_clipboard_history_entry, upsert_capture_history_store, CapturePreview,
        DeleteClipboardCaptureResult,
    },
    backend::clipboard_history::migration::reconcile_capture_history_store,
    storage::capture_history_store::{CaptureHistoryStore, CaptureHistoryUpsert},
};

pub(crate) fn persist_capture_preview(
    knowledge_root: &Path,
    history_days: u16,
    preview: &CapturePreview,
    history_upsert: &CaptureHistoryUpsert,
) -> Result<(), String> {
    append_clipboard_history_entry(knowledge_root, preview)?;
    if let Err(error) = upsert_capture_history_store(knowledge_root, history_upsert) {
        warn!("failed to persist capture preview into sqlite store: {error}");
        if let Err(sync_error) = reconcile_capture_history_store(knowledge_root, history_days) {
            warn!("failed to repair sqlite capture history store from jsonl: {sync_error}");
        }
    }

    Ok(())
}

pub(crate) fn delete_capture_with_fallback(
    knowledge_root: &Path,
    history_days: u16,
    capture_id: &str,
) -> Result<DeleteClipboardCaptureResult, String> {
    let removed_from_history =
        delete_clipboard_history_entry(knowledge_root, history_days, capture_id)?;

    let removed_from_store = match CaptureHistoryStore::new(knowledge_root)
        .and_then(|store| store.delete_capture(capture_id))
    {
        Ok(removed) => removed,
        Err(error) => {
            warn!("failed to delete capture from sqlite store: {error}");
            if let Err(sync_error) = reconcile_capture_history_store(knowledge_root, history_days) {
                warn!("failed to repair sqlite capture history store after delete: {sync_error}");
            }
            false
        }
    };

    Ok(DeleteClipboardCaptureResult {
        id: capture_id.to_string(),
        removed_from_history,
        removed_from_store,
        deleted: removed_from_history || removed_from_store,
    })
}

pub(crate) fn promote_capture_reuse_with_fallback(
    knowledge_root: &Path,
    history_days: u16,
    capture_id: &str,
    capture_hash: &str,
    captured_at: &str,
) -> Result<bool, String> {
    let promoted_legacy =
        promote_clipboard_history_entry(knowledge_root, history_days, capture_id, captured_at)?;
    let promoted_store = match CaptureHistoryStore::new(knowledge_root)
        .and_then(|store| store.promote_capture_reuse(capture_id, capture_hash, captured_at))
    {
        Ok(promoted) => promoted,
        Err(error) => {
            warn!("failed to promote replayed capture in sqlite store: {error}");
            false
        }
    };

    if !promoted_store && promoted_legacy {
        if let Err(sync_error) = reconcile_capture_history_store(knowledge_root, history_days) {
            warn!("failed to repair sqlite capture history store after replay: {sync_error}");
        }
    }

    Ok(promoted_legacy || promoted_store)
}
