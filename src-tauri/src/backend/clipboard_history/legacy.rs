use chrono::{DateTime, Duration, FixedOffset, Local, NaiveDate};
use log::warn;
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};

use crate::{
    backend::clipboard_history::search::{
        matches_clipboard_history_search, matches_content_kind_filter,
        parse_clipboard_history_search,
    },
    clipboard::{
        preview::{
            build_link_display_with_metadata, build_link_secondary_preview,
            hydrate_capture_preview_assets, normalize_ocr_text, should_persist_capture_history,
        },
        types::{
            CapturePreview, ClipboardPage, ClipboardPageRequest, ClipboardPageSummary,
            LinkMetadata,
        },
    },
    storage::capture_history_store::{CaptureHistoryStore, CaptureHistoryUpsert},
};

const CLIPBOARD_HISTORY_DIR_NAME: &str = "clipboard";
const MAX_CLIPBOARD_STORAGE_BYTES: u64 = 256 * 1024 * 1024;

pub(crate) fn query_clipboard_history_page_legacy(
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
    let search = request.search.as_deref().unwrap_or("").trim();
    let search_query = parse_clipboard_history_search(search);
    let start = page.saturating_mul(page_size);
    let end = start.saturating_add(page_size);
    let mut captures = Vec::new();
    let mut summary = ClipboardPageSummary {
        total: 0,
        text: 0,
        links: 0,
        images: 0,
        videos: 0,
        files: 0,
    };
    let mut filtered_total = 0usize;

    visit_clipboard_history_entries(clipboard_cache_root, history_days, |capture| {
        if !should_persist_capture_history(&capture.status) {
            return Ok(());
        }

        if excluded_capture_ids.contains(&capture.id) {
            return Ok(());
        }

        if !matches_clipboard_history_search(capture, &search_query) {
            return Ok(());
        }

        match capture.content_kind.as_str() {
            "plain_text" | "rich_text" => summary.text += 1,
            "link" => summary.links += 1,
            "image" => summary.images += 1,
            "video" => summary.videos += 1,
            "file" => summary.files += 1,
            _ => {}
        }
        summary.total += 1;

        if !matches_clipboard_filter(capture, &filter) {
            return Ok(());
        }

        if filtered_total >= start && filtered_total < end {
            let mut hydrated = capture.clone();
            hydrate_capture_preview_assets(knowledge_root, &mut hydrated)?;
            captures.push(hydrated);
        }

        filtered_total += 1;
        Ok(())
    })?;

    Ok(ClipboardPage {
        captures,
        page,
        page_size,
        total: filtered_total,
        has_more: end < filtered_total,
        history_days,
        summary,
    })
}

pub(crate) fn load_recent_clipboard_captures_legacy(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    history_days: u16,
    limit: usize,
) -> Result<Vec<CapturePreview>, String> {
    let mut captures = Vec::new();

    visit_clipboard_history_entries(clipboard_cache_root, history_days, |capture| {
        if !should_persist_capture_history(&capture.status) {
            return Ok(());
        }

        if captures.len() >= limit {
            return Ok(());
        }

        let mut hydrated = capture.clone();
        hydrate_capture_preview_assets(knowledge_root, &mut hydrated)?;
        captures.push(hydrated);
        Ok(())
    })?;

    Ok(captures)
}

pub(crate) fn capture_preview_to_history_upsert(preview: CapturePreview) -> CaptureHistoryUpsert {
    CaptureHistoryUpsert {
        id: preview.id,
        captured_at: preview.captured_at,
        source: preview.source,
        source_app_name: preview.source_app_name,
        source_app_bundle_id: preview.source_app_bundle_id,
        source_app_icon_path: preview.source_app_icon_path,
        content_kind: preview.content_kind,
        preview: preview.preview,
        secondary_preview: preview.secondary_preview,
        status: preview.status,
        raw_text: preview.raw_text,
        ocr_text: preview.ocr_text,
        raw_rich: preview.raw_rich,
        raw_rich_format: preview.raw_rich_format,
        link_url: preview.link_url,
        link_title: preview
            .link_metadata
            .as_ref()
            .and_then(|metadata| metadata.title.clone()),
        link_description: preview
            .link_metadata
            .as_ref()
            .and_then(|metadata| metadata.description.clone()),
        link_icon_path: preview
            .link_metadata
            .as_ref()
            .and_then(|metadata| metadata.icon_path.clone()),
        link_metadata_fetched_at: preview
            .link_metadata
            .as_ref()
            .map(|metadata| metadata.fetched_at.clone()),
        link_metadata_fetch_status: preview
            .link_metadata
            .as_ref()
            .map(|metadata| metadata.fetch_status.as_storage_label().to_string()),
        asset_path: preview.asset_path,
        thumbnail_path: preview.thumbnail_path,
        image_width: preview.image_width,
        image_height: preview.image_height,
        byte_size: preview.byte_size,
        hash: None,
    }
}

