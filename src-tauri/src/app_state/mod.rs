#[cfg(test)]
use chrono::Duration;
use chrono::Local;
use log::warn;
use serde::Serialize;
use specta::Type;
#[cfg(target_os = "macos")]
use std::sync::atomic::AtomicBool;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs, mem,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager};
use tauri_specta::Event as _;
#[cfg(test)]
use uuid::Uuid;

mod ocr;
mod runtime;
mod settings;
mod shortcuts;

use crate::app_idle::AppTaskScheduler;
use crate::backend::clipboard_history::legacy::{
    enforce_clipboard_retention, reconcile_clipboard_history as reconcile_clipboard_history_legacy,
};
use crate::backend::clipboard_history::migration::reconcile_capture_history_store;
use crate::backend::clipboard_history::pins::{
    load_pinned_clipboard_capture_ids, load_pinned_clipboard_state,
    normalize_pinned_clipboard_state, persist_pinned_clipboard_state,
    remove_pinned_clipboard_capture, MAX_PINNED_CLIPBOARD_CAPTURES,
};
use crate::backend::clipboard_history::read::{
    load_recent_clipboard_captures, query_clipboard_history_page,
};
use crate::backend::clipboard_history::write::delete_capture_with_fallback;
use crate::clipboard::ingest::{
    append_filter_log, clipboard_app_icons_dir_path, detect_filter_reason,
    persist_capture_ingest_artifacts, SourceAppFilterRule,
};
use crate::clipboard::preview::hydrate_capture_preview_assets;
use crate::clipboard::types::{
    CapturePreview, CaptureRecord, ClipboardBoardBootstrap, ClipboardPage, ClipboardPageRequest,
    ClipboardWindowTarget, DeleteClipboardCaptureResult, PinnedClipboardCapture,
    UpdateClipboardPinResult,
};
use crate::error::{AppError, AppResult};
use crate::ipc_events::{AppSettingsChanged, ClipboardCapturesUpdated};
use crate::runtime_profile;
use crate::storage::knowledge_root::ensure_knowledge_root_layout;
use runtime::{
    count_ready_batches, enqueue_capture, ensure_queue_state, hydrate_runtime_preview_assets,
    load_runtime_state, parse_captured_at, queue_depth_for_root, CaptureHashDisposition,
    RecentHashEntry, RuntimeState,
};
use settings::clipboard_history_storage_retention_days;
use settings::load_settings;
pub use settings::{AppSettings, ClipboardSourceAppOption};
#[cfg(test)]
use settings::{AppShortcutOverride, ClipboardSourceAppRule};
use shortcuts::sync_app_global_shortcuts;
#[cfg(test)]
use shortcuts::{
    resolve_app_global_shortcuts, ResolvedAppGlobalShortcut,
    GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_DEFAULT, GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID,
    GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_DEFAULT, GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID,
};

const SETTINGS_FILE_NAME: &str = "settings.json";
#[cfg(test)]
const CLIPBOARD_HISTORY_DIR_NAME: &str = "clipboard";
const BATCH_TRIGGER_SIZE: usize = 20;
const BATCH_TRIGGER_MAX_WAIT_MINUTES: i64 = 10;
const CLIPBOARD_BOARD_BOOTSTRAP_PAGE_SIZE: usize = 40;
#[cfg(target_os = "macos")]
const IMAGE_OCR_MAX_ATTEMPTS: usize = 2;
#[cfg(target_os = "macos")]
const IMAGE_OCR_RETRY_DELAY_MS: u64 = 150;
#[cfg(target_os = "macos")]
const IMAGE_OCR_BACKFILL_BATCH_SIZE: usize = 4;
const RUNNING_WATCH_STATUS: &str = "Rust clipboard poller active";
const STARTING_WATCH_STATUS: &str = "Rust clipboard poller starting";
const DEDUP_WINDOW_MINUTES: i64 = 5;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
    pub app_name: String,
    pub app_version: String,
    pub build_channel: String,
    pub app_env: String,
    pub data_channel: String,
    pub os: String,
    pub default_knowledge_root: String,
    pub app_data_dir: String,
    pub app_log_dir: String,
    pub queue_policy: String,
    pub capture_mode: String,
    pub recent_captures: Vec<CapturePreview>,
}

#[derive(Debug)]
pub enum CaptureProcessingResult {
    Paused,
    Archived { path: PathBuf },
    Queued { path: PathBuf, queue_depth: usize },
    Filtered { reason: String },
    Deduplicated,
    Reused,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchPromotionSummary {
    pub id: String,
    pub path: PathBuf,
    pub trigger_reason: String,
    pub capture_count: usize,
}

#[derive(Debug)]
struct StateData {
    settings: AppSettings,
    runtime: RuntimeState,
    pending_replay_hashes: VecDeque<RecentHashEntry>,
    clipboard_window_target: Option<ClipboardWindowTarget>,
    last_external_clipboard_window_target: Option<ClipboardWindowTarget>,
}

#[cfg(target_os = "macos")]
#[derive(Debug)]
struct ImageOcrRuntime {
    queued_capture_ids: Mutex<HashSet<String>>,
    backfill_queued: AtomicBool,
}

#[derive(Debug)]
struct SharedState {
    app_handle: AppHandle,
    task_scheduler: AppTaskScheduler,
    default_knowledge_root: PathBuf,
    app_data_dir: PathBuf,
    clipboard_cache_dir: PathBuf,
    app_log_dir: PathBuf,
    settings_path: PathBuf,
    settings_save_lock: Mutex<()>,
    clipboard_board_bootstrap: Mutex<Option<ClipboardBoardBootstrap>>,
    clipboard_source_apps_cache: Mutex<Option<Vec<ClipboardSourceAppOption>>>,
    clipboard_source_app_icons_cache: Mutex<HashMap<String, Option<String>>>,
    #[cfg(target_os = "macos")]
    image_ocr: ImageOcrRuntime,
    inner: Mutex<StateData>,
}

#[derive(Clone, Debug)]
pub struct AppState {
    shared: Arc<SharedState>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let home_dir = app.path().home_dir().map_err(|error| error.to_string())?;
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let app_log_dir = app
            .path()
            .app_log_dir()
            .map_err(|error| error.to_string())?;

        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        fs::create_dir_all(&app_log_dir).map_err(|error| error.to_string())?;

