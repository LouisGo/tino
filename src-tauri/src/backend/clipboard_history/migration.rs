use std::path::Path;

use crate::{
    backend::clipboard_history::legacy::{
        capture_preview_to_history_upsert, load_capture_history_entries_legacy,
    },
    storage::capture_history_store::CaptureHistoryStore,
};

pub(crate) fn reconcile_capture_history_store(
    clipboard_cache_root: &Path,
    history_days: u16,
) -> Result<(), String> {
    let captures = load_capture_history_entries_legacy(clipboard_cache_root, history_days)?;
    let upserts = captures
        .into_iter()
        .map(capture_preview_to_history_upsert)
        .collect::<Vec<_>>();
    CaptureHistoryStore::new(clipboard_cache_root)?.replace_retained_history(&upserts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Local};
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    use crate::{
        backend::clipboard_history::legacy::append_clipboard_history_entry,
        clipboard::types::CapturePreview, storage::capture_history_store::CaptureHistoryQuery,
        storage::knowledge_root::ensure_knowledge_root_layout,
    };
    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tino-history-migration-tests-{}",
            Uuid::now_v7().simple()
        ))
    }

    fn sample_preview(id: &str, captured_at: &str) -> CapturePreview {
        CapturePreview {
            id: id.into(),
            source: "clipboard".into(),
            source_app_name: Some("Tino".into()),
            source_app_bundle_id: Some("dev.tino".into()),
            source_app_icon_path: None,
            content_kind: "plain_text".into(),
            preview: format!("preview-{id}"),
            secondary_preview: Some("1 line · 10 chars".into()),
            captured_at: captured_at.into(),
            status: "archived".into(),
            raw_text: format!("raw-{id}"),
            ocr_text: None,
            file_missing: false,
            raw_rich: None,
            raw_rich_format: None,
            link_url: None,
            link_metadata: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
        }
    }

    #[test]
    fn reconcile_capture_history_store_is_idempotent_for_same_legacy_entries() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");
        let captured_at = (Local::now().fixed_offset() - Duration::minutes(1)).to_rfc3339();
        append_clipboard_history_entry(&root, &sample_preview("cap_1", &captured_at))
            .expect("preview should append");

        reconcile_capture_history_store(&root, 3).expect("first reconcile should succeed");
        reconcile_capture_history_store(&root, 3).expect("second reconcile should succeed");

        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 3,
                excluded_capture_ids: Vec::new(),
                search: String::new(),
                filter: "all".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(result.captures[0].id, "cap_1");

        let _ = fs::remove_dir_all(root);
    }
}