pub(crate) fn update_clipboard_history_link_metadata(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
    link_metadata: &LinkMetadata,
) -> Result<bool, String> {
    let normalized_capture_id = capture_id.trim();
    if normalized_capture_id.is_empty() || link_metadata.fetched_at.trim().is_empty() {
        return Ok(false);
    }

    let mut entries_by_day =
        load_clipboard_history_entries_by_day(clipboard_cache_root, history_days)?;
    let mut changed = false;

    for captures_by_id in entries_by_day.values_mut() {
        let Some(capture) = captures_by_id.get_mut(normalized_capture_id) else {
            continue;
        };

        let next_preview = capture
            .link_url
            .as_deref()
            .map(|link_url| build_link_display_with_metadata(link_url, Some(link_metadata)))
            .unwrap_or_else(|| capture.preview.clone());
        let next_secondary_preview = capture
            .link_url
            .as_deref()
            .map(|link_url| build_link_secondary_preview(link_url, &capture.raw_text, Some(link_metadata)));

        if capture.link_metadata.as_ref() == Some(link_metadata)
            && capture.preview == next_preview
            && capture.secondary_preview == next_secondary_preview
        {
            return Ok(false);
        }

        capture.link_metadata = Some(link_metadata.clone());
        capture.preview = next_preview;
        capture.secondary_preview = next_secondary_preview;
        changed = true;
        break;
    }

    if !changed {
        return Ok(false);
    }

    persist_clipboard_history_entries(clipboard_cache_root, history_days, &entries_by_day)?;
    Ok(true)
}

pub(crate) fn update_clipboard_history_ocr_text(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
    ocr_text: &str,
) -> Result<bool, String> {
    let normalized = normalize_ocr_text(ocr_text);
    if normalized.is_empty() {
        return Ok(false);
    }

    let mut entries_by_day =
        load_clipboard_history_entries_by_day(clipboard_cache_root, history_days)?;
    let mut changed = false;

    for captures_by_id in entries_by_day.values_mut() {
        let Some(capture) = captures_by_id.get_mut(capture_id) else {
            continue;
        };

        if capture.ocr_text.as_deref() == Some(normalized.as_str()) {
            return Ok(false);
        }

        capture.ocr_text = Some(normalized.clone());
        changed = true;
        break;
    }

    if !changed {
        return Ok(false);
    }

    persist_clipboard_history_entries(clipboard_cache_root, history_days, &entries_by_day)?;
    Ok(true)
}

pub(crate) fn append_clipboard_history_entry(
    clipboard_cache_root: &Path,
    preview: &CapturePreview,
) -> Result<(), String> {
    let path = clipboard_history_file_path(clipboard_cache_root, &preview.captured_at)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string(preview).map_err(|error| error.to_string())?;
    file.write_all(serialized.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|error| error.to_string())
}

pub(crate) fn promote_clipboard_history_entry(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
    replayed_at: &str,
) -> Result<bool, String> {
    let mut entries_by_day =
        load_clipboard_history_entries_by_day(clipboard_cache_root, history_days)?;
    let mut promoted_capture = None;

    for captures_by_id in entries_by_day.values_mut() {
        if let Some(capture) = captures_by_id.remove(capture_id) {
            promoted_capture = Some(capture);
            break;
        }
    }

    let Some(mut capture) = promoted_capture else {
        return Ok(false);
    };

    capture.captured_at = replayed_at.to_string();
    let _ = upsert_clipboard_history_entry(&mut entries_by_day, capture)?;
    entries_by_day.retain(|_, captures_by_id| !captures_by_id.is_empty());
    persist_clipboard_history_entries(clipboard_cache_root, history_days, &entries_by_day)?;
    Ok(true)
}

