use chrono::{DateTime, Duration, FixedOffset, Local};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const SETTINGS_FILE_NAME: &str = "settings.json";
const RUNTIME_FILE_NAME: &str = "runtime.json";
const QUEUE_FILE_NAME: &str = "queue.json";
const FILTERS_LOG_FILE_NAME: &str = "filters.log";
const BATCHES_DIR_NAME: &str = "batches";
const ASSETS_DIR_NAME: &str = "assets";
const RECENT_CAPTURE_LIMIT: usize = 60;
const BATCH_TRIGGER_SIZE: usize = 20;
const BATCH_TRIGGER_MAX_WAIT_MINUTES: i64 = 10;
const DEFAULT_PROVIDER_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-5.4-mini";
const RUNNING_WATCH_STATUS: &str = "Rust clipboard poller active";
const STARTING_WATCH_STATUS: &str = "Rust clipboard poller starting";
const DEDUP_WINDOW_MINUTES: i64 = 5;
const MIN_CAPTURE_TEXT_CHARS: usize = 4;
const OTP_MAX_CHARS: usize = 8;
const SECRET_MIN_CHARS: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub knowledge_root: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl AppSettings {
    fn defaults(default_knowledge_root: &Path) -> Self {
        Self {
            knowledge_root: default_knowledge_root.display().to_string(),
            base_url: DEFAULT_PROVIDER_BASE_URL.into(),
            api_key: String::new(),
            model: DEFAULT_MODEL.into(),
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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CaptureRecord {
    pub id: String,
    pub source: String,
    pub captured_at: String,
    pub content_kind: String,
    pub raw_text: String,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
    pub hash: String,
    #[serde(skip, default)]
    pub image_bytes: Option<Vec<u8>>,
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

#[derive(Debug, Clone, Serialize)]
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
        ensure_knowledge_root_layout(&settings.knowledge_root_path())?;

        let queue_state = ensure_queue_state(&settings.knowledge_root_path())?;
        let mut runtime = load_runtime_state(&settings.knowledge_root_path())?;
        runtime.watch_status = STARTING_WATCH_STATUS.into();
        runtime.last_error = None;
        runtime.queue_depth = queue_state.pending.len();
        runtime.ready_batch_count = count_ready_batches(&settings.knowledge_root_path())?;
        runtime.updated_at = now_rfc3339();

        let state = Self {
            shared: Arc::new(SharedState {
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
        let queue_state = ensure_queue_state(&knowledge_root)?;
        let mut runtime = load_runtime_state(&knowledge_root)?;
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
        let state = self.lock_state()?;
        let queue_state = if state.settings.ai_enabled() {
            format!(
                "AI queue pending {} · ready batches {}",
                state.runtime.queue_depth, state.runtime.ready_batch_count
            )
        } else {
            format!(
                "AI queue paused with {} pending · ready batches {} until provider setup completes",
                state.runtime.queue_depth, state.runtime.ready_batch_count
            )
        };

        let batch_state = match &state.runtime.last_batch_reason {
            Some(reason) => format!(" · last batch {}", reason),
            None => String::new(),
        };

        Ok(DashboardSnapshot {
            app_name: app.package_info().name.clone(),
            app_version: app.package_info().version.to_string(),
            build_channel: if cfg!(debug_assertions) {
                "debug".into()
            } else {
                "release".into()
            },
            os: std::env::consts::OS.into(),
            default_knowledge_root: state.settings.knowledge_root.clone(),
            app_data_dir: self.shared.app_data_dir.display().to_string(),
            queue_policy: "20 captures or 10 minutes · exact-match dedupe in 5 minutes".into(),
            capture_mode: match &state.runtime.last_error {
                Some(error) => format!(
                    "{} · {}{} · last error: {}",
                    state.runtime.watch_status, queue_state, batch_state, error
                ),
                None => format!(
                    "{} · {}{}",
                    state.runtime.watch_status, queue_state, batch_state
                ),
            },
            recent_captures: state.runtime.recent_captures.iter().cloned().collect(),
        })
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
        ensure_queue_state(&knowledge_root)?;

        if stored_capture.content_kind == "image" {
            let asset_path = persist_image_asset(&knowledge_root, &stored_capture)?;
            stored_capture.asset_path = Some(asset_path.display().to_string());
            stored_capture.image_bytes = None;
        }

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
            state.pending_replay_hashes.push_front(RecentHashEntry { hash, captured_at });
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

        self.persist_runtime_snapshot()
    }

    pub fn set_watch_error(&self, error: impl Into<String>) -> Result<(), String> {
        let error = error.into();

        {
            let mut state = self.lock_state()?;
            state.runtime.watch_status = "Rust clipboard poller retrying".into();
            state.runtime.last_error = Some(error);
            state.runtime.updated_at = now_rfc3339();
        }

        self.persist_runtime_snapshot()
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
        {
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
            state.runtime.updated_at = now_rfc3339();
            state
                .runtime
                .recent_captures
                .push_front(build_capture_preview(capture, status));

            while state.runtime.recent_captures.len() > RECENT_CAPTURE_LIMIT {
                state.runtime.recent_captures.pop_back();
            }
        }

        self.persist_runtime_snapshot()
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

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, StateData>, String> {
        self.shared
            .inner
            .lock()
            .map_err(|_| "application state lock poisoned".to_string())
    }
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
            let markdown_asset_path =
                markdown_asset_path(knowledge_root, asset_path).unwrap_or_else(|| asset_path.clone());
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

    if looks_like_secret(trimmed) {
        return Some("secret_like_content");
    }

    None
}

fn persist_image_asset(knowledge_root: &Path, capture: &CaptureRecord) -> Result<PathBuf, String> {
    let image_bytes = capture
        .image_bytes
        .as_ref()
        .ok_or_else(|| format!("image capture {} is missing in-memory bytes", capture.id))?;
    let captured_at = parse_captured_at(&capture.captured_at)?;
    let asset_dir = assets_dir_path(knowledge_root).join(captured_at.format("%Y-%m-%d").to_string());
    fs::create_dir_all(&asset_dir).map_err(|error| error.to_string())?;

    let asset_path = asset_dir.join(format!("{}.png", capture.id));
    fs::write(&asset_path, image_bytes).map_err(|error| error.to_string())?;

    Ok(asset_path)
}

fn build_capture_preview(capture: &CaptureRecord, status: &str) -> CapturePreview {
    CapturePreview {
        id: capture.id.clone(),
        source: capture.source.clone(),
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

fn markdown_asset_path(knowledge_root: &Path, asset_path: &str) -> Option<String> {
    let relative_asset_path = Path::new(asset_path).strip_prefix(knowledge_root).ok()?;
    Some(format!("../{}", relative_asset_path.display()))
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

fn looks_like_secret(input: &str) -> bool {
    let normalized = input.trim();
    let lower = normalized.to_ascii_lowercase();

    if lower.contains("private key") || lower.contains("authorization: bearer") {
        return true;
    }

    if normalized.starts_with("sk-")
        || normalized.starts_with("ghp_")
        || normalized.starts_with("github_pat_")
        || normalized.starts_with("xoxb-")
        || normalized.starts_with("xoxp-")
    {
        return true;
    }

    normalized.chars().count() >= SECRET_MIN_CHARS
        && !normalized.contains(char::is_whitespace)
        && normalized
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '_' | '-' | '=' | '.'))
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

fn consume_matching_hash(
    recent_hashes: &mut VecDeque<RecentHashEntry>,
    hash: &str,
) -> bool {
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

fn batches_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(BATCHES_DIR_NAME)
}

fn ensure_knowledge_root_layout(knowledge_root: &Path) -> Result<(), String> {
    fs::create_dir_all(knowledge_root.join("daily")).map_err(|error| error.to_string())?;
    fs::create_dir_all(knowledge_root.join("_system")).map_err(|error| error.to_string())?;
    fs::create_dir_all(assets_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
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
