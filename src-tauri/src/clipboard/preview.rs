use chrono::{DateTime, FixedOffset};
use image::ImageFormat;
use log::warn;
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    clipboard::types::{CapturePreview, CaptureRecord, LinkMetadata},
    storage::knowledge_root::assets_dir_path,
    video_thumbnail::generate_video_thumbnail_png,
};

const IMAGE_THUMBNAIL_MAX_EDGE: u32 = 240;
const VIDEO_THUMBNAIL_MAX_EDGE: f64 = 640.0;

pub(crate) fn build_capture_preview(capture: &CaptureRecord, status: &str) -> CapturePreview {
    let file_missing = is_missing_file_reference(&capture.content_kind, &capture.raw_text);

    CapturePreview {
        id: capture.id.clone(),
        source: capture.source.clone(),
        source_app_name: capture.source_app_name.clone(),
        source_app_bundle_id: capture.source_app_bundle_id.clone(),
        source_app_icon_path: capture.source_app_icon_path.clone(),
        content_kind: capture.content_kind.clone(),
        preview: match capture.content_kind.as_str() {
            "image" => "Clipboard image".into(),
            "video" | "file" => build_file_display(&capture.raw_text),
            "link" => capture
                .link_url
                .as_deref()
                .map(|link_url| {
                    build_link_display_with_metadata(link_url, capture.link_metadata.as_ref())
                })
                .unwrap_or_else(|| build_preview(&capture.raw_text)),
            _ => build_preview(&capture.raw_text),
        },
        secondary_preview: build_capture_secondary_preview(capture),
        captured_at: capture.captured_at.clone(),
        status: status.into(),
        raw_text: capture.raw_text.clone(),
        ocr_text: None,
        file_missing,
        raw_rich: capture.raw_rich.clone(),
        raw_rich_format: capture.raw_rich_format.clone(),
        link_url: capture.link_url.clone(),
        link_metadata: capture.link_metadata.clone(),
        asset_path: capture.asset_path.clone(),
        thumbnail_path: capture.thumbnail_path.clone(),
        image_width: capture.image_width,
        image_height: capture.image_height,
        byte_size: capture.byte_size,
    }
}

