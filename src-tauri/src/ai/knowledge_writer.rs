use chrono::{DateTime, FixedOffset};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    clipboard::types::CaptureRecord,
    error::{AppError, AppResult},
    storage::knowledge_root::{inbox_dir_path, topics_dir_path},
};

const TOPIC_BODY_MARKER: &str = "<!-- tino-topic-body -->";
const INBOX_BODY_MARKER: &str = "<!-- tino-inbox-body -->";

pub fn topic_file_path(knowledge_root: &Path, topic_slug: &str) -> PathBuf {
    topics_dir_path(knowledge_root).join(format!("{topic_slug}.md"))
}

pub fn inbox_file_path(knowledge_root: &Path, submitted_at: &str) -> AppResult<PathBuf> {
    let timestamp = parse_rfc3339_timestamp(submitted_at)?;
    let date = timestamp.format("%Y-%m-%d").to_string();
    Ok(inbox_dir_path(knowledge_root).join(format!("{date}.md")))
}

pub fn slugify_topic_value(raw: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_dash = false;

    for character in raw.trim().chars() {
        if character.is_alphanumeric() {
            slug.extend(character.to_lowercase());
            previous_was_dash = false;
        } else if !previous_was_dash && !slug.is_empty() {
            slug.push('-');
            previous_was_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "untitled-topic".into()
    } else {
        trimmed.into()
    }
}

pub fn upsert_topic_markdown_file(
    path: &Path,
    topic_name: &str,
    latest_summary: &str,
    recent_tags: &[String],
    updated_at: &str,
    section_marker: &str,
    section_markdown: &str,
) -> AppResult<bool> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create topic output directory", error))?;
    }

    let next_content = if path.exists() {
        let existing = fs::read_to_string(path)
            .map_err(|error| AppError::io("failed to read topic markdown file", error))?;
        if existing.contains(section_marker) {
            return Ok(false);
        }

        if let Some((_, body)) = existing.split_once(TOPIC_BODY_MARKER) {
            let merged_body = merge_markdown_body(body, section_markdown);
            render_topic_document(
                topic_name,
                latest_summary,
                recent_tags,
                updated_at,
                &merged_body,
            )
        } else {
            append_legacy_markdown(existing, section_markdown)
        }
    } else {
        render_topic_document(
            topic_name,
            latest_summary,
            recent_tags,
            updated_at,
            section_markdown,
        )
    };

    fs::write(path, next_content)
        .map_err(|error| AppError::io("failed to write topic markdown file", error))?;
    Ok(true)
}

pub fn upsert_inbox_markdown_file(
    path: &Path,
    day: &str,
    updated_at: &str,
    section_marker: &str,
    section_markdown: &str,
) -> AppResult<bool> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create inbox output directory", error))?;
    }

    let next_content = if path.exists() {
        let existing = fs::read_to_string(path)
            .map_err(|error| AppError::io("failed to read inbox markdown file", error))?;
        if existing.contains(section_marker) {
            return Ok(false);
        }

        if let Some((_, body)) = existing.split_once(INBOX_BODY_MARKER) {
            let merged_body = merge_markdown_body(body, section_markdown);
            render_inbox_document(day, updated_at, &merged_body)
        } else {
            append_legacy_markdown(existing, section_markdown)
        }
    } else {
        render_inbox_document(day, updated_at, section_markdown)
    };

    fs::write(path, next_content)
        .map_err(|error| AppError::io("failed to write inbox markdown file", error))?;
    Ok(true)
}

pub fn render_source_fragments(source_captures: &[&CaptureRecord]) -> String {
    if source_captures.is_empty() {
        return "- none\n".into();
    }

    let mut rendered = String::new();
    for capture in source_captures {
        rendered.push_str(&format!(
            "- `{}` · {} · {}\n  > {}\n",
            capture.id,
            capture_source_label(capture),
            capture.captured_at,
            sanitize_inline_markdown(&build_capture_fragment_preview(capture))
        ));
    }

    rendered
}

pub fn truncate_inline_text(value: &str, limit: usize) -> String {
    let mut truncated = value.chars().take(limit).collect::<String>();
    if value.chars().count() > limit {
        truncated.push('…');
    }
    truncated
}

pub fn render_inline_code_list(values: &[String]) -> String {
    if values.is_empty() {
        "none".into()
    } else {
        values
            .iter()
            .map(|value| format!("`{value}`"))
            .collect::<Vec<_>>()
            .join(", ")
    }
}

pub fn render_tag_list(tags: &[String]) -> String {
    if tags.is_empty() {
        "none".into()
    } else {
        tags.join(", ")
    }
}

pub fn render_source_capture_marker(source_capture_ids: &[String]) -> String {
    let mut normalized = source_capture_ids
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();

    let mut hasher = Sha256::new();
    hasher.update(normalized.join("\n").as_bytes());
    let digest = hasher.finalize();
    let key = digest
        .iter()
        .take(12)
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();

    format!("<!-- tino-source-set:{key} -->")
}

pub fn relative_output_path(knowledge_root: &Path, path: &Path) -> String {
    path.strip_prefix(knowledge_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

pub fn sanitize_inline_markdown(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_rfc3339_timestamp(value: &str) -> AppResult<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value.trim())
        .map_err(|error| AppError::validation(format!("invalid RFC3339 timestamp: {error}")))
}

fn merge_markdown_body(existing_body: &str, next_section: &str) -> String {
    let trimmed_existing = existing_body.trim();
    let trimmed_next = next_section.trim();

    if trimmed_existing.is_empty() {
        trimmed_next.into()
    } else {
        format!("{trimmed_existing}\n\n{trimmed_next}")
    }
}

fn append_legacy_markdown(mut existing: String, section_markdown: &str) -> String {
    if !existing.ends_with('\n') {
        existing.push('\n');
    }
    if !existing.ends_with("\n\n") {
        existing.push('\n');
    }
    existing.push_str(section_markdown.trim());
    existing.push('\n');
    existing
}

fn render_topic_document(
    topic_name: &str,
    latest_summary: &str,
    recent_tags: &[String],
    updated_at: &str,
    body: &str,
) -> String {
    let recent_tags_label = if recent_tags.is_empty() {
        "none".into()
    } else {
        recent_tags.join(", ")
    };

    format!(
        "# {topic_name}\n\n> Latest summary: {}\n> Recent tags: {recent_tags_label}\n> Last updated: {updated_at}\n\n{TOPIC_BODY_MARKER}\n\n{}\n",
        sanitize_inline_markdown(latest_summary),
        body.trim()
    )
}

fn render_inbox_document(day: &str, updated_at: &str, body: &str) -> String {
    format!(
        "# AI Inbox {day}\n\n> Last updated: {updated_at}\n> Purpose: low-confidence or rerouted outputs waiting for a calmer pass.\n\n{INBOX_BODY_MARKER}\n\n{}\n",
        body.trim()
    )
}

fn capture_source_label(capture: &CaptureRecord) -> String {
    capture
        .source_app_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(capture.source.as_str())
        .to_string()
}

fn build_capture_fragment_preview(capture: &CaptureRecord) -> String {
    if capture.content_kind == "link" {
        if let Some(link_url) = capture.link_url.as_deref() {
            if !link_url.trim().is_empty() {
                return link_url.trim().into();
            }
        }
    }

    let compact = capture
        .raw_text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if compact.is_empty() {
        return "(empty capture)".into();
    }

    truncate_inline_text(&compact, 240)
}
