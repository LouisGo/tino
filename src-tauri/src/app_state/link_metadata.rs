use super::{settings::clipboard_history_storage_retention_days, AppState};

use crate::backend::clipboard_history::write::update_capture_link_metadata_with_fallback;
use crate::clipboard::{
    link_metadata::fetch_link_metadata,
    preview::{build_link_display_with_metadata, build_link_secondary_preview},
    types::LinkMetadata,
};
use crate::ipc_events::ClipboardCapturesUpdated;

use super::{LinkMetadataRuntime, LINK_METADATA_BACKFILL_BATCH_SIZE};
use crate::app_idle::TaskPriority;
use crate::backend::clipboard_history::pins::{
    load_pinned_clipboard_state, persist_pinned_clipboard_state,
};
use crate::storage::capture_history_store::{CaptureHistoryQuery, CaptureHistoryStore};
use log::{info, warn};
use std::{
    collections::HashSet,
    panic::AssertUnwindSafe,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Instant,
};

impl AppState {
    pub(super) fn create_link_metadata_runtime() -> LinkMetadataRuntime {
        LinkMetadataRuntime {
            queued_capture_ids: Mutex::new(HashSet::new()),
            backfill_queued: AtomicBool::new(false),
        }
    }

    fn process_link_metadata_job(&self, capture_id: String, link_url: String) {
        let started_at = Instant::now();
        let metadata = fetch_link_metadata(&link_url, &self.shared.clipboard_cache_dir);

        if let Err(error) = self.store_capture_link_metadata(&capture_id, &link_url, &metadata) {
            warn!("failed to persist link metadata for capture {capture_id}: {error}");
        } else {
            info!(
                "finished link metadata fetch for capture {} in {} ms with status {}",
                capture_id,
                started_at.elapsed().as_millis(),
                metadata.fetch_status.as_storage_label()
            );
        }

        self.release_link_metadata_capture(&capture_id);
    }

    fn process_link_metadata_backfill(&self) {
        let started_at = Instant::now();
        let candidates = match self
            .pending_link_metadata_backfill_candidates(LINK_METADATA_BACKFILL_BATCH_SIZE)
        {
            Ok(candidates) => candidates,
            Err(error) => {
                warn!("failed to load link metadata backfill candidates: {error}");
                self.clear_link_metadata_backfill_flag();
                return;
            }
        };

        let candidate_count = candidates.len();
        let should_schedule_next_batch = candidates.len() >= LINK_METADATA_BACKFILL_BATCH_SIZE;
        self.clear_link_metadata_backfill_flag();

        for (capture_id, link_url) in candidates {
            self.schedule_link_metadata_capture(&capture_id, &link_url, TaskPriority::Idle);
        }

        info!(
            "queued link metadata backfill scan with {} capture(s) in {} ms",
            candidate_count,
            started_at.elapsed().as_millis()
        );

        if should_schedule_next_batch {
            self.request_link_metadata_backfill();
        }
    }

    fn release_link_metadata_capture(&self, capture_id: &str) {
        if let Ok(mut queued_capture_ids) = self.shared.link_metadata.queued_capture_ids.lock() {
            queued_capture_ids.remove(capture_id);
        }
    }

    fn clear_link_metadata_backfill_flag(&self) {
        self.shared
            .link_metadata
            .backfill_queued
            .store(false, Ordering::Release);
    }

    pub(super) fn request_link_metadata_backfill(&self) {
        if self
            .shared
            .link_metadata
            .backfill_queued
            .swap(true, Ordering::AcqRel)
        {
            return;
        }

        let state = self.clone();
        if let Err(error) = self
            .shared
            .task_scheduler
            .schedule(TaskPriority::Idle, move || {
                state.process_link_metadata_backfill();
            })
        {
            self.clear_link_metadata_backfill_flag();
            warn!("failed to schedule link metadata backfill: {error}");
        }
    }

