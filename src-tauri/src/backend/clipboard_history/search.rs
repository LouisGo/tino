use chrono::{Duration, Local, NaiveTime, TimeZone};

use crate::clipboard::types::CapturePreview;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ClipboardHistorySearchQuery {
    pub raw_text_terms: Vec<String>,
    pub source_terms: Vec<String>,
    pub bundle_terms: Vec<String>,
    pub content_kind_filter: Option<String>,
    pub captured_after_epoch_ms: Option<i64>,
}

pub fn parse_clipboard_history_search(value: &str) -> ClipboardHistorySearchQuery {
    let mut query = ClipboardHistorySearchQuery::default();

    for token in tokenize_search_query(value) {
        let normalized_token = normalize_search_value(&token);
        if normalized_token.is_empty() {
            continue;
        }

        if let Some((raw_key, raw_value)) = token.split_once(':') {
            let key = normalize_search_value(raw_key);
            let normalized_value = normalize_search_value(raw_value);
            if normalized_value.is_empty() {
                continue;
            }

            match key.as_str() {
                "app" | "source" | "src" | "来源" | "应用" => {
                    query.source_terms.push(normalized_value);
                    continue;
                }
                "bundle" | "bundleid" | "bid" | "包名" => {
                    query.bundle_terms.push(normalized_value);
                    continue;
                }
                "type" | "kind" | "类型" => {
                    if let Some(filter) = normalize_content_kind_filter(&normalized_value) {
                        query.content_kind_filter = Some(filter);
                        continue;
                    }
                }
                "date" | "day" | "日期" => {
                    if let Some(cutoff_epoch_ms) = normalize_date_cutoff_epoch_ms(&normalized_value)
                    {
                        query.captured_after_epoch_ms = Some(cutoff_epoch_ms);
                        continue;
                    }
                }
                _ => {}
            }
        }

        query.raw_text_terms.push(normalized_token);
    }

    query
}

pub fn matches_clipboard_history_search(
    capture: &CapturePreview,
    query: &ClipboardHistorySearchQuery,
) -> bool {
    if let Some(filter) = query.content_kind_filter.as_deref() {
        if !matches_content_kind_filter(&capture.content_kind, filter) {
            return false;
        }
    }

    if let Some(captured_after_epoch_ms) = query.captured_after_epoch_ms {
        let Ok(captured_at_epoch_ms) = capture_captured_at_epoch_ms(capture) else {
            return false;
        };

        if captured_at_epoch_ms < captured_after_epoch_ms {
            return false;
        }
    }

    let haystack = capture_search_haystack(capture);
    if !query
        .raw_text_terms
        .iter()
        .all(|term| haystack.contains(term.as_str()))
    {
        return false;
    }

    let source_haystack = capture_source_haystack(capture);
    if !query
        .source_terms
        .iter()
        .all(|term| source_haystack.contains(term.as_str()))
    {
        return false;
    }

    let bundle_haystack = capture
        .source_app_bundle_id
        .as_deref()
        .map(normalize_search_value)
        .unwrap_or_default();
    query
        .bundle_terms
        .iter()
        .all(|term| bundle_haystack.contains(term.as_str()))
}

pub fn matches_content_kind_filter(content_kind: &str, filter: &str) -> bool {
    match filter {
        "all" | "" => true,
        "text" => matches!(content_kind, "plain_text" | "rich_text"),
        "link" => content_kind == "link",
        "image" => content_kind == "image",
        "video" => content_kind == "video",
        "file" => content_kind == "file",
        _ => true,
    }
}

pub fn normalize_content_kind_filter(value: &str) -> Option<String> {
    match value {
        "all" | "全部" => Some("all".into()),
        "text" | "texts" | "plain_text" | "rich_text" | "文本" | "富文本" => {
            Some("text".into())
        }
        "link" | "links" | "url" | "urls" | "链接" => Some("link".into()),
        "image" | "images" | "img" | "图片" => Some("image".into()),
        "video" | "videos" | "影片" | "视频" => Some("video".into()),
        "file" | "files" | "文件" => Some("file".into()),
        _ => None,
    }
}

