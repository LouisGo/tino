use crate::app_state::{AppState, BatchPromotionSummary, CaptureProcessingResult, CaptureRecord};

#[cfg(target_os = "macos")]
use {
    block2::RcBlock,
    chrono::Local,
    image::{GenericImageView, ImageFormat},
    log::{error, info},
    objc2::{rc::Retained, runtime::AnyObject},
    objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSPasteboard, NSPasteboardTypeFileURL,
        NSPasteboardTypeHTML, NSPasteboardTypePNG, NSPasteboardTypeRTF, NSPasteboardTypeString,
        NSPasteboardTypeTIFF, NSPasteboardTypeURL, NSRunningApplication, NSWorkspace,
        NSWorkspaceApplicationKey, NSWorkspaceDidActivateApplicationNotification,
    },
    objc2_foundation::{NSDictionary, NSNotification, NSString, NSURL},
    sha2::{Digest, Sha256},
    std::{
        collections::VecDeque,
        fs,
        io::Cursor,
        path::Path,
        ptr::NonNull,
        sync::{
            atomic::{AtomicBool, Ordering},
            Mutex, OnceLock,
        },
        thread,
        time::{Duration, Instant},
    },
    uuid::Uuid,
};

#[cfg(target_os = "macos")]
const CLIPBOARD_POLL_INTERVAL: Duration = Duration::from_millis(500);
#[cfg(target_os = "macos")]
const BATCH_CHECK_INTERVAL: Duration = Duration::from_secs(15);
#[cfg(target_os = "macos")]
const MAINTENANCE_INTERVAL: Duration = Duration::from_secs(60 * 5);

#[cfg(target_os = "macos")]
struct SourceAttributionConfig {
    history_limit: usize,
    screenshot_source_lookback_window: Duration,
    screenshot_return_window: Duration,
    screenshot_context_window: Duration,
    ambiguous_image_types: &'static [&'static str],
    known_capture_tool_hints: &'static [&'static str],
    inline_capture_host_hints: &'static [&'static str],
}

#[cfg(target_os = "macos")]
const SOURCE_ATTRIBUTION_CONFIG: SourceAttributionConfig = SourceAttributionConfig {
    history_limit: 16,
    screenshot_source_lookback_window: Duration::from_secs(5),
    screenshot_return_window: Duration::from_secs(2),
    screenshot_context_window: Duration::from_secs(30),
    ambiguous_image_types: &[
        "public.png",
        "public.tiff",
        "NSPasteboardTypePNG",
        "NSTIFFPboardType",
    ],
    known_capture_tool_hints: &[
        "cleanshot",
        "cleanshot x",
        "longshot",
        "monosnap",
        "screen capture",
        "screencapture",
        "screencaptureui",
        "screenshot",
        "shottr",
        "snagit",
        "xnip",
    ],
    inline_capture_host_hints: &[
        "com.tencent.qq",
        "qq",
        "tencent qq",
        "wecom",
        "wechat work",
        "wework",
        "企业微信",
        "com.tencent.xinwechat",
        "wechat",
        "weixin",
        "feishu",
        "飞书",
        "lark",
        "telegram",
        "signal",
        "whatsapp",
        "discord",
        "slack",
        "microsoft teams",
        "teams",
        "line",
        "messenger",
        "facebook messenger",
        "skype",
        "dingtalk",
        "钉钉",
    ],
};

#[cfg(target_os = "macos")]
static SOURCE_APP_ACTIVATION_HISTORY: OnceLock<SourceAppActivationHistory> = OnceLock::new();
#[cfg(target_os = "macos")]
static SOURCE_APP_TRACKER_INSTALLED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
#[derive(Clone, Debug, Default)]
struct SourceAppSnapshot {
    app_name: Option<String>,
    bundle_id: Option<String>,
    icon_bytes: Option<Vec<u8>>,
}

#[cfg(target_os = "macos")]
impl SourceAppSnapshot {
    fn from_parts(
        app_name: Option<String>,
        bundle_id: Option<String>,
        icon_bytes: Option<Vec<u8>>,
    ) -> Self {
        Self {
            app_name,
            bundle_id,
            icon_bytes,
        }
    }

    fn into_tuple(self) -> (Option<String>, Option<String>, Option<Vec<u8>>) {
        (self.app_name, self.bundle_id, self.icon_bytes)
    }

    fn is_empty(&self) -> bool {
        self.bundle_id
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
            && self
                .app_name
                .as_deref()
                .map(str::trim)
                .unwrap_or_default()
                .is_empty()
    }

    fn same_identity(&self, other: &Self) -> bool {
        match (
            self.bundle_id.as_deref().map(str::trim),
            other.bundle_id.as_deref().map(str::trim),
        ) {
            (Some(lhs), Some(rhs)) if !lhs.is_empty() && !rhs.is_empty() => lhs == rhs,
            _ => match (
                self.app_name.as_deref().map(str::trim),
                other.app_name.as_deref().map(str::trim),
            ) {
                (Some(lhs), Some(rhs)) if !lhs.is_empty() && !rhs.is_empty() => lhs == rhs,
                _ => false,
            },
        }
    }
}