    fn schedule_link_metadata_capture(
        &self,
        capture_id: &str,
        link_url: &str,
        priority: TaskPriority,
    ) {
        let normalized_capture_id = capture_id.trim();
        let normalized_link_url = link_url.trim();
        if normalized_capture_id.is_empty() || normalized_link_url.is_empty() {
            return;
        }

        let mut queued_capture_ids = match self.shared.link_metadata.queued_capture_ids.lock() {
            Ok(queued_capture_ids) => queued_capture_ids,
            Err(_) => {
                warn!(
                    "failed to enqueue link metadata for capture {normalized_capture_id}: queue lock poisoned"
                );
                return;
            }
        };

        if !queued_capture_ids.insert(normalized_capture_id.to_string()) {
            return;
        }
        drop(queued_capture_ids);

        let scheduled_capture_id = normalized_capture_id.to_string();
        let cleanup_capture_id = scheduled_capture_id.clone();
        let scheduled_link_url = normalized_link_url.to_string();
        let state = self.clone();
        if let Err(error) = self.shared.task_scheduler.schedule(priority, move || {
            let started_at = Instant::now();
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
                state.process_link_metadata_job(scheduled_capture_id, scheduled_link_url);
            }));
            if let Err(payload) = result {
                state.release_link_metadata_capture(&cleanup_capture_id);
                warn!(
                    "link metadata task panicked for capture {} after {} ms: {}",
                    cleanup_capture_id,
                    started_at.elapsed().as_millis(),
                    super::panic_payload_message(&payload)
                );
            }
        }) {
            if let Ok(mut queued_capture_ids) = self.shared.link_metadata.queued_capture_ids.lock()
            {
                queued_capture_ids.remove(normalized_capture_id);
            }
            warn!(
                "failed to schedule link metadata fetch for capture {normalized_capture_id}: {error}"
            );
        }
    }

    pub(super) fn spawn_link_metadata_for_capture(&self, capture_id: &str, link_url: Option<&str>) {
        let normalized_capture_id = capture_id.trim();
        let normalized_link_url = link_url.unwrap_or("").trim();
        if normalized_capture_id.is_empty() || normalized_link_url.is_empty() {
            return;
        }

        self.schedule_link_metadata_capture(
            normalized_capture_id,
            normalized_link_url,
            TaskPriority::Background,
        );
    }

    fn pending_link_metadata_backfill_candidates(
        &self,
        limit: usize,
    ) -> Result<Vec<(String, String)>, String> {
        let store = CaptureHistoryStore::new(&self.shared.clipboard_cache_dir)?;
        let page = store.query_page(&CaptureHistoryQuery {
            history_days: clipboard_history_storage_retention_days(),
            excluded_capture_ids: Vec::new(),
            search: String::new(),
            filter: "link".into(),
            page: 0,
            page_size: limit.clamp(1, 100),
        })?;

        Ok(page
            .captures
            .into_iter()
            .filter(|capture| {
                let fetched_at = capture
                    .link_metadata_fetched_at
                    .as_deref()
                    .unwrap_or("")
                    .trim();
                let fetch_status = capture
                    .link_metadata_fetch_status
                    .as_deref()
                    .unwrap_or("")
                    .trim();
                let icon_path = capture.link_icon_path.as_deref().unwrap_or("").trim();

                fetched_at.is_empty()
                    || (icon_path.is_empty() && !matches!(fetch_status, "skipped"))
            })
            .filter_map(|capture| {
                let link_url = capture.link_url?;
                let normalized_link_url = link_url.trim().to_string();
                if normalized_link_url.is_empty() {
                    return None;
                }

                Some((capture.id, normalized_link_url))
            })
            .collect())
    }

    fn store_capture_link_metadata(
        &self,
        capture_id: &str,
        link_url: &str,
        link_metadata: &LinkMetadata,
    ) -> Result<bool, String> {
        let normalized_capture_id = capture_id.trim();
        let normalized_link_url = link_url.trim();
        if normalized_capture_id.is_empty() || normalized_link_url.is_empty() {
            return Ok(false);
        }

        let preview = build_link_display_with_metadata(normalized_link_url, Some(link_metadata));
        let secondary_preview = build_link_secondary_preview(
            normalized_link_url,
            normalized_link_url,
            Some(link_metadata),
        );

        let history_changed = update_capture_link_metadata_with_fallback(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
            normalized_capture_id,
            &preview,
            Some(secondary_preview.as_str()),
            link_metadata,
        )?;
        let pinned_changed = self.update_pinned_capture_link_metadata(
            normalized_capture_id,
            normalized_link_url,
            link_metadata,
        )?;

        if history_changed || pinned_changed {
            self.emit_clipboard_updated(ClipboardCapturesUpdated::link_metadata_updated(
                pinned_changed,
            ));
        }

        Ok(history_changed || pinned_changed)
    }

    fn update_pinned_capture_link_metadata(
        &self,
        capture_id: &str,
        link_url: &str,
        link_metadata: &LinkMetadata,
    ) -> Result<bool, String> {
        let mut state = load_pinned_clipboard_state(&self.shared.clipboard_cache_dir)?;
        let Some(pinned_capture) = state
            .captures
            .iter_mut()
            .find(|entry| entry.capture.id == capture_id)
        else {
            return Ok(false);
        };

        let next_preview = build_link_display_with_metadata(link_url, Some(link_metadata));
        let next_secondary_preview =
            build_link_secondary_preview(link_url, link_url, Some(link_metadata));

        if pinned_capture.capture.link_metadata.as_ref() == Some(link_metadata)
            && pinned_capture.capture.preview == next_preview
            && pinned_capture.capture.secondary_preview.as_deref()
                == Some(next_secondary_preview.as_str())
        {
            return Ok(false);
        }

        pinned_capture.capture.link_metadata = Some(link_metadata.clone());
        pinned_capture.capture.preview = next_preview;
        pinned_capture.capture.secondary_preview = Some(next_secondary_preview);
        persist_pinned_clipboard_state(&self.shared.clipboard_cache_dir, &state)?;
        Ok(true)
    }
}
