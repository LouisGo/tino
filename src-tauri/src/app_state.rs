use chrono::{DateTime, Duration, FixedOffset, Local, NaiveDate};
use image::ImageFormat;
use log::warn;
use serde::{Deserialize, Serialize};
use specta::Type;
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
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use uuid::Uuid;

use crate::locale::AppLocalePreference;
use crate::runtime_profile;
use crate::storage::capture_history_store::{
    CaptureHistoryEntry, CaptureHistoryQuery, CaptureHistoryStore, CaptureHistorySummary,
    CaptureHistoryUpsert,
};

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
const MIN_CLIPBOARD_HISTORY_DAYS: u16 = 1;
const MAX_CLIPBOARD_HISTORY_DAYS: u16 = 14;
const MAX_CLIPBOARD_STORAGE_BYTES: u64 = 256 * 1024 * 1024;
const CLIPBOARD_CAPTURES_UPDATED_EVENT: &str = "clipboard-captures-updated";
const RUNNING_WATCH_STATUS: &str = "Rust clipboard poller active";
const STARTING_WATCH_STATUS: &str = "Rust clipboard poller starting";
const DEDUP_WINDOW_MINUTES: i64 = 5;
const MIN_CAPTURE_TEXT_CHARS: usize = 4;
const OTP_MAX_CHARS: usize = 8;
const GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID: &str = "shell.toggleMainWindow";
const GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_DEFAULT: &str = "CommandOrControl+Shift+Alt+T";
const GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID: &str = "shell.toggleClipboardWindow";
const GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_DEFAULT: &str = "CommandOrControl+Shift+Alt+V";

fn default_clipboard_history_days() -> u16 {
    DEFAULT_CLIPBOARD_HISTORY_DAYS
}

#[derive(Debug, Clone, Copy)]
struct AppGlobalShortcutSpec {
    id: &'static str,
    default_accelerator: &'static str,
}

const APP_GLOBAL_SHORTCUT_SPECS: [AppGlobalShortcutSpec; 2] = [
    AppGlobalShortcutSpec {
        id: GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID,
        default_accelerator: GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_DEFAULT,
    },
    AppGlobalShortcutSpec {
        id: GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID,
        default_accelerator: GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_DEFAULT,
    },
];

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppShortcutOverride {
    #[serde(default)]
    pub accelerator: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub knowledge_root: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub locale_preference: AppLocalePreference,
    #[serde(default = "default_clipboard_history_days")]
    pub clipboard_history_days: u16,
    #[serde(default)]
    pub shortcut_overrides: BTreeMap<String, AppShortcutOverride>,
}

impl AppSettings {
    fn defaults(default_knowledge_root: &Path) -> Self {
        Self {
            knowledge_root: default_knowledge_root.display().to_string(),
            base_url: DEFAULT_PROVIDER_BASE_URL.into(),
            api_key: String::new(),
            model: DEFAULT_MODEL.into(),
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: DEFAULT_CLIPBOARD_HISTORY_DAYS,
            shortcut_overrides: BTreeMap::new(),
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

        self.locale_preference = self.locale_preference.normalized();

        self.clipboard_history_days = self
            .clipboard_history_days
            .clamp(MIN_CLIPBOARD_HISTORY_DAYS, MAX_CLIPBOARD_HISTORY_DAYS);

        self.shortcut_overrides = self
            .shortcut_overrides
            .into_iter()
            .filter_map(|(shortcut_id, shortcut_override)| {
                let shortcut_id = shortcut_id.trim();
                if shortcut_id.is_empty() {
                    return None;
                }

                let accelerator = shortcut_override
                    .accelerator
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());

                Some((shortcut_id.to_string(), AppShortcutOverride { accelerator }))
            })
            .collect();

        self
    }

    pub fn knowledge_root_path(&self) -> PathBuf {
        PathBuf::from(&self.knowledge_root)
    }