pub(crate) fn load_capture_history_entries_legacy(
    clipboard_cache_root: &Path,
    history_days: u16,
) -> Result<Vec<CapturePreview>, String> {
    let mut captures = Vec::new();

    visit_clipboard_history_entries(clipboard_cache_root, history_days, |capture| {
        captures.push(capture.clone());
        Ok(())
    })?;

    Ok(captures)
}

pub(crate) fn reconcile_clipboard_history(
    clipboard_cache_root: &Path,
    history_days: u16,
    recent_captures: &[CapturePreview],
) -> Result<(), String> {
    let mut entries_by_day =
        load_clipboard_history_entries_by_day(clipboard_cache_root, history_days)?;
    let mut changed = false;

    for capture in recent_captures.iter().cloned() {
        changed |= upsert_clipboard_history_entry(&mut entries_by_day, capture)?;
    }

    if changed {
        persist_clipboard_history_entries(clipboard_cache_root, history_days, &entries_by_day)?;
    }

    Ok(())
}

pub(crate) fn delete_clipboard_history_entry(
    clipboard_cache_root: &Path,
    history_days: u16,
    capture_id: &str,
) -> Result<bool, String> {
    let mut entries_by_day =
        load_clipboard_history_entries_by_day(clipboard_cache_root, history_days)?;
    let mut changed = false;

    for captures_by_id in entries_by_day.values_mut() {
        if captures_by_id.remove(capture_id).is_some() {
            changed = true;
        }
    }

    if !changed {
        return Ok(false);
    }

    entries_by_day.retain(|_, captures_by_id| !captures_by_id.is_empty());
    persist_clipboard_history_entries(clipboard_cache_root, history_days, &entries_by_day)?;
    Ok(true)
}

pub(crate) fn enforce_clipboard_retention(
    clipboard_cache_root: &Path,
    history_days: u16,
) -> Result<(), String> {
    let retention_cutoff = retention_cutoff_timestamp(history_days);
    let prune_start_date = retention_prune_start_date(history_days);

    prune_dated_children(
        &clipboard_history_dir_path(clipboard_cache_root),
        "jsonl",
        prune_start_date,
    )?;
    let retained_entries =
        load_clipboard_history_entries_by_day(clipboard_cache_root, history_days)?;
    persist_clipboard_history_entries(clipboard_cache_root, history_days, &retained_entries)?;
    if let Err(error) = CaptureHistoryStore::new(clipboard_cache_root).and_then(|store| {
        store.delete_before_capture_timestamp(retention_cutoff.timestamp_millis())
    }) {
        warn!("failed to prune sqlite capture history retention window: {error}");
    }
    enforce_clipboard_storage_budget(clipboard_cache_root)?;

    Ok(())
}

#[derive(Default)]
struct ClipboardDayUsage {
    total_bytes: u64,
}

fn prune_dated_children(
    dir: &Path,
    required_extension: &str,
    cutoff: NaiveDate,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };

        if !required_extension.is_empty()
            && path.extension().and_then(|value| value.to_str()) != Some(required_extension)
        {
            continue;
        }

        let Ok(date) = NaiveDate::parse_from_str(name, "%Y-%m-%d") else {
            continue;
        };

        if date >= cutoff {
            continue;
        }

        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn enforce_clipboard_storage_budget(clipboard_cache_root: &Path) -> Result<(), String> {
    let mut usage_by_day = collect_clipboard_day_usage(clipboard_cache_root)?;
    let mut total_bytes = usage_by_day
        .values()
        .map(|usage| usage.total_bytes)
        .sum::<u64>();

    if total_bytes <= MAX_CLIPBOARD_STORAGE_BYTES {
        return Ok(());
    }

    let mut removed_dates = Vec::new();
    for (date, usage) in &usage_by_day {
        if total_bytes <= MAX_CLIPBOARD_STORAGE_BYTES {
            break;
        }

        remove_clipboard_day_data(clipboard_cache_root, *date)?;
        total_bytes = total_bytes.saturating_sub(usage.total_bytes);
        removed_dates.push(*date);
    }

    if removed_dates.is_empty() {
        return Ok(());
    }

    if let Err(error) = prune_capture_history_store_days(clipboard_cache_root, &removed_dates) {
        warn!("failed to prune sqlite capture history for removed dates: {error}");
    }
    usage_by_day.clear();

    Ok(())
}