        let default_knowledge_root = runtime_profile::default_knowledge_root(&home_dir);
        let clipboard_cache_dir = clipboard_cache_root_path(&app_data_dir);
        fs::create_dir_all(&clipboard_cache_dir).map_err(|error| error.to_string())?;
        let settings_path = app_data_dir.join(SETTINGS_FILE_NAME);
        let settings = load_settings(&settings_path, &default_knowledge_root)?;
        let knowledge_root = settings.knowledge_root_path();
        ensure_knowledge_root_layout(&knowledge_root)?;
        enforce_clipboard_retention(
            &clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
        )?;

        let queue_state = ensure_queue_state(&knowledge_root)?;
        let mut runtime = load_runtime_state(&knowledge_root)?;
        let runtime_recent_captures: Vec<_> = mem::take(&mut runtime.recent_captures)
            .into_iter()
            .collect();
        reconcile_clipboard_history_legacy(
            &clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
            &runtime_recent_captures,
        )?;
        if let Err(error) = reconcile_capture_history_store(
            &clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
        ) {
            warn!("failed to reconcile sqlite capture history store on startup: {error}");
        }
        hydrate_runtime_preview_assets(&knowledge_root, &mut runtime)?;
        runtime.watch_status = STARTING_WATCH_STATUS.into();
        runtime.last_error = None;
        runtime.queue_depth = queue_state.pending.len();
        runtime.ready_batch_count = count_ready_batches(&knowledge_root)?;
        runtime.updated_at = now_rfc3339();

        let state = Self {
            shared: Arc::new(SharedState {
                app_handle: app.clone(),
                task_scheduler: AppTaskScheduler::new(),
                default_knowledge_root,
                app_data_dir,
                clipboard_cache_dir,
                app_log_dir,
                settings_path,
                settings_save_lock: Mutex::new(()),
                clipboard_board_bootstrap: Mutex::new(None),
                clipboard_source_apps_cache: Mutex::new(None),
                clipboard_source_app_icons_cache: Mutex::new(HashMap::new()),
                #[cfg(target_os = "macos")]
                image_ocr: Self::create_image_ocr_runtime(),
                inner: Mutex::new(StateData {
                    settings,
                    runtime,
                    pending_replay_hashes: VecDeque::new(),
                    clipboard_window_target: None,
                    last_external_clipboard_window_target: None,
                }),
            }),
        };

        state.try_refresh_clipboard_board_bootstrap_cache("startup");
        state.persist_runtime_snapshot()?;
        state.request_image_ocr_backfill();

        Ok(state)
    }

    pub fn current_settings(&self) -> Result<AppSettings, String> {
        Ok(self.lock_state()?.settings.clone())
    }

    pub fn clipboard_board_bootstrap(&self) -> Result<ClipboardBoardBootstrap, String> {
        if let Some(bootstrap) = self.cached_clipboard_board_bootstrap()? {
            return Ok(bootstrap);
        }

        let bootstrap = self.build_clipboard_board_bootstrap()?;
        self.cache_clipboard_board_bootstrap(bootstrap.clone())?;
        Ok(bootstrap)
    }

    pub fn cached_clipboard_source_apps(
        &self,
    ) -> Result<Option<Vec<ClipboardSourceAppOption>>, String> {
        self.shared
            .clipboard_source_apps_cache
            .lock()
            .map(|cache| cache.clone())
            .map_err(|error| error.to_string())
    }

    pub fn cache_clipboard_source_apps(
        &self,
        options: Vec<ClipboardSourceAppOption>,
    ) -> Result<(), String> {
        let mut cache = self
            .shared
            .clipboard_source_apps_cache
            .lock()
            .map_err(|error| error.to_string())?;
        *cache = Some(options);
        Ok(())
    }

    pub fn split_cached_clipboard_source_app_icons(
        &self,
        app_paths: &[String],
    ) -> Result<(Vec<(String, Option<String>)>, Vec<String>), String> {
        let cache = self
            .shared
            .clipboard_source_app_icons_cache
            .lock()
            .map_err(|error| error.to_string())?;
        let mut hits = Vec::new();
        let mut misses = Vec::new();

        for app_path in app_paths {
            let trimmed = app_path.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Some(icon_path) = cache.get(trimmed) {
                hits.push((trimmed.to_string(), icon_path.clone()));
            } else {
                misses.push(trimmed.to_string());
            }
        }

        Ok((hits, misses))
    }

    pub fn cache_clipboard_source_app_icons(
        &self,
        entries: Vec<(String, Option<String>)>,
    ) -> Result<(), String> {
        let mut cache = self
            .shared
            .clipboard_source_app_icons_cache
            .lock()
            .map_err(|error| error.to_string())?;

        for (app_path, icon_path) in entries {
            let trimmed = app_path.trim();
            if trimmed.is_empty() {
                continue;
            }

            cache.insert(trimmed.to_string(), icon_path);
        }

        Ok(())
    }

    pub fn clipboard_source_app_icons_dir(&self) -> PathBuf {
        clipboard_app_icons_dir_path(&self.shared.clipboard_cache_dir)
    }

