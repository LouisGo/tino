use chrono::{DateTime, FixedOffset};
use log::warn;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};

use crate::{
    clipboard::{
        preview::{
            build_preview, capture_asset_dir_path, ensure_video_thumbnail_path,
            thumbnail_path_for_asset, write_thumbnail_image,
        },
        types::CaptureRecord,
    },
    storage::knowledge_root::filters_log_file_path,
};

const APP_ICONS_DIR_NAME: &str = "app-icons";
const MIN_CAPTURE_TEXT_CHARS: usize = 4;
const OTP_MAX_CHARS: usize = 8;

#[derive(Debug, Clone, Copy)]
pub(crate) struct SourceAppFilterRule<'a> {
    pub bundle_id: &'a str,
    pub app_name: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CaptureFilterReason {
    pub reason: String,
    pub rule_kind: &'static str,
    pub rule_value: Option<String>,
}

impl CaptureFilterReason {
    fn builtin(code: &'static str) -> Self {
        Self {
            reason: code.to_string(),
            rule_kind: "builtin",
            rule_value: Some(code.to_string()),
        }
    }

    fn source_app(bundle_id: &str, app_name: Option<&str>) -> Self {
        let label = app_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(bundle_id);

        Self {
            reason: format!("source_app_excluded: {label}"),
            rule_kind: "source_app",
            rule_value: Some(bundle_id.to_string()),
        }
    }

    fn keyword(keyword: &str) -> Self {
        Self {
            reason: format!("keyword_excluded: {keyword}"),
            rule_kind: "keyword",
            rule_value: Some(keyword.to_string()),
        }
    }

    pub(crate) fn as_status_reason(&self) -> String {
        self.reason.clone()
    }