fn collect_clipboard_day_usage(
    clipboard_cache_root: &Path,
) -> Result<BTreeMap<NaiveDate, ClipboardDayUsage>, String> {
    let mut usage_by_day = BTreeMap::new();

    collect_dated_file_usage(
        &clipboard_history_dir_path(clipboard_cache_root),
        "jsonl",
        &mut usage_by_day,
    )?;
    if let Err(error) = merge_capture_history_store_usage(clipboard_cache_root, &mut usage_by_day) {
        warn!("failed to estimate sqlite capture history usage by day: {error}");
    }

    Ok(usage_by_day)
}

fn collect_dated_file_usage(
    dir: &Path,
    extension: &str,
    usage_by_day: &mut BTreeMap<NaiveDate, ClipboardDayUsage>,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some(extension) {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(date) = NaiveDate::parse_from_str(stem, "%Y-%m-%d") else {
            continue;
        };

        let bytes = path.metadata().map_err(|error| error.to_string())?.len();
        usage_by_day.entry(date).or_default().total_bytes += bytes;
    }

    Ok(())
}

fn merge_capture_history_store_usage(
    clipboard_cache_root: &Path,
    usage_by_day: &mut BTreeMap<NaiveDate, ClipboardDayUsage>,
) -> Result<(), String> {
    let usage = CaptureHistoryStore::new(clipboard_cache_root)?.estimate_usage_by_day()?;

    for (day, bytes) in usage {
        let Ok(date) = NaiveDate::parse_from_str(&day, "%Y-%m-%d") else {
            continue;
        };
        usage_by_day.entry(date).or_default().total_bytes += bytes;
    }

    Ok(())
}

fn remove_clipboard_day_data(clipboard_cache_root: &Path, date: NaiveDate) -> Result<(), String> {
    let day = date.format("%Y-%m-%d").to_string();
    let history_path =
        clipboard_history_dir_path(clipboard_cache_root).join(format!("{day}.jsonl"));
    if history_path.exists() {
        fs::remove_file(history_path).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn prune_capture_history_store_days(
    clipboard_cache_root: &Path,
    removed_dates: &[NaiveDate],
) -> Result<(), String> {
    if removed_dates.is_empty() {
        return Ok(());
    }

    let days = removed_dates
        .iter()
        .map(|date| date.format("%Y-%m-%d").to_string())
        .collect::<Vec<_>>();
    CaptureHistoryStore::new(clipboard_cache_root)?.delete_days(&days)
}

fn matches_clipboard_filter(capture: &CapturePreview, filter: &str) -> bool {
    matches_content_kind_filter(&capture.content_kind, filter)
}


fn visit_clipboard_history_entries<F>(
    clipboard_cache_root: &Path,
    history_days: u16,
    mut visit: F,
) -> Result<(), String>
where
    F: FnMut(&CapturePreview) -> Result<(), String>,
{
    let retention_cutoff = retention_cutoff_timestamp(history_days);

    for history_path in clipboard_history_paths_desc(clipboard_cache_root, history_days)? {
        let content = fs::read_to_string(&history_path).map_err(|error| error.to_string())?;
        let mut lines = content.lines().collect::<Vec<&str>>();
        lines.reverse();

        for line in lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let capture = match serde_json::from_str::<CapturePreview>(trimmed) {
                Ok(capture) => capture,
                Err(_) => continue,
            };
            if !should_persist_capture_history(&capture.status) {
                continue;
            }
            if !is_capture_within_retention_window(&capture.captured_at, &retention_cutoff) {
                continue;
            }
            visit(&capture)?;
        }
    }

    Ok(())
}

fn load_clipboard_history_entries_by_day(
    clipboard_cache_root: &Path,
    history_days: u16,
) -> Result<BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>>, String> {
    let mut entries_by_day: BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>> = BTreeMap::new();
    let retention_cutoff = retention_cutoff_timestamp(history_days);

    for history_path in clipboard_history_paths_desc(clipboard_cache_root, history_days)? {
        let Some(date) = path_date(&history_path) else {
            continue;
        };
        let content = fs::read_to_string(&history_path).map_err(|error| error.to_string())?;

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            let Ok(capture) = serde_json::from_str::<CapturePreview>(trimmed) else {
                continue;
            };
            if !should_persist_capture_history(&capture.status) {
                continue;
            }
            if !is_capture_within_retention_window(&capture.captured_at, &retention_cutoff) {
                continue;
            }

            entries_by_day
                .entry(date)
                .or_default()
                .entry(capture.id.clone())
                .or_insert(capture);
        }
    }

    Ok(entries_by_day)
}

