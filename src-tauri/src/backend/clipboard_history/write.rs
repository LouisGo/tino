use std::path::Path;

use log::warn;

use crate::{
    backend::clipboard_history::legacy::{
        append_clipboard_history_entry, delete_clipboard_history_entry,
        promote_clipboard_history_entry, update_clipboard_history_ocr_text,
    },
    backend::clipboard_history::migration::reconcile_capture_history_store,
    clipboard::types::{CapturePreview, DeleteClipboardCaptureResult},
    storage::capture_history_store::{CaptureHistoryStore, CaptureHistoryUpsert},
};

pub(crate) fn persist_capture_preview(
    clipboard_cache_root: &Path,
    history_days: u16,
    preview: &CapturePreview,
    history_upsert: &CaptureHistoryUpsert,
) -> Result<(), String> {
    append_clipboard_history_entry(clipboard_cache_root, preview)?;
    if let Err(error) = upsert_capture_history_store(clipboard_cache_root, history_upsert) {
        warn!("failed to persist capture preview into sqlite store: {error}");
        if let Err(sync_error) = reconcile_capture_history_store(clipboard_cache_root, history_days)
        {
            warn!("failed to repair sqlite capture history store from jsonl: {sync_error}");
        }
    }

    Ok(())
}

pub(crate) fn delete_capture_with_fallback(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
) -> Result<DeleteClipboardCaptureResult, String> {
    let removed_from_history =
        delete_clipboard_history_entry(clipboard_cache_root, history_days, capture_id)?;

    let removed_from_store = match CaptureHistoryStore::new(clipboard_cache_root)
        .and_then(|store| store.delete_capture(capture_id))
    {
        Ok(removed) => removed,
        Err(error) => {
            warn!("failed to delete capture from sqlite store: {error}");
            if let Err(sync_error) =
                reconcile_capture_history_store(clipboard_cache_root, history_days)
            {
                warn!("failed to repair sqlite capture history store after delete: {sync_error}");
            }
            false
        }
    };

    Ok(DeleteClipboardCaptureResult {
        id: capture_id.to_string(),
        removed_from_history,
        removed_from_store,
        removed_from_pinned: false,
        deleted: removed_from_history || removed_from_store,
    })
}

pub(crate) fn promote_capture_reuse_with_fallback(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
    capture_hash: &str,
    captured_at: &str,
) -> Result<bool, String> {
    let promoted_legacy = promote_clipboard_history_entry(
        clipboard_cache_root,
        history_days,
        capture_id,
        captured_at,
    )?;
    let promoted_store = match CaptureHistoryStore::new(clipboard_cache_root)
        .and_then(|store| store.promote_capture_reuse(capture_id, capture_hash, captured_at))
    {
        Ok(promoted) => promoted,
        Err(error) => {
            warn!("failed to promote replayed capture in sqlite store: {error}");
            false
        }
    };

    if !promoted_store && promoted_legacy {
        if let Err(sync_error) = reconcile_capture_history_store(clipboard_cache_root, history_days)
        {
            warn!("failed to repair sqlite capture history store after replay: {sync_error}");
        }
    }

    Ok(promoted_legacy || promoted_store)
}

pub(crate) fn update_capture_ocr_text_with_fallback(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
    ocr_text: &str,
) -> Result<bool, String> {
    let updated_history = match update_clipboard_history_ocr_text(
        clipboard_cache_root,
        history_days,
        capture_id,
        ocr_text,
    ) {
        Ok(updated) => updated,
        Err(error) => {
            warn!("failed to update capture OCR text in jsonl history: {error}");
            false
        }
    };

    let updated_store = match CaptureHistoryStore::new(clipboard_cache_root)
        .and_then(|store| store.update_capture_ocr_text(capture_id, ocr_text))
    {
        Ok(updated) => updated,
        Err(error) => {
            warn!("failed to update capture OCR text in sqlite store: {error}");
            if let Err(sync_error) =
                reconcile_capture_history_store(clipboard_cache_root, history_days)
            {
                warn!(
                    "failed to repair sqlite capture history store after OCR update: {sync_error}"
                );
            }
            false
        }
    };

    Ok(updated_history || updated_store)
}

fn upsert_capture_history_store(
    clipboard_cache_root: &Path,
    capture: &CaptureHistoryUpsert,
) -> Result<(), String> {
    CaptureHistoryStore::new(clipboard_cache_root)?.upsert_capture(capture)
}