#[cfg(target_os = "macos")]
#[derive(Clone, Debug)]
struct AppActivationRecord {
    observed_at: Instant,
    app: SourceAppSnapshot,
}

#[cfg(target_os = "macos")]
struct SourceAppActivationHistory {
    self_bundle_id: Option<String>,
    entries: Mutex<VecDeque<AppActivationRecord>>,
}

#[cfg(target_os = "macos")]
impl SourceAppActivationHistory {
    fn new(self_bundle_id: Option<String>) -> Self {
        Self {
            self_bundle_id,
            entries: Mutex::new(VecDeque::with_capacity(
                SOURCE_ATTRIBUTION_CONFIG.history_limit,
            )),
        }
    }

    fn record(&self, app: SourceAppSnapshot, observed_at: Instant) {
        if app.is_empty() {
            return;
        }

        let Ok(mut entries) = self.entries.lock() else {
            return;
        };

        if let Some(last) = entries.back_mut() {
            if last.app.same_identity(&app) {
                last.observed_at = observed_at;
                last.app = app;
                return;
            }
        }

        entries.push_back(AppActivationRecord { observed_at, app });
        while entries.len() > SOURCE_ATTRIBUTION_CONFIG.history_limit {
            entries.pop_front();
        }
    }

    fn infer_screenshot_source(
        &self,
        frontmost: &SourceAppSnapshot,
        detected_at: Instant,
    ) -> Option<SourceAppSnapshot> {
        let entries = self.entries.lock().ok()?;
        let recent = entries
            .iter()
            .filter(|entry| !self.is_self_app(&entry.app))
            .filter(|entry| {
                detected_at.saturating_duration_since(entry.observed_at)
                    <= SOURCE_ATTRIBUTION_CONFIG.screenshot_context_window
            })
            .cloned()
            .collect::<Vec<_>>();

        infer_screenshot_source_candidate(frontmost, detected_at, &recent)
    }

    fn is_self_app(&self, app: &SourceAppSnapshot) -> bool {
        let Some(self_bundle_id) = self.self_bundle_id.as_deref().map(str::trim) else {
            return false;
        };

        let Some(bundle_id) = app.bundle_id.as_deref().map(str::trim) else {
            return false;
        };

        !self_bundle_id.is_empty() && self_bundle_id == bundle_id
    }
}

#[cfg(target_os = "macos")]
pub fn install_source_app_tracker(self_bundle_id: Option<&str>) -> Result<(), String> {
    let history = SOURCE_APP_ACTIVATION_HISTORY.get_or_init(|| {
        SourceAppActivationHistory::new(self_bundle_id.map(|bundle_id| bundle_id.to_string()))
    });

    if SOURCE_APP_TRACKER_INSTALLED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    if let Some(frontmost) = current_frontmost_application_snapshot(&NSWorkspace::sharedWorkspace())
    {
        history.record(frontmost, Instant::now());
    }

    let notification_center = NSWorkspace::sharedWorkspace().notificationCenter();
    let activation_history = SOURCE_APP_ACTIVATION_HISTORY
        .get()
        .ok_or_else(|| "source app activation history was not initialized".to_string())?;
    let activation_block = RcBlock::new(move |notification: NonNull<NSNotification>| {
        let notification = unsafe { notification.as_ref() };
        let Some(application) = running_application_from_notification(notification) else {
            return;
        };

        activation_history.record(
            source_app_snapshot_from_running_application(&application),
            Instant::now(),
        );
    });

    unsafe {
        let _ = notification_center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceDidActivateApplicationNotification),
            None,
            None,
            &activation_block,
        );
    }

    Ok(())
}

pub fn spawn_clipboard_watcher(state: AppState) {
    #[cfg(target_os = "macos")]
    {
        thread::spawn(move || run_macos_clipboard_watcher(state));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = state.set_watch_unsupported();
    }
}