    pub fn record_app_activity(&self) -> Result<(), String> {
        self.shared.task_scheduler.record_user_activity()
    }

    pub fn record_window_focus_change(&self, label: &str, focused: bool) -> Result<(), String> {
        self.shared
            .task_scheduler
            .update_window_focus(label, focused)
    }

    pub fn sync_current_global_shortcuts(&self) -> Result<(), String> {
        let settings = self.current_settings()?;
        sync_app_global_shortcuts(&self.shared.app_handle, None, &settings)
    }

    pub fn save_settings(
        &self,
        next: AppSettings,
        source_window_label: Option<String>,
    ) -> AppResult<AppSettings> {
        let _save_guard = self
            .shared
            .settings_save_lock
            .lock()
            .map_err(|_| AppError::internal("settings save lock poisoned"))?;
        let previous_settings = self.current_settings().map_err(AppError::from)?;
        if next.revision != previous_settings.revision {
            return Err(AppError::state_conflict(
                "settings changed in another window; please retry with the latest state",
            ));
        }

        let normalized = next.normalized(&self.shared.default_knowledge_root);
        let next_revision = previous_settings.revision.saturating_add(1);
        let normalized = AppSettings {
            revision: next_revision,
            ..normalized
        };
        ensure_knowledge_root_layout(&normalized.knowledge_root_path()).map_err(AppError::from)?;
        write_json_file(&self.shared.settings_path, &normalized).map_err(AppError::from)?;

        let knowledge_root = normalized.knowledge_root_path();
        enforce_clipboard_retention(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
        )
        .map_err(AppError::from)?;
        let queue_state = ensure_queue_state(&knowledge_root).map_err(AppError::from)?;
        let mut runtime = load_runtime_state(&knowledge_root).map_err(AppError::from)?;
        let runtime_recent_captures: Vec<_> = mem::take(&mut runtime.recent_captures)
            .into_iter()
            .collect();
        reconcile_clipboard_history_legacy(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
            &runtime_recent_captures,
        )
        .map_err(AppError::from)?;
        if let Err(error) = reconcile_capture_history_store(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
        ) {
            warn!(
                "failed to reconcile sqlite capture history store after settings change: {error}"
            );
        }
        hydrate_runtime_preview_assets(&knowledge_root, &mut runtime).map_err(AppError::from)?;
        runtime.watch_status = self.current_watch_status();
        runtime.last_error = self.current_last_error();
        runtime.queue_depth = queue_state.pending.len();
        runtime.ready_batch_count = count_ready_batches(&knowledge_root).map_err(AppError::from)?;
        runtime.updated_at = now_rfc3339();

        {
            let mut state = self.lock_state()?;
            state.settings = normalized.clone();
            state.runtime = runtime;
        }

        if let Err(error) = sync_app_global_shortcuts(
            &self.shared.app_handle,
            Some(&previous_settings),
            &normalized,
        ) {
            warn!("failed to sync app global shortcuts after settings change: {error}");
        }

        self.persist_runtime_snapshot().map_err(AppError::from)?;
        self.try_refresh_clipboard_board_bootstrap_cache("settings update");
        if previous_settings.clipboard_history_days != normalized.clipboard_history_days
            || previous_settings.knowledge_root != normalized.knowledge_root
        {
            self.request_image_ocr_backfill();
        }

        if let Err(error) = (AppSettingsChanged {
            previous: Some(previous_settings),
            saved: normalized.clone(),
            source_window_label,
        })
        .emit(&self.shared.app_handle)
        {
            warn!("failed to emit app settings changed event: {error}");
        }

        Ok(normalized)
    }

