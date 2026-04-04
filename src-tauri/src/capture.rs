use crate::app_state::{AppState, BatchPromotionSummary, CaptureProcessingResult, CaptureRecord};

#[cfg(target_os = "macos")]
use {
    chrono::Local,
    log::{error, info},
    objc2_app_kit::{
        NSPasteboard, NSPasteboardTypeHTML, NSPasteboardTypeRTF, NSPasteboardTypeString,
    },
    sha2::{Digest, Sha256},
    std::{
        thread,
        time::{Duration, Instant},
    },
    uuid::Uuid,
};

#[cfg(target_os = "macos")]
const CLIPBOARD_POLL_INTERVAL: Duration = Duration::from_millis(500);
#[cfg(target_os = "macos")]
const BATCH_CHECK_INTERVAL: Duration = Duration::from_secs(15);

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

    loop {
        thread::sleep(CLIPBOARD_POLL_INTERVAL);

        if last_batch_check.elapsed() >= BATCH_CHECK_INTERVAL {
            flush_ready_batches(&state);
            last_batch_check = Instant::now();
        }

        match current_change_count() {
            Ok(change_count) if change_count == last_change_count => continue,
            Ok(change_count) => {
                last_change_count = change_count;

                match read_capture_record() {
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
fn read_capture_record() -> Result<Option<CaptureRecord>, String> {
    let pasteboard = NSPasteboard::generalPasteboard();
    let raw_text = unsafe { pasteboard.stringForType(NSPasteboardTypeString) }
        .map(|text| text.to_string())
        .unwrap_or_default();
    let raw_text = raw_text.trim().to_string();

    if raw_text.is_empty() {
        return Ok(None);
    }

    let rich_text = unsafe { pasteboard.dataForType(NSPasteboardTypeHTML) }
        .and_then(|data| decode_clipboard_bytes("html", data.to_vec()));

    let rich_text = match rich_text {
        Some(value) => Some(value),
        None => unsafe { pasteboard.dataForType(NSPasteboardTypeRTF) }
            .and_then(|data| decode_clipboard_bytes("rtf", data.to_vec())),
    };

    let content_kind = if rich_text.is_some() {
        "rich_text"
    } else {
        "plain_text"
    };

    let (raw_rich_format, raw_rich) = rich_text
        .map(|(format, content)| (Some(format), Some(content)))
        .unwrap_or((None, None));
    let hash = build_capture_hash(content_kind, &raw_text, raw_rich.as_deref());

    Ok(Some(CaptureRecord {
        id: format!("cap_{}", Uuid::now_v7().simple()),
        source: "clipboard".into(),
        captured_at: Local::now().to_rfc3339(),
        content_kind: content_kind.into(),
        raw_text: raw_text.clone(),
        raw_rich,
        raw_rich_format,
        hash,
    }))
}

#[cfg(target_os = "macos")]
fn decode_clipboard_bytes(format: &str, bytes: Vec<u8>) -> Option<(String, String)> {
    if bytes.is_empty() {
        return None;
    }

    let decoded = String::from_utf8_lossy(&bytes).trim().to_string();

    if decoded.is_empty() {
        return None;
    }

    Some((format.into(), decoded))
}

#[cfg(target_os = "macos")]
fn build_capture_hash(content_kind: &str, raw_text: &str, raw_rich: Option<&str>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content_kind.as_bytes());
    hasher.update([0]);
    hasher.update(raw_text.as_bytes());

    if let Some(raw_rich) = raw_rich {
        hasher.update([0]);
        hasher.update(raw_rich.as_bytes());
    }

    format!("{:x}", hasher.finalize())
}
