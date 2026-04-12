use std::{collections::HashSet, path::Path};

use log::warn;

use crate::backend::clipboard_history::legacy::{
    load_recent_clipboard_captures_legacy, query_clipboard_history_page_legacy,
};
use crate::clipboard::preview::hydrate_capture_preview_assets;
use crate::clipboard::types::{
    CapturePreview, ClipboardPage, ClipboardPageRequest, LinkMetadata, LinkMetadataFetchStatus,
};
use crate::storage::capture_history_store::{
    CaptureHistoryEntry, CaptureHistoryQuery, CaptureHistoryStore, CaptureHistorySummary,
};

pub(crate) fn query_clipboard_history_page(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    history_days: u16,
    excluded_capture_ids: &HashSet<String>,
    request: &ClipboardPageRequest,
) -> Result<ClipboardPage, String> {
    match query_capture_history_page_from_store(
        knowledge_root,
        clipboard_cache_root,
        history_days,
        excluded_capture_ids,
        request,
    ) {
        Ok(page) => Ok(page),
        Err(error) => {
            warn!(
                "failed to read capture history from sqlite store, falling back to jsonl: {error}"
            );
            query_clipboard_history_page_legacy(
                knowledge_root,
                clipboard_cache_root,
                history_days,
                excluded_capture_ids,
                request,
            )
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
            load_recent_clipboard_captures_legacy(
                knowledge_root,
                clipboard_cache_root,
                history_days,
                limit,
            )
        }
    }
}

fn query_capture_history_page_from_store(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    history_days: u16,
    excluded_capture_ids: &HashSet<String>,
    request: &ClipboardPageRequest,
) -> Result<ClipboardPage, String> {
    let page_size = request.page_size.clamp(1, 100);
    let page = request.page;
    let filter = request
        .filter
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_ascii_lowercase();
    let search = request.search.as_deref().unwrap_or("").trim().to_string();
    let mut excluded_ids = excluded_capture_ids.iter().cloned().collect::<Vec<_>>();
    excluded_ids.sort();

    let page_result =
        CaptureHistoryStore::new(clipboard_cache_root)?.query_page(&CaptureHistoryQuery {
            history_days,
            excluded_capture_ids: excluded_ids,
            search,
            filter,
            page,
            page_size,
        })?;
    let mut captures = Vec::with_capacity(page_result.captures.len());
    for entry in page_result.captures {
        let mut capture = capture_history_entry_to_preview(entry);
        hydrate_capture_preview_assets(knowledge_root, &mut capture)?;
        captures.push(capture);
    }

    let end = page.saturating_mul(page_size).saturating_add(page_size);
    Ok(ClipboardPage {
        captures,
        page,
        page_size,
        total: page_result.total,
        has_more: end < page_result.total,
        history_days,
        summary: capture_history_summary_to_page_summary(page_result.summary),
    })
}

fn load_recent_clipboard_captures_from_store(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    history_days: u16,
    limit: usize,
) -> Result<Vec<CapturePreview>, String> {
    let entries = CaptureHistoryStore::new(clipboard_cache_root)?
        .list_recent_captures(history_days, limit)?;
    let mut captures = Vec::with_capacity(entries.len());

    for entry in entries {
        let mut capture = capture_history_entry_to_preview(entry);
        hydrate_capture_preview_assets(knowledge_root, &mut capture)?;
        captures.push(capture);
    }

    Ok(captures)
}

fn capture_history_entry_to_preview(entry: CaptureHistoryEntry) -> CapturePreview {
    let link_metadata = capture_history_entry_link_metadata(&entry);

    CapturePreview {
        id: entry.id,
        source: entry.source,
        source_app_name: entry.source_app_name,
        source_app_bundle_id: entry.source_app_bundle_id,
        source_app_icon_path: entry.source_app_icon_path,
        content_kind: entry.content_kind,
        preview: entry.preview,
        secondary_preview: entry.secondary_preview,
        captured_at: entry.captured_at,
        status: entry.status,
        raw_text: entry.raw_text,
        ocr_text: entry.ocr_text,
        file_missing: false,
        raw_rich: entry.raw_rich,
        raw_rich_format: entry.raw_rich_format,
        link_url: entry.link_url,
        link_metadata,
        asset_path: entry.asset_path,
        thumbnail_path: entry.thumbnail_path,
        image_width: entry.image_width,
        image_height: entry.image_height,
        byte_size: entry.byte_size,
    }
}

fn capture_history_entry_link_metadata(entry: &CaptureHistoryEntry) -> Option<LinkMetadata> {
    let fetched_at = entry.link_metadata_fetched_at.as_deref()?.trim();
    if fetched_at.is_empty() {
        return None;
    }

    Some(LinkMetadata {
        title: entry.link_title.clone(),
        description: entry.link_description.clone(),
        icon_path: entry.link_icon_path.clone(),
        fetched_at: fetched_at.to_string(),
        fetch_status: LinkMetadataFetchStatus::from_storage_label(
            entry.link_metadata_fetch_status.as_deref().unwrap_or(""),
        ),
    })
}

fn capture_history_summary_to_page_summary(
    summary: CaptureHistorySummary,
) -> crate::clipboard::types::ClipboardPageSummary {
    crate::clipboard::types::ClipboardPageSummary {
        total: summary.total,
        text: summary.text,
        links: summary.links,
        images: summary.images,
        videos: summary.videos,
        files: summary.files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Local};
    use std::{collections::HashSet, fs, path::PathBuf};
    use uuid::Uuid;

    use crate::{
        backend::clipboard_history::legacy::append_clipboard_history_entry,
        clipboard::types::{CapturePreview, ClipboardPageRequest},
    };

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tino-history-read-tests-{}",
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
    fn query_clipboard_history_page_falls_back_to_legacy_when_sqlite_unavailable() {
        let root = unique_root();
        fs::create_dir_all(&root).expect("root should exist");
        let captured_at = (Local::now().fixed_offset() - Duration::minutes(1)).to_rfc3339();
        append_clipboard_history_entry(&root, &sample_preview("cap_1", &captured_at))
            .expect("preview should append");
        fs::create_dir_all(root.join("tino.db")).expect("sqlite path should be blocked by dir");

        let page = query_clipboard_history_page(
            &root,
            &root,
            3,
            &HashSet::new(),
            &ClipboardPageRequest {
                page: 0,
                page_size: 20,
                search: None,
                filter: None,
            },
        )
        .expect("fallback query should succeed");

        assert_eq!(page.total, 1);
        assert_eq!(page.captures.len(), 1);
        assert_eq!(page.captures[0].id, "cap_1");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn load_recent_clipboard_captures_falls_back_to_legacy_when_sqlite_unavailable() {
        let root = unique_root();
        fs::create_dir_all(&root).expect("root should exist");
        let captured_at = (Local::now().fixed_offset() - Duration::minutes(1)).to_rfc3339();
        append_clipboard_history_entry(&root, &sample_preview("cap_1", &captured_at))
            .expect("preview should append");
        fs::create_dir_all(root.join("tino.db")).expect("sqlite path should be blocked by dir");

        let captures =
            load_recent_clipboard_captures(&root, &root, 3, 10).expect("fallback load should work");

        assert_eq!(captures.len(), 1);
        assert_eq!(captures[0].id, "cap_1");

        let _ = fs::remove_dir_all(root);
    }
}