    pub fn dashboard_snapshot(&self, app: &AppHandle) -> Result<DashboardSnapshot, String> {
        let (
            locale,
            ai_enabled,
            watch_status,
            queue_depth,
            ready_batch_count,
            last_error,
            last_batch_reason,
            knowledge_root,
            clipboard_history_days,
            default_knowledge_root,
        ) = {
            let state = self.lock_state()?;
            (
                state.settings.locale_preference.resolved(),
                state.settings.ai_enabled(),
                state.runtime.watch_status.clone(),
                state.runtime.queue_depth,
                state.runtime.ready_batch_count,
                state.runtime.last_error.clone(),
                state.runtime.last_batch_reason.clone(),
                state.settings.knowledge_root_path(),
                state.settings.clipboard_history_days,
                state.settings.knowledge_root.clone(),
            )
        };
        let app_data_dir = self.shared.app_data_dir.display().to_string();
        let app_log_dir = self.shared.app_log_dir.display().to_string();
        let watch_status = match locale {
            crate::locale::AppLocale::ZhCn => match watch_status.as_str() {
                RUNNING_WATCH_STATUS => "Rust 剪贴板轮询器运行中".to_string(),
                STARTING_WATCH_STATUS => "Rust 剪贴板轮询器启动中".to_string(),
                "Rust clipboard poller retrying" => "Rust 剪贴板轮询器重试中".to_string(),
                "Clipboard watcher is only implemented on macOS" => {
                    "剪贴板监听目前只在 macOS 上实现".to_string()
                }
                other => other.to_string(),
            },
            crate::locale::AppLocale::EnUs => watch_status,
        };
        let queue_state = match locale {
            crate::locale::AppLocale::ZhCn => {
                if ai_enabled {
                    format!(
                        "AI 队列待处理 {} · 就绪批次 {}",
                        queue_depth, ready_batch_count
                    )
                } else {
                    format!(
                        "AI 队列已暂停，待处理 {} · 就绪批次 {}，等待完成提供方配置",
                        queue_depth, ready_batch_count
                    )
                }
            }
            crate::locale::AppLocale::EnUs => {
                if ai_enabled {
                    format!(
                        "AI queue pending {} · ready batches {}",
                        queue_depth, ready_batch_count
                    )
                } else {
                    format!(
                        "AI queue paused with {} pending · ready batches {} until provider setup completes",
                        queue_depth, ready_batch_count
                    )
                }
            }
        };

        let batch_state = match (&last_batch_reason, locale) {
            (Some(reason), crate::locale::AppLocale::ZhCn) => {
                let localized_reason = match reason.as_str() {
                    "capture_count" => "按采集条数触发",
                    "max_wait" => "按最长等待触发",
                    other => other,
                };
                format!(" · 上一次成批触发：{}", localized_reason)
            }
            (Some(reason), crate::locale::AppLocale::EnUs) => {
                format!(" · last batch {}", reason)
            }
            (None, _) => String::new(),
        };
        let recent_captures = load_recent_clipboard_captures(
            &knowledge_root,
            &self.shared.clipboard_cache_dir,
            clipboard_history_days,
            3,
        )?;

        Ok(DashboardSnapshot {
            app_name: app.package_info().name.clone(),
            app_version: app.package_info().version.to_string(),
            build_channel: runtime_profile::build_channel_label(),
            app_env: runtime_profile::app_env().into(),
            data_channel: runtime_profile::data_channel().into(),
            os: std::env::consts::OS.into(),
            default_knowledge_root,
            app_data_dir,
            app_log_dir,
            queue_policy: match locale {
                crate::locale::AppLocale::ZhCn => {
                    "20 条剪贴板或 10 分钟 · 5 分钟内做精确去重".into()
                }
                crate::locale::AppLocale::EnUs => {
                    "20 captures or 10 minutes · exact-match dedupe in 5 minutes".into()
                }
            },
            capture_mode: match (&last_error, locale) {
                (Some(error), crate::locale::AppLocale::ZhCn) => format!(
                    "{} · {}{} · 最近错误：{}",
                    watch_status, queue_state, batch_state, error
                ),
                (Some(error), crate::locale::AppLocale::EnUs) => format!(
                    "{} · {}{} · last error: {}",
                    watch_status, queue_state, batch_state, error
                ),
                (None, _) => format!("{} · {}{}", watch_status, queue_state, batch_state),
            },
            recent_captures,
        })
    }

    pub fn clipboard_page(&self, request: ClipboardPageRequest) -> Result<ClipboardPage, String> {
        let settings = self.current_settings()?;
        let excluded_capture_ids =
            load_pinned_clipboard_capture_ids(&self.shared.clipboard_cache_dir)?;
        query_clipboard_history_page(
            &settings.knowledge_root_path(),
            &self.shared.clipboard_cache_dir,
            settings.clipboard_history_days,
            &excluded_capture_ids,
            &request,
        )
    }

    pub fn pinned_clipboard_captures(&self) -> Result<Vec<PinnedClipboardCapture>, String> {
        let settings = self.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        let mut state = load_pinned_clipboard_state(&self.shared.clipboard_cache_dir)?;

        for pinned_capture in &mut state.captures {
            hydrate_capture_preview_assets(&knowledge_root, &mut pinned_capture.capture)?;
        }

        Ok(state.captures)
    }

    pub fn set_clipboard_capture_pinned(
        &self,
        capture: CapturePreview,
        pinned: bool,
        replace_oldest: bool,
    ) -> Result<UpdateClipboardPinResult, String> {
        let normalized_id = capture.id.trim().to_string();
        if normalized_id.is_empty() {
            return Err("capture id is required".into());
        }

        let mut state = load_pinned_clipboard_state(&self.shared.clipboard_cache_dir)?;
        let existing_index = state
            .captures
            .iter()
            .position(|entry| entry.capture.id == normalized_id);

        let (changed, replaced_capture_id) = if pinned {
            if let Some(index) = existing_index {
                state.captures[index].capture = capture;
                (true, None)
            } else {
                let replaced_capture_id = if state.captures.len() >= MAX_PINNED_CLIPBOARD_CAPTURES {
                    if !replace_oldest {
                        return Err(format!(
                            "Pinned captures are limited to {} items.",
                            MAX_PINNED_CLIPBOARD_CAPTURES
                        ));
                    }

                    Some(state.captures.remove(0).capture.id)
                } else {
                    None
                };

                state.captures.push(PinnedClipboardCapture {
                    capture,
                    pinned_at: now_rfc3339(),
                });
                (true, replaced_capture_id)
            }
        } else if let Some(index) = existing_index {
            state.captures.remove(index);
            (true, None)
        } else {
            (false, None)
        };

        normalize_pinned_clipboard_state(&mut state);
        persist_pinned_clipboard_state(&self.shared.clipboard_cache_dir, &state)?;

        if changed {
            self.emit_clipboard_updated(ClipboardCapturesUpdated::pins_changed());
        }

        Ok(UpdateClipboardPinResult {
            capture_id: normalized_id,
            pinned,
            changed,
            replaced_capture_id,
            pinned_count: state.captures.len(),
        })
    }

    pub fn delete_clipboard_capture(
        &self,
        capture_id: String,
    ) -> Result<DeleteClipboardCaptureResult, String> {
        let normalized_id = capture_id.trim();
        if normalized_id.is_empty() {
            return Err("capture id is required".into());
        }

        let result = delete_capture_with_fallback(
            &self.shared.clipboard_cache_dir,
            clipboard_history_storage_retention_days(),
            normalized_id,
        )?;
        let removed_from_pinned =
            remove_pinned_clipboard_capture(&self.shared.clipboard_cache_dir, normalized_id)?;
        let deleted = result.deleted || removed_from_pinned;

        if deleted {
            self.persist_runtime_snapshot()?;
            self.emit_clipboard_updated(ClipboardCapturesUpdated::capture_deleted());
        }

        Ok(DeleteClipboardCaptureResult {
            removed_from_pinned,
            deleted,
            ..result
        })
    }

