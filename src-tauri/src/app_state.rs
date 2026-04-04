use chrono::{DateTime, Duration, FixedOffset, Local, NaiveDate};
use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    collections::VecDeque,
    fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

const SETTINGS_FILE_NAME: &str = "settings.json";
const RUNTIME_FILE_NAME: &str = "runtime.json";
const QUEUE_FILE_NAME: &str = "queue.json";
const FILTERS_LOG_FILE_NAME: &str = "filters.log";
const BATCHES_DIR_NAME: &str = "batches";
const ASSETS_DIR_NAME: &str = "assets";
const CLIPBOARD_HISTORY_DIR_NAME: &str = "clipboard";
const APP_ICONS_DIR_NAME: &str = "app-icons";
const IMAGE_THUMBNAIL_MAX_EDGE: u32 = 240;
const BATCH_TRIGGER_SIZE: usize = 20;
const BATCH_TRIGGER_MAX_WAIT_MINUTES: i64 = 10;
const DEFAULT_PROVIDER_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-5.4-mini";
const DEFAULT_CLIPBOARD_HISTORY_DAYS: u16 = 3;
const MAX_CLIPBOARD_HISTORY_DAYS: u16 = 7;
const MAX_CLIPBOARD_STORAGE_BYTES: u64 = 256 * 1024 * 1024;
const CLIPBOARD_CAPTURES_UPDATED_EVENT: &str = "clipboard-captures-updated";
const RUNNING_WATCH_STATUS: &str = "Rust clipboard poller active";
const STARTING_WATCH_STATUS: &str = "Rust clipboard poller starting";
const DEDUP_WINDOW_MINUTES: i64 = 5;
const MIN_CAPTURE_TEXT_CHARS: usize = 4;
const OTP_MAX_CHARS: usize = 8;

fn default_clipboard_history_days() -> u16 {
    DEFAULT_CLIPBOARD_HISTORY_DAYS
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub knowledge_root: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default = "default_clipboard_history_days")]
    pub clipboard_history_days: u16,
}

impl AppSettings {
    fn defaults(default_knowledge_root: &Path) -> Self {
        Self {
            knowledge_root: default_knowledge_root.display().to_string(),
            base_url: DEFAULT_PROVIDER_BASE_URL.into(),
            api_key: String::new(),
            model: DEFAULT_MODEL.into(),
            clipboard_history_days: DEFAULT_CLIPBOARD_HISTORY_DAYS,
        }
    }

    fn normalized(mut self, default_knowledge_root: &Path) -> Self {
        let knowledge_root = if self.knowledge_root.trim().is_empty() {
            default_knowledge_root.to_path_buf()
        } else {
            expand_home_path(&self.knowledge_root, default_knowledge_root)
        };

        self.knowledge_root = knowledge_root.display().to_string();

        if self.base_url.trim().is_empty() {
            self.base_url = DEFAULT_PROVIDER_BASE_URL.into();
        }

        if self.model.trim().is_empty() {
            self.model = DEFAULT_MODEL.into();
        }

        self.clipboard_history_days = self
            .clipboard_history_days
            .clamp(DEFAULT_CLIPBOARD_HISTORY_DAYS, MAX_CLIPBOARD_HISTORY_DAYS);

        self
    }

    pub fn knowledge_root_path(&self) -> PathBuf {
        PathBuf::from(&self.knowledge_root)
    }

