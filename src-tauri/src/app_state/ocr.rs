use super::{settings::clipboard_history_storage_retention_days, AppState};
use std::path::PathBuf;

use crate::backend::clipboard_history::write::update_capture_ocr_text_with_fallback;
use crate::clipboard::preview::normalize_ocr_text;
use crate::ipc_events::ClipboardCapturesUpdated;

#[cfg(target_os = "macos")]
use super::{
    panic_payload_message, ImageOcrRuntime, IMAGE_OCR_BACKFILL_BATCH_SIZE, IMAGE_OCR_MAX_ATTEMPTS,
    IMAGE_OCR_RETRY_DELAY_MS,
};
#[cfg(target_os = "macos")]
use crate::app_idle::TaskPriority;
#[cfg(target_os = "macos")]
use crate::clipboard::preview::summarize_ocr_log_text;
#[cfg(target_os = "macos")]
use crate::storage::capture_history_store::{CaptureHistoryQuery, CaptureHistoryStore};
#[cfg(target_os = "macos")]
use crate::vision_ocr::recognize_text_from_image_path;
#[cfg(target_os = "macos")]
use log::{info, warn};
#[cfg(target_os = "macos")]
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
    #[cfg(target_os = "macos")]
    pub(super) fn create_image_ocr_runtime() -> ImageOcrRuntime {
        ImageOcrRuntime {
            queued_capture_ids: Mutex::new(HashSet::new()),
            backfill_queued: AtomicBool::new(false),
        }
    }

    #[cfg(target_os = "macos")]
    fn process_image_ocr_job(&self, capture_id: String, asset_path: PathBuf) {
        let started_at = Instant::now();
        info!(
            "starting OCR for capture {} from {}",
            capture_id,
            asset_path.display()
        );

        for attempt in 1..=IMAGE_OCR_MAX_ATTEMPTS {
            match recognize_text_from_image_path(&asset_path) {
                Ok(Some(ocr_text)) => {
                    if let Err(error) = self.store_capture_ocr_text(&capture_id, &ocr_text) {
                        warn!("failed to persist OCR text for capture {capture_id}: {error}");
                    } else {
                        let summary = summarize_ocr_log_text(&ocr_text);
                        info!(
                            "OCR recognized text for capture {} in {} ms on attempt {}: {}",
                            capture_id,
                            started_at.elapsed().as_millis(),
                            attempt,
                            summary
                        );
                    }
                    self.release_image_ocr_capture(&capture_id);
                    return;
                }
                Ok(None) => {
                    info!(
                        "OCR found no text for capture {} in {} ms on attempt {}",
                        capture_id,
                        started_at.elapsed().as_millis(),
                        attempt
                    );
                    self.release_image_ocr_capture(&capture_id);
                    return;
                }
                Err(error) if attempt < IMAGE_OCR_MAX_ATTEMPTS => {
                    warn!(
                        "OCR attempt {} failed for capture {} after {} ms: {}; retrying once",
                        attempt,
                        capture_id,
                        started_at.elapsed().as_millis(),
                        error
                    );
                    std::thread::sleep(std::time::Duration::from_millis(IMAGE_OCR_RETRY_DELAY_MS));
                }
                Err(error) => {
                    warn!(
                        "OCR failed for capture {} after {} ms across {} attempt(s): {}",
                        capture_id,
                        started_at.elapsed().as_millis(),
                        attempt,
                        error
                    );
                    self.release_image_ocr_capture(&capture_id);
                    return;
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    fn process_image_ocr_backfill(&self) {
        let started_at = Instant::now();
        let candidates =
            match self.pending_image_ocr_backfill_candidates(IMAGE_OCR_BACKFILL_BATCH_SIZE) {
                Ok(candidates) => candidates,
                Err(error) => {
                    warn!("failed to load image OCR backfill candidates: {error}");
                    self.clear_image_ocr_backfill_flag();
                    return;
                }
            };

        info!(
            "queued OCR backfill scan with {} pending image capture(s)",
            candidates.len()
        );

        let should_schedule_next_batch = candidates.len() >= IMAGE_OCR_BACKFILL_BATCH_SIZE;
        self.clear_image_ocr_backfill_flag();

        for (capture_id, asset_path) in candidates {
            self.schedule_image_ocr_capture(&capture_id, asset_path, TaskPriority::Idle);
        }

        info!(
            "finished OCR backfill scan in {} ms",
            started_at.elapsed().as_millis()
        );

        if should_schedule_next_batch {
            self.request_image_ocr_backfill();
        }
    }

    #[cfg(target_os = "macos")]
    fn release_image_ocr_capture(&self, capture_id: &str) {
        if let Ok(mut queued_capture_ids) = self.shared.image_ocr.queued_capture_ids.lock() {
            queued_capture_ids.remove(capture_id);
        }
    }

    #[cfg(target_os = "macos")]
    fn clear_image_ocr_backfill_flag(&self) {
        self.shared
            .image_ocr
            .backfill_queued
            .store(false, Ordering::Release);
    }

    #[cfg(target_os = "macos")]
    pub(super) fn request_image_ocr_backfill(&self) {
        if self
            .shared
            .image_ocr
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
                state.process_image_ocr_backfill();
            })
        {
            self.clear_image_ocr_backfill_flag();
            warn!("failed to schedule image OCR backfill: {error}");
        }
    }

    #[cfg(target_os = "macos")]
    fn schedule_image_ocr_capture(
        &self,
        capture_id: &str,
        asset_path: PathBuf,
        priority: TaskPriority,
    ) {
        let normalized_capture_id = capture_id.trim();
        if normalized_capture_id.is_empty() {
            return;
        }

        let mut queued_capture_ids = match self.shared.image_ocr.queued_capture_ids.lock() {
            Ok(queued_capture_ids) => queued_capture_ids,
            Err(_) => {
                warn!(
                    "failed to enqueue image OCR for capture {normalized_capture_id}: queue lock poisoned"
                );
                return;
            }
        };

        if !queued_capture_ids.insert(normalized_capture_id.to_string()) {
            info!(
                "skipped OCR enqueue for capture {} because it is already queued",
                normalized_capture_id
            );
            return;
        }
        drop(queued_capture_ids);

        info!(
            "queued OCR for capture {} from {}",
            normalized_capture_id,
            asset_path.display()
        );

        let scheduled_capture_id = normalized_capture_id.to_string();
        let cleanup_capture_id = scheduled_capture_id.clone();
        let state = self.clone();
        if let Err(error) = self.shared.task_scheduler.schedule(priority, move || {
            let started_at = Instant::now();
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| {
                state.process_image_ocr_job(scheduled_capture_id, asset_path);
            }));
            if let Err(payload) = result {
                state.release_image_ocr_capture(&cleanup_capture_id);
                warn!(
                    "image OCR task panicked for capture {} after {} ms: {}",
                    cleanup_capture_id,
                    started_at.elapsed().as_millis(),
                    panic_payload_message(&payload)
                );
            }
        }) {
            if let Ok(mut queued_capture_ids) = self.shared.image_ocr.queued_capture_ids.lock() {
                queued_capture_ids.remove(normalized_capture_id);
            }
            warn!("failed to schedule image OCR for capture {normalized_capture_id}: {error}");
        }
    }

    #[cfg(target_os = "macos")]
    pub(super) fn spawn_image_ocr_for_capture(&self, capture_id: &str, asset_path: Option<&str>) {
        let normalized_capture_id = capture_id.trim();
        let normalized_asset_path = asset_path.unwrap_or("").trim();

        if normalized_capture_id.is_empty() || normalized_asset_path.is_empty() {
            return;
        }

        self.schedule_image_ocr_capture(
            normalized_capture_id,
            PathBuf::from(normalized_asset_path),
            TaskPriority::UserInitiated,
        );
    }

    #[cfg(not(target_os = "macos"))]
    pub(super) fn spawn_image_ocr_for_capture(&self, _capture_id: &str, _asset_path: Option<&str>) {
    }

    #[cfg(not(target_os = "macos"))]
    pub(super) fn request_image_ocr_backfill(&self) {}

    #[cfg(target_os = "macos")]
    fn pending_image_ocr_backfill_candidates(
        &self,
        limit: usize,
    ) -> Result<Vec<(String, PathBuf)>, String> {
        let store = CaptureHistoryStore::new(&self.shared.clipboard_cache_dir)?;
        let page = store.query_page(&CaptureHistoryQuery {
            history_days: clipboard_history_storage_retention_days(),
            excluded_capture_ids: Vec::new(),
            search: String::new(),
            filter: "image".into(),
            page: 0,
            page_size: limit.clamp(1, 100),
        })?;

        Ok(page
            .captures
            .into_iter()
            .filter(|capture| capture.ocr_text.as_deref().unwrap_or("").trim().is_empty())
            .filter_map(|capture| {
                let asset_path = capture.asset_path?;
                let normalized = asset_path.trim();
                if normalized.is_empty() {
                    return None;
                }

                Some((capture.id, PathBuf::from(normalized)))
            })
            .collect())
    }

    #[cfg(not(target_os = "macos"))]
    fn pending_image_ocr_backfill_candidates(
        &self,
        _limit: usize,
    ) -> Result<Vec<(String, PathBuf)>, String> {
        Ok(Vec::new())
    }

    fn store_capture_ocr_text(&self, capture_id: &str, ocr_text: &str) -> Result<bool, String> {
        let normalized_capture_id = capture_id.trim();
        let normalized_ocr_text = normalize_ocr_text(ocr_text);

        if normalized_capture_id.is_empty() || normalized_ocr_text.is_empty() {
            return Ok(false);
        }

        let changed = update_capture_ocr_text_with_fallback(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
            normalized_capture_id,
            &normalized_ocr_text,
        )?;

        if changed {
            self.emit_clipboard_updated(ClipboardCapturesUpdated::ocr_updated());
        }

        Ok(changed)
    }
}