fn tokenize_search_query(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote_delimiter: Option<char> = None;

    for ch in value.chars() {
        if let Some(delimiter) = quote_delimiter {
            if ch == delimiter {
                quote_delimiter = None;
            } else {
                current.push(ch);
            }
            continue;
        }

        match ch {
            '"' | '\'' => {
                quote_delimiter = Some(ch);
            }
            _ if ch.is_whitespace() => {
                if !current.trim().is_empty() {
                    tokens.push(current.trim().to_string());
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if !current.trim().is_empty() {
        tokens.push(current.trim().to_string());
    }

    tokens
}

fn normalize_search_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn capture_search_haystack(capture: &CapturePreview) -> String {
    [
        capture.source.as_str(),
        capture.source_app_name.as_deref().unwrap_or_default(),
        capture.source_app_bundle_id.as_deref().unwrap_or_default(),
        capture.preview.as_str(),
        capture.secondary_preview.as_deref().unwrap_or_default(),
        capture.raw_text.as_str(),
        capture.ocr_text.as_deref().unwrap_or_default(),
        capture.link_url.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_lowercase()
}

fn capture_source_haystack(capture: &CapturePreview) -> String {
    [
        capture.source.as_str(),
        capture.source_app_name.as_deref().unwrap_or_default(),
        capture.source_app_bundle_id.as_deref().unwrap_or_default(),
    ]
    .join(" ")
    .to_lowercase()
}

fn normalize_date_cutoff_epoch_ms(value: &str) -> Option<i64> {
    match value {
        "today" | "今日" | "今天" => {
            let start_of_day = Local
                .from_local_datetime(&Local::now().date_naive().and_time(NaiveTime::MIN))
                .single()?;
            Some(start_of_day.timestamp_millis())
        }
        "7d" | "7day" | "7days" | "7天" => {
            Some((Local::now() - Duration::days(7)).timestamp_millis())
        }
        "30d" | "30day" | "30days" | "30天" => {
            Some((Local::now() - Duration::days(30)).timestamp_millis())
        }
        "90d" | "90day" | "90days" | "90天" => {
            Some((Local::now() - Duration::days(90)).timestamp_millis())
        }
        _ => None,
    }
}

fn capture_captured_at_epoch_ms(capture: &CapturePreview) -> Result<i64, String> {
    chrono::DateTime::parse_from_rfc3339(&capture.captured_at)
        .map(|parsed| parsed.timestamp_millis())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Local};

    fn sample_capture() -> CapturePreview {
        CapturePreview {
            id: "cap_1".into(),
            source: "clipboard".into(),
            source_app_name: Some("Google Chrome".into()),
            source_app_bundle_id: Some("com.google.Chrome".into()),
            source_app_icon_path: None,
            content_kind: "image".into(),
            preview: "Quarterly roadmap".into(),
            secondary_preview: Some("pasted from browser".into()),
            captured_at: Local::now().to_rfc3339(),
            status: "archived".into(),
            raw_text: "Q2 launch checklist".into(),
            ocr_text: Some("Roadmap launch".into()),
            file_missing: false,
            raw_rich: None,
            raw_rich_format: None,
            link_url: Some("https://example.com/roadmap".into()),
            link_metadata: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
        }
    }

    #[test]
    fn parses_structured_keywords_from_search() {
        let query = parse_clipboard_history_search(
            r#"roadmap app:"Google Chrome" date:7d type:image bundle:com.google"#,
        );

        assert_eq!(query.raw_text_terms, vec!["roadmap"]);
        assert_eq!(query.source_terms, vec!["google chrome"]);
        assert_eq!(query.bundle_terms, vec!["com.google"]);
        assert_eq!(query.content_kind_filter.as_deref(), Some("image"));
        assert!(query.captured_after_epoch_ms.is_some());
    }

    #[test]
    fn matches_capture_against_structured_search_query() {
        let capture = sample_capture();
        let query = parse_clipboard_history_search(r#"launch app:chrome type:image date:7d"#);

        assert!(matches_clipboard_history_search(&capture, &query));
    }

    #[test]
    fn rejects_capture_outside_requested_date_window() {
        let mut capture = sample_capture();
        capture.captured_at = (Local::now() - Duration::days(31)).to_rfc3339();
        let query = parse_clipboard_history_search("date:30d");

        assert!(!matches_clipboard_history_search(&capture, &query));
    }
}