    fn ai_enabled(&self) -> bool {
        !self.api_key.trim().is_empty()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CapturePreview {
    pub id: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub source_app_icon_path: Option<String>,
    pub content_kind: String,
    pub preview: String,
    pub secondary_preview: Option<String>,
    pub captured_at: String,
    pub status: String,
    pub raw_text: String,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
    pub app_name: String,
    pub app_version: String,
    pub build_channel: String,
    pub os: String,
    pub default_knowledge_root: String,
    pub app_data_dir: String,
    pub queue_policy: String,
    pub capture_mode: String,
    pub recent_captures: Vec<CapturePreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPageSummary {
    pub total: usize,
    pub text: usize,
    pub links: usize,
    pub images: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPage {
    pub captures: Vec<CapturePreview>,
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub has_more: bool,
    pub history_days: u16,
    pub summary: ClipboardPageSummary,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPageRequest {
    pub page: usize,
    pub page_size: usize,
    pub search: Option<String>,
    pub filter: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CaptureRecord {
    pub id: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub source_app_icon_path: Option<String>,
    pub captured_at: String,
    pub content_kind: String,
    pub raw_text: String,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
    pub hash: String,
    #[serde(skip, default)]
    pub image_bytes: Option<Vec<u8>>,
    #[serde(skip, default)]
    pub source_app_icon_bytes: Option<Vec<u8>>,
}

#[derive(Debug)]
pub enum CaptureProcessingResult {
    Archived { path: PathBuf },
    Queued { path: PathBuf, queue_depth: usize },
    Filtered { reason: String },
    Deduplicated,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchPromotionSummary {
    pub id: String,
    pub path: PathBuf,
    pub trigger_reason: String,
    pub capture_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct RuntimeState {
    watch_status: String,
    last_error: Option<String>,
    last_archive_path: Option<String>,
    last_filter_reason: Option<String>,
    last_batch_path: Option<String>,
    last_batch_reason: Option<String>,
    queue_depth: usize,
    ready_batch_count: usize,
    updated_at: String,
    recent_hashes: VecDeque<RecentHashEntry>,
    recent_captures: VecDeque<CapturePreview>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            watch_status: STARTING_WATCH_STATUS.into(),
            last_error: None,
            last_archive_path: None,
            last_filter_reason: None,
            last_batch_path: None,
            last_batch_reason: None,
            queue_depth: 0,
            ready_batch_count: 0,
            updated_at: now_rfc3339(),
            recent_hashes: VecDeque::new(),
            recent_captures: VecDeque::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct QueueState {
    updated_at: String,
    pending: VecDeque<CaptureRecord>,
}

impl Default for QueueState {
    fn default() -> Self {
        Self {
            updated_at: now_rfc3339(),
            pending: VecDeque::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum BatchTriggerReason {
    CaptureCount,
    MaxWait,
}

impl BatchTriggerReason {
    fn as_label(&self) -> &'static str {
        match self {
            Self::CaptureCount => "capture_count",
            Self::MaxWait => "max_wait",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchFile {
    id: String,
    status: String,
    created_at: String,
    trigger_reason: BatchTriggerReason,
    capture_count: usize,
    first_captured_at: String,
    last_captured_at: String,
    source_ids: Vec<String>,
    captures: Vec<CaptureRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentHashEntry {
    hash: String,
    captured_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilterLogEntry {
    id: String,
    captured_at: String,
    hash: String,
    reason: String,
    preview: String,
}

#[derive(Debug)]
struct StateData {
    settings: AppSettings,
    runtime: RuntimeState,
    pending_replay_hashes: VecDeque<RecentHashEntry>,
}

#[derive(Debug)]
struct SharedState {
    app_handle: AppHandle,
    default_knowledge_root: PathBuf,
    app_data_dir: PathBuf,
    settings_path: PathBuf,
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

        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

        let default_knowledge_root = home_dir.join("tino-inbox");
        let settings_path = app_data_dir.join(SETTINGS_FILE_NAME);
        let settings = load_settings(&settings_path, &default_knowledge_root)?;
        let knowledge_root = settings.knowledge_root_path();
        ensure_knowledge_root_layout(&knowledge_root)?;
        enforce_clipboard_retention(&knowledge_root, settings.clipboard_history_days)?;

        let queue_state = ensure_queue_state(&knowledge_root)?;
        let mut runtime = load_runtime_state(&knowledge_root)?;
        reconcile_clipboard_history(&knowledge_root, settings.clipboard_history_days, &runtime)?;
        runtime.recent_captures.clear();
        hydrate_runtime_preview_assets(&knowledge_root, &mut runtime)?;
        runtime.watch_status = STARTING_WATCH_STATUS.into();
        runtime.last_error = None;
        runtime.queue_depth = queue_state.pending.len();
        runtime.ready_batch_count = count_ready_batches(&knowledge_root)?;
        runtime.updated_at = now_rfc3339();

        let state = Self {
            shared: Arc::new(SharedState {
                app_handle: app.clone(),
                default_knowledge_root,
                app_data_dir,
                settings_path,
                inner: Mutex::new(StateData {
                    settings,
                    runtime,
                    pending_replay_hashes: VecDeque::new(),
                }),
            }),
        };

        state.persist_runtime_snapshot()?;

        Ok(state)
    }

    pub fn current_settings(&self) -> Result<AppSettings, String> {
        Ok(self.lock_state()?.settings.clone())
    }

    pub fn save_settings(&self, next: AppSettings) -> Result<AppSettings, String> {
        let normalized = next.normalized(&self.shared.default_knowledge_root);
        ensure_knowledge_root_layout(&normalized.knowledge_root_path())?;
        write_json_file(&self.shared.settings_path, &normalized)?;

        let knowledge_root = normalized.knowledge_root_path();
        enforce_clipboard_retention(&knowledge_root, normalized.clipboard_history_days)?;
        let queue_state = ensure_queue_state(&knowledge_root)?;
        let mut runtime = load_runtime_state(&knowledge_root)?;
        reconcile_clipboard_history(&knowledge_root, normalized.clipboard_history_days, &runtime)?;
        runtime.recent_captures.clear();
        hydrate_runtime_preview_assets(&knowledge_root, &mut runtime)?;
        runtime.watch_status = self.current_watch_status();
        runtime.last_error = self.current_last_error();
        runtime.queue_depth = queue_state.pending.len();
        runtime.ready_batch_count = count_ready_batches(&knowledge_root)?;
        runtime.updated_at = now_rfc3339();

        {
            let mut state = self.lock_state()?;
            state.settings = normalized.clone();
            state.runtime = runtime;
        }

        self.persist_runtime_snapshot()?;

        Ok(normalized)
    }

    pub fn dashboard_snapshot(&self, app: &AppHandle) -> Result<DashboardSnapshot, String> {
        let (settings, runtime, app_data_dir) = {
            let state = self.lock_state()?;
            (
                state.settings.clone(),
                state.runtime.clone(),
                self.shared.app_data_dir.display().to_string(),
            )
        };
        let queue_state = if settings.ai_enabled() {
            format!(
                "AI queue pending {} · ready batches {}",
                runtime.queue_depth, runtime.ready_batch_count
            )
        } else {
            format!(
                "AI queue paused with {} pending · ready batches {} until provider setup completes",
                runtime.queue_depth, runtime.ready_batch_count
            )
        };

        let batch_state = match &runtime.last_batch_reason {
            Some(reason) => format!(" · last batch {}", reason),
            None => String::new(),
        };
        let recent_captures = load_recent_clipboard_captures(
            &settings.knowledge_root_path(),
            settings.clipboard_history_days,
            3,
        )?;

        Ok(DashboardSnapshot {
            app_name: app.package_info().name.clone(),
            app_version: app.package_info().version.to_string(),
            build_channel: if cfg!(debug_assertions) {
                "debug".into()
            } else {
                "release".into()
            },
            os: std::env::consts::OS.into(),
            default_knowledge_root: settings.knowledge_root.clone(),
            app_data_dir,
            queue_policy: "20 captures or 10 minutes · exact-match dedupe in 5 minutes".into(),
            capture_mode: match &runtime.last_error {
                Some(error) => format!(
                    "{} · {}{} · last error: {}",
                    runtime.watch_status, queue_state, batch_state, error
                ),
                None => format!("{} · {}{}", runtime.watch_status, queue_state, batch_state),
            },
            recent_captures,
        })
    }

    pub fn clipboard_page(&self, request: ClipboardPageRequest) -> Result<ClipboardPage, String> {
        let settings = self.current_settings()?;
        query_clipboard_history_page(
            &settings.knowledge_root_path(),
            settings.clipboard_history_days,
            &request,
        )
    }

    pub fn process_capture(
        &self,
        capture: &CaptureRecord,
    ) -> Result<CaptureProcessingResult, String> {
        let settings = self.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        let captured_at = parse_captured_at(&capture.captured_at)?;
        let mut stored_capture = capture.clone();
        ensure_knowledge_root_layout(&knowledge_root)?;
        enforce_clipboard_retention(&knowledge_root, settings.clipboard_history_days)?;
        ensure_queue_state(&knowledge_root)?;

        if let Some(reason) = detect_filter_reason(&stored_capture) {
            append_filter_log(
                &knowledge_root,
                &FilterLogEntry {
                    id: stored_capture.id.clone(),
                    captured_at: stored_capture.captured_at.clone(),
                    hash: stored_capture.hash.clone(),
                    reason: reason.into(),
                    preview: build_preview(&stored_capture.raw_text),
                },
            )?;

            self.record_capture_outcome(
                &stored_capture,
                "filtered",
                None,
                Some(reason.into()),
                None,
                queue_depth_for_root(&knowledge_root)?,
                &captured_at,
            )?;

            return Ok(CaptureProcessingResult::Filtered {
                reason: reason.into(),
            });
        }

        if self.is_duplicate_capture(&stored_capture.hash, &captured_at)? {
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

        if stored_capture.content_kind == "image" {
            let persisted_assets = persist_image_assets(&knowledge_root, &stored_capture)?;
            stored_capture.asset_path = Some(persisted_assets.asset_path.display().to_string());
            stored_capture.thumbnail_path =
                Some(persisted_assets.thumbnail_path.display().to_string());
            stored_capture.image_bytes = None;
        }

        if let Some(source_app_icon_path) =
            persist_source_app_icon(&knowledge_root, &stored_capture)?
        {
            stored_capture.source_app_icon_path = Some(source_app_icon_path);
        }
        stored_capture.source_app_icon_bytes = None;

        let archive_path = daily_file_path(&knowledge_root, &stored_capture.captured_at)?;
        append_capture_to_daily_file(&archive_path, &knowledge_root, &stored_capture)?;

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
            }),
            queue_depth,
            &captured_at,
        )?;

        Ok(if settings.ai_enabled() {
            CaptureProcessingResult::Queued {
                path: archive_path,
                queue_depth,
            }
        } else {
            CaptureProcessingResult::Archived { path: archive_path }
        })
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
            queue_state.updated_at = now_rfc3339();
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

    pub fn register_replay_hash(&self, hash: String, captured_at: String) -> Result<(), String> {
        let replay_timestamp = parse_captured_at(&captured_at)?;

        {
            let mut state = self.lock_state()?;
            prune_recent_hashes(&mut state.pending_replay_hashes, &replay_timestamp);
            state
                .pending_replay_hashes
                .push_front(RecentHashEntry { hash, captured_at });
        }

        Ok(())
    }

    pub fn set_watch_running(&self) -> Result<(), String> {
        {
            let mut state = self.lock_state()?;
            state.runtime.watch_status = RUNNING_WATCH_STATUS.into();
            state.runtime.last_error = None;
            state.runtime.updated_at = now_rfc3339();
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
            state.runtime.updated_at = now_rfc3339();
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
            state.runtime.updated_at = now_rfc3339();
        }

        self.persist_runtime_snapshot()
    }

    fn is_duplicate_capture(
        &self,
        hash: &str,
        captured_at: &DateTime<FixedOffset>,
    ) -> Result<bool, String> {
        let mut state = self.lock_state()?;
        prune_recent_hashes(&mut state.runtime.recent_hashes, captured_at);
        prune_recent_hashes(&mut state.pending_replay_hashes, captured_at);

        if consume_matching_hash(&mut state.pending_replay_hashes, hash) {
            return Ok(false);
        }

        Ok(state
            .runtime
            .recent_hashes
            .iter()
            .any(|entry| entry.hash == hash))
    }

    fn record_capture_outcome(
        &self,
        capture: &CaptureRecord,
        status: &str,
        archive_path: Option<String>,
        filter_reason: Option<String>,
        accepted_hash: Option<RecentHashEntry>,
        queue_depth: usize,
        captured_at: &DateTime<FixedOffset>,
    ) -> Result<(), String> {
        let (knowledge_root, preview) = {
            let mut state = self.lock_state()?;
            let knowledge_root = state.settings.knowledge_root_path();
            prune_recent_hashes(&mut state.runtime.recent_hashes, captured_at);

            if let Some(accepted_hash) = accepted_hash {
                state.runtime.recent_hashes.push_front(accepted_hash);
            }

            state.runtime.watch_status = RUNNING_WATCH_STATUS.into();
            state.runtime.last_error = None;
            state.runtime.last_archive_path = archive_path;
            state.runtime.last_filter_reason = filter_reason;
            state.runtime.queue_depth = queue_depth;
            state.runtime.updated_at = now_rfc3339();
            state.runtime.recent_captures.clear();
            (knowledge_root, build_capture_preview(capture, status))
        };

        if should_persist_capture_history(status) {
            append_clipboard_history_entry(&knowledge_root, &preview)?;
        }
        self.persist_runtime_snapshot()?;
        self.emit_clipboard_updated();
        Ok(())
    }

    fn update_runtime_batch_metrics(
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
            state.runtime.updated_at = now_rfc3339();
        }

        self.persist_runtime_snapshot()
    }

    fn current_watch_status(&self) -> String {
        self.lock_state()
            .map(|state| state.runtime.watch_status.clone())
            .unwrap_or_else(|_| STARTING_WATCH_STATUS.into())
    }

    fn current_last_error(&self) -> Option<String> {
        self.lock_state()
            .ok()
            .and_then(|state| state.runtime.last_error.clone())
    }

    fn persist_runtime_snapshot(&self) -> Result<(), String> {
        let (knowledge_root, runtime) = {
            let state = self.lock_state()?;
            (state.settings.knowledge_root_path(), state.runtime.clone())
        };

        ensure_knowledge_root_layout(&knowledge_root)?;
        let runtime_path = runtime_file_path(&knowledge_root);
        write_json_file(&runtime_path, &runtime)
    }

    fn emit_clipboard_updated(&self) {
        let _ = self
            .shared
            .app_handle
            .emit(CLIPBOARD_CAPTURES_UPDATED_EVENT, ());
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, StateData>, String> {
        self.shared
            .inner
            .lock()
            .map_err(|_| "application state lock poisoned".to_string())
    }
}

fn matches_clipboard_filter(capture: &CapturePreview, filter: &str) -> bool {
    match filter {
        "all" | "" => true,
        "text" => matches!(capture.content_kind.as_str(), "plain_text" | "rich_text"),
        "link" => capture.content_kind == "link",
        "image" => capture.content_kind == "image",
        _ => true,
    }
}

fn matches_clipboard_search(capture: &CapturePreview, search: &str) -> bool {
    if search.is_empty() {
        return true;
    }

    [
        capture.source.as_str(),
        capture.source_app_name.as_deref().unwrap_or_default(),
        capture.source_app_bundle_id.as_deref().unwrap_or_default(),
        capture.preview.as_str(),
        capture.secondary_preview.as_deref().unwrap_or_default(),
        capture.raw_text.as_str(),
        capture.link_url.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_ascii_lowercase()
    .contains(search)
}

fn query_clipboard_history_page(
    knowledge_root: &Path,
    history_days: u16,
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
    let search = request
        .search
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let start = page.saturating_mul(page_size);
    let end = start.saturating_add(page_size);
    let mut captures = Vec::new();
    let mut summary = ClipboardPageSummary {
        total: 0,
        text: 0,
        links: 0,
        images: 0,
    };
    let mut filtered_total = 0usize;

    visit_clipboard_history_entries(knowledge_root, history_days, |capture| {
        if !should_persist_capture_history(&capture.status) {
            return Ok(());
        }

        if !matches_clipboard_search(capture, &search) {
            return Ok(());
        }

        match capture.content_kind.as_str() {
            "plain_text" | "rich_text" => summary.text += 1,
            "link" => summary.links += 1,
            "image" => summary.images += 1,
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

fn load_recent_clipboard_captures(
    knowledge_root: &Path,
    history_days: u16,
    limit: usize,
) -> Result<Vec<CapturePreview>, String> {
    let mut captures = Vec::new();

    visit_clipboard_history_entries(knowledge_root, history_days, |capture| {
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

fn append_clipboard_history_entry(
    knowledge_root: &Path,
    preview: &CapturePreview,
) -> Result<(), String> {
    let path = clipboard_history_file_path(knowledge_root, &preview.captured_at)?;
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

fn reconcile_clipboard_history(
    knowledge_root: &Path,
    history_days: u16,
    runtime: &RuntimeState,
) -> Result<(), String> {
    let mut entries_by_day = load_clipboard_history_entries_by_day(knowledge_root, history_days)?;
    let mut changed = false;

    for capture in runtime.recent_captures.iter().cloned() {
        changed |= upsert_clipboard_history_entry(&mut entries_by_day, capture)?;
    }

    for capture in load_daily_archive_history(knowledge_root, history_days)? {
        changed |= upsert_clipboard_history_entry(&mut entries_by_day, capture)?;
    }

    if changed {
        persist_clipboard_history_entries(knowledge_root, history_days, &entries_by_day)?;
    }

    Ok(())
}

fn visit_clipboard_history_entries<F>(
    knowledge_root: &Path,
    history_days: u16,
    mut visit: F,
) -> Result<(), String>
where
    F: FnMut(&CapturePreview) -> Result<(), String>,
{
    for history_path in clipboard_history_paths_desc(knowledge_root, history_days)? {
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
            visit(&capture)?;
        }
    }

    Ok(())
}

fn load_clipboard_history_entries_by_day(
    knowledge_root: &Path,
    history_days: u16,
) -> Result<BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>>, String> {
    let mut entries_by_day: BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>> = BTreeMap::new();

    for history_path in clipboard_history_paths_desc(knowledge_root, history_days)? {
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
    knowledge_root: &Path,
    history_days: u16,
    entries_by_day: &BTreeMap<NaiveDate, BTreeMap<String, CapturePreview>>,
) -> Result<(), String> {
    let history_dir = clipboard_history_dir_path(knowledge_root);
    fs::create_dir_all(&history_dir).map_err(|error| error.to_string())?;

    let retained_days = entries_by_day
        .keys()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();

    for history_path in clipboard_history_paths_desc(knowledge_root, history_days)? {
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

fn load_daily_archive_history(
    knowledge_root: &Path,
    history_days: u16,
) -> Result<Vec<CapturePreview>, String> {
    let mut captures = Vec::new();

    for path in daily_archive_paths_desc(knowledge_root, history_days)? {
        captures.extend(parse_daily_archive_history(&path)?);
    }

    Ok(captures)
}

fn daily_archive_paths_desc(
    knowledge_root: &Path,
    history_days: u16,
) -> Result<Vec<PathBuf>, String> {
    let dir = knowledge_root.join("daily");
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let cutoff = retention_cutoff_date(history_days);
    let mut paths = Vec::new();

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let Some(date) = path_date(&path) else {
            continue;
        };

        if date >= cutoff {
            paths.push((date, path));
        }
    }

    paths.sort_by(|left, right| right.0.cmp(&left.0));
    Ok(paths.into_iter().map(|(_, path)| path).collect())
}

fn parse_daily_archive_history(path: &Path) -> Result<Vec<CapturePreview>, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let lines = content.lines().collect::<Vec<_>>();
    let mut captures = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index];
        if !line.starts_with("## ") {
            index += 1;
            continue;
        }

        let Some((captured_at, id)) = parse_daily_entry_header(line) else {
            index += 1;
            continue;
        };
        index += 1;

        let mut capture = CaptureRecord {
            id,
            source: "clipboard".into(),
            source_app_name: None,
            source_app_bundle_id: None,
            source_app_icon_path: None,
            captured_at,
            ..CaptureRecord::default()
        };

        while index < lines.len() {
            let line = lines[index];

            if line.starts_with("## ") {
                break;
            }

            if let Some(value) = line.strip_prefix("- Source: ") {
                capture.source = value.to_string();
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Source App: ") {
                capture.source_app_name = Some(value.to_string());
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Source Bundle ID: ") {
                capture.source_app_bundle_id = Some(value.to_string());
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Source App Icon Path: ") {
                capture.source_app_icon_path = Some(value.to_string());
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Kind: ") {
                capture.content_kind = value.to_string();
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Hash: ") {
                capture.hash = value.to_string();
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- URL: ") {
                capture.link_url = Some(value.to_string());
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Dimensions: ") {
                if let Some((width, height)) = value.split_once('x') {
                    capture.image_width = width.parse::<u32>().ok();
                    capture.image_height = height.parse::<u32>().ok();
                }
                index += 1;
                continue;
            }

            if let Some(value) = line.strip_prefix("- Asset Size: ") {
                capture.byte_size = value
                    .strip_suffix(" bytes")
                    .and_then(|bytes| bytes.parse::<u64>().ok());
                index += 1;
                continue;
            }

            if line == "### Image Preview" {
                index += 1;

                while index < lines.len() {
                    let line = lines[index];
                    if line.starts_with("## ") || line.starts_with("### ") {
                        break;
                    }

                    if let Some(value) = line
                        .strip_prefix("- Asset Path: `")
                        .and_then(|raw| raw.strip_suffix('`'))
                    {
                        capture.asset_path = Some(value.to_string());
                    }

                    index += 1;
                }
                continue;
            }

            if line == "### Readable Text" {
                let (_, raw_text, next_index) = parse_fenced_block(&lines, index + 1)?;
                capture.raw_text = raw_text;
                index = next_index;
                continue;
            }

            if line == "### Raw Rich Representation" {
                let (format, raw_rich, next_index) = parse_fenced_block(&lines, index + 1)?;
                capture.raw_rich = Some(raw_rich);
                capture.raw_rich_format = Some(format);
                index = next_index;
                continue;
            }

            index += 1;
        }

        captures.push(build_capture_preview(&capture, "archived"));
    }

    Ok(captures)
}

fn parse_daily_entry_header(line: &str) -> Option<(String, String)> {
    let rest = line.strip_prefix("## ")?;
    let (captured_at, tail) = rest.split_once(" `")?;
    let id = tail.strip_suffix('`')?;
    Some((captured_at.to_string(), id.to_string()))
}

fn parse_fenced_block(
    lines: &[&str],
    start_index: usize,
) -> Result<(String, String, usize), String> {
    let mut index = start_index;
    while index < lines.len() && lines[index].trim().is_empty() {
        index += 1;
    }

    if index >= lines.len() {
        return Ok((String::new(), String::new(), index));
    }

    let opening = lines[index];
    let fence_len = opening.chars().take_while(|char| *char == '`').count();
    if fence_len < 3 {
        return Err(format!("invalid fenced block: {opening}"));
    }

    let fence = "`".repeat(fence_len);
    let language = opening[fence_len..].to_string();
    index += 1;

    let mut content = Vec::new();
    while index < lines.len() {
        if lines[index].trim() == fence {
            return Ok((language, content.join("\n"), index + 1));
        }

        content.push(lines[index]);
        index += 1;
    }

    Ok((language, content.join("\n"), index))
}

fn path_date(path: &Path) -> Option<NaiveDate> {
    let stem = path.file_stem()?.to_str()?;
    NaiveDate::parse_from_str(stem, "%Y-%m-%d").ok()
}

fn clipboard_history_paths_desc(
    knowledge_root: &Path,
    history_days: u16,
) -> Result<Vec<PathBuf>, String> {
    let dir = clipboard_history_dir_path(knowledge_root);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let cutoff = retention_cutoff_date(history_days);
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

#[derive(Default)]
struct ClipboardDayUsage {
    total_bytes: u64,
}

fn enforce_clipboard_retention(knowledge_root: &Path, history_days: u16) -> Result<(), String> {
    let cutoff = retention_cutoff_date(history_days);

    prune_dated_children(&knowledge_root.join("daily"), "md", cutoff)?;
    prune_dated_children(&assets_dir_path(knowledge_root), "", cutoff)?;
    prune_dated_children(&clipboard_history_dir_path(knowledge_root), "jsonl", cutoff)?;
    prune_queue_retention(knowledge_root, cutoff)?;
    prune_runtime_retention(knowledge_root, history_days)?;
    prune_batch_retention(knowledge_root, cutoff)?;
    prune_filter_log_retention(knowledge_root, cutoff)?;
    enforce_clipboard_storage_budget(knowledge_root)?;

    Ok(())
}

fn retention_cutoff_date(history_days: u16) -> NaiveDate {
    let keep_days = history_days.max(1) as i64;
    Local::now().date_naive() - Duration::days(keep_days - 1)
}

fn prune_queue_retention(knowledge_root: &Path, cutoff: NaiveDate) -> Result<(), String> {
    let mut queue_state = load_queue_state(knowledge_root)?;
    let original_len = queue_state.pending.len();
    queue_state
        .pending
        .retain(|capture| capture_date(&capture.captured_at).is_some_and(|date| date >= cutoff));

    if queue_state.pending.len() != original_len {
        queue_state.updated_at = now_rfc3339();
        persist_queue_state(knowledge_root, &queue_state)?;
    }

    Ok(())
}

fn prune_runtime_retention(knowledge_root: &Path, _history_days: u16) -> Result<(), String> {
    let runtime_path = runtime_file_path(knowledge_root);
    if !runtime_path.exists() {
        return Ok(());
    }

    let mut runtime = load_runtime_state(knowledge_root)?;
    let original_len = runtime.recent_captures.len();
    runtime.recent_captures.clear();

    if runtime.recent_captures.len() != original_len {
        runtime.updated_at = now_rfc3339();
        write_json_file(&runtime_path, &runtime)?;
    }

    Ok(())
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

fn prune_batch_retention(knowledge_root: &Path, cutoff: NaiveDate) -> Result<(), String> {
    let batches_dir = batches_dir_path(knowledge_root);
    if !batches_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&batches_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let batch =
            serde_json::from_slice::<BatchFile>(&bytes).map_err(|error| error.to_string())?;
        let keep = capture_date(&batch.last_captured_at).is_some_and(|date| date >= cutoff);

        if !keep {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn prune_filter_log_retention(knowledge_root: &Path, cutoff: NaiveDate) -> Result<(), String> {
    let path = filters_log_file_path(knowledge_root);
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut kept_entries = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let entry =
            serde_json::from_str::<FilterLogEntry>(line).map_err(|error| error.to_string())?;
        if capture_date(&entry.captured_at).is_some_and(|date| date >= cutoff) {
            kept_entries.push(entry);
        }
    }

    let serialized = if kept_entries.is_empty() {
        String::new()
    } else {
        let mut lines = kept_entries
            .into_iter()
            .map(|entry| serde_json::to_string(&entry).map_err(|error| error.to_string()))
            .collect::<Result<Vec<String>, String>>()?;
        lines.push(String::new());
        lines.join("\n")
    };

    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn enforce_clipboard_storage_budget(knowledge_root: &Path) -> Result<(), String> {
    let mut usage_by_day = collect_clipboard_day_usage(knowledge_root)?;
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

        remove_clipboard_day_data(knowledge_root, *date)?;
        total_bytes = total_bytes.saturating_sub(usage.total_bytes);
        removed_dates.push(*date);
    }

    if removed_dates.is_empty() {
        return Ok(());
    }

    prune_queue_dates(knowledge_root, &removed_dates)?;
    prune_batch_dates(knowledge_root, &removed_dates)?;
    prune_filter_log_dates(knowledge_root, &removed_dates)?;
    prune_runtime_retention(knowledge_root, 0)?;
    usage_by_day.clear();

    Ok(())
}

fn collect_clipboard_day_usage(
    knowledge_root: &Path,
) -> Result<BTreeMap<NaiveDate, ClipboardDayUsage>, String> {
    let mut usage_by_day = BTreeMap::new();

    collect_dated_file_usage(&knowledge_root.join("daily"), "md", &mut usage_by_day)?;
    collect_dated_file_usage(
        &clipboard_history_dir_path(knowledge_root),
        "jsonl",
        &mut usage_by_day,
    )?;
    collect_dated_dir_usage(&assets_dir_path(knowledge_root), &mut usage_by_day)?;

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

fn collect_dated_dir_usage(
    dir: &Path,
    usage_by_day: &mut BTreeMap<NaiveDate, ClipboardDayUsage>,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(date) = NaiveDate::parse_from_str(name, "%Y-%m-%d") else {
            continue;
        };

        usage_by_day.entry(date).or_default().total_bytes += dir_size_bytes(&path)?;
    }

    Ok(())
}

fn dir_size_bytes(dir: &Path) -> Result<u64, String> {
    let mut total = 0;

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let metadata = path.metadata().map_err(|error| error.to_string())?;
        if metadata.is_dir() {
            total += dir_size_bytes(&path)?;
        } else {
            total += metadata.len();
        }
    }

    Ok(total)
}

fn remove_clipboard_day_data(knowledge_root: &Path, date: NaiveDate) -> Result<(), String> {
    let day = date.format("%Y-%m-%d").to_string();
    let daily_path = knowledge_root.join("daily").join(format!("{day}.md"));
    if daily_path.exists() {
        fs::remove_file(daily_path).map_err(|error| error.to_string())?;
    }

    let history_path = clipboard_history_dir_path(knowledge_root).join(format!("{day}.jsonl"));
    if history_path.exists() {
        fs::remove_file(history_path).map_err(|error| error.to_string())?;
    }

    let asset_dir = assets_dir_path(knowledge_root).join(day);
    if asset_dir.exists() {
        fs::remove_dir_all(asset_dir).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn prune_queue_dates(knowledge_root: &Path, removed_dates: &[NaiveDate]) -> Result<(), String> {
    let mut queue_state = load_queue_state(knowledge_root)?;
    let original_len = queue_state.pending.len();
    queue_state.pending.retain(|capture| {
        !capture_date(&capture.captured_at)
            .is_some_and(|date| removed_dates.iter().any(|removed| *removed == date))
    });

    if queue_state.pending.len() != original_len {
        queue_state.updated_at = now_rfc3339();
        persist_queue_state(knowledge_root, &queue_state)?;
    }

    Ok(())
}

fn prune_batch_dates(knowledge_root: &Path, removed_dates: &[NaiveDate]) -> Result<(), String> {
    let batches_dir = batches_dir_path(knowledge_root);
    if !batches_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(&batches_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let batch =
            serde_json::from_slice::<BatchFile>(&bytes).map_err(|error| error.to_string())?;
        let should_remove = batch.captures.iter().any(|capture| {
            capture_date(&capture.captured_at)
                .is_some_and(|date| removed_dates.iter().any(|removed| *removed == date))
        });

        if should_remove {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn prune_filter_log_dates(
    knowledge_root: &Path,
    removed_dates: &[NaiveDate],
) -> Result<(), String> {
    let path = filters_log_file_path(knowledge_root);
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    let mut kept_entries = Vec::new();

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let entry =
            serde_json::from_str::<FilterLogEntry>(line).map_err(|error| error.to_string())?;
        let should_remove = capture_date(&entry.captured_at)
            .is_some_and(|date| removed_dates.iter().any(|removed| *removed == date));

        if !should_remove {
            kept_entries.push(entry);
        }
    }

    let serialized = if kept_entries.is_empty() {
        String::new()
    } else {
        let mut lines = kept_entries
            .into_iter()
            .map(|entry| serde_json::to_string(&entry).map_err(|error| error.to_string()))
            .collect::<Result<Vec<String>, String>>()?;
        lines.push(String::new());
        lines.join("\n")
    };

    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn capture_date(captured_at: &str) -> Option<NaiveDate> {
    parse_captured_at(captured_at)
        .ok()
        .map(|value| value.date_naive())
}

fn load_settings(
    settings_path: &Path,
    default_knowledge_root: &Path,
) -> Result<AppSettings, String> {
    let settings = if settings_path.exists() {
        let bytes = fs::read(settings_path).map_err(|error| error.to_string())?;
        serde_json::from_slice::<AppSettings>(&bytes).map_err(|error| error.to_string())?
    } else {
        AppSettings::defaults(default_knowledge_root)
    }
    .normalized(default_knowledge_root);

    write_json_file(settings_path, &settings)?;

    Ok(settings)
}

fn load_runtime_state(knowledge_root: &Path) -> Result<RuntimeState, String> {
    let runtime_path = runtime_file_path(knowledge_root);

    if !runtime_path.exists() {
        return Ok(RuntimeState::default());
    }

    let bytes = fs::read(runtime_path).map_err(|error| error.to_string())?;
    serde_json::from_slice::<RuntimeState>(&bytes).map_err(|error| error.to_string())
}

fn load_queue_state(knowledge_root: &Path) -> Result<QueueState, String> {
    let queue_path = queue_file_path(knowledge_root);

    if !queue_path.exists() {
        return Ok(QueueState::default());
    }

    let bytes = fs::read(queue_path).map_err(|error| error.to_string())?;
    serde_json::from_slice::<QueueState>(&bytes).map_err(|error| error.to_string())
}

fn ensure_queue_state(knowledge_root: &Path) -> Result<QueueState, String> {
    let queue_state = load_queue_state(knowledge_root)?;
    persist_queue_state(knowledge_root, &queue_state)?;
    Ok(queue_state)
}

fn persist_queue_state(knowledge_root: &Path, queue_state: &QueueState) -> Result<(), String> {
    let queue_path = queue_file_path(knowledge_root);
    write_json_file(&queue_path, queue_state)
}

fn enqueue_capture(knowledge_root: &Path, capture: &CaptureRecord) -> Result<usize, String> {
    let mut queue_state = load_queue_state(knowledge_root)?;
    queue_state.pending.push_back(capture.clone());
    queue_state.updated_at = now_rfc3339();
    let queue_depth = queue_state.pending.len();
    persist_queue_state(knowledge_root, &queue_state)?;
    Ok(queue_depth)
}

fn queue_depth_for_root(knowledge_root: &Path) -> Result<usize, String> {
    Ok(load_queue_state(knowledge_root)?.pending.len())
}

fn resolve_batch_trigger(
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

fn build_batch_file(
    captures: Vec<CaptureRecord>,
    trigger_reason: BatchTriggerReason,
) -> Result<BatchFile, String> {
    let first_capture = captures
        .first()
        .ok_or_else(|| "cannot build batch from empty capture set".to_string())?;
    let last_capture = captures
        .last()
        .ok_or_else(|| "cannot build batch from empty capture set".to_string())?;
    let created_at = now_rfc3339();

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

fn count_ready_batches(knowledge_root: &Path) -> Result<usize, String> {
    let batches_dir = batches_dir_path(knowledge_root);
    if !batches_dir.exists() {
        return Ok(0);
    }

    let entries = fs::read_dir(batches_dir).map_err(|error| error.to_string())?;
    let mut count = 0;

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.path().extension().and_then(|ext| ext.to_str()) == Some("json") {
            count += 1;
        }
    }

    Ok(count)
}

fn parse_captured_at(captured_at: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(captured_at).map_err(|error| error.to_string())
}

fn daily_file_path(knowledge_root: &Path, captured_at: &str) -> Result<PathBuf, String> {
    let captured_at = parse_captured_at(captured_at)?;
    let date = captured_at.format("%Y-%m-%d").to_string();

    Ok(knowledge_root.join("daily").join(format!("{date}.md")))
}

fn batch_file_path(knowledge_root: &Path, batch_id: &str) -> PathBuf {
    batches_dir_path(knowledge_root).join(format!("{batch_id}.json"))
}

fn clipboard_history_file_path(
    knowledge_root: &Path,
    captured_at: &str,
) -> Result<PathBuf, String> {
    let captured_at = parse_captured_at(captured_at)?;
    let date = captured_at.format("%Y-%m-%d").to_string();

    Ok(clipboard_history_dir_path(knowledge_root).join(format!("{date}.jsonl")))
}

fn append_capture_to_daily_file(
    path: &Path,
    knowledge_root: &Path,
    capture: &CaptureRecord,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut content = if path.exists() {
        fs::read_to_string(path).map_err(|error| error.to_string())?
    } else {
        let captured_at = parse_captured_at(&capture.captured_at)?;
        format!(
            "# Daily Capture Archive {}\n",
            captured_at.format("%Y-%m-%d")
        )
    };

    if !content.ends_with('\n') {
        content.push('\n');
    }

    content.push('\n');
    content.push_str(&render_capture_entry(capture, knowledge_root));
    fs::write(path, content).map_err(|error| error.to_string())
}

fn render_capture_entry(capture: &CaptureRecord, knowledge_root: &Path) -> String {
    let mut entry = String::new();
    entry.push_str(&format!("## {} `{}`\n", capture.captured_at, capture.id));
    entry.push_str(&format!("- Source: {}\n", capture.source));
    if let Some(source_app_name) = &capture.source_app_name {
        entry.push_str(&format!("- Source App: {}\n", source_app_name));
    }
    if let Some(source_app_bundle_id) = &capture.source_app_bundle_id {
        entry.push_str(&format!("- Source Bundle ID: {}\n", source_app_bundle_id));
    }
    if let Some(source_app_icon_path) = &capture.source_app_icon_path {
        entry.push_str(&format!(
            "- Source App Icon Path: {}\n",
            source_app_icon_path
        ));
    }
    entry.push_str(&format!("- Kind: {}\n", capture.content_kind));
    entry.push_str(&format!("- Hash: {}\n\n", capture.hash));

    if let Some(link_url) = &capture.link_url {
        entry.push_str(&format!("- URL: {}\n\n", link_url));
    }

    if let (Some(width), Some(height)) = (capture.image_width, capture.image_height) {
        entry.push_str(&format!("- Dimensions: {}x{}\n", width, height));
    }

    if let Some(byte_size) = capture.byte_size {
        entry.push_str(&format!("- Asset Size: {} bytes\n", byte_size));
    }

    if capture.image_width.is_some() || capture.byte_size.is_some() {
        entry.push('\n');
    }

    if capture.content_kind == "image" {
        if let Some(asset_path) = &capture.asset_path {
            let markdown_asset_path = markdown_asset_path(knowledge_root, asset_path)
                .unwrap_or_else(|| asset_path.clone());
            entry.push_str("### Image Preview\n");
            entry.push_str(&format!("![Clipboard image]({})\n\n", markdown_asset_path));
            entry.push_str(&format!("- Asset Path: `{}`\n\n", asset_path));
        }
    }

    entry.push_str("### Readable Text\n");
    entry.push_str(&render_code_block("text", &capture.raw_text));

    if let (Some(raw_rich), Some(raw_rich_format)) = (&capture.raw_rich, &capture.raw_rich_format) {
        entry.push_str("\n### Raw Rich Representation\n");
        entry.push_str(&render_code_block(raw_rich_format, raw_rich));
    }

    entry
}

fn render_code_block(language: &str, content: &str) -> String {
    let longest_tick_run = content.split('`').map(str::len).max().unwrap_or_default();
    let fence = "`".repeat(longest_tick_run.max(2) + 1);

    format!("{fence}{language}\n{content}\n{fence}\n")
}

fn detect_filter_reason(capture: &CaptureRecord) -> Option<&'static str> {
    if capture.content_kind == "image" {
        return None;
    }

    let trimmed = capture.raw_text.trim();
    let char_count = trimmed.chars().count();

    if char_count < MIN_CAPTURE_TEXT_CHARS {
        return Some("text_too_short");
    }

    let single_line = trimmed.lines().count() == 1;
    if single_line && looks_like_otp(trimmed) {
        return Some("otp_or_verification_code");
    }

    None
}

struct PersistedImageAssets {
    asset_path: PathBuf,
    thumbnail_path: PathBuf,
}

fn persist_image_assets(
    knowledge_root: &Path,
    capture: &CaptureRecord,
) -> Result<PersistedImageAssets, String> {
    let image_bytes = capture
        .image_bytes
        .as_ref()
        .ok_or_else(|| format!("image capture {} is missing in-memory bytes", capture.id))?;
    let captured_at = parse_captured_at(&capture.captured_at)?;
    let asset_dir =
        assets_dir_path(knowledge_root).join(captured_at.format("%Y-%m-%d").to_string());
    fs::create_dir_all(&asset_dir).map_err(|error| error.to_string())?;

    let asset_path = asset_dir.join(format!("{}.png", capture.id));
    let thumbnail_path = thumbnail_path_for_asset(&asset_path);
    fs::write(&asset_path, image_bytes).map_err(|error| error.to_string())?;
    write_thumbnail_image(image_bytes, &thumbnail_path)?;

    Ok(PersistedImageAssets {
        asset_path,
        thumbnail_path,
    })
}

fn write_thumbnail_image(image_bytes: &[u8], thumbnail_path: &Path) -> Result<(), String> {
    let decoded = image::load_from_memory(image_bytes).map_err(|error| error.to_string())?;
    let thumbnail = decoded.thumbnail(IMAGE_THUMBNAIL_MAX_EDGE, IMAGE_THUMBNAIL_MAX_EDGE);
    thumbnail
        .save_with_format(thumbnail_path, ImageFormat::Png)
        .map_err(|error| error.to_string())
}

fn thumbnail_path_for_asset(asset_path: &Path) -> PathBuf {
    let stem = asset_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("clipboard-image");
    asset_path.with_file_name(format!("{stem}.thumb.png"))
}

fn persist_source_app_icon(
    knowledge_root: &Path,
    capture: &CaptureRecord,
) -> Result<Option<String>, String> {
    if let Some(existing_path) = &capture.source_app_icon_path {
        if Path::new(existing_path).exists() {
            return Ok(Some(existing_path.clone()));
        }
    }

    let Some(icon_bytes) = capture.source_app_icon_bytes.as_deref() else {
        return Ok(capture.source_app_icon_path.clone());
    };

    let cache_key = app_icon_cache_key(
        capture.source_app_bundle_id.as_deref(),
        capture.source_app_name.as_deref(),
    );
    let icon_path = app_icons_dir_path(knowledge_root).join(format!("{cache_key}.png"));

    if !icon_path.exists() {
        fs::create_dir_all(app_icons_dir_path(knowledge_root))
            .map_err(|error| error.to_string())?;
        if let Err(error) = write_app_icon_png(icon_bytes, &icon_path) {
            log::warn!(
                "failed to persist source app icon for {:?} / {:?}: {}",
                capture.source_app_name,
                capture.source_app_bundle_id,
                error
            );
            return Ok(None);
        }
    }

    Ok(Some(icon_path.display().to_string()))
}

fn app_icon_cache_key(bundle_id: Option<&str>, app_name: Option<&str>) -> String {
    let raw = bundle_id
        .filter(|value| !value.trim().is_empty())
        .or(app_name.filter(|value| !value.trim().is_empty()))
        .unwrap_or("clipboard-source");
    let sanitized = raw
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() {
                char.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('-');

    if trimmed.is_empty() {
        "clipboard-source".into()
    } else {
        trimmed.into()
    }
}

fn write_app_icon_png(icon_bytes: &[u8], icon_path: &Path) -> Result<(), String> {
    fs::write(icon_path, icon_bytes).map_err(|error| error.to_string())
}

fn hydrate_runtime_preview_assets(
    knowledge_root: &Path,
    runtime: &mut RuntimeState,
) -> Result<(), String> {
    for capture in &mut runtime.recent_captures {
        hydrate_capture_preview_assets(knowledge_root, capture)?;
    }

    Ok(())
}

fn hydrate_capture_preview_assets(
    _knowledge_root: &Path,
    capture: &mut CapturePreview,
) -> Result<(), String> {
    if capture.content_kind != "image" {
        return Ok(());
    }

    let Some(asset_path) = capture.asset_path.as_deref() else {
        return Ok(());
    };

    let asset_path = PathBuf::from(asset_path);
    if !asset_path.exists() {
        return Ok(());
    }

    let thumbnail_path = capture
        .thumbnail_path
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| thumbnail_path_for_asset(&asset_path));

    if !thumbnail_path.exists() {
        let image_bytes = fs::read(&asset_path).map_err(|error| error.to_string())?;
        write_thumbnail_image(&image_bytes, &thumbnail_path)?;
    }

    capture.thumbnail_path = Some(thumbnail_path.display().to_string());

    Ok(())
}

fn build_capture_preview(capture: &CaptureRecord, status: &str) -> CapturePreview {
    CapturePreview {
        id: capture.id.clone(),
        source: capture.source.clone(),
        source_app_name: capture.source_app_name.clone(),
        source_app_bundle_id: capture.source_app_bundle_id.clone(),
        source_app_icon_path: capture.source_app_icon_path.clone(),
        content_kind: capture.content_kind.clone(),
        preview: match capture.content_kind.as_str() {
            "image" => "Clipboard image".into(),
            "link" => capture
                .link_url
                .as_deref()
                .map(build_link_display)
                .unwrap_or_else(|| build_preview(&capture.raw_text)),
            _ => build_preview(&capture.raw_text),
        },
        secondary_preview: build_capture_secondary_preview(capture),
        captured_at: capture.captured_at.clone(),
        status: status.into(),
        raw_text: capture.raw_text.clone(),
        raw_rich: capture.raw_rich.clone(),
        raw_rich_format: capture.raw_rich_format.clone(),
        link_url: capture.link_url.clone(),
        asset_path: capture.asset_path.clone(),
        thumbnail_path: capture.thumbnail_path.clone(),
        image_width: capture.image_width,
        image_height: capture.image_height,
        byte_size: capture.byte_size,
    }
}

fn build_capture_secondary_preview(capture: &CaptureRecord) -> Option<String> {
    match capture.content_kind.as_str() {
        "image" => {
            let mut parts = Vec::new();

            if let (Some(width), Some(height)) = (capture.image_width, capture.image_height) {
                parts.push(format!("{}x{}", width, height));
            }

            if let Some(byte_size) = capture.byte_size {
                parts.push(format_bytes(byte_size));
            }

            if parts.is_empty() {
                None
            } else {
                Some(parts.join(" · "))
            }
        }
        "link" => capture
            .link_url
            .as_deref()
            .map(|link_url| build_link_secondary_preview(link_url, &capture.raw_text)),
        _ => {
            let line_count = capture.raw_text.lines().count().max(1);
            Some(format!(
                "{} line{} · {} chars",
                line_count,
                if line_count == 1 { "" } else { "s" },
                capture.raw_text.chars().count()
            ))
        }
    }
}

fn build_link_display(link_url: &str) -> String {
    let normalized = link_url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.");
    let compact = normalized.split_whitespace().next().unwrap_or(normalized);
    let mut preview = compact.chars().take(80).collect::<String>();

    if compact.chars().count() > 80 {
        preview.push('…');
    }

    preview
}

fn build_link_secondary_preview(link_url: &str, fallback: &str) -> String {
    let normalized = link_url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let host = normalized.split('/').next().unwrap_or(normalized);

    if host.is_empty() {
        build_preview(fallback)
    } else {
        host.to_string()
    }
}

fn should_persist_capture_history(status: &str) -> bool {
    matches!(status, "archived" | "queued")
}

fn markdown_asset_path(knowledge_root: &Path, asset_path: &str) -> Option<String> {
    let relative_asset_path = Path::new(asset_path).strip_prefix(knowledge_root).ok()?;
    Some(format!("../{}", relative_asset_path.display()))
}

fn app_icons_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(APP_ICONS_DIR_NAME)
}

fn format_bytes(byte_size: u64) -> String {
    if byte_size < 1024 {
        return format!("{byte_size} B");
    }

    let kib = byte_size as f64 / 1024.0;
    if kib < 1024.0 {
        return format!("{kib:.1} KB");
    }

    format!("{:.1} MB", kib / 1024.0)
}

fn looks_like_otp(input: &str) -> bool {
    let digits_only = input.chars().all(|char| char.is_ascii_digit());
    digits_only && input.chars().count() >= 4 && input.chars().count() <= OTP_MAX_CHARS
}

fn append_filter_log(knowledge_root: &Path, entry: &FilterLogEntry) -> Result<(), String> {
    let filters_log_path = filters_log_file_path(knowledge_root);

    if let Some(parent) = filters_log_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(filters_log_path)
        .map_err(|error| error.to_string())?;
    let serialized = serde_json::to_string(entry).map_err(|error| error.to_string())?;
    file.write_all(serialized.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|error| error.to_string())
}

fn prune_recent_hashes(
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

fn consume_matching_hash(recent_hashes: &mut VecDeque<RecentHashEntry>, hash: &str) -> bool {
    let Some(index) = recent_hashes.iter().position(|entry| entry.hash == hash) else {
        return false;
    };

    recent_hashes.remove(index);
    true
}

fn runtime_file_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(RUNTIME_FILE_NAME)
}

fn queue_file_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(QUEUE_FILE_NAME)
}

fn filters_log_file_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(FILTERS_LOG_FILE_NAME)
}

fn assets_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join(ASSETS_DIR_NAME)
}

fn clipboard_history_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root
        .join("_system")
        .join(CLIPBOARD_HISTORY_DIR_NAME)
}

fn batches_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(BATCHES_DIR_NAME)
}

fn ensure_knowledge_root_layout(knowledge_root: &Path) -> Result<(), String> {
    fs::create_dir_all(knowledge_root.join("daily")).map_err(|error| error.to_string())?;
    fs::create_dir_all(knowledge_root.join("_system")).map_err(|error| error.to_string())?;
    fs::create_dir_all(assets_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(clipboard_history_dir_path(knowledge_root))
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(app_icons_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(batches_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    Ok(())
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

fn build_preview(raw_text: &str) -> String {
    let compact = raw_text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = compact.chars().take(120).collect::<String>();

    if compact.chars().count() > 120 {
        preview.push('…');
    }

    preview
}

fn expand_home_path(input: &str, default_knowledge_root: &Path) -> PathBuf {
    if let Some(stripped) = input.strip_prefix("~/") {
        if let Some(home_dir) = default_knowledge_root.parent() {
            return home_dir.join(stripped);
        }
    }

    PathBuf::from(input)
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339()
}