fn persist_clipboard_history_entries(
    clipboard_cache_root: &Path,
    history_days: u16,
    entries_by_day: &BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>>,
) -> Result<(), String> {
    let history_dir = clipboard_history_dir_path(clipboard_cache_root);
    fs::create_dir_all(&history_dir).map_err(|error| error.to_string())?;

    let retained_days = entries_by_day
        .keys()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();

    for history_path in clipboard_history_paths_desc(clipboard_cache_root, history_days)? {
        let Some(date) = path_date(&history_path) else {
            continue;
        };

        if !retained_days.contains(&date) {
            fs::remove_file(history_path).map_err(|error| error.to_string())?;
        }
    }

    for (date, captures_by_id) in entries_by_day {
        let mut captures = captures_by_id.values().cloned().collect::<Vec<_>>();
        captures.sort_by(|left, right| {
            left.captured_at
                .cmp(&right.captured_at)
                .then(left.id.cmp(&right.id))
        });

        let mut lines = captures
            .into_iter()
            .map(|capture| serde_json::to_string(&capture).map_err(|error| error.to_string()))
            .collect::<Result<Vec<String>, String>>()?;
        lines.push(String::new());

        let path = history_dir.join(format!("{}.jsonl", date.format("%Y-%m-%d")));
        fs::write(path, lines.join("\n")).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn upsert_clipboard_history_entry(
    entries_by_day: &mut BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>>,
    capture: CapturePreview,
) -> Result<bool, String> {
    let date = capture_date(&capture.captured_at)
        .ok_or_else(|| format!("invalid capture timestamp {}", capture.captured_at))?;
    let captures_by_id = entries_by_day.entry(date).or_default();

    match captures_by_id.get_mut(&capture.id) {
        Some(existing) => Ok(merge_capture_preview(existing, &capture)),
        None => {
            captures_by_id.insert(capture.id.clone(), capture);
            Ok(true)
        }
    }
}

fn merge_capture_preview(existing: &mut CapturePreview, incoming: &CapturePreview) -> bool {
    let mut changed = false;

    if existing.source.is_empty() && !incoming.source.is_empty() {
        existing.source = incoming.source.clone();
        changed = true;
    }

    if existing.source_app_name.is_none() && incoming.source_app_name.is_some() {
        existing.source_app_name = incoming.source_app_name.clone();
        changed = true;
    }

    if existing.source_app_bundle_id.is_none() && incoming.source_app_bundle_id.is_some() {
        existing.source_app_bundle_id = incoming.source_app_bundle_id.clone();
        changed = true;
    }

    if existing.source_app_icon_path.is_none() && incoming.source_app_icon_path.is_some() {
        existing.source_app_icon_path = incoming.source_app_icon_path.clone();
        changed = true;
    }

    if existing.content_kind.is_empty() && !incoming.content_kind.is_empty() {
        existing.content_kind = incoming.content_kind.clone();
        changed = true;
    }

    if existing.preview.is_empty() && !incoming.preview.is_empty() {
        existing.preview = incoming.preview.clone();
        changed = true;
    }

    if existing.secondary_preview.is_none() && incoming.secondary_preview.is_some() {
        existing.secondary_preview = incoming.secondary_preview.clone();
        changed = true;
    }

    if existing.status.is_empty() && !incoming.status.is_empty() {
        existing.status = incoming.status.clone();
        changed = true;
    }

    if existing.raw_text.is_empty() && !incoming.raw_text.is_empty() {
        existing.raw_text = incoming.raw_text.clone();
        changed = true;
    }

    if existing.ocr_text != incoming.ocr_text && incoming.ocr_text.is_some() {
        existing.ocr_text = incoming.ocr_text.clone();
        changed = true;
    }

    if existing.file_missing != incoming.file_missing {
        existing.file_missing = incoming.file_missing;
        changed = true;
    }

    if existing.raw_rich.is_none() && incoming.raw_rich.is_some() {
        existing.raw_rich = incoming.raw_rich.clone();
        changed = true;
    }

    if existing.raw_rich_format.is_none() && incoming.raw_rich_format.is_some() {
        existing.raw_rich_format = incoming.raw_rich_format.clone();
        changed = true;
    }

    if existing.link_url.is_none() && incoming.link_url.is_some() {
        existing.link_url = incoming.link_url.clone();
        changed = true;
    }

    if existing.asset_path.is_none() && incoming.asset_path.is_some() {
        existing.asset_path = incoming.asset_path.clone();
        changed = true;
    }

    if existing.thumbnail_path.is_none() && incoming.thumbnail_path.is_some() {
        existing.thumbnail_path = incoming.thumbnail_path.clone();
        changed = true;
    }

    if existing.image_width.is_none() && incoming.image_width.is_some() {
        existing.image_width = incoming.image_width;
        changed = true;
    }

    if existing.image_height.is_none() && incoming.image_height.is_some() {
        existing.image_height = incoming.image_height;
        changed = true;
    }

    if existing.byte_size.is_none() && incoming.byte_size.is_some() {
        existing.byte_size = incoming.byte_size;
        changed = true;
    }

    changed
}

fn capture_date(captured_at: &str) -> Option<NaiveDate> {
    parse_captured_at(captured_at)
        .ok()
        .map(|value| value.date_naive())
}

fn path_date(path: &Path) -> Option<NaiveDate> {
    let stem = path.file_stem()?.to_str()?;
    NaiveDate::parse_from_str(stem, "%Y-%m-%d").ok()
}

fn clipboard_history_paths_desc(
    clipboard_cache_root: &Path,
    history_days: u16,
) -> Result<Vec<PathBuf>, String> {
    let dir = clipboard_history_dir_path(clipboard_cache_root);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let cutoff = retention_prune_start_date(history_days);
    let mut paths = Vec::new();

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
            continue;
        }

        let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(date) = NaiveDate::parse_from_str(name, "%Y-%m-%d") else {
            continue;
        };

        if date >= cutoff {
            paths.push((date, path));
        }
    }

    paths.sort_by(|left, right| right.0.cmp(&left.0));
    Ok(paths.into_iter().map(|(_, path)| path).collect())
}