pub(crate) fn hydrate_capture_preview_assets(
    knowledge_root: &Path,
    capture: &mut CapturePreview,
) -> Result<(), String> {
    capture.file_missing = is_missing_file_reference(&capture.content_kind, &capture.raw_text);

    if capture.content_kind == "video" {
        match ensure_video_thumbnail_path(
            knowledge_root,
            &capture.id,
            &capture.captured_at,
            &capture.raw_text,
            capture.thumbnail_path.as_deref(),
        ) {
            Ok(Some(thumbnail_path)) => {
                capture.thumbnail_path = Some(thumbnail_path);
            }
            Ok(None) => {}
            Err(error) => {
                warn!(
                    "failed to hydrate video thumbnail for capture {}: {}",
                    capture.id, error
                );
            }
        }
        return Ok(());
    }

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

pub(crate) fn ensure_video_thumbnail_path(
    knowledge_root: &Path,
    capture_id: &str,
    captured_at: &str,
    raw_video_path: &str,
    existing_thumbnail_path: Option<&str>,
) -> Result<Option<String>, String> {
    let thumbnail_path = existing_thumbnail_path
        .map(|value| PathBuf::from(value.trim()))
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(video_thumbnail_asset_path(
            knowledge_root,
            capture_id,
            captured_at,
        )?);

    if thumbnail_path.exists() {
        return Ok(Some(thumbnail_path.display().to_string()));
    }

    let source_path = PathBuf::from(raw_video_path.trim());
    if source_path.as_os_str().is_empty() || !source_path.exists() {
        return Ok(None);
    }

    if let Some(parent) = thumbnail_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let Some(image_bytes) = generate_video_thumbnail_png(&source_path, VIDEO_THUMBNAIL_MAX_EDGE)?
    else {
        return Ok(None);
    };

    fs::write(&thumbnail_path, image_bytes).map_err(|error| error.to_string())?;
    Ok(Some(thumbnail_path.display().to_string()))
}

pub(crate) fn capture_asset_dir_path(
    knowledge_root: &Path,
    captured_at: &str,
) -> Result<PathBuf, String> {
    let captured_at = parse_captured_at(captured_at)?;
    Ok(assets_dir_path(knowledge_root).join(captured_at.format("%Y-%m-%d").to_string()))
}

pub(crate) fn thumbnail_path_for_asset(asset_path: &Path) -> PathBuf {
    let stem = asset_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("clipboard-image");
    asset_path.with_file_name(format!("{stem}.thumb.png"))
}

pub(crate) fn write_thumbnail_image(
    image_bytes: &[u8],
    thumbnail_path: &Path,
) -> Result<(), String> {
    let decoded = image::load_from_memory(image_bytes).map_err(|error| error.to_string())?;
    let thumbnail = decoded.thumbnail(IMAGE_THUMBNAIL_MAX_EDGE, IMAGE_THUMBNAIL_MAX_EDGE);
    thumbnail
        .save_with_format(thumbnail_path, ImageFormat::Png)
        .map_err(|error| error.to_string())
}

pub(crate) fn build_preview(raw_text: &str) -> String {
    let compact = raw_text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = compact.chars().take(120).collect::<String>();

    if compact.chars().count() > 120 {
        preview.push('…');
    }

    preview
}

pub(crate) fn normalize_ocr_text(input: &str) -> String {
    input
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

pub(crate) fn summarize_ocr_log_text(input: &str) -> String {
    let normalized = normalize_ocr_text(input);
    if normalized.is_empty() {
        return "empty result".into();
    }

    let char_count = normalized.chars().count();
    let preview = build_preview(&normalized).replace('\n', " ");
    format!("{char_count} chars, preview=\"{preview}\"")
}

pub(crate) fn should_persist_capture_history(status: &str) -> bool {
    matches!(status, "archived" | "queued")
}

pub(crate) fn format_bytes(byte_size: u64) -> String {
    if byte_size < 1024 {
        return format!("{byte_size} B");
    }

    let kib = byte_size as f64 / 1024.0;
    if kib < 1024.0 {
        return format!("{kib:.1} KB");
    }

    format!("{:.1} MB", kib / 1024.0)
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
        "link" => capture.link_url.as_deref().map(|link_url| {
            build_link_secondary_preview(
                link_url,
                &capture.raw_text,
                capture.link_metadata.as_ref(),
            )
        }),
        "video" | "file" => build_file_secondary_preview(&capture.raw_text, capture.byte_size),
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

pub(crate) fn build_link_display_with_metadata(
    link_url: &str,
    metadata: Option<&LinkMetadata>,
) -> String {
    if let Some(title) = metadata
        .and_then(|metadata| metadata.title.as_deref())
        .map(str::trim)
        .filter(|title| !title.is_empty())
    {
        return clamp_preview(title, 120);
    }

    let normalized = link_url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.");
    let compact = normalized.split_whitespace().next().unwrap_or(normalized);
    clamp_preview(compact, 80)
}

fn is_missing_file_reference(content_kind: &str, raw_text: &str) -> bool {
    if !matches!(content_kind, "file" | "video") {
        return false;
    }

    let normalized = raw_text.trim();
    if normalized.is_empty() {
        return true;
    }

    let path = Path::new(normalized);
    match path.try_exists() {
        Ok(true) => path.is_dir(),
        Ok(false) | Err(_) => true,
    }
}

fn build_file_display(path: &str) -> String {
    Path::new(path.trim())
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .unwrap_or_else(|| build_preview(path))
}

fn build_file_secondary_preview(path: &str, byte_size: Option<u64>) -> Option<String> {
    let normalized = path.trim();
    if normalized.is_empty() {
        return byte_size.map(format_bytes);
    }

    let parent = Path::new(normalized)
        .parent()
        .map(|value| compact_home_path(&value.display().to_string()))
        .filter(|value| !value.trim().is_empty());

    let mut parts = Vec::new();
    if let Some(parent) = parent {
        parts.push(parent);
    }
    if let Some(byte_size) = byte_size {
        parts.push(format_bytes(byte_size));
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" · "))
    }
}

fn compact_home_path(path: &str) -> String {
    let Some(home_dir) = std::env::var_os("HOME") else {
        return path.to_string();
    };
    let home_dir = home_dir.to_string_lossy();

    if path == home_dir {
        "~".into()
    } else if let Some(suffix) = path.strip_prefix(home_dir.as_ref()) {
        format!("~{suffix}")
    } else {
        path.to_string()
    }
}

pub(crate) fn build_link_secondary_preview(
    link_url: &str,
    fallback: &str,
    metadata: Option<&LinkMetadata>,
) -> String {
    if let Some(description) = metadata
        .and_then(|metadata| metadata.description.as_deref())
        .map(str::trim)
        .filter(|description| !description.is_empty())
    {
        return clamp_preview(description, 160);
    }

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

fn clamp_preview(value: &str, max_chars: usize) -> String {
    let mut preview = value.chars().take(max_chars).collect::<String>();
    if value.chars().count() > max_chars {
        preview.push('…');
    }
    preview
}

fn parse_captured_at(captured_at: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(captured_at).map_err(|error| error.to_string())
}

fn video_thumbnail_asset_path(
    knowledge_root: &Path,
    capture_id: &str,
    captured_at: &str,
) -> Result<PathBuf, String> {
    Ok(capture_asset_dir_path(knowledge_root, captured_at)?
        .join(format!("{capture_id}.video.thumb.png")))
}
