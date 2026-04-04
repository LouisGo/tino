use crate::app_state::{AppState, BatchPromotionSummary, CaptureProcessingResult, CaptureRecord};

#[cfg(target_os = "macos")]
use {
    chrono::Local,
    image::{GenericImageView, ImageFormat},
    log::{error, info},
    objc2_app_kit::{
        NSPasteboard, NSPasteboardTypeHTML, NSPasteboardTypePNG, NSPasteboardTypeRTF,
        NSPasteboardTypeString, NSPasteboardTypeTIFF,
    },
    sha2::{Digest, Sha256},
    std::{
        io::Cursor,
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
    let trimmed_raw_text = raw_text.trim();

    let rich_text = unsafe { pasteboard.dataForType(NSPasteboardTypeHTML) }
        .and_then(|data| decode_clipboard_bytes("html", data.to_vec()));

    let rich_text = match rich_text {
        Some(value) => Some(value),
        None => unsafe { pasteboard.dataForType(NSPasteboardTypeRTF) }
            .and_then(|data| decode_clipboard_bytes("rtf", data.to_vec())),
    };

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
        let hash =
            build_capture_hash(content_kind, &raw_text, raw_rich.as_deref(), None::<&[u8]>);

        return Ok(Some(CaptureRecord {
            id: format!("cap_{}", Uuid::now_v7().simple()),
            source: "clipboard".into(),
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
            image_width: None,
            image_height: None,
            byte_size: None,
            hash,
            image_bytes: None,
        }));
    }

    if let Some((image_bytes, width, height, byte_size)) = read_clipboard_image(&pasteboard)? {
        let raw_text = format!("Clipboard image · {}x{}", width, height);
        let hash = build_capture_hash("image", &raw_text, None, Some(image_bytes.as_slice()));

        return Ok(Some(CaptureRecord {
            id: format!("cap_{}", Uuid::now_v7().simple()),
            source: "clipboard".into(),
            captured_at: Local::now().to_rfc3339(),
            content_kind: "image".into(),
            raw_text,
            raw_rich: None,
            raw_rich_format: None,
            link_url: None,
            asset_path: None,
            image_width: Some(width),
            image_height: Some(height),
            byte_size: Some(byte_size as u64),
            hash,
            image_bytes: Some(image_bytes),
        }));
    }

    Ok(None)
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
fn read_clipboard_image(
    pasteboard: &NSPasteboard,
) -> Result<Option<(Vec<u8>, u32, u32, usize)>, String> {
    let image_data = unsafe { pasteboard.dataForType(NSPasteboardTypePNG) }
        .map(|data| ("png", data.to_vec()))
        .or_else(|| unsafe { pasteboard.dataForType(NSPasteboardTypeTIFF) }.map(|data| ("tiff", data.to_vec())));

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
fn build_capture_hash(
    content_kind: &str,
    raw_text: &str,
    raw_rich: Option<&str>,
    image_bytes: Option<&[u8]>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content_kind.as_bytes());
    hasher.update([0]);
    hasher.update(raw_text.as_bytes());

    if let Some(raw_rich) = raw_rich {
        hasher.update([0]);
        hasher.update(raw_rich.as_bytes());
    }

    if let Some(image_bytes) = image_bytes {
        hasher.update([0]);
        hasher.update(image_bytes);
    }

    format!("{:x}", hasher.finalize())
}

#[cfg(target_os = "macos")]
fn looks_like_link(input: &str) -> bool {
    let trimmed = input.trim();
    trimmed.lines().count() == 1
        && !trimmed.contains(char::is_whitespace)
        && (trimmed.starts_with("https://") || trimmed.starts_with("http://"))
}