fn clipboard_history_dir_path(clipboard_cache_root: &Path) -> PathBuf {
    clipboard_cache_root.join(CLIPBOARD_HISTORY_DIR_NAME)
}

fn clipboard_history_file_path(
    clipboard_cache_root: &Path,
    captured_at: &str,
) -> Result<PathBuf, String> {
    let captured_at = parse_captured_at(captured_at)?;
    let date = captured_at.format("%Y-%m-%d").to_string();
    Ok(clipboard_history_dir_path(clipboard_cache_root).join(format!("{date}.jsonl")))
}

fn retention_cutoff_timestamp(history_days: u16) -> DateTime<FixedOffset> {
    let keep_days = history_days.max(1) as i64;
    Local::now().fixed_offset() - Duration::days(keep_days)
}

fn retention_prune_start_date(history_days: u16) -> NaiveDate {
    retention_cutoff_timestamp(history_days).date_naive() - Duration::days(1)
}

fn is_capture_within_retention_window(captured_at: &str, cutoff: &DateTime<FixedOffset>) -> bool {
    parse_captured_at(captured_at)
        .map(|captured_at| captured_at >= *cutoff)
        .unwrap_or(false)
}

fn parse_captured_at(captured_at: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(captured_at).map_err(|error| error.to_string())
}
