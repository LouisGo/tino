use crate::{
    ai::{batch_store::StoredBatchFile, topic_index::TopicIndexEntry},
    clipboard::types::CaptureRecord,
};

pub fn select_relevant_topics<'a>(
    batch: &StoredBatchFile,
    topics: &'a [TopicIndexEntry],
    limit: usize,
) -> Vec<&'a TopicIndexEntry> {
    if topics.len() <= limit {
        return topics.iter().collect();
    }

    let batch_terms = extract_batch_terms(batch);
    if batch_terms.is_empty() {
        return topics.iter().take(limit).collect();
    }

    let mut scored = topics
        .iter()
        .enumerate()
        .map(|(index, topic)| {
            let haystack = format!(
                "{} {} {} {}",
                topic.topic_slug,
                topic.topic_name,
                topic.topic_summary,
                topic.recent_tags.join(" ")
            )
            .to_lowercase();
            let score = batch_terms.iter().fold(0usize, |total, term| {
                if haystack.contains(term) {
                    total + if term.len() >= 7 { 2 } else { 1 }
                } else {
                    total
                }
            });

            (index, score, topic)
        })
        .collect::<Vec<_>>();
    scored.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));

    scored
        .into_iter()
        .take(limit)
        .map(|(_, _, topic)| topic)
        .collect()
}

pub fn is_complex_batch(batch: &StoredBatchFile) -> bool {
    let non_link_captures = batch
        .captures
        .iter()
        .filter(|capture| capture.content_kind != "link" && !is_weak_placeholder_capture(capture))
        .count();
    let total_text_chars = batch
        .captures
        .iter()
        .map(|capture| capture.raw_text.chars().take(2_000).count())
        .sum::<usize>();
    let multiline_captures = batch
        .captures
        .iter()
        .filter(|capture| capture.raw_text.lines().count() > 1)
        .count();

    non_link_captures > 1
        || batch.capture_count > 2
        || total_text_chars > 600
        || multiline_captures > 0
}

pub fn is_weak_placeholder_capture(capture: &CaptureRecord) -> bool {
    if capture.content_kind == "image" {
        return true;
    }

    let lowered = capture.raw_text.trim().to_lowercase();
    lowered.starts_with("clipboard image")
        || lowered.starts_with("clipboard video")
        || lowered.starts_with("clipboard file")
}

fn extract_batch_terms(batch: &StoredBatchFile) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut terms = Vec::new();
    let joined = batch
        .captures
        .iter()
        .flat_map(|capture| {
            [
                Some(capture.raw_text.as_str()),
                capture.source_app_name.as_deref(),
                capture.link_url.as_deref(),
            ]
        })
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();

    for term in joined.split(|character: char| !character.is_alphanumeric() && character != '_') {
        let trimmed = term.trim();
        if trimmed.len() < 3 || !seen.insert(trimmed.to_string()) {
            continue;
        }

        terms.push(trimmed.to_string());
        if terms.len() >= 80 {
            break;
        }
    }

    terms
}

#[cfg(test)]
mod tests {
    use crate::{
        ai::batch_store::StoredBatchFile,
        clipboard::types::CaptureRecord,
    };

    use super::{is_complex_batch, is_weak_placeholder_capture};

    fn sample_capture(id: &str, content_kind: &str, raw_text: &str) -> CaptureRecord {
        CaptureRecord {
            id: id.into(),
            source: "clipboard".into(),
            source_app_name: Some("Arc".into()),
            source_app_bundle_id: Some("company.thebrowser.Browser".into()),
            source_app_icon_path: None,
            captured_at: "2026-04-13T12:00:00+08:00".into(),
            content_kind: content_kind.into(),
            raw_text: raw_text.into(),
            raw_rich: None,
            raw_rich_format: None,
            link_url: (content_kind == "link").then(|| raw_text.to_string()),
            link_metadata: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash: format!("hash-{id}"),
            image_bytes: None,
            source_app_icon_bytes: None,
        }
    }

    #[test]
    fn placeholder_image_captures_are_low_signal() {
        assert!(is_weak_placeholder_capture(&sample_capture(
            "cap_1",
            "plain_text",
            "Clipboard image · 1724x1760",
        )));
        assert!(is_weak_placeholder_capture(&sample_capture(
            "cap_2",
            "image",
            "Diagram screenshot",
        )));
    }

    #[test]
    fn multiline_batches_are_treated_as_complex() {
        let batch = StoredBatchFile {
            id: "batch_1".into(),
            status: "ready".into(),
            created_at: "2026-04-13T12:00:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: "2026-04-13T12:00:00+08:00".into(),
            last_captured_at: "2026-04-13T12:00:00+08:00".into(),
            source_ids: vec!["cap_1".into()],
            captures: vec![sample_capture(
                "cap_1",
                "rich_text",
                "Line 1\nLine 2\nLine 3",
            )],
        };

        assert!(is_complex_batch(&batch));
    }
}