    pub fn process_capture(
        &self,
        capture: &CaptureRecord,
    ) -> Result<CaptureProcessingResult, String> {
        let settings = self.current_settings()?;
        if !settings.clipboard_capture_enabled {
            return Ok(CaptureProcessingResult::Paused);
        }

        let knowledge_root = settings.knowledge_root_path();
        let captured_at = parse_captured_at(&capture.captured_at)?;
        let mut stored_capture = capture.clone();
        ensure_knowledge_root_layout(&knowledge_root)?;
        ensure_queue_state(&knowledge_root)?;

        if let Some(reason) = detect_filter_reason(
            &stored_capture,
            settings
                .clipboard_excluded_source_apps
                .iter()
                .map(|rule| SourceAppFilterRule {
                    bundle_id: &rule.bundle_id,
                    app_name: &rule.app_name,
                }),
            &settings.clipboard_excluded_keywords,
        ) {
            let filter_reason = reason.as_status_reason();
            append_filter_log(
                &knowledge_root,
                &reason.into_filter_log_entry(&stored_capture),
            )?;

            self.record_capture_outcome(
                &stored_capture,
                "filtered",
                None,
                Some(filter_reason.clone()),
                None,
                queue_depth_for_root(&knowledge_root)?,
                &captured_at,
            )?;

            return Ok(CaptureProcessingResult::Filtered {
                reason: filter_reason,
            });
        }

        match self.resolve_capture_hash_disposition(&stored_capture.hash, &captured_at)? {
            CaptureHashDisposition::Duplicate => {
                self.record_capture_outcome(
                    &stored_capture,
                    "deduplicated",
                    None,
                    None,
                    None,
                    queue_depth_for_root(&knowledge_root)?,
                    &captured_at,
                )?;

                return Ok(CaptureProcessingResult::Deduplicated);
            }
            CaptureHashDisposition::Reused(replay_entry) => {
                if self.record_capture_reuse(&stored_capture, &replay_entry, &captured_at)? {
                    return Ok(CaptureProcessingResult::Reused);
                }
            }
            CaptureHashDisposition::Fresh => {}
        }

        let archive_path = persist_capture_ingest_artifacts(
            &knowledge_root,
            &self.shared.clipboard_cache_dir,
            &mut stored_capture,
        )?;

        let queue_depth = if settings.ai_enabled() {
            enqueue_capture(&knowledge_root, &stored_capture)?
        } else {
            queue_depth_for_root(&knowledge_root)?
        };

        let status = if settings.ai_enabled() {
            "queued"
        } else {
            "archived"
        };

        self.record_capture_outcome(
            &stored_capture,
            status,
            Some(archive_path.display().to_string()),
            None,
            Some(RecentHashEntry {
                hash: stored_capture.hash.clone(),
                captured_at: stored_capture.captured_at.clone(),
                capture_id: None,
            }),
            queue_depth,
            &captured_at,
        )?;

        self.spawn_image_ocr_for_capture(&stored_capture.id, stored_capture.asset_path.as_deref());

        Ok(if settings.ai_enabled() {
            CaptureProcessingResult::Queued {
                path: archive_path,
                queue_depth,
            }
        } else {
            CaptureProcessingResult::Archived { path: archive_path }
        })
    }

    pub fn set_clipboard_window_target(
        &self,
        target: Option<ClipboardWindowTarget>,
    ) -> Result<(), String> {
        self.lock_state()?.clipboard_window_target = target;
        Ok(())
    }

    pub fn clipboard_window_target(&self) -> Result<Option<ClipboardWindowTarget>, String> {
        Ok(self.lock_state()?.clipboard_window_target.clone())
    }

    pub fn set_last_external_clipboard_window_target(
        &self,
        target: Option<ClipboardWindowTarget>,
    ) -> Result<(), String> {
        self.lock_state()?.last_external_clipboard_window_target = target;
        Ok(())
    }

    pub fn last_external_clipboard_window_target(
        &self,
    ) -> Result<Option<ClipboardWindowTarget>, String> {
        Ok(self
            .lock_state()?
            .last_external_clipboard_window_target
            .clone())
    }

    fn emit_clipboard_updated(&self, update: ClipboardCapturesUpdated) {
        if update.refresh_history || update.refresh_pinned {
            self.try_refresh_clipboard_board_bootstrap_cache("clipboard update");
        }

        if let Err(error) = update.emit(&self.shared.app_handle) {
            warn!("failed to emit clipboard captures updated event: {error}");
        }
    }

    fn cached_clipboard_board_bootstrap(&self) -> Result<Option<ClipboardBoardBootstrap>, String> {
        self.shared
            .clipboard_board_bootstrap
            .lock()
            .map(|cache| cache.clone())
            .map_err(|error| error.to_string())
    }

    fn cache_clipboard_board_bootstrap(
        &self,
        bootstrap: ClipboardBoardBootstrap,
    ) -> Result<(), String> {
        let mut cache = self
            .shared
            .clipboard_board_bootstrap
            .lock()
            .map_err(|error| error.to_string())?;
        *cache = Some(bootstrap);
        Ok(())
    }

    fn refresh_clipboard_board_bootstrap_cache(&self) -> Result<(), String> {
        let bootstrap = self.build_clipboard_board_bootstrap()?;
        self.cache_clipboard_board_bootstrap(bootstrap)
    }

