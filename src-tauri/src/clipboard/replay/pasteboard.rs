use crate::clipboard::types::ClipboardReplayRequest;

#[cfg(target_os = "macos")]
use {
    objc2_app_kit::{
        NSPasteboard, NSPasteboardTypeFileURL, NSPasteboardTypeHTML, NSPasteboardTypePNG,
        NSPasteboardTypeRTF, NSPasteboardTypeString, NSPasteboardTypeURL,
    },
    objc2_foundation::{NSData, NSString, NSURL},
    sha2::{Digest, Sha256},
    std::fs,
};

#[cfg(target_os = "macos")]
pub(super) fn copy_capture_to_clipboard_macos(
    capture: &ClipboardReplayRequest,
) -> Result<String, String> {
    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();

    match capture.content_kind.as_str() {
        "image" => {
            let asset_path = capture
                .asset_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "image capture is missing assetPath".to_string())?;
            let image_bytes = fs::read(asset_path).map_err(|error| error.to_string())?;
            let data = NSData::from_vec(image_bytes.clone());

            if !pasteboard.setData_forType(Some(&data), unsafe { NSPasteboardTypePNG }) {
                return Err("failed to write image to clipboard".into());
            }

            let raw_text = if capture.raw_text.trim().is_empty() {
                "Clipboard image".to_string()
            } else {
                capture.raw_text.clone()
            };

            Ok(build_capture_hash(
                "image",
                &raw_text,
                None,
                Some(image_bytes.as_slice()),
            ))
        }
        "video" | "file" => {
            let file_path = capture.raw_text.trim();
            if file_path.is_empty() {
                return Err(format!(
                    "{} capture is missing a local file path",
                    capture.content_kind
                ));
            }

            let metadata = fs::metadata(file_path).map_err(|error| error.to_string())?;
            if !metadata.is_file() {
                return Err(format!("{file_path} is not a file"));
            }

            let file_url = NSURL::fileURLWithPath(&NSString::from_str(file_path));
            let file_url_string = file_url
                .absoluteString()
                .ok_or_else(|| "failed to encode file URL".to_string())?;
            let plain_path = NSString::from_str(file_path);

            if !pasteboard.setString_forType(&file_url_string, unsafe { NSPasteboardTypeFileURL }) {
                return Err("failed to write file to clipboard".into());
            }

            let _ = pasteboard.setString_forType(&file_url_string, unsafe { NSPasteboardTypeURL });
            let _ = pasteboard.setString_forType(&plain_path, unsafe { NSPasteboardTypeString });

            Ok(build_capture_hash(
                capture.content_kind.as_str(),
                file_path,
                None,
                None::<&[u8]>,
            ))
        }
        "link" => {
            let text = capture
                .link_url
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(&capture.raw_text);
            let string = NSString::from_str(text);

            if !pasteboard.setString_forType(&string, unsafe { NSPasteboardTypeString }) {
                return Err("failed to write link to clipboard".into());
            }

            Ok(build_capture_hash("link", text, None, None::<&[u8]>))
        }
        "rich_text" => {
            let plain_text = NSString::from_str(&capture.raw_text);
            if !pasteboard.setString_forType(&plain_text, unsafe { NSPasteboardTypeString }) {
                return Err("failed to write text fallback to clipboard".into());
            }

            if let Some(raw_rich) = capture.raw_rich.as_deref() {
                let bytes = NSData::from_vec(raw_rich.as_bytes().to_vec());
                match capture.raw_rich_format.as_deref() {
                    Some("html") => {
                        let _ = pasteboard
                            .setData_forType(Some(&bytes), unsafe { NSPasteboardTypeHTML });
                    }
                    Some("rtf") => {
                        let _ = pasteboard
                            .setData_forType(Some(&bytes), unsafe { NSPasteboardTypeRTF });
                    }
                    _ => {}
                }
            }

            Ok(build_capture_hash(
                "rich_text",
                &capture.raw_text,
                capture.raw_rich.as_deref(),
                None::<&[u8]>,
            ))
        }
        _ => {
            let string = NSString::from_str(&capture.raw_text);

            if !pasteboard.setString_forType(&string, unsafe { NSPasteboardTypeString }) {
                return Err("failed to write text to clipboard".into());
            }

            Ok(build_capture_hash(
                "plain_text",
                &capture.raw_text,
                None,
                None::<&[u8]>,
            ))
        }
    }
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
