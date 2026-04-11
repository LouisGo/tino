use chrono::{DateTime, Duration, FixedOffset, Local};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, fs, path::Path};
use uuid::Uuid;

use crate::backend::clipboard_history::legacy::enforce_clipboard_retention;
use crate::backend::clipboard_history::write::{
    persist_capture_preview, promote_capture_reuse_with_fallback,
};
use crate::clipboard::preview::{build_capture_preview, should_persist_capture_history};
use crate::clipboard::{
    preview::hydrate_capture_preview_assets,
    types::{CapturePreview, CaptureRecord},
};
use crate::storage::capture_history_store::CaptureHistoryUpsert;
use crate::storage::knowledge_root::{
    batch_file_path, batches_dir_path, ensure_knowledge_root_layout, queue_file_path,
    runtime_file_path,
};

use super::{
    settings::clipboard_history_storage_retention_days, write_json_file, AppState,
    BatchPromotionSummary, BATCH_TRIGGER_MAX_WAIT_MINUTES, BATCH_TRIGGER_SIZE,
    DEDUP_WINDOW_MINUTES, RUNNING_WATCH_STATUS, STARTING_WATCH_STATUS,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct RuntimeState {
    pub(super) watch_status: String,
    pub(super) last_error: Option<String>,
    pub(super) last_archive_path: Option<String>,
    pub(super) last_filter_reason: Option<String>,
    pub(super) last_batch_path: Option<String>,
    pub(super) last_batch_reason: Option<String>,
    pub(super) queue_depth: usize,
    pub(super) ready_batch_count: usize,
    pub(super) updated_at: String,
    pub(super) recent_hashes: VecDeque<RecentHashEntry>,
    pub(super) recent_captures: VecDeque<crate::clipboard::types::CapturePreview>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            watch_status: super::STARTING_WATCH_STATUS.into(),
            last_error: None,
            last_archive_path: None,
            last_filter_reason: None,
            last_batch_path: None,
            last_batch_reason: None,
            queue_depth: 0,
            ready_batch_count: 0,
            updated_at: super::now_rfc3339(),
            recent_hashes: VecDeque::new(),
            recent_captures: VecDeque::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct QueueState {
    pub(super) updated_at: String,
    pub(super) pending: VecDeque<CaptureRecord>,
}

impl Default for QueueState {
    fn default() -> Self {
        Self {
            updated_at: super::now_rfc3339(),
            pending: VecDeque::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum BatchTriggerReason {
    CaptureCount,
    MaxWait,
}

impl BatchTriggerReason {
    pub(super) fn as_label(&self) -> &'static str {
        match self {
            Self::CaptureCount => "capture_count",
            Self::MaxWait => "max_wait",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct BatchFile {
    pub(super) id: String,
    pub(super) status: String,
    pub(super) created_at: String,
    pub(super) trigger_reason: BatchTriggerReason,
    pub(super) capture_count: usize,
    pub(super) first_captured_at: String,
    pub(super) last_captured_at: String,
    pub(super) source_ids: Vec<String>,
    pub(super) captures: Vec<CaptureRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RecentHashEntry {
    pub(super) hash: String,
    pub(super) captured_at: String,
    #[serde(default)]
    pub(super) capture_id: Option<String>,
}

#[derive(Debug)]
pub(super) enum CaptureHashDisposition {
    Fresh,
    Duplicate,
    Reused(RecentHashEntry),
}

pub(super) fn load_runtime_state(knowledge_root: &Path) -> Result<RuntimeState, String> {
    let runtime_path = runtime_file_path(knowledge_root);

    if !runtime_path.exists() {
        return Ok(RuntimeState::default());
    }

    let bytes = fs::read(runtime_path).map_err(|error| error.to_string())?;
    serde_json::from_slice::<RuntimeState>(&bytes).map_err(|error| error.to_string())
}

pub(super) fn load_queue_state(knowledge_root: &Path) -> Result<QueueState, String> {
    let queue_path = queue_file_path(knowledge_root);

    if !queue_path.exists() {
        return Ok(QueueState::default());
    }

    let bytes = fs::read(queue_path).map_err(|error| error.to_string())?;
    serde_json::from_slice::<QueueState>(&bytes).map_err(|error| error.to_string())
}

pub(super) fn ensure_queue_state(knowledge_root: &Path) -> Result<QueueState, String> {
    let queue_state = load_queue_state(knowledge_root)?;
    persist_queue_state(knowledge_root, &queue_state)?;
    Ok(queue_state)
}

pub(super) fn persist_queue_state(
    knowledge_root: &Path,
    queue_state: &QueueState,
) -> Result<(), String> {
    let queue_path = queue_file_path(knowledge_root);
    write_json_file(&queue_path, queue_state)
}

pub(super) fn enqueue_capture(
    knowledge_root: &Path,
    capture: &CaptureRecord,
) -> Result<usize, String> {
    let mut queue_state = load_queue_state(knowledge_root)?;
    queue_state.pending.push_back(capture.clone());
    queue_state.updated_at = super::now_rfc3339();
    let queue_depth = queue_state.pending.len();
    persist_queue_state(knowledge_root, &queue_state)?;
    Ok(queue_depth)
}

pub(super) fn queue_depth_for_root(knowledge_root: &Path) -> Result<usize, String> {
    Ok(load_queue_state(knowledge_root)?.pending.len())
}

pub(super) fn resolve_batch_trigger(
    pending: &VecDeque<CaptureRecord>,
) -> Result<Option<BatchTriggerReason>, String> {
    if pending.len() >= BATCH_TRIGGER_SIZE {
        return Ok(Some(BatchTriggerReason::CaptureCount));
    }

    let Some(oldest) = pending.front() else {
        return Ok(None);
    };

    let oldest_captured_at = parse_captured_at(&oldest.captured_at)?;
    let age = Local::now()
        .fixed_offset()
        .signed_duration_since(oldest_captured_at);

    if age >= Duration::minutes(BATCH_TRIGGER_MAX_WAIT_MINUTES) {
        return Ok(Some(BatchTriggerReason::MaxWait));
    }

    Ok(None)
}

pub(super) fn build_batch_file(
    captures: Vec<CaptureRecord>,
    trigger_reason: BatchTriggerReason,
) -> Result<BatchFile, String> {
    let first_capture = captures
        .first()
        .ok_or_else(|| "cannot build batch from empty capture set".to_string())?;
    let last_capture = captures
        .last()
        .ok_or_else(|| "cannot build batch from empty capture set".to_string())?;
    let created_at = super::now_rfc3339();

    Ok(BatchFile {
        id: format!("batch_{}", Uuid::now_v7().simple()),
        status: "pending_ai".into(),
        created_at,
        trigger_reason,
        capture_count: captures.len(),
        first_captured_at: first_capture.captured_at.clone(),
        last_captured_at: last_capture.captured_at.clone(),
        source_ids: captures.iter().map(|capture| capture.id.clone()).collect(),
        captures,
    })
}

pub(super) fn count_ready_batches(knowledge_root: &Path) -> Result<usize, String> {
    let batches_dir = batches_dir_path(knowledge_root);
    if !batches_dir.exists() {
        return Ok(0);
    }

    let entries = fs::read_dir(batches_dir).map_err(|error| error.to_string())?;
    let mut count = 0;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let batch =
            serde_json::from_slice::<BatchFile>(&bytes).map_err(|error| error.to_string())?;
        if matches!(batch.status.trim(), "pending_ai" | "ready") {
            count += 1;
        }
    }

    Ok(count)
}

pub(super) fn parse_captured_at(captured_at: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(captured_at).map_err(|error| error.to_string())
}

pub(super) fn hydrate_runtime_preview_assets(
    knowledge_root: &Path,
    runtime: &mut RuntimeState,
) -> Result<(), String> {
    for capture in &mut runtime.recent_captures {
        hydrate_capture_preview_assets(knowledge_root, capture)?;
    }

    Ok(())
}

pub(super) fn prune_recent_hashes(
    recent_hashes: &mut VecDeque<RecentHashEntry>,
    captured_at: &DateTime<FixedOffset>,
) {
    recent_hashes.retain(|entry| {
        parse_captured_at(&entry.captured_at)
            .map(|recorded_at| {
                let age = captured_at.signed_duration_since(recorded_at);
                age >= Duration::zero() && age < Duration::minutes(DEDUP_WINDOW_MINUTES)
            })
            .unwrap_or(false)
    });
}

pub(super) fn consume_matching_hash(
    recent_hashes: &mut VecDeque<RecentHashEntry>,
    hash: &str,
) -> Option<RecentHashEntry> {
    let Some(index) = recent_hashes.iter().position(|entry| entry.hash == hash) else {
        return None;
    };

    recent_hashes.remove(index)
}

pub(super) fn build_capture_history_upsert(
    capture: &CaptureRecord,
    preview: &CapturePreview,
) -> CaptureHistoryUpsert {
    CaptureHistoryUpsert {
        id: preview.id.clone(),
        captured_at: preview.captured_at.clone(),
        source: preview.source.clone(),
        source_app_name: preview.source_app_name.clone(),
        source_app_bundle_id: preview.source_app_bundle_id.clone(),
        source_app_icon_path: preview.source_app_icon_path.clone(),
        content_kind: preview.content_kind.clone(),
        preview: preview.preview.clone(),
        secondary_preview: preview.secondary_preview.clone(),
        status: preview.status.clone(),
        raw_text: preview.raw_text.clone(),
        ocr_text: preview.ocr_text.clone(),
        raw_rich: preview.raw_rich.clone(),
        raw_rich_format: preview.raw_rich_format.clone(),
        link_url: preview.link_url.clone(),
        asset_path: preview.asset_path.clone(),
        thumbnail_path: preview.thumbnail_path.clone(),
        image_width: preview.image_width,
        image_height: preview.image_height,
        byte_size: preview.byte_size,
        hash: Some(capture.hash.clone()),
    }
}

impl AppState {
    pub fn run_periodic_maintenance(&self) -> Result<(), String> {
        let settings = self.current_settings()?;
        let previous_runtime = self.lock_state()?.runtime.clone();

        enforce_clipboard_retention(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
        )?;

        let knowledge_root = settings.knowledge_root_path();
        let queue_depth = queue_depth_for_root(&knowledge_root)?;
        let ready_batch_count = count_ready_batches(&knowledge_root)?;
        let maintenance_changed = previous_runtime.queue_depth != queue_depth
            || previous_runtime.ready_batch_count != ready_batch_count;

        self.update_runtime_batch_metrics(queue_depth, ready_batch_count, None, None)?;

        if maintenance_changed {
            self.emit_clipboard_updated();
        }

        Ok(())
    }

    pub fn promote_ready_batches(&self) -> Result<Vec<BatchPromotionSummary>, String> {
        let settings = self.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        ensure_knowledge_root_layout(&knowledge_root)?;

        let mut queue_state = ensure_queue_state(&knowledge_root)?;
        let ready_batch_count_before = count_ready_batches(&knowledge_root)?;

        if !settings.ai_enabled() {
            self.update_runtime_batch_metrics(
                queue_state.pending.len(),
                ready_batch_count_before,
                None,
                None,
            )?;
            return Ok(Vec::new());
        }

        let mut created_batches = Vec::new();

        while let Some(trigger_reason) = resolve_batch_trigger(&queue_state.pending)? {
            let take_count = match trigger_reason {
                BatchTriggerReason::CaptureCount => BATCH_TRIGGER_SIZE,
                BatchTriggerReason::MaxWait => queue_state.pending.len(),
            };

            let captures = queue_state
                .pending
                .drain(..take_count)
                .collect::<Vec<CaptureRecord>>();
            let batch_file = build_batch_file(captures, trigger_reason.clone())?;
            let batch_path = batch_file_path(&knowledge_root, &batch_file.id);
            write_json_file(&batch_path, &batch_file)?;

            created_batches.push(BatchPromotionSummary {
                id: batch_file.id.clone(),
                path: batch_path,
                trigger_reason: trigger_reason.as_label().into(),
                capture_count: batch_file.capture_count,
            });
        }

        if !created_batches.is_empty() {
            queue_state.updated_at = super::now_rfc3339();
            persist_queue_state(&knowledge_root, &queue_state)?;
        }

        let ready_batch_count_after = count_ready_batches(&knowledge_root)?;
        let latest_batch = created_batches.last().cloned();
        self.update_runtime_batch_metrics(
            queue_state.pending.len(),
            ready_batch_count_after,
            latest_batch
                .as_ref()
                .map(|batch| batch.path.display().to_string()),
            latest_batch.map(|batch| batch.trigger_reason),
        )?;

        Ok(created_batches)
    }

    pub fn register_replay_hash(
        &self,
        hash: String,
        captured_at: String,
        capture_id: Option<String>,
    ) -> Result<(), String> {
        let replay_timestamp = parse_captured_at(&captured_at)?;

        {
            let mut state = self.lock_state()?;
            prune_recent_hashes(&mut state.pending_replay_hashes, &replay_timestamp);
            state.pending_replay_hashes.push_front(RecentHashEntry {
                hash,
                captured_at,
                capture_id: capture_id
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
            });
        }

        Ok(())
    }

    pub fn set_watch_running(&self) -> Result<(), String> {
        {
            let mut state = self.lock_state()?;
            state.runtime.watch_status = RUNNING_WATCH_STATUS.into();
            state.runtime.last_error = None;
            state.runtime.updated_at = super::now_rfc3339();
        }

        self.persist_runtime_snapshot()?;
        self.emit_clipboard_updated();
        Ok(())
    }

    pub fn set_watch_error(&self, error: impl Into<String>) -> Result<(), String> {
        let error = error.into();

        {
            let mut state = self.lock_state()?;
            state.runtime.watch_status = "Rust clipboard poller retrying".into();
            state.runtime.last_error = Some(error);
            state.runtime.updated_at = super::now_rfc3339();
        }

        self.persist_runtime_snapshot()?;
        self.emit_clipboard_updated();
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    pub fn set_watch_unsupported(&self) -> Result<(), String> {
        {
            let mut state = self.lock_state()?;
            state.runtime.watch_status = "Clipboard watcher is only implemented on macOS".into();
            state.runtime.last_error = None;
            state.runtime.updated_at = super::now_rfc3339();
        }

        self.persist_runtime_snapshot()
    }

    pub(super) fn resolve_capture_hash_disposition(
        &self,
        hash: &str,
        captured_at: &DateTime<FixedOffset>,
    ) -> Result<CaptureHashDisposition, String> {
        let mut state = self.lock_state()?;
        prune_recent_hashes(&mut state.runtime.recent_hashes, captured_at);
        prune_recent_hashes(&mut state.pending_replay_hashes, captured_at);

        if let Some(replay_entry) = consume_matching_hash(&mut state.pending_replay_hashes, hash) {
            return Ok(CaptureHashDisposition::Reused(replay_entry));
        }

        Ok(
            if state
                .runtime
                .recent_hashes
                .iter()
                .any(|entry| entry.hash == hash)
            {
                CaptureHashDisposition::Duplicate
            } else {
                CaptureHashDisposition::Fresh
            },
        )
    }

    pub(super) fn record_capture_reuse(
        &self,
        capture: &CaptureRecord,
        replay_entry: &RecentHashEntry,
        captured_at: &DateTime<FixedOffset>,
    ) -> Result<bool, String> {
        let Some(capture_id) = replay_entry
            .capture_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            return Ok(false);
        };

        let settings = self.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        let promoted = promote_capture_reuse_with_fallback(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
            capture_id,
            &capture.hash,
            &capture.captured_at,
        )?;
        if !promoted {
            return Ok(false);
        }

        let queue_depth = queue_depth_for_root(&knowledge_root)?;

        {
            let mut state = self.lock_state()?;
            prune_recent_hashes(&mut state.runtime.recent_hashes, captured_at);
            state.runtime.recent_hashes.push_front(RecentHashEntry {
                hash: capture.hash.clone(),
                captured_at: capture.captured_at.clone(),
                capture_id: Some(capture_id.to_string()),
            });
            state.runtime.watch_status = RUNNING_WATCH_STATUS.into();
            state.runtime.last_error = None;
            state.runtime.last_archive_path = None;
            state.runtime.last_filter_reason = None;
            state.runtime.queue_depth = queue_depth;
            state.runtime.updated_at = super::now_rfc3339();
            state.runtime.recent_captures.clear();
        }

        self.persist_runtime_snapshot()?;
        self.emit_clipboard_updated();
        Ok(true)
    }

    pub(super) fn record_capture_outcome(
        &self,
        capture: &CaptureRecord,
        status: &str,
        archive_path: Option<String>,
        filter_reason: Option<String>,
        accepted_hash: Option<RecentHashEntry>,
        queue_depth: usize,
        captured_at: &DateTime<FixedOffset>,
    ) -> Result<(), String> {
        let (preview, history_upsert) = {
            let mut state = self.lock_state()?;
            prune_recent_hashes(&mut state.runtime.recent_hashes, captured_at);

            if let Some(accepted_hash) = accepted_hash {
                state.runtime.recent_hashes.push_front(accepted_hash);
            }

            state.runtime.watch_status = RUNNING_WATCH_STATUS.into();
            state.runtime.last_error = None;
            state.runtime.last_archive_path = archive_path;
            state.runtime.last_filter_reason = filter_reason;
            state.runtime.queue_depth = queue_depth;
            state.runtime.updated_at = super::now_rfc3339();
            state.runtime.recent_captures.clear();
            let preview = build_capture_preview(capture, status);
            let history_upsert = build_capture_history_upsert(capture, &preview);
            (preview, history_upsert)
        };

        if should_persist_capture_history(status) {
            persist_capture_preview(
                &self.shared.clipboard_cache_dir,
                clipboard_history_storage_retention_days(),
                &preview,
                &history_upsert,
            )?;
        }
        self.persist_runtime_snapshot()?;
        self.emit_clipboard_updated();
        Ok(())
    }

    pub(super) fn update_runtime_batch_metrics(
        &self,
        queue_depth: usize,
        ready_batch_count: usize,
        last_batch_path: Option<String>,
        last_batch_reason: Option<String>,
    ) -> Result<(), String> {
        {
            let mut state = self.lock_state()?;
            state.runtime.queue_depth = queue_depth;
            state.runtime.ready_batch_count = ready_batch_count;
            if let Some(last_batch_path) = last_batch_path {
                state.runtime.last_batch_path = Some(last_batch_path);
            }
            if let Some(last_batch_reason) = last_batch_reason {
                state.runtime.last_batch_reason = Some(last_batch_reason);
            }
            state.runtime.updated_at = super::now_rfc3339();
        }

        self.persist_runtime_snapshot()
    }

    pub(super) fn current_watch_status(&self) -> String {
        self.lock_state()
            .map(|state| state.runtime.watch_status.clone())
            .unwrap_or_else(|_| STARTING_WATCH_STATUS.into())
    }

    pub(super) fn current_last_error(&self) -> Option<String> {
        self.lock_state()
            .ok()
            .and_then(|state| state.runtime.last_error.clone())
    }

    pub(super) fn persist_runtime_snapshot(&self) -> Result<(), String> {
        let (knowledge_root, runtime) = {
            let state = self.lock_state()?;
            (state.settings.knowledge_root_path(), state.runtime.clone())
        };

        ensure_knowledge_root_layout(&knowledge_root)?;
        let runtime_path = runtime_file_path(&knowledge_root);
        write_json_file(&runtime_path, &runtime)
    }
}