    fn try_refresh_clipboard_board_bootstrap_cache(&self, context: &str) {
        if let Err(error) = self.refresh_clipboard_board_bootstrap_cache() {
            warn!("failed to refresh clipboard bootstrap cache after {context}: {error}");
        }
    }

    fn build_clipboard_board_bootstrap(&self) -> Result<ClipboardBoardBootstrap, String> {
        let settings = self.current_settings()?;
        let excluded_capture_ids =
            load_pinned_clipboard_capture_ids(&self.shared.clipboard_cache_dir)?;
        let page = query_clipboard_history_page(
            &settings.knowledge_root_path(),
            &self.shared.clipboard_cache_dir,
            settings.clipboard_history_days,
            &excluded_capture_ids,
            &ClipboardPageRequest {
                page: 0,
                page_size: CLIPBOARD_BOARD_BOOTSTRAP_PAGE_SIZE,
                search: None,
                filter: None,
            },
        )?;
        let pinned_captures = self.pinned_clipboard_captures()?;

        Ok(ClipboardBoardBootstrap {
            page,
            pinned_captures,
        })
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, StateData>, String> {
        self.shared
            .inner
            .lock()
            .map_err(|_| "application state lock poisoned".to_string())
    }
}

#[cfg(test)]
fn clipboard_history_file_path(
    clipboard_cache_root: &Path,
    captured_at: &str,
) -> Result<PathBuf, String> {
    let captured_at = parse_captured_at(captured_at)?;
    let date = captured_at.format("%Y-%m-%d").to_string();

    Ok(clipboard_history_dir_path(clipboard_cache_root).join(format!("{date}.jsonl")))
}

fn clipboard_cache_root_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("clipboard-cache")
}