#[cfg(target_os = "macos")]
fn run_macos_clipboard_watcher(state: AppState) {
    let mut last_change_count = match current_change_count() {
        Ok(change_count) => change_count,
        Err(error) => {
            error!("failed to bootstrap clipboard watcher: {error}");
            let _ = state.set_watch_error(error);
            0
        }
    };

    let _ = state.set_watch_running();
    flush_ready_batches(&state);
    let mut last_batch_check = Instant::now();
    let mut last_maintenance_check = Instant::now();

    loop {
        thread::sleep(CLIPBOARD_POLL_INTERVAL);

        if last_batch_check.elapsed() >= BATCH_CHECK_INTERVAL {
            flush_ready_batches(&state);
            last_batch_check = Instant::now();
        }

        if last_maintenance_check.elapsed() >= MAINTENANCE_INTERVAL {
            run_periodic_maintenance(&state);
            last_maintenance_check = Instant::now();
        }

        match current_change_count() {
            Ok(change_count) if change_count == last_change_count => continue,
            Ok(change_count) => {
                last_change_count = change_count;
                let detected_at = Instant::now();

                match read_capture_record(detected_at) {
                    Ok(Some(capture)) => match state.process_capture(&capture) {
                        Ok(CaptureProcessingResult::Archived { path }) => {
                            let _ = state.set_watch_running();
                            info!(
                                "archived clipboard capture {} to {}",
                                capture.id,
                                path.display()
                            );
                        }
                        Ok(CaptureProcessingResult::Queued { path, queue_depth }) => {
                            let _ = state.set_watch_running();
                            info!(
                                "archived clipboard capture {} to {} and queued it ({} pending)",
                                capture.id,
                                path.display(),
                                queue_depth
                            );
                            flush_ready_batches(&state);
                            last_batch_check = Instant::now();
                        }
                        Ok(CaptureProcessingResult::Filtered { reason }) => {
                            let _ = state.set_watch_running();
                            info!("filtered clipboard capture {}: {}", capture.id, reason);
                        }
                        Ok(CaptureProcessingResult::Deduplicated) => {
                            let _ = state.set_watch_running();
                            info!("deduplicated clipboard capture {}", capture.id);
                        }
                        Ok(CaptureProcessingResult::Reused) => {
                            let _ = state.set_watch_running();
                            info!("reused clipboard capture {}", capture.id);
                        }
                        Err(error) => {
                            error!("failed to process capture {}: {error}", capture.id);
                            let _ = state.set_watch_error(format!("processing failed: {error}"));
                        }
                    },
                    Ok(None) => {
                        let _ = state.set_watch_running();
                    }
                    Err(error) => {
                        error!("failed to read clipboard: {error}");
                        let _ = state.set_watch_error(format!("capture failed: {error}"));
                    }
                }
            }
            Err(error) => {
                error!("failed to poll clipboard changeCount: {error}");
                let _ = state.set_watch_error(format!("poll failed: {error}"));
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn flush_ready_batches(state: &AppState) {
    match state.promote_ready_batches() {
        Ok(created_batches) => {
            if created_batches.is_empty() {
                return;
            }

            let _ = state.set_watch_running();
            for batch in created_batches {
                log_promoted_batch(&batch);
            }
        }
        Err(error) => {
            error!("failed to promote ready batches: {error}");
            let _ = state.set_watch_error(format!("batch promotion failed: {error}"));
        }
    }
}

#[cfg(target_os = "macos")]
fn run_periodic_maintenance(state: &AppState) {
    if let Err(error) = state.run_periodic_maintenance() {
        error!("failed to run periodic maintenance: {error}");
        let _ = state.set_watch_error(format!("maintenance failed: {error}"));
    }
}

#[cfg(target_os = "macos")]
fn log_promoted_batch(batch: &BatchPromotionSummary) {
    info!(
        "promoted ready batch {} via {} with {} captures at {}",
        batch.id,
        batch.trigger_reason,
        batch.capture_count,
        batch.path.display()
    );
}

#[cfg(target_os = "macos")]
fn current_change_count() -> Result<isize, String> {
    let pasteboard = NSPasteboard::generalPasteboard();
    Ok(pasteboard.changeCount())
}

#[cfg(target_os = "macos")]
fn read_capture_record(detected_at: Instant) -> Result<Option<CaptureRecord>, String> {
    let pasteboard = NSPasteboard::generalPasteboard();
    let (source_app_name, source_app_bundle_id, source_app_icon_bytes) =
        read_clipboard_source_application(&pasteboard, detected_at);
    if let Some((content_kind, file_path, byte_size)) = read_clipboard_file_reference(&pasteboard)?
    {
        let hash = build_capture_hash(content_kind, &file_path, None, None::<&[u8]>);

        return Ok(Some(CaptureRecord {
            id: format!("cap_{}", Uuid::now_v7().simple()),
            source: "clipboard".into(),
            source_app_name,
            source_app_bundle_id,
            source_app_icon_path: None,
            captured_at: Local::now().to_rfc3339(),
            content_kind: content_kind.into(),
            raw_text: file_path,
            raw_rich: None,
            raw_rich_format: None,
            link_url: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size,
            hash,
            image_bytes: None,
            source_app_icon_bytes,
        }));
    }
    let plain_text = unsafe { pasteboard.stringForType(NSPasteboardTypeString) }
        .map(|text| text.to_string())
        .unwrap_or_default();
    let rich_text = read_clipboard_rich_text(&pasteboard);
    let raw_text = if plain_text.trim().is_empty() {
        rich_text
            .as_ref()
            .and_then(|(format, content)| extract_plain_text_from_rich_content(format, content))
            .unwrap_or_default()
    } else {
        plain_text
    };
    let trimmed_raw_text = raw_text.trim();

    if !trimmed_raw_text.is_empty() {
        let content_kind = if looks_like_link(trimmed_raw_text) {
            "link"
        } else if rich_text.is_some() {
            "rich_text"
        } else {
            "plain_text"
        };

        let (raw_rich_format, raw_rich) = rich_text
            .map(|(format, content)| (Some(format), Some(content)))
            .unwrap_or((None, None));
        let hash = build_capture_hash(content_kind, &raw_text, raw_rich.as_deref(), None::<&[u8]>);

        return Ok(Some(CaptureRecord {
            id: format!("cap_{}", Uuid::now_v7().simple()),
            source: "clipboard".into(),
            source_app_name: source_app_name.clone(),
            source_app_bundle_id: source_app_bundle_id.clone(),
            source_app_icon_path: None,
            captured_at: Local::now().to_rfc3339(),
            content_kind: content_kind.into(),
            raw_text: raw_text.clone(),
            raw_rich,
            raw_rich_format,
            link_url: if content_kind == "link" {
                Some(trimmed_raw_text.to_string())
            } else {
                None
            },
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash,
            image_bytes: None,
            source_app_icon_bytes: source_app_icon_bytes.clone(),
        }));
    }

    if let Some((image_bytes, width, height, byte_size)) = read_clipboard_image(&pasteboard)? {
        let raw_text = format!("Clipboard image · {}x{}", width, height);
        let hash = build_capture_hash("image", &raw_text, None, Some(image_bytes.as_slice()));

        return Ok(Some(CaptureRecord {
            id: format!("cap_{}", Uuid::now_v7().simple()),
            source: "clipboard".into(),
            source_app_name,
            source_app_bundle_id,
            source_app_icon_path: None,
            captured_at: Local::now().to_rfc3339(),
            content_kind: "image".into(),
            raw_text,
            raw_rich: None,
            raw_rich_format: None,
            link_url: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: Some(width),
            image_height: Some(height),
            byte_size: Some(byte_size as u64),
            hash,
            image_bytes: Some(image_bytes),
            source_app_icon_bytes,
        }));
    }

    Ok(None)
}

#[cfg(target_os = "macos")]
fn read_clipboard_source_application(
    pasteboard: &NSPasteboard,
    detected_at: Instant,
) -> (Option<String>, Option<String>, Option<Vec<u8>>) {
    let workspace = NSWorkspace::sharedWorkspace();
    let item = pasteboard
        .pasteboardItems()
        .and_then(|items| items.firstObject());

    if let Some(bundle_id) = item
        .as_ref()
        .and_then(|item| read_pasteboard_source_bundle_id(item))
    {
        return resolve_source_application(&workspace, &bundle_id);
    }

    if let Some(bundle_id) = item
        .as_ref()
        .and_then(|item| infer_source_bundle_id_from_item_types(&workspace, item))
    {
        return resolve_source_application(&workspace, &bundle_id);
    }

    let frontmost = current_frontmost_application_snapshot(&workspace);
    let suppress_frontmost_fallback = item
        .as_ref()
        .is_some_and(|item| should_suppress_frontmost_fallback_for_item(pasteboard, item));

    if suppress_frontmost_fallback {
        if let Some(frontmost) = frontmost.as_ref() {
            if let Some(candidate) = infer_screenshot_source_application(frontmost, detected_at) {
                return candidate.into_tuple();
            }

            if app_supports_inline_capture_fallback(frontmost) {
                return frontmost.clone().into_tuple();
            }
        }

        return (None, None, None);
    }

    frontmost
        .map(SourceAppSnapshot::into_tuple)
        .unwrap_or((None, None, None))
}

#[cfg(target_os = "macos")]
fn read_pasteboard_source_bundle_id(item: &objc2_app_kit::NSPasteboardItem) -> Option<String> {
    let source_type = NSString::from_str("org.nspasteboard.source");
    let bundle_id = item.stringForType(&source_type)?.to_string();
    let normalized = bundle_id.trim();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized.to_string())
    }
}

#[cfg(target_os = "macos")]
fn infer_source_bundle_id_from_item_types(
    workspace: &NSWorkspace,
    item: &objc2_app_kit::NSPasteboardItem,
) -> Option<String> {
    let running_applications = workspace.runningApplications();
    let mut bundle_ids = running_applications
        .iter()
        .filter_map(|application| {
            application
                .bundleIdentifier()
                .map(|value| value.to_string())
        })
        .filter(|bundle_id| is_vendor_bundle_id(bundle_id))
        .collect::<Vec<_>>();

    bundle_ids.sort_by_key(|bundle_id| std::cmp::Reverse(bundle_id.len()));

    for pasteboard_type in item.types().iter() {
        let type_name = pasteboard_type.to_string();
        if is_generic_pasteboard_type(&type_name) {
            continue;
        }

        for bundle_id in &bundle_ids {
            if type_name == *bundle_id
                || type_name
                    .strip_prefix(bundle_id)
                    .is_some_and(|suffix| suffix.starts_with('.') || suffix.starts_with('/'))
            {
                return Some(bundle_id.clone());
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn current_frontmost_application_snapshot(workspace: &NSWorkspace) -> Option<SourceAppSnapshot> {
    workspace
        .frontmostApplication()
        .as_deref()
        .map(source_app_snapshot_from_running_application)
}

#[cfg(target_os = "macos")]
fn infer_screenshot_source_application(
    frontmost: &SourceAppSnapshot,
    detected_at: Instant,
) -> Option<SourceAppSnapshot> {
    SOURCE_APP_ACTIVATION_HISTORY
        .get()
        .and_then(|history| history.infer_screenshot_source(frontmost, detected_at))
}

#[cfg(target_os = "macos")]
fn infer_screenshot_source_candidate(
    frontmost: &SourceAppSnapshot,
    detected_at: Instant,
    recent_activations: &[AppActivationRecord],
) -> Option<SourceAppSnapshot> {
    // Screenshot flows often look like "source app -> capture tool -> source app"
    // before the poller notices the pasteboard change, so we detect that bounce.
    let last = recent_activations.last()?;
    let last_age = detected_at.saturating_duration_since(last.observed_at);

    if !last.app.same_identity(frontmost) {
        return if last_age <= SOURCE_ATTRIBUTION_CONFIG.screenshot_source_lookback_window
            && app_looks_like_capture_tool(&last.app)
        {
            Some(last.app.clone())
        } else {
            None
        };
    }

    if last_age > SOURCE_ATTRIBUTION_CONFIG.screenshot_return_window {
        return None;
    }

    let previous = recent_activations.iter().rev().nth(1)?;
    if detected_at.saturating_duration_since(previous.observed_at)
        > SOURCE_ATTRIBUTION_CONFIG.screenshot_source_lookback_window
    {
        return None;
    }

    if app_looks_like_capture_tool(&previous.app) {
        return Some(previous.app.clone());
    }

    let frontmost_return_pattern = recent_activations.iter().rev().skip(2).any(|entry| {
        detected_at.saturating_duration_since(entry.observed_at)
            <= SOURCE_ATTRIBUTION_CONFIG.screenshot_context_window
            && entry.app.same_identity(frontmost)
    });

    frontmost_return_pattern.then(|| previous.app.clone())
}

#[cfg(target_os = "macos")]
fn app_looks_like_capture_tool(app: &SourceAppSnapshot) -> bool {
    app_matches_hint_list(app, SOURCE_ATTRIBUTION_CONFIG.known_capture_tool_hints)
}

#[cfg(target_os = "macos")]
fn app_supports_inline_capture_fallback(app: &SourceAppSnapshot) -> bool {
    app_matches_hint_list(app, SOURCE_ATTRIBUTION_CONFIG.inline_capture_host_hints)
}

#[cfg(target_os = "macos")]
fn app_matches_hint_list(app: &SourceAppSnapshot, hints: &[&str]) -> bool {
    let bundle_id = app.bundle_id.as_deref().unwrap_or_default();
    let app_name = app.app_name.as_deref().unwrap_or_default();

    hints
        .iter()
        .any(|hint| text_matches_hint(bundle_id, hint) || text_matches_hint(app_name, hint))
}

#[cfg(target_os = "macos")]
fn text_matches_hint(text: &str, hint: &str) -> bool {
    let normalized_text = text.trim().to_ascii_lowercase();
    let normalized_hint = hint.trim().to_ascii_lowercase();

    if normalized_text.is_empty() || normalized_hint.is_empty() {
        return false;
    }

    if normalized_hint.len() <= 3 {
        return normalized_text == normalized_hint
            || normalized_text
                .split(|char: char| !char.is_ascii_alphanumeric())
                .any(|token| token == normalized_hint);
    }

    normalized_text.contains(&normalized_hint)
}

#[cfg(target_os = "macos")]
fn should_suppress_frontmost_fallback_for_item(
    pasteboard: &NSPasteboard,
    item: &objc2_app_kit::NSPasteboardItem,
) -> bool {
    let type_names = item
        .types()
        .iter()
        .map(|pasteboard_type| pasteboard_type.to_string())
        .collect::<Vec<_>>();
    let has_plain_text = unsafe { pasteboard.stringForType(NSPasteboardTypeString) }
        .map(|text| !text.to_string().trim().is_empty())
        .unwrap_or(false);
    let has_rich_text = unsafe { pasteboard.dataForType(NSPasteboardTypeHTML) }.is_some()
        || unsafe { pasteboard.dataForType(NSPasteboardTypeRTF) }.is_some();

    should_suppress_frontmost_fallback(&type_names, has_plain_text, has_rich_text)
}

#[cfg(target_os = "macos")]
fn should_suppress_frontmost_fallback(
    type_names: &[String],
    has_plain_text: bool,
    has_rich_text: bool,
) -> bool {
    let has_image_payload = type_names.iter().any(|type_name| {
        SOURCE_ATTRIBUTION_CONFIG
            .ambiguous_image_types
            .iter()
            .any(|known_type| type_name == known_type)
    });

    has_image_payload && !has_plain_text && !has_rich_text
}

#[cfg(target_os = "macos")]
fn running_application_from_notification(
    notification: &NSNotification,
) -> Option<Retained<NSRunningApplication>> {
    let user_info = notification.userInfo()?;
    let typed_user_info = unsafe { user_info.cast_unchecked::<NSString, AnyObject>() };
    let application = typed_user_info.objectForKey(unsafe { NSWorkspaceApplicationKey })?;

    application.downcast::<NSRunningApplication>().ok()
}

#[cfg(target_os = "macos")]
fn resolve_source_application(
    workspace: &NSWorkspace,
    bundle_id: &str,
) -> (Option<String>, Option<String>, Option<Vec<u8>>) {
    let bundle_identifier = NSString::from_str(bundle_id);
    let applications =
        NSRunningApplication::runningApplicationsWithBundleIdentifier(&bundle_identifier);

    if let Some(application) = applications.firstObject() {
        return source_app_snapshot_from_running_application(&application).into_tuple();
    }

    let app_url = workspace.URLForApplicationWithBundleIdentifier(&bundle_identifier);
    let app_name = app_url
        .as_ref()
        .and_then(|url| url.lastPathComponent())
        .map(|value| value.to_string())
        .map(|value| value.trim_end_matches(".app").to_string())
        .filter(|value| !value.trim().is_empty());
    let icon_bytes = app_url
        .as_ref()
        .and_then(|url| url.path())
        .map(|path| workspace.iconForFile(&path))
        .and_then(|icon| ns_image_to_png_bytes(&icon));

    SourceAppSnapshot::from_parts(app_name, Some(bundle_id.to_string()), icon_bytes).into_tuple()
}

#[cfg(target_os = "macos")]
fn source_app_snapshot_from_running_application(
    application: &NSRunningApplication,
) -> SourceAppSnapshot {
    let app_name = application.localizedName().map(|value| value.to_string());
    let bundle_id = application
        .bundleIdentifier()
        .map(|value| value.to_string());
    let icon_bytes = application
        .icon()
        .and_then(|icon| ns_image_to_png_bytes(&icon));

    SourceAppSnapshot::from_parts(app_name, bundle_id, icon_bytes)
}

#[cfg(target_os = "macos")]
fn ns_image_to_png_bytes(image: &objc2_app_kit::NSImage) -> Option<Vec<u8>> {
    let tiff_data = image.TIFFRepresentation()?;
    let bitmap_rep = NSBitmapImageRep::imageRepWithData(&tiff_data)?;
    let properties = NSDictionary::new();
    unsafe {
        bitmap_rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
    }
    .map(|data| data.to_vec())
}

#[cfg(target_os = "macos")]
fn is_generic_pasteboard_type(type_name: &str) -> bool {
    let normalized = type_name.trim();
    normalized.is_empty()
        || normalized.starts_with("public.")
        || normalized.starts_with("dyn.")
        || normalized.starts_with("org.nspasteboard.")
        || normalized.starts_with("com.apple.")
        || normalized.starts_with("CorePasteboardFlavorType")
        || normalized.starts_with("Apple ")
        || normalized.starts_with("NeXT ")
        || normalized == "NSStringPboardType"
        || normalized == "NSFilenamesPboardType"
}

#[cfg(target_os = "macos")]
fn is_vendor_bundle_id(bundle_id: &str) -> bool {
    let normalized = bundle_id.trim();
    !normalized.is_empty()
        && !normalized.starts_with("com.apple.")
        && !normalized.starts_with("org.nspasteboard.")
}

#[cfg(target_os = "macos")]
fn read_clipboard_rich_text(pasteboard: &NSPasteboard) -> Option<(String, String)> {
    let rich_text = unsafe { pasteboard.dataForType(NSPasteboardTypeHTML) }
        .and_then(|data| decode_clipboard_bytes("html", data.to_vec()));

    match rich_text {
        Some(value) => Some(value),
        None => unsafe { pasteboard.dataForType(NSPasteboardTypeRTF) }
            .and_then(|data| decode_clipboard_bytes("rtf", data.to_vec())),
    }
}

#[cfg(target_os = "macos")]
fn decode_clipboard_bytes(format: &str, bytes: Vec<u8>) -> Option<(String, String)> {
    if bytes.is_empty() {
        return None;
    }

    let decoded = String::from_utf8_lossy(&bytes).to_string();

    if decoded.trim().is_empty() {
        return None;
    }

    Some((format.into(), decoded))
}

#[cfg(target_os = "macos")]
fn extract_plain_text_from_rich_content(format: &str, content: &str) -> Option<String> {
    let extracted = match format {
        "html" => extract_plain_text_from_html(content),
        "rtf" => extract_plain_text_from_rtf(content),
        _ => content.trim().to_string(),
    };

    let normalized = extracted
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

#[cfg(target_os = "macos")]
fn extract_plain_text_from_html(content: &str) -> String {
    let mut output = String::new();
    let mut inside_tag = false;
    let mut entity = String::new();
    let mut inside_entity = false;

    for char in content.chars() {
        if inside_tag {
            if char == '>' {
                inside_tag = false;
            }
            continue;
        }

        if inside_entity {
            if char == ';' {
                output.push_str(match entity.as_str() {
                    "nbsp" => " ",
                    "lt" => "<",
                    "gt" => ">",
                    "amp" => "&",
                    "quot" => "\"",
                    "#39" => "'",
                    _ => "",
                });
                entity.clear();
                inside_entity = false;
            } else {
                entity.push(char);
            }
            continue;
        }

        match char {
            '<' => inside_tag = true,
            '&' => {
                inside_entity = true;
                entity.clear();
            }
            _ => output.push(char),
        }
    }

    output
}

#[cfg(target_os = "macos")]
fn extract_plain_text_from_rtf(content: &str) -> String {
    let mut output = String::new();
    let mut chars = content.chars().peekable();

    while let Some(char) = chars.next() {
        match char {
            '\\' => {
                let mut control = String::new();
                while let Some(next) = chars.peek() {
                    if next.is_ascii_alphabetic() {
                        control.push(*next);
                        chars.next();
                        continue;
                    }
                    break;
                }

                let mut numeric = String::new();
                while let Some(next) = chars.peek() {
                    if *next == '-' || next.is_ascii_digit() {
                        numeric.push(*next);
                        chars.next();
                        continue;
                    }
                    break;
                }

                if matches!(chars.peek(), Some(' ')) {
                    chars.next();
                }

                match control.as_str() {
                    "par" | "line" => output.push('\n'),
                    "tab" => output.push('\t'),
                    "'" => {
                        let hi = chars.next();
                        let lo = chars.next();
                        if let (Some(hi), Some(lo)) = (hi, lo) {
                            let hex = format!("{hi}{lo}");
                            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                                output.push(byte as char);
                            }
                        }
                    }
                    "u" => {
                        if let Ok(codepoint) = numeric.parse::<i32>() {
                            if let Some(decoded) = char::from_u32(codepoint.max(0) as u32) {
                                output.push(decoded);
                            }
                        }
                        let _ = chars.next();
                    }
                    _ => {}
                }
            }
            '{' | '}' => {}
            _ => output.push(char),
        }
    }

    output
}

#[cfg(target_os = "macos")]
fn read_clipboard_image(
    pasteboard: &NSPasteboard,
) -> Result<Option<(Vec<u8>, u32, u32, usize)>, String> {
    let image_data = unsafe { pasteboard.dataForType(NSPasteboardTypePNG) }
        .map(|data| ("png", data.to_vec()))
        .or_else(|| {
            unsafe { pasteboard.dataForType(NSPasteboardTypeTIFF) }
                .map(|data| ("tiff", data.to_vec()))
        });

    let Some((format, bytes)) = image_data else {
        return Ok(None);
    };

    let image_format = match format {
        "png" => ImageFormat::Png,
        "tiff" => ImageFormat::Tiff,
        _ => return Ok(None),
    };
    let decoded = image::load_from_memory_with_format(&bytes, image_format)
        .map_err(|error| error.to_string())?;
    let (width, height) = decoded.dimensions();
    let mut encoded = Cursor::new(Vec::new());
    decoded
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|error| error.to_string())?;
    let encoded = encoded.into_inner();
    let byte_size = encoded.len();

    Ok(Some((encoded, width, height, byte_size)))
}

#[cfg(target_os = "macos")]
fn read_clipboard_file_reference(
    pasteboard: &NSPasteboard,
) -> Result<Option<(&'static str, String, Option<u64>)>, String> {
    let Some(items) = pasteboard.pasteboardItems() else {
        return Ok(None);
    };

    for item in items.iter() {
        let Some(file_path) = read_clipboard_item_file_path(&item) else {
            continue;
        };

        if !file_path.try_exists().map_err(|error| error.to_string())? || file_path.is_dir() {
            continue;
        }

        let content_kind = if is_video_file_path(&file_path) {
            "video"
        } else {
            "file"
        };
        let byte_size = fs::metadata(&file_path)
            .ok()
            .filter(|metadata| metadata.is_file())
            .map(|metadata| metadata.len());

        return Ok(Some((
            content_kind,
            file_path.display().to_string(),
            byte_size,
        )));
    }

    Ok(None)
}

#[cfg(target_os = "macos")]
fn read_clipboard_item_file_path(
    item: &objc2_app_kit::NSPasteboardItem,
) -> Option<std::path::PathBuf> {
    item.stringForType(unsafe { NSPasteboardTypeFileURL })
        .or_else(|| item.stringForType(unsafe { NSPasteboardTypeURL }))
        .and_then(|value| file_url_string_to_path(&value.to_string()))
}

#[cfg(target_os = "macos")]
fn file_url_string_to_path(value: &str) -> Option<std::path::PathBuf> {
    let url = NSURL::URLWithString(&NSString::from_str(value.trim()))?;
    url.to_file_path()
}

#[cfg(target_os = "macos")]
fn is_video_file_path(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };

    matches!(
        extension.to_ascii_lowercase().as_str(),
        "3gp"
            | "asf"
            | "avi"
            | "flv"
            | "m2ts"
            | "m4v"
            | "mkv"
            | "mov"
            | "mp4"
            | "mpeg"
            | "mpg"
            | "mts"
            | "ogm"
            | "ogv"
            | "qt"
            | "ts"
            | "vob"
            | "webm"
            | "wmv"
    )
}

#[cfg(target_os = "macos")]
fn build_capture_hash(
    content_kind: &str,
    raw_text: &str,
    raw_rich: Option<&str>,
    image_bytes: Option<&[u8]>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content_kind.as_bytes());
    hasher.update([0]);

    let normalized_text = normalize_capture_hash_text(raw_text);
    hasher.update(normalized_text.as_bytes());

    if normalized_text.is_empty() {
        if let Some(raw_rich) = raw_rich {
            hasher.update([0]);
            hasher.update(normalize_capture_hash_text(raw_rich).as_bytes());
        }
    }

    if let Some(image_bytes) = image_bytes {
        hasher.update([0]);
        hasher.update(image_bytes);
    }

    format!("{:x}", hasher.finalize())
}

#[cfg(target_os = "macos")]
fn normalize_capture_hash_text(input: &str) -> String {
    input
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[cfg(target_os = "macos")]
fn looks_like_link(input: &str) -> bool {
    let trimmed = input.trim();
    trimmed.lines().count() == 1
        && !trimmed.contains(char::is_whitespace)
        && (trimmed.starts_with("https://") || trimmed.starts_with("http://"))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::{
        app_looks_like_capture_tool, app_supports_inline_capture_fallback,
        infer_screenshot_source_candidate, should_suppress_frontmost_fallback, text_matches_hint,
        AppActivationRecord, SourceAppSnapshot,
    };
    use std::time::{Duration, Instant};

    fn snapshot(name: &str, bundle_id: &str) -> SourceAppSnapshot {
        SourceAppSnapshot::from_parts(Some(name.to_string()), Some(bundle_id.to_string()), None)
    }

    fn activation(now: Instant, age: Duration, name: &str, bundle_id: &str) -> AppActivationRecord {
        AppActivationRecord {
            observed_at: now - age,
            app: snapshot(name, bundle_id),
        }
    }

    #[test]
    fn infers_capture_tool_when_frontmost_app_returns_after_screenshot() {
        let now = Instant::now();
        let safari = snapshot("Safari", "com.apple.Safari");
        let recent = vec![
            activation(now, Duration::from_secs(12), "Safari", "com.apple.Safari"),
            activation(
                now,
                Duration::from_millis(900),
                "Screenshot",
                "com.apple.Screenshot",
            ),
            activation(
                now,
                Duration::from_millis(150),
                "Safari",
                "com.apple.Safari",
            ),
        ];

        let inferred = infer_screenshot_source_candidate(&safari, now, &recent)
            .expect("should infer the screenshot tool");

        assert_eq!(inferred.bundle_id.as_deref(), Some("com.apple.Screenshot"));
    }

    #[test]
    fn does_not_mislabel_regular_app_switch_as_screenshot_source() {
        let now = Instant::now();
        let preview = snapshot("Preview", "com.apple.Preview");
        let recent = vec![
            activation(now, Duration::from_secs(9), "Safari", "com.apple.Safari"),
            activation(
                now,
                Duration::from_millis(200),
                "Preview",
                "com.apple.Preview",
            ),
        ];

        let inferred = infer_screenshot_source_candidate(&preview, now, &recent);

        assert!(inferred.is_none());
    }

    #[test]
    fn recognizes_common_capture_tool_names() {
        let screenshot = snapshot("ScreenCaptureUI", "com.apple.screencaptureui");
        let cleanshot = snapshot("CleanShot X", "com.bjango.cleanshotx");
        let shottr = snapshot("Shottr", "cc.ffitch.shottr");
        let browser = snapshot("Safari", "com.apple.Safari");

        assert!(app_looks_like_capture_tool(&screenshot));
        assert!(app_looks_like_capture_tool(&cleanshot));
        assert!(app_looks_like_capture_tool(&shottr));
        assert!(!app_looks_like_capture_tool(&browser));
    }

    #[test]
    fn recognizes_inline_capture_hosts() {
        let qq = snapshot("QQ", "com.tencent.qq");
        let wechat = snapshot("WeChat", "com.tencent.xinWeChat");
        let wecom = snapshot("企业微信", "com.tencent.WeWorkMac");
        let feishu = snapshot("飞书", "com.bytedance.feishu");
        let telegram = snapshot("Telegram", "ru.keepcoder.Telegram");
        let signal = snapshot("Signal", "org.whispersystems.signal-desktop");
        let whatsapp = snapshot("WhatsApp", "net.whatsapp.WhatsApp");
        let browser = snapshot("Safari", "com.apple.Safari");

        assert!(app_supports_inline_capture_fallback(&qq));
        assert!(app_supports_inline_capture_fallback(&wechat));
        assert!(app_supports_inline_capture_fallback(&wecom));
        assert!(app_supports_inline_capture_fallback(&feishu));
        assert!(app_supports_inline_capture_fallback(&telegram));
        assert!(app_supports_inline_capture_fallback(&signal));
        assert!(app_supports_inline_capture_fallback(&whatsapp));
        assert!(!app_supports_inline_capture_fallback(&browser));
    }

    #[test]
    fn short_hints_match_tokens_but_not_unrelated_longer_words() {
        assert!(text_matches_hint("QQ", "qq"));
        assert!(text_matches_hint("com.tencent.qq", "qq"));
        assert!(!text_matches_hint("QQMusic", "qq"));
        assert!(!text_matches_hint("com.tencent.qqmusic", "qq"));
    }

    #[test]
    fn suppresses_frontmost_fallback_for_ambiguous_image_only_payloads() {
        let type_names = vec![
            "public.png".to_string(),
            "org.nspasteboard.AutoGeneratedType".to_string(),
        ];

        assert!(should_suppress_frontmost_fallback(
            &type_names,
            false,
            false
        ));
    }

    #[test]
    fn keeps_frontmost_fallback_for_text_payloads() {
        let type_names = vec!["public.utf8-plain-text".to_string()];

        assert!(!should_suppress_frontmost_fallback(
            &type_names,
            true,
            false
        ));
    }
}