    fn ai_enabled(&self) -> bool {
        !self.api_key.trim().is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedAppGlobalShortcut {
    id: &'static str,
    accelerator: String,
}

fn resolve_app_global_shortcuts(settings: &AppSettings) -> Vec<ResolvedAppGlobalShortcut> {
    APP_GLOBAL_SHORTCUT_SPECS
        .iter()
        .filter_map(|shortcut| {
            let accelerator = match settings.shortcut_overrides.get(shortcut.id) {
                Some(shortcut_override) => shortcut_override.accelerator.clone(),
                None => Some(shortcut.default_accelerator.to_string()),
            }?;

            Some(ResolvedAppGlobalShortcut {
                id: shortcut.id,
                accelerator,
            })
        })
        .collect()
}

fn execute_app_global_shortcut(app: &AppHandle, shortcut_id: &str) -> Result<(), String> {
    match shortcut_id {
        GLOBAL_SHORTCUT_TOGGLE_MAIN_WINDOW_ID => {
            crate::toggle_main_window_visibility(app).map(|_| ())
        }
        GLOBAL_SHORTCUT_TOGGLE_CLIPBOARD_WINDOW_ID => {
            crate::toggle_clipboard_window_visibility(app).map(|_| ())
        }
        _ => Err(format!("unknown app global shortcut: {shortcut_id}")),
    }
}

fn register_app_global_shortcut(
    app: &AppHandle,
    shortcut: &ResolvedAppGlobalShortcut,
) -> Result<(), String> {
    let shortcut_id = shortcut.id;
    let accelerator = shortcut.accelerator.clone();
    let accelerator_for_log = accelerator.clone();

    app.global_shortcut()
        .on_shortcut(accelerator.as_str(), move |app_handle, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            if let Err(error) = execute_app_global_shortcut(app_handle, shortcut_id) {
                warn!(
                    "failed to execute app global shortcut {} ({}): {}",
                    shortcut_id, accelerator_for_log, error
                );
            }
        })
        .map_err(|error| error.to_string())
}

fn sync_app_global_shortcuts(
    app: &AppHandle,
    previous: Option<&AppSettings>,
    next: &AppSettings,
) -> Result<(), String> {
    let previous_shortcuts = previous
        .map(resolve_app_global_shortcuts)
        .unwrap_or_default();
    let next_shortcuts = resolve_app_global_shortcuts(next);
    let shortcut_manager = app.global_shortcut();
    let mut register_errors = Vec::new();

    for shortcut in previous_shortcuts.iter().filter(|shortcut| {
        !next_shortcuts
            .iter()
            .any(|candidate| candidate == *shortcut)
    }) {
        if let Err(error) = shortcut_manager.unregister(shortcut.accelerator.as_str()) {
            warn!(
                "failed to unregister app global shortcut {} ({}): {}",
                shortcut.id, shortcut.accelerator, error
            );
        }
    }

    for shortcut in next_shortcuts.iter().filter(|shortcut| {
        !previous_shortcuts
            .iter()
            .any(|candidate| candidate == *shortcut)
    }) {
        if let Err(error) = register_app_global_shortcut(app, shortcut) {
            register_errors.push(format!(
                "{} ({}): {}",
                shortcut.id, shortcut.accelerator, error
            ));
        }
    }

    if register_errors.is_empty() {
        Ok(())
    } else {
        Err(register_errors.join("; "))
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
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

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPageSummary {
    pub total: usize,
    pub text: usize,
    pub links: usize,
    pub images: usize,
}

#[derive(Debug, Clone, Serialize, Type)]
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

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteClipboardCaptureResult {
    pub id: String,
    pub removed_from_history: bool,
    pub removed_from_store: bool,
    pub deleted: bool,
}

#[derive(Debug, Clone)]
pub struct ClipboardWindowTarget {
    pub app_name: Option<String>,
    pub bundle_id: Option<String>,
    pub process_id: i32,
}

#[derive(Debug, Clone, Deserialize, Type)]
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
    Reused,
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
    #[serde(default)]
    capture_id: Option<String>,
}

#[derive(Debug)]
enum CaptureHashDisposition {
    Fresh,
    Duplicate,
    Reused(RecentHashEntry),
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
    clipboard_window_target: Option<ClipboardWindowTarget>,
}

#[derive(Debug)]
struct SharedState {
    app_handle: AppHandle,
    default_knowledge_root: PathBuf,
    app_data_dir: PathBuf,
    app_log_dir: PathBuf,
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
        let app_log_dir = app
            .path()
            .app_log_dir()
            .map_err(|error| error.to_string())?;

        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        fs::create_dir_all(&app_log_dir).map_err(|error| error.to_string())?;

        let default_knowledge_root = runtime_profile::default_knowledge_root(&home_dir);
        let settings_path = app_data_dir.join(SETTINGS_FILE_NAME);
        let settings = load_settings(&settings_path, &default_knowledge_root)?;
        let knowledge_root = settings.knowledge_root_path();
        ensure_knowledge_root_layout(&knowledge_root)?;
        enforce_clipboard_retention(&knowledge_root, settings.clipboard_history_days)?;

        let queue_state = ensure_queue_state(&knowledge_root)?;
        let mut runtime = load_runtime_state(&knowledge_root)?;
        reconcile_clipboard_history(&knowledge_root, settings.clipboard_history_days, &runtime)?;
        if let Err(error) =
            reconcile_capture_history_store(&knowledge_root, settings.clipboard_history_days)
        {
            warn!("failed to reconcile sqlite capture history store on startup: {error}");
        }
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
                app_log_dir,
                settings_path,
                inner: Mutex::new(StateData {
                    settings,
                    runtime,
                    pending_replay_hashes: VecDeque::new(),
                    clipboard_window_target: None,
                }),
            }),
        };

        state.persist_runtime_snapshot()?;

        Ok(state)
    }

    pub fn current_settings(&self) -> Result<AppSettings, String> {
        Ok(self.lock_state()?.settings.clone())
    }

    pub fn sync_current_global_shortcuts(&self) -> Result<(), String> {
        let settings = self.current_settings()?;
        sync_app_global_shortcuts(&self.shared.app_handle, None, &settings)
    }

    pub fn save_settings(&self, next: AppSettings) -> Result<AppSettings, String> {
        let previous_settings = self.current_settings()?;
        let normalized = next.normalized(&self.shared.default_knowledge_root);
        ensure_knowledge_root_layout(&normalized.knowledge_root_path())?;
        write_json_file(&self.shared.settings_path, &normalized)?;

        let knowledge_root = normalized.knowledge_root_path();
        enforce_clipboard_retention(&knowledge_root, normalized.clipboard_history_days)?;
        let queue_state = ensure_queue_state(&knowledge_root)?;
        let mut runtime = load_runtime_state(&knowledge_root)?;
        reconcile_clipboard_history(&knowledge_root, normalized.clipboard_history_days, &runtime)?;
        if let Err(error) =
            reconcile_capture_history_store(&knowledge_root, normalized.clipboard_history_days)
        {
            warn!(
                "failed to reconcile sqlite capture history store after settings change: {error}"
            );
        }
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

        if let Err(error) = sync_app_global_shortcuts(
            &self.shared.app_handle,
            Some(&previous_settings),
            &normalized,
        ) {
            warn!("failed to sync app global shortcuts after settings change: {error}");
        }

        self.persist_runtime_snapshot()?;

        Ok(normalized)
    }

    pub fn dashboard_snapshot(&self, app: &AppHandle) -> Result<DashboardSnapshot, String> {
        let (settings, runtime, app_data_dir, app_log_dir) = {
            let state = self.lock_state()?;
            (
                state.settings.clone(),
                state.runtime.clone(),
                self.shared.app_data_dir.display().to_string(),
                self.shared.app_log_dir.display().to_string(),
            )
        };
        let locale = settings.locale_preference.resolved();
        let watch_status = match locale {
            crate::locale::AppLocale::ZhCn => match runtime.watch_status.as_str() {
                RUNNING_WATCH_STATUS => "Rust 剪贴板轮询器运行中".to_string(),
                STARTING_WATCH_STATUS => "Rust 剪贴板轮询器启动中".to_string(),
                "Rust clipboard poller retrying" => "Rust 剪贴板轮询器重试中".to_string(),
                "Clipboard watcher is only implemented on macOS" => {
                    "剪贴板监听目前只在 macOS 上实现".to_string()
                }
                other => other.to_string(),
            },
            crate::locale::AppLocale::EnUs => runtime.watch_status.clone(),
        };
        let queue_state = match locale {
            crate::locale::AppLocale::ZhCn => {
                if settings.ai_enabled() {
                    format!(
                        "AI 队列待处理 {} · 就绪批次 {}",
                        runtime.queue_depth, runtime.ready_batch_count
                    )
                } else {
                    format!(
                        "AI 队列已暂停，待处理 {} · 就绪批次 {}，等待完成提供方配置",
                        runtime.queue_depth, runtime.ready_batch_count
                    )
                }
            }
            crate::locale::AppLocale::EnUs => {
                if settings.ai_enabled() {
                    format!(
                        "AI queue pending {} · ready batches {}",
                        runtime.queue_depth, runtime.ready_batch_count
                    )
                } else {
                    format!(
                        "AI queue paused with {} pending · ready batches {} until provider setup completes",
                        runtime.queue_depth, runtime.ready_batch_count
                    )
                }
            }
        };

        let batch_state = match (&runtime.last_batch_reason, locale) {
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
            &settings.knowledge_root_path(),
            settings.clipboard_history_days,
            3,
        )?;

        Ok(DashboardSnapshot {
            app_name: app.package_info().name.clone(),
            app_version: app.package_info().version.to_string(),
            build_channel: runtime_profile::build_channel_label(),
            app_env: runtime_profile::app_env().into(),
            data_channel: runtime_profile::data_channel().into(),
            os: std::env::consts::OS.into(),
            default_knowledge_root: settings.knowledge_root.clone(),
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
            capture_mode: match (&runtime.last_error, locale) {
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
        query_clipboard_history_page(
            &settings.knowledge_root_path(),
            settings.clipboard_history_days,
            &request,
        )
    }

    pub fn delete_clipboard_capture(
        &self,
        capture_id: String,
    ) -> Result<DeleteClipboardCaptureResult, String> {
        let normalized_id = capture_id.trim();
        if normalized_id.is_empty() {
            return Err("capture id is required".into());
        }

        let settings = self.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        let removed_from_history = delete_clipboard_history_entry(
            &knowledge_root,
            settings.clipboard_history_days,
            normalized_id,
        )?;

        let removed_from_store = match CaptureHistoryStore::new(&knowledge_root)
            .and_then(|store| store.delete_capture(normalized_id))
        {
            Ok(removed) => removed,
            Err(error) => {
                warn!("failed to delete capture from sqlite store: {error}");
                if let Err(sync_error) = reconcile_capture_history_store(
                    &knowledge_root,
                    settings.clipboard_history_days,
                ) {
                    warn!(
                        "failed to repair sqlite capture history store after delete: {sync_error}"
                    );
                }
                false
            }
        };

        let deleted = removed_from_history || removed_from_store;
        if deleted {
            self.persist_runtime_snapshot()?;
            self.emit_clipboard_updated();
        }

        Ok(DeleteClipboardCaptureResult {
            id: normalized_id.to_string(),
            removed_from_history,
            removed_from_store,
            deleted,
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
                capture_id: None,
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

    pub fn run_periodic_maintenance(&self) -> Result<(), String> {
        let settings = self.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        let previous_runtime = self.lock_state()?.runtime.clone();

        enforce_clipboard_retention(&knowledge_root, settings.clipboard_history_days)?;

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

    fn resolve_capture_hash_disposition(
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

    fn record_capture_reuse(
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
        let promoted_legacy = promote_clipboard_history_entry(
            &knowledge_root,
            settings.clipboard_history_days,
            capture_id,
            &capture.captured_at,
        )?;
        let promoted_store = match CaptureHistoryStore::new(&knowledge_root).and_then(|store| {
            store.promote_capture_reuse(capture_id, &capture.hash, &capture.captured_at)
        }) {
            Ok(promoted) => promoted,
            Err(error) => {
                warn!("failed to promote replayed capture in sqlite store: {error}");
                false
            }
        };

        if !promoted_store && promoted_legacy {
            if let Err(sync_error) =
                reconcile_capture_history_store(&knowledge_root, settings.clipboard_history_days)
            {
                warn!("failed to repair sqlite capture history store after replay: {sync_error}");
            }
        }

        if !promoted_legacy && !promoted_store {
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
            state.runtime.updated_at = now_rfc3339();
            state.runtime.recent_captures.clear();
        }

        self.persist_runtime_snapshot()?;
        self.emit_clipboard_updated();
        Ok(true)
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
        let (knowledge_root, preview, history_upsert, history_days) = {
            let mut state = self.lock_state()?;
            let knowledge_root = state.settings.knowledge_root_path();
            let history_days = state.settings.clipboard_history_days;
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
            let preview = build_capture_preview(capture, status);
            let history_upsert = build_capture_history_upsert(capture, &preview);
            (knowledge_root, preview, history_upsert, history_days)
        };

        if should_persist_capture_history(status) {
            append_clipboard_history_entry(&knowledge_root, &preview)?;
            if let Err(error) = upsert_capture_history_store(&knowledge_root, &history_upsert) {
                warn!("failed to persist capture preview into sqlite store: {error}");
                if let Err(sync_error) =
                    reconcile_capture_history_store(&knowledge_root, history_days)
                {
                    warn!("failed to repair sqlite capture history store from jsonl: {sync_error}");
                }
            }
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
    match query_capture_history_page_from_store(knowledge_root, history_days, request) {
        Ok(page) => Ok(page),
        Err(error) => {
            warn!(
                "failed to read capture history from sqlite store, falling back to jsonl: {error}"
            );
            query_clipboard_history_page_legacy(knowledge_root, history_days, request)
        }
    }
}

fn query_clipboard_history_page_legacy(
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
    match load_recent_clipboard_captures_from_store(knowledge_root, history_days, limit) {
        Ok(captures) => Ok(captures),
        Err(error) => {
            warn!(
                "failed to read recent captures from sqlite store, falling back to jsonl: {error}"
            );
            load_recent_clipboard_captures_legacy(knowledge_root, history_days, limit)
        }
    }
}

fn load_recent_clipboard_captures_legacy(
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

fn build_capture_history_upsert(
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

fn capture_preview_to_history_upsert(preview: CapturePreview) -> CaptureHistoryUpsert {
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
        raw_rich: preview.raw_rich,
        raw_rich_format: preview.raw_rich_format,
        link_url: preview.link_url,
        asset_path: preview.asset_path,
        thumbnail_path: preview.thumbnail_path,
        image_width: preview.image_width,
        image_height: preview.image_height,
        byte_size: preview.byte_size,
        hash: None,
    }
}

fn capture_history_entry_to_preview(entry: CaptureHistoryEntry) -> CapturePreview {
    let _ = (&entry.hash, &entry.created_at, &entry.updated_at);
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
        raw_rich: entry.raw_rich,
        raw_rich_format: entry.raw_rich_format,
        link_url: entry.link_url,
        asset_path: entry.asset_path,
        thumbnail_path: entry.thumbnail_path,
        image_width: entry.image_width,
        image_height: entry.image_height,
        byte_size: entry.byte_size,
    }
}

fn capture_history_summary_to_page_summary(summary: CaptureHistorySummary) -> ClipboardPageSummary {
    ClipboardPageSummary {
        total: summary.total,
        text: summary.text,
        links: summary.links,
        images: summary.images,
    }
}

fn upsert_capture_history_store(
    knowledge_root: &Path,
    capture: &CaptureHistoryUpsert,
) -> Result<(), String> {
    CaptureHistoryStore::new(knowledge_root)?.upsert_capture(capture)
}

fn query_capture_history_page_from_store(
    knowledge_root: &Path,
    history_days: u16,
    request: &ClipboardPageRequest,
) -> Result<ClipboardPage, String> {
    let store = CaptureHistoryStore::new(knowledge_root)?;
    let page_size = request.page_size.clamp(1, 100);
    let query = CaptureHistoryQuery {
        history_days,
        search: request.search.as_deref().unwrap_or("").trim().to_string(),
        filter: request
            .filter
            .as_deref()
            .unwrap_or("all")
            .trim()
            .to_string(),
        page: request.page,
        page_size,
    };
    let result = store.query_page(&query)?;
    let mut captures = Vec::with_capacity(result.captures.len());

    for capture in result.captures {
        let mut hydrated = capture_history_entry_to_preview(capture);
        hydrate_capture_preview_assets(knowledge_root, &mut hydrated)?;
        captures.push(hydrated);
    }

    Ok(ClipboardPage {
        captures,
        page: request.page,
        page_size,
        total: result.total,
        has_more: request
            .page
            .saturating_mul(page_size)
            .saturating_add(page_size)
            < result.total,
        history_days,
        summary: capture_history_summary_to_page_summary(result.summary),
    })
}

fn load_recent_clipboard_captures_from_store(
    knowledge_root: &Path,
    history_days: u16,
    limit: usize,
) -> Result<Vec<CapturePreview>, String> {
    let store = CaptureHistoryStore::new(knowledge_root)?;
    let entries = store.list_recent_captures(history_days, limit)?;
    let mut captures = Vec::with_capacity(entries.len());

    for capture in entries {
        let mut hydrated = capture_history_entry_to_preview(capture);
        hydrate_capture_preview_assets(knowledge_root, &mut hydrated)?;
        captures.push(hydrated);
    }

    Ok(captures)
}

fn reconcile_capture_history_store(knowledge_root: &Path, history_days: u16) -> Result<(), String> {
    let captures = load_capture_history_entries_legacy(knowledge_root, history_days)?;
    let upserts = captures
        .into_iter()
        .map(capture_preview_to_history_upsert)
        .collect::<Vec<_>>();
    CaptureHistoryStore::new(knowledge_root)?.replace_retained_history(&upserts)
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

fn promote_clipboard_history_entry(
    knowledge_root: &Path,
    history_days: u16,
    capture_id: &str,
    replayed_at: &str,
) -> Result<bool, String> {
    let mut entries_by_day = load_clipboard_history_entries_by_day(knowledge_root, history_days)?;
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
    persist_clipboard_history_entries(knowledge_root, history_days, &entries_by_day)?;
    Ok(true)
}

fn load_capture_history_entries_legacy(
    knowledge_root: &Path,
    history_days: u16,
) -> Result<Vec<CapturePreview>, String> {
    let mut captures = Vec::new();

    visit_clipboard_history_entries(knowledge_root, history_days, |capture| {
        captures.push(capture.clone());
        Ok(())
    })?;

    Ok(captures)
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

fn delete_clipboard_history_entry(
    knowledge_root: &Path,
    history_days: u16,
    capture_id: &str,
) -> Result<bool, String> {
    let mut entries_by_day = load_clipboard_history_entries_by_day(knowledge_root, history_days)?;
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
    persist_clipboard_history_entries(knowledge_root, history_days, &entries_by_day)?;
    Ok(true)
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
    let cutoff_day = cutoff.format("%Y-%m-%d").to_string();

    prune_dated_children(&knowledge_root.join("daily"), "md", cutoff)?;
    prune_dated_children(&assets_dir_path(knowledge_root), "", cutoff)?;
    prune_dated_children(&clipboard_history_dir_path(knowledge_root), "jsonl", cutoff)?;
    if let Err(error) = CaptureHistoryStore::new(knowledge_root)
        .and_then(|store| store.delete_before_day(&cutoff_day))
    {
        warn!("failed to prune sqlite capture history retention window: {error}");
    }
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

    if let Err(error) = prune_capture_history_store_days(knowledge_root, &removed_dates) {
        warn!("failed to prune sqlite capture history for removed dates: {error}");
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
    if let Err(error) = merge_capture_history_store_usage(knowledge_root, &mut usage_by_day) {
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

fn merge_capture_history_store_usage(
    knowledge_root: &Path,
    usage_by_day: &mut BTreeMap<NaiveDate, ClipboardDayUsage>,
) -> Result<(), String> {
    let usage = CaptureHistoryStore::new(knowledge_root)?.estimate_usage_by_day()?;

    for (day, bytes) in usage {
        let Ok(date) = NaiveDate::parse_from_str(&day, "%Y-%m-%d") else {
            continue;
        };
        usage_by_day.entry(date).or_default().total_bytes += bytes;
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

fn prune_capture_history_store_days(
    knowledge_root: &Path,
    removed_dates: &[NaiveDate],
) -> Result<(), String> {
    if removed_dates.is_empty() {
        return Ok(());
    }

    let days = removed_dates
        .iter()
        .map(|date| date.format("%Y-%m-%d").to_string())
        .collect::<Vec<_>>();
    CaptureHistoryStore::new(knowledge_root)?.delete_days(&days)
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

fn consume_matching_hash(
    recent_hashes: &mut VecDeque<RecentHashEntry>,
    hash: &str,
) -> Option<RecentHashEntry> {
    let Some(index) = recent_hashes.iter().position(|entry| entry.hash == hash) else {
        return None;
    };

    recent_hashes.remove(index)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("tino-app-state-tests-{suffix}"))
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

    fn sample_settings() -> AppSettings {
        AppSettings::defaults(&unique_root())
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
    fn delete_clipboard_history_entry_removes_target_and_keeps_other_rows() {
        let root = unique_root();
        ensure_knowledge_root_layout(&root).expect("knowledge root should initialize");

        let first = sample_preview("cap_1", "2026-04-04T12:00:00+08:00");
        let second = sample_preview("cap_2", "2026-04-04T12:30:00+08:00");
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

        let capture = sample_preview("cap_1", "2026-04-04T12:00:00+08:00");
        let history_path = clipboard_history_file_path(&root, &capture.captured_at)
            .expect("history path should build");
        append_clipboard_history_entry(&root, &capture).expect("preview should append");

        let deleted = delete_clipboard_history_entry(&root, 3, "cap_1")
            .expect("history delete should succeed");
        assert!(deleted);
        assert!(!history_path.exists());

        let _ = fs::remove_dir_all(root);
    }
}