#[cfg(test)]
fn clipboard_history_dir_path(clipboard_cache_root: &Path) -> PathBuf {
    clipboard_cache_root.join(CLIPBOARD_HISTORY_DIR_NAME)
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn panic_payload_message(payload: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return (*message).to_string();
    }
    "unknown panic payload".into()
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::clipboard_history::legacy::{
        append_clipboard_history_entry, delete_clipboard_history_entry,
        load_capture_history_entries_legacy,
    };
    use crate::backend::clipboard_history::pins::PinnedClipboardState;
    use crate::clipboard::ingest::{
        daily_archive_path, detect_filter_reason, render_capture_entry, SourceAppFilterRule,
    };
    use crate::storage::knowledge_root::assets_dir_path;
    use std::collections::BTreeMap;

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!("tino-app-state-tests-{}", Uuid::now_v7().simple()))
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
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
        }
    }

    fn recent_captured_at(hour: u32, minute: u32) -> String {
        let day = Local::now().date_naive().format("%Y-%m-%d");
        let offset = Local::now().format("%:z");
        format!("{day}T{hour:02}:{minute:02}:00{offset}")
    }

    fn relative_captured_at(duration: Duration) -> String {
        (Local::now().fixed_offset() - duration).to_rfc3339()
    }

    fn sample_settings() -> AppSettings {
        AppSettings::defaults(&unique_root())
    }

    #[test]
    fn app_settings_defaults_revision_to_zero() {
        let settings = sample_settings();

        assert_eq!(settings.revision, 0);
    }

    fn sample_capture_record(raw_text: &str) -> CaptureRecord {
        CaptureRecord {
            id: "cap_filter".into(),
            source: "clipboard".into(),
            source_app_name: Some("Safari".into()),
            source_app_bundle_id: Some("com.apple.Safari".into()),
            source_app_icon_path: None,
            captured_at: "2026-04-08T12:00:00+08:00".into(),
            content_kind: "plain_text".into(),
            raw_text: raw_text.into(),
            raw_rich: None,
            raw_rich_format: None,
            link_url: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash: "hash_filter".into(),
            image_bytes: None,
            source_app_icon_bytes: None,
        }
    }

    #[test]
    fn resolve_app_global_shortcuts_uses_defaults_without_overrides() {
        let settings = sample_settings();
        let shortcuts = resolve_app_global_shortcuts(&settings);

        assert_eq!(
            shortcuts,
            vec![
                ResolvedAppGlobalShortcut {
                    id: GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID,
                    accelerator: GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_DEFAULT.into(),
                },
                ResolvedAppGlobalShortcut {
                    id: GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID,
                    accelerator: GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_DEFAULT.into(),
                },
            ]
        );
    }

    #[test]
    fn resolve_app_global_shortcuts_prefers_persisted_override() {
        let mut settings = sample_settings();
        settings.shortcut_overrides = BTreeMap::from([(
            GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID.into(),
            AppShortcutOverride {
                accelerator: Some("Control+Alt+Shift+M".into()),
            },
        )]);

        let shortcuts = resolve_app_global_shortcuts(&settings);

        assert_eq!(
            shortcuts
                .iter()
                .find(|shortcut| shortcut.id == GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID)
                .map(|shortcut| shortcut.accelerator.as_str()),
            Some("Control+Alt+Shift+M")
        );
    }

    #[test]
    fn resolve_app_global_shortcuts_skips_disabled_override() {
        let mut settings = sample_settings();
        settings.shortcut_overrides = BTreeMap::from([(
            GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID.into(),
            AppShortcutOverride { accelerator: None },
        )]);

        let shortcuts = resolve_app_global_shortcuts(&settings);

        assert!(shortcuts
            .iter()
            .all(|shortcut| shortcut.id != GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID));
        assert!(shortcuts
            .iter()
            .any(|shortcut| shortcut.id == GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID));
    }

    #[test]
    fn app_settings_normalized_dedupes_clipboard_filter_rules() {
        let mut settings = sample_settings();
        settings.revision = 7;
        settings.clipboard_history_days = 365;
        settings.clipboard_capture_enabled = false;
        settings.clipboard_excluded_source_apps = vec![
            ClipboardSourceAppRule {
                bundle_id: " com.apple.Safari ".into(),
                app_name: "Safari".into(),
            },
            ClipboardSourceAppRule {
                bundle_id: "COM.APPLE.SAFARI".into(),
                app_name: "Safari Duplicate".into(),
            },
            ClipboardSourceAppRule {
                bundle_id: "abnerworks.Typora".into(),
                app_name: " ".into(),
            },
        ];
        settings.clipboard_excluded_keywords = vec![
            " password ; secret ".into(),
            "Password".into(),
            "internal；token".into(),
        ];

        let normalized = settings.normalized(&unique_root());

        assert_eq!(normalized.clipboard_history_days, 90);
        assert_eq!(normalized.revision, 7);
        assert!(!normalized.clipboard_capture_enabled);
        assert_eq!(normalized.clipboard_excluded_source_apps.len(), 2);
        assert_eq!(
            normalized.clipboard_excluded_source_apps[0].bundle_id,
            "com.apple.Safari"
        );
        assert_eq!(
            normalized.clipboard_excluded_source_apps[1].app_name,
            "abnerworks.Typora"
        );
        assert_eq!(
            normalized.clipboard_excluded_keywords,
            vec!["password", "secret", "internal", "token"]
        );
    }

    #[test]
    fn detect_filter_reason_prefers_source_app_rule() {
        let mut settings = sample_settings();
        settings.clipboard_excluded_source_apps = vec![ClipboardSourceAppRule {
            bundle_id: "com.apple.Safari".into(),
            app_name: "Safari".into(),
        }];
        let capture = sample_capture_record("123");

        let reason = detect_filter_reason(
            &capture,
            settings
                .clipboard_excluded_source_apps
                .iter()
                .map(|rule| SourceAppFilterRule {
                    bundle_id: &rule.bundle_id,
                    app_name: &rule.app_name,
                }),
            &settings.clipboard_excluded_keywords,
        )
        .expect("capture should filter");

        assert_eq!(reason.reason, "source_app_excluded: Safari");
        assert_eq!(reason.rule_kind, "source_app");
        assert_eq!(reason.rule_value.as_deref(), Some("com.apple.Safari"));
    }

    #[test]
    fn detect_filter_reason_matches_keywords_case_insensitively() {
        let mut settings = sample_settings();
        settings.clipboard_excluded_keywords = vec!["PassWord".into()];
        let capture = sample_capture_record("Temporary PASSWORD reset link");

        let reason = detect_filter_reason(
            &capture,
            settings
                .clipboard_excluded_source_apps
                .iter()
                .map(|rule| SourceAppFilterRule {
                    bundle_id: &rule.bundle_id,
                    app_name: &rule.app_name,
                }),
            &settings.clipboard_excluded_keywords,
        )
        .expect("capture should filter");

        assert_eq!(reason.reason, "keyword_excluded: PassWord");
        assert_eq!(reason.rule_kind, "keyword");
        assert_eq!(reason.rule_value.as_deref(), Some("PassWord"));
    }

    #[test]
    fn delete_clipboard_history_entry_removes_target_and_keeps_other_rows() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let first = sample_preview("cap_1", &recent_captured_at(12, 0));
        let second = sample_preview("cap_2", &recent_captured_at(12, 30));
        append_clipboard_history_entry(&root, &first).expect("first preview should append");
        append_clipboard_history_entry(&root, &second).expect("second preview should append");

        let deleted = delete_clipboard_history_entry(&root, 3, "cap_1")
            .expect("history delete should succeed");
        assert!(deleted);

        let remaining =
            load_capture_history_entries_legacy(&root, 3).expect("remaining history should load");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "cap_2");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn delete_clipboard_history_entry_removes_empty_day_file() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let capture = sample_preview("cap_1", &recent_captured_at(12, 0));
        let history_path = clipboard_history_file_path(&root, &capture.captured_at)
            .expect("history path should build");
        append_clipboard_history_entry(&root, &capture).expect("preview should append");

        let deleted = delete_clipboard_history_entry(&root, 3, "cap_1")
            .expect("history delete should succeed");
        assert!(deleted);
        assert!(!history_path.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn clipboard_retention_keeps_daily_and_assets_while_pruning_history_cache() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let retained_day = (Local::now().date_naive() - Duration::days(30)).format("%Y-%m-%d");
        let captured_at = format!("{retained_day}T12:00:00+08:00");
        let preview = sample_preview("cap_legacy", &captured_at);
        let history_path =
            clipboard_history_file_path(&root, &captured_at).expect("history path should build");
        append_clipboard_history_entry(&root, &preview).expect("preview should append");

        let daily_path = daily_archive_path(&root, &captured_at).expect("daily path should build");
        fs::write(&daily_path, "# keep daily").expect("daily should persist");

        let asset_dir = assets_dir_path(&root).join(retained_day.to_string());
        fs::create_dir_all(&asset_dir).expect("asset dir should initialize");
        let asset_path = asset_dir.join("cap_legacy.png");
        fs::write(&asset_path, b"png").expect("asset should persist");

        enforce_clipboard_retention(&root, 1).expect("retention should succeed");

        assert!(
            !history_path.exists(),
            "clipboard history cache should still respect retention"
        );
        assert!(
            daily_path.exists(),
            "daily archive should remain a long-lived knowledge asset"
        );
        assert!(
            asset_path.exists(),
            "persisted assets referenced by daily should not be pruned by clipboard retention"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn clipboard_retention_prunes_expired_entries_without_dropping_retained_ones() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let expired = sample_preview(
            "cap_expired",
            &relative_captured_at(Duration::days(1) + Duration::minutes(1)),
        );
        let retained = sample_preview(
            "cap_retained",
            &relative_captured_at(Duration::days(1) - Duration::minutes(1)),
        );

        append_clipboard_history_entry(&root, &expired).expect("expired preview should append");
        append_clipboard_history_entry(&root, &retained).expect("retained preview should append");

        enforce_clipboard_retention(&root, 1).expect("retention should succeed");

        let remaining =
            load_capture_history_entries_legacy(&root, 7).expect("remaining history should load");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "cap_retained");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn clipboard_history_window_filters_without_pruning_ninety_day_cache() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let captured_at = relative_captured_at(Duration::days(30));
        let history_path =
            clipboard_history_file_path(&root, &captured_at).expect("history path should build");
        append_clipboard_history_entry(&root, &sample_preview("cap_30d", &captured_at))
            .expect("preview should append");
        reconcile_capture_history_store(&root, clipboard_history_storage_retention_days())
            .expect("sqlite reconcile should succeed");

        let one_day_page = query_clipboard_history_page(
            &root,
            &root,
            1,
            &HashSet::new(),
            &ClipboardPageRequest {
                page: 0,
                page_size: 20,
                search: None,
                filter: None,
            },
        )
        .expect("1-day query should succeed");
        assert_eq!(one_day_page.total, 0);
        assert!(
            history_path.exists(),
            "switching to a shorter window should not physically prune retained cache entries",
        );

        let ninety_day_page = query_clipboard_history_page(
            &root,
            &root,
            90,
            &HashSet::new(),
            &ClipboardPageRequest {
                page: 0,
                page_size: 20,
                search: None,
                filter: None,
            },
        )
        .expect("90-day query should succeed");
        assert_eq!(ninety_day_page.total, 1);
        assert_eq!(ninety_day_page.captures[0].id, "cap_30d");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn clipboard_storage_retention_prunes_only_entries_older_than_ninety_days() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let expired = sample_preview(
            "cap_91d",
            &relative_captured_at(Duration::days(91) + Duration::minutes(1)),
        );
        let retained = sample_preview("cap_89d", &relative_captured_at(Duration::days(89)));

        append_clipboard_history_entry(&root, &expired).expect("expired preview should append");
        append_clipboard_history_entry(&root, &retained).expect("retained preview should append");

        enforce_clipboard_retention(&root, clipboard_history_storage_retention_days())
            .expect("90-day retention should succeed");

        let remaining =
            load_capture_history_entries_legacy(&root, clipboard_history_storage_retention_days())
                .expect("remaining history should load");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "cap_89d");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn render_capture_entry_omits_clipboard_ui_icon_cache_path() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let capture = CaptureRecord {
            id: "cap_icon".into(),
            source: "clipboard".into(),
            source_app_name: Some("Safari".into()),
            source_app_bundle_id: Some("com.apple.Safari".into()),
            source_app_icon_path: Some(
                root.join("clipboard-cache")
                    .join("app-icons")
                    .join("com-apple-safari.png")
                    .display()
                    .to_string(),
            ),
            source_app_icon_bytes: None,
            captured_at: "2026-04-06T12:00:00+08:00".into(),
            content_kind: "plain_text".into(),
            raw_text: "storage layering".into(),
            raw_rich: None,
            raw_rich_format: None,
            image_bytes: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash: "hash_icon".into(),
            link_url: None,
            asset_path: None,
            thumbnail_path: None,
        };

        let rendered = render_capture_entry(&capture, &root);

        assert!(
            !rendered.contains("Source App Icon Path"),
            "daily markdown should not persist clipboard UI icon cache paths"
        );
        assert!(
            rendered.contains("- Source App: Safari"),
            "daily markdown should still retain useful source metadata"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn normalize_pinned_clipboard_state_keeps_oldest_first_and_limits_to_five() {
        let mut state = PinnedClipboardState {
            captures: vec![
                PinnedClipboardCapture {
                    capture: sample_preview("cap_6", "2026-04-06T12:00:00+08:00"),
                    pinned_at: "2026-04-06T12:00:00+08:00".into(),
                },
                PinnedClipboardCapture {
                    capture: sample_preview("cap_4", "2026-04-04T12:00:00+08:00"),
                    pinned_at: "2026-04-04T12:00:00+08:00".into(),
                },
                PinnedClipboardCapture {
                    capture: sample_preview("cap_2", "2026-04-02T12:00:00+08:00"),
                    pinned_at: "2026-04-02T12:00:00+08:00".into(),
                },
                PinnedClipboardCapture {
                    capture: sample_preview("cap_5", "2026-04-05T12:00:00+08:00"),
                    pinned_at: "2026-04-05T12:00:00+08:00".into(),
                },
                PinnedClipboardCapture {
                    capture: sample_preview("cap_1", "2026-04-01T12:00:00+08:00"),
                    pinned_at: "2026-04-01T12:00:00+08:00".into(),
                },
                PinnedClipboardCapture {
                    capture: sample_preview("cap_3", "2026-04-03T12:00:00+08:00"),
                    pinned_at: "2026-04-03T12:00:00+08:00".into(),
                },
            ],
        };

        normalize_pinned_clipboard_state(&mut state);

        assert_eq!(state.captures.len(), 5);
        assert_eq!(
            state
                .captures
                .iter()
                .map(|entry| entry.capture.id.as_str())
                .collect::<Vec<_>>(),
            vec!["cap_2", "cap_3", "cap_4", "cap_5", "cap_6"]
        );
    }
}
