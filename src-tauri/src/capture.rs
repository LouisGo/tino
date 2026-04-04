use crate::app_state::{AppState, BatchPromotionSummary, CaptureProcessingResult, CaptureRecord};

#[cfg(target_os = "macos")]
use {
    chrono::Local,
    image::{GenericImageView, ImageFormat},
    log::{error, info},
    objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSPasteboard, NSPasteboardTypeHTML,
        NSPasteboardTypePNG, NSPasteboardTypeRTF, NSPasteboardTypeString, NSPasteboardTypeTIFF,
        NSRunningApplication, NSWorkspace,
    },
    objc2_foundation::{NSDictionary, NSString},
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
#[cfg(target_os = "macos")]
const MAINTENANCE_INTERVAL: Duration = Duration::from_secs(60 * 5);

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
fn read_capture_record() -> Result<Option<CaptureRecord>, String> {
    let pasteboard = NSPasteboard::generalPasteboard();
    let (source_app_name, source_app_bundle_id, source_app_icon_bytes) =
        read_clipboard_source_application(&pasteboard);
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
    };

    workspace
        .frontmostApplication()
        .as_deref()
        .map(snapshot_running_application)
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
fn resolve_source_application(
    workspace: &NSWorkspace,
    bundle_id: &str,
) -> (Option<String>, Option<String>, Option<Vec<u8>>) {
    let bundle_identifier = NSString::from_str(bundle_id);
    let applications =
        NSRunningApplication::runningApplicationsWithBundleIdentifier(&bundle_identifier);

    if let Some(application) = applications.firstObject() {
        return snapshot_running_application(&application);
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

    (app_name, Some(bundle_id.to_string()), icon_bytes)
}

#[cfg(target_os = "macos")]
fn snapshot_running_application(
    application: &NSRunningApplication,
) -> (Option<String>, Option<String>, Option<Vec<u8>>) {
    let name = application.localizedName().map(|value| value.to_string());
    let bundle_id = application
        .bundleIdentifier()
        .map(|value| value.to_string());
    let icon_bytes = application
        .icon()
        .and_then(|icon| ns_image_to_png_bytes(&icon));

    (name, bundle_id, icon_bytes)
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