    pub(crate) fn into_filter_log_entry(self, capture: &CaptureRecord) -> FilterLogEntry {
        FilterLogEntry {
            id: capture.id.clone(),
            captured_at: capture.captured_at.clone(),
            hash: capture.hash.clone(),
            reason: self.reason,
            rule_kind: self.rule_kind.to_string(),
            rule_value: self.rule_value,
            source_app_name: capture.source_app_name.clone(),
            source_app_bundle_id: capture.source_app_bundle_id.clone(),
            content_kind: capture.content_kind.clone(),
            preview: build_preview(&capture.raw_text),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FilterLogEntry {
    pub id: String,
    pub captured_at: String,
    pub hash: String,
    pub reason: String,
    pub rule_kind: String,
    #[serde(default)]
    pub rule_value: Option<String>,
    #[serde(default)]
    pub source_app_name: Option<String>,
    #[serde(default)]
    pub source_app_bundle_id: Option<String>,
    pub content_kind: String,
    pub preview: String,
}

pub(crate) struct PersistedImageAssets {
    pub asset_path: PathBuf,
    pub thumbnail_path: PathBuf,
}

pub(crate) fn append_filter_log(
    knowledge_root: &Path,
    entry: &FilterLogEntry,
) -> Result<(), String> {
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

pub(crate) fn detect_filter_reason<'a, I>(
    capture: &CaptureRecord,
    excluded_source_apps: I,
    excluded_keywords: &[String],
) -> Option<CaptureFilterReason>
where
    I: IntoIterator<Item = SourceAppFilterRule<'a>>,
{
    if let Some(capture_bundle_id_key) = capture
        .source_app_bundle_id
        .as_deref()
        .and_then(normalize_bundle_id_key)
    {
        for rule in excluded_source_apps {
            if normalize_bundle_id_key(rule.bundle_id).as_deref() == Some(&capture_bundle_id_key) {
                return Some(CaptureFilterReason::source_app(
                    rule.bundle_id,
                    Some(rule.app_name),
                ));
            }
        }
    }

    let lowered_text = capture.raw_text.to_lowercase();
    if let Some(keyword) = excluded_keywords
        .iter()
        .find(|keyword| lowered_text.contains(&keyword.to_lowercase()))
    {
        return Some(CaptureFilterReason::keyword(keyword));
    }

    if capture.content_kind == "image" {
        return None;
    }

    let trimmed = capture.raw_text.trim();
    let char_count = trimmed.chars().count();

    if char_count < MIN_CAPTURE_TEXT_CHARS {
        return Some(CaptureFilterReason::builtin("text_too_short"));
    }

    let single_line = trimmed.lines().count() == 1;
    if single_line && looks_like_otp(trimmed) {
        return Some(CaptureFilterReason::builtin("otp_or_verification_code"));
    }

    None
}

pub(crate) fn append_capture_to_daily_file(
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

pub(crate) fn render_capture_entry(capture: &CaptureRecord, knowledge_root: &Path) -> String {
    let mut entry = String::new();
    entry.push_str(&format!("## {} `{}`\n", capture.captured_at, capture.id));
    entry.push_str(&format!("- Source: {}\n", capture.source));
    if let Some(source_app_name) = &capture.source_app_name {
        entry.push_str(&format!("- Source App: {}\n", source_app_name));
    }
    if let Some(source_app_bundle_id) = &capture.source_app_bundle_id {
        entry.push_str(&format!("- Source Bundle ID: {}\n", source_app_bundle_id));
    }
    entry.push_str(&format!("- Kind: {}\n", capture.content_kind));
    entry.push_str(&format!("- Hash: {}\n\n", capture.hash));

    if let Some(link_url) = &capture.link_url {
        entry.push_str(&format!("- URL: {}\n\n", link_url));
    }

    if matches!(capture.content_kind.as_str(), "file" | "video") {
        entry.push_str(&format!("- Path: `{}`\n", capture.raw_text));
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

pub(crate) fn daily_archive_path(
    knowledge_root: &Path,
    captured_at: &str,
) -> Result<PathBuf, String> {
    let captured_at = parse_captured_at(captured_at)?;
    let date = captured_at.format("%Y-%m-%d").to_string();

    Ok(knowledge_root.join("daily").join(format!("{date}.md")))
}

pub(crate) fn persist_capture_ingest_artifacts(
    knowledge_root: &Path,
    clipboard_cache_root: &Path,
    capture: &mut CaptureRecord,
) -> Result<PathBuf, String> {
    if capture.content_kind == "image" {
        let persisted_assets = persist_image_assets(knowledge_root, capture)?;
        capture.asset_path = Some(persisted_assets.asset_path.display().to_string());
        capture.thumbnail_path = Some(persisted_assets.thumbnail_path.display().to_string());
        capture.image_bytes = None;
    }

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
                    "failed to generate video thumbnail for capture {}: {}",
                    capture.id, error
                );
            }
        }
    }

    if let Some(source_app_icon_path) = persist_source_app_icon(clipboard_cache_root, capture)? {
        capture.source_app_icon_path = Some(source_app_icon_path);
    }
    capture.source_app_icon_bytes = None;

    let archive_path = daily_archive_path(knowledge_root, &capture.captured_at)?;
    append_capture_to_daily_file(&archive_path, knowledge_root, capture)?;
    Ok(archive_path)
}

pub(crate) fn persist_image_assets(
    knowledge_root: &Path,
    capture: &CaptureRecord,
) -> Result<PersistedImageAssets, String> {
    let image_bytes = capture
        .image_bytes
        .as_ref()
        .ok_or_else(|| format!("image capture {} is missing in-memory bytes", capture.id))?;
    let asset_dir = capture_asset_dir_path(knowledge_root, &capture.captured_at)?;
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

pub(crate) fn persist_source_app_icon(
    clipboard_cache_root: &Path,
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
    let icon_path =
        clipboard_app_icons_dir_path(clipboard_cache_root).join(format!("{cache_key}.png"));

    if !icon_path.exists() {
        fs::create_dir_all(clipboard_app_icons_dir_path(clipboard_cache_root))
            .map_err(|error| error.to_string())?;
        if let Err(error) = write_app_icon_png(icon_bytes, &icon_path) {
            warn!(
                "failed to persist source app icon for {:?} / {:?}: {}",
                capture.source_app_name, capture.source_app_bundle_id, error
            );
            return Ok(None);
        }
    }

    Ok(Some(icon_path.display().to_string()))
}

fn render_code_block(language: &str, content: &str) -> String {
    let longest_tick_run = content.split('`').map(str::len).max().unwrap_or_default();
    let fence = "`".repeat(longest_tick_run.max(2) + 1);

    format!("{fence}{language}\n{content}\n{fence}\n")
}

fn markdown_asset_path(knowledge_root: &Path, asset_path: &str) -> Option<String> {
    let relative_asset_path = Path::new(asset_path).strip_prefix(knowledge_root).ok()?;
    Some(format!("../{}", relative_asset_path.display()))
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

pub(crate) fn clipboard_app_icons_dir_path(clipboard_cache_root: &Path) -> PathBuf {
    clipboard_cache_root.join(APP_ICONS_DIR_NAME)
}

fn normalize_bundle_id_key(bundle_id: &str) -> Option<String> {
    let trimmed = bundle_id.trim();

    (!trimmed.is_empty()).then(|| trimmed.to_ascii_lowercase())
}

fn looks_like_otp(input: &str) -> bool {
    let digits_only = input.chars().all(|char| char.is_ascii_digit());
    digits_only && input.chars().count() >= 4 && input.chars().count() <= OTP_MAX_CHARS
}

fn parse_captured_at(captured_at: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(captured_at).map_err(|error| error.to_string())
}
