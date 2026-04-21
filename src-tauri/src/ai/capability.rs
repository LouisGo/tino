#[cfg(test)]
use std::collections::BTreeSet;

#[cfg(test)]
use crate::ai::{
    compile_support::select_relevant_topics, contracts::BatchCompileDisposition,
    knowledge_writer::slugify_topic_value,
};
use crate::{
    ai::{
        batch_store::StoredBatchFile,
        contracts::{AiCapabilitySnapshot, BackgroundCompileSourceKind, BatchCompileDecision},
        provider_compile::compile_batch_with_provider,
        topic_index::TopicIndexEntry,
    },
    app_state::AppSettings,
    error::{AppError, AppResult},
    runtime_provider::{uses_deepseek_background_compile_models, RuntimeProviderProfile},
};

#[cfg(test)]
const BACKGROUND_COMPILE_SOURCE_LABEL: &str = "Injected Mock Compiler";
#[cfg(test)]
const BACKGROUND_COMPILE_SOURCE_REASON: &str =
    "Debug-stage fixed mock capability is currently wired for background compile.";
#[cfg_attr(test, allow(dead_code))]
const BACKGROUND_COMPILE_UNAVAILABLE_REASON: &str =
    "Configure an active provider profile with a valid base URL and API key to enable background compile.";

#[derive(Debug, Clone)]
pub struct BatchCompileCapabilityResult {
    pub source_label: String,
    pub decisions: Vec<BatchCompileDecision>,
}

pub fn resolve_background_compile_capability(settings: &AppSettings) -> AiCapabilitySnapshot {
    let active_provider = settings.active_runtime_provider();
    let interactive_configured = active_provider
        .map(|provider| provider.is_configured())
        .unwrap_or(false);

    if let Some(provider) = active_provider.filter(|provider| provider.is_configured()) {
        let source_reason = if uses_deepseek_background_compile_models(provider) {
            "Background compile uses the active DeepSeek-compatible profile and auto-selects deepseek-chat for simple batches or deepseek-reasoner for complex batches."
        } else {
            "Background compile uses the active provider profile over the OpenAI-compatible chat completions API."
        };

        return AiCapabilitySnapshot {
            interactive_configured,
            background_compile_configured: true,
            background_source_kind: BackgroundCompileSourceKind::ProviderProfile,
            background_source_label: provider.name.clone(),
            background_source_reason: Some(source_reason.into()),
            active_provider_id: Some(provider.id.clone()),
            active_provider_name: Some(provider.name.clone()),
            active_vendor: Some(provider.vendor),
        };
    }

    #[cfg(test)]
    {
        return AiCapabilitySnapshot {
            interactive_configured,
            background_compile_configured: true,
            background_source_kind: BackgroundCompileSourceKind::InjectedMock,
            background_source_label: BACKGROUND_COMPILE_SOURCE_LABEL.into(),
            background_source_reason: Some(BACKGROUND_COMPILE_SOURCE_REASON.into()),
            active_provider_id: active_provider.map(|provider| provider.id.clone()),
            active_provider_name: active_provider.map(|provider| provider.name.clone()),
            active_vendor: active_provider.map(|provider| provider.vendor),
        };
    }

    #[cfg(not(test))]
    {
        let unavailable_reason = background_compile_unavailable_reason(active_provider);
        AiCapabilitySnapshot {
            interactive_configured,
            background_compile_configured: false,
            background_source_kind: BackgroundCompileSourceKind::Unavailable,
            background_source_label: "Unavailable".into(),
            background_source_reason: Some(unavailable_reason),
            active_provider_id: active_provider.map(|provider| provider.id.clone()),
            active_provider_name: active_provider.map(|provider| provider.name.clone()),
            active_vendor: active_provider.map(|provider| provider.vendor),
        }
    }
}

pub fn background_compile_enabled(settings: &AppSettings) -> bool {
    resolve_background_compile_capability(settings).background_compile_configured
}

pub fn compile_batch_with_capability(
    settings: &AppSettings,
    batch: &StoredBatchFile,
    topics: &[TopicIndexEntry],
) -> AppResult<BatchCompileCapabilityResult> {
    if batch.captures.is_empty() {
        return Err(AppError::validation("cannot compile an empty batch"));
    }

    if let Some(provider) = settings
        .active_runtime_provider()
        .filter(|provider| provider.is_configured())
    {
        return compile_batch_with_provider(
            provider,
            batch,
            topics,
            settings.locale_preference.resolved(),
        )
        .map(|result| BatchCompileCapabilityResult {
            source_label: result.source_label,
            decisions: result.decisions,
        });
    }

    #[cfg(test)]
    {
        return compile_batch_with_mock(batch, topics).map(|decisions| {
            BatchCompileCapabilityResult {
                source_label: BACKGROUND_COMPILE_SOURCE_LABEL.into(),
                decisions,
            }
        });
    }

    #[cfg(not(test))]
    {
        Err(AppError::state_conflict(
            background_compile_unavailable_reason(settings.active_runtime_provider()),
        ))
    }
}

#[cfg_attr(test, allow(dead_code))]
fn background_compile_unavailable_reason(
    active_provider: Option<&RuntimeProviderProfile>,
) -> String {
    let Some(provider) = active_provider else {
        return BACKGROUND_COMPILE_UNAVAILABLE_REASON.into();
    };

    if provider.api_key.trim().is_empty() {
        return BACKGROUND_COMPILE_UNAVAILABLE_REASON.into();
    }

    match provider.validate() {
        Ok(_) => BACKGROUND_COMPILE_UNAVAILABLE_REASON.into(),
        Err(error) => format!(
            "Active provider {} is invalid for background compile: {}",
            background_compile_provider_label(provider),
            error
        ),
    }
}

fn background_compile_provider_label(provider: &RuntimeProviderProfile) -> String {
    let trimmed_name = provider.name.trim();
    if trimmed_name.is_empty() {
        "the selected profile".into()
    } else {
        format!("\"{trimmed_name}\"")
    }
}

#[cfg(test)]
fn compile_batch_with_mock(
    batch: &StoredBatchFile,
    topics: &[TopicIndexEntry],
) -> AppResult<Vec<BatchCompileDecision>> {
    let reference_captures = batch
        .captures
        .iter()
        .filter(|capture| capture.content_kind == "link")
        .collect::<Vec<_>>();
    let knowledge_captures = batch
        .captures
        .iter()
        .filter(|capture| capture.content_kind != "link")
        .collect::<Vec<_>>();
    let mut decisions = Vec::new();
    let relevant_topics = select_relevant_topics(batch, topics, 5);

    if !knowledge_captures.is_empty() {
        let primary_topic = relevant_topics.first().copied();
        let fallback_title = build_cluster_title(&knowledge_captures);
        let topic_slug = primary_topic
            .map(|topic| topic.topic_slug.clone())
            .unwrap_or_else(|| slugify_topic_value(&fallback_title));
        let topic_name = primary_topic
            .map(|topic| topic.topic_name.clone())
            .unwrap_or_else(|| fallback_title.clone());
        decisions.push(BatchCompileDecision {
            decision_id: format!("{}_knowledge", batch.id),
            disposition: BatchCompileDisposition::WriteTopic,
            source_capture_ids: knowledge_captures
                .iter()
                .map(|capture| capture.id.clone())
                .collect(),
            topic_slug: Some(topic_slug),
            topic_name: Some(topic_name),
            title: fallback_title,
            summary: build_cluster_summary(&knowledge_captures),
            key_points: build_key_points(&knowledge_captures),
            tags: build_tags(&knowledge_captures, primary_topic),
            confidence: if primary_topic.is_some() { 0.82 } else { 0.71 },
            rationale: if primary_topic.is_some() {
                "The batch overlaps with an existing topic and includes enough textual evidence to persist directly.".into()
            } else {
                "The batch contains non-link captures with enough context to persist as a provisional topic section.".into()
            },
        });
    }

    if !reference_captures.is_empty() {
        decisions.push(BatchCompileDecision {
            decision_id: format!("{}_references", batch.id),
            disposition: BatchCompileDisposition::WriteInbox,
            source_capture_ids: reference_captures
                .iter()
                .map(|capture| capture.id.clone())
                .collect(),
            topic_slug: None,
            topic_name: None,
            title: "Reference links pending calmer compilation".into(),
            summary: "Link-only captures are kept in inbox until the background compiler has richer surrounding context.".into(),
            key_points: build_key_points(&reference_captures),
            tags: build_tags(&reference_captures, None),
            confidence: 0.56,
            rationale: "The batch segment is mostly references, so it should stay in inbox instead of forcing a long-term topic write.".into(),
        });
    }

    Ok(decisions)
}

#[cfg(test)]
fn build_cluster_title(captures: &[&crate::clipboard::types::CaptureRecord]) -> String {
    captures
        .first()
        .map(|capture| truncate_inline_text(&capture.raw_text, 58))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Untitled cluster".into())
}

#[cfg(test)]
fn build_cluster_summary(captures: &[&crate::clipboard::types::CaptureRecord]) -> String {
    let summary = captures
        .iter()
        .take(2)
        .map(|capture| capture.raw_text.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if summary.is_empty() {
        "Summary unavailable.".into()
    } else {
        truncate_inline_text(&summary, 280)
    }
}

#[cfg(test)]
fn build_key_points(captures: &[&crate::clipboard::types::CaptureRecord]) -> Vec<String> {
    let mut points = captures
        .iter()
        .map(|capture| truncate_inline_text(&capture.raw_text, 120))
        .filter(|value| !value.trim().is_empty())
        .take(4)
        .collect::<Vec<_>>();

    if points.is_empty() {
        points.push("No stable key point extracted.".into());
    }

    points
}

#[cfg(test)]
fn build_tags(
    captures: &[&crate::clipboard::types::CaptureRecord],
    topic: Option<&TopicIndexEntry>,
) -> Vec<String> {
    let mut tags = BTreeSet::new();

    if let Some(topic) = topic {
        for tag in &topic.recent_tags {
            let trimmed = tag.trim();
            if !trimmed.is_empty() {
                tags.insert(trimmed.to_string());
            }
        }
    }

    for capture in captures {
        tags.insert(capture.content_kind.clone());
        if let Some(source_app_name) = capture.source_app_name.as_deref() {
            let normalized = source_app_name.trim().to_lowercase().replace(' ', "-");
            if !normalized.is_empty() {
                tags.insert(normalized);
            }
        }
    }

    tags.into_iter().take(5).collect()
}

#[cfg(test)]
fn truncate_inline_text(value: &str, limit: usize) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut truncated = compact.chars().take(limit).collect::<String>();
    if compact.chars().count() > limit {
        truncated.push('…');
    }
    truncated
}

#[cfg(test)]
mod tests {
    use crate::{
        ai::{
            batch_store::StoredBatchFile,
            contracts::{BackgroundCompileSourceKind, BatchCompileDisposition},
            topic_index::TopicIndexEntry,
        },
        app_state::AppSettings,
        clipboard::types::CaptureRecord,
        locale::AppLocalePreference,
        runtime_provider::default_runtime_provider_profile,
    };

    use super::{
        background_compile_unavailable_reason, compile_batch_with_capability,
        resolve_background_compile_capability,
    };

    fn sample_batch() -> StoredBatchFile {
        StoredBatchFile {
            id: "batch_1".into(),
            status: "pending_ai".into(),
            created_at: "2026-04-13T12:00:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 2,
            first_captured_at: "2026-04-13T11:58:00+08:00".into(),
            last_captured_at: "2026-04-13T11:59:00+08:00".into(),
            source_ids: vec!["cap_1".into(), "cap_2".into()],
            captures: vec![
                CaptureRecord {
                    id: "cap_1".into(),
                    source: "clipboard".into(),
                    source_app_name: Some("Typora".into()),
                    source_app_bundle_id: Some("abnerworks.Typora".into()),
                    source_app_icon_path: None,
                    captured_at: "2026-04-13T11:58:00+08:00".into(),
                    content_kind: "plain_text".into(),
                    raw_text: "Rust async runtime should own background compile orchestration."
                        .into(),
                    raw_rich: None,
                    raw_rich_format: None,
                    link_url: None,
                    link_metadata: None,
                    asset_path: None,
                    thumbnail_path: None,
                    image_width: None,
                    image_height: None,
                    byte_size: None,
                    hash: "hash_1".into(),
                    image_bytes: None,
                    source_app_icon_bytes: None,
                },
                CaptureRecord {
                    id: "cap_2".into(),
                    source: "clipboard".into(),
                    source_app_name: Some("Safari".into()),
                    source_app_bundle_id: Some("com.apple.Safari".into()),
                    source_app_icon_path: None,
                    captured_at: "2026-04-13T11:59:00+08:00".into(),
                    content_kind: "link".into(),
                    raw_text: "https://openai.com/docs/guides/text".into(),
                    raw_rich: None,
                    raw_rich_format: None,
                    link_url: Some("https://openai.com/docs/guides/text".into()),
                    link_metadata: None,
                    asset_path: None,
                    thumbnail_path: None,
                    image_width: None,
                    image_height: None,
                    byte_size: None,
                    hash: "hash_2".into(),
                    image_bytes: None,
                    source_app_icon_bytes: None,
                },
            ],
        }
    }

    #[test]
    fn resolves_mock_background_compile_capability() {
        let profile = default_runtime_provider_profile(1);
        let settings = AppSettings {
            revision: 0,
            knowledge_root: "/tmp/tino-tests".into(),
            runtime_provider_profiles: vec![profile.clone()],
            active_runtime_provider_id: profile.id,
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: 7,
            clipboard_capture_enabled: true,
            clipboard_excluded_source_apps: Vec::new(),
            clipboard_excluded_keywords: Vec::new(),
            shortcut_overrides: Default::default(),
        };

        let capability = resolve_background_compile_capability(&settings);
        assert!(capability.background_compile_configured);
        assert_eq!(
            capability.background_source_kind,
            BackgroundCompileSourceKind::InjectedMock
        );
    }

    #[test]
    fn resolves_provider_backed_background_compile_capability_when_configured() {
        let mut profile = default_runtime_provider_profile(1);
        profile.name = "DeepSeek".into();
        profile.vendor = crate::runtime_provider::RuntimeProviderVendor::Deepseek;
        profile.api_key = "sk-test-12345678901234567890".into();
        profile.model = "deepseek-chat".into();
        let settings = AppSettings {
            revision: 0,
            knowledge_root: "/tmp/tino-tests".into(),
            runtime_provider_profiles: vec![profile.clone()],
            active_runtime_provider_id: profile.id,
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: 7,
            clipboard_capture_enabled: true,
            clipboard_excluded_source_apps: Vec::new(),
            clipboard_excluded_keywords: Vec::new(),
            shortcut_overrides: Default::default(),
        };

        let capability = resolve_background_compile_capability(&settings);
        assert!(capability.background_compile_configured);
        assert_eq!(
            capability.background_source_kind,
            BackgroundCompileSourceKind::ProviderProfile
        );
    }

    #[test]
    fn explicit_deepseek_model_marks_capability_as_deepseek_compatible() {
        let mut profile = default_runtime_provider_profile(1);
        profile.name = "Relay".into();
        profile.vendor = crate::runtime_provider::RuntimeProviderVendor::Openai;
        profile.api_key = "sk-test-12345678901234567890".into();
        profile.model = "deepseek-chat".into();
        let settings = AppSettings {
            revision: 0,
            knowledge_root: "/tmp/tino-tests".into(),
            runtime_provider_profiles: vec![profile.clone()],
            active_runtime_provider_id: profile.id,
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: 7,
            clipboard_capture_enabled: true,
            clipboard_excluded_source_apps: Vec::new(),
            clipboard_excluded_keywords: Vec::new(),
            shortcut_overrides: Default::default(),
        };

        let capability = resolve_background_compile_capability(&settings);
        assert_eq!(
            capability.background_source_reason.as_deref(),
            Some(
                "Background compile uses the active DeepSeek-compatible profile and auto-selects deepseek-chat for simple batches or deepseek-reasoner for complex batches."
            )
        );
    }

    #[test]
    fn compile_batch_with_capability_returns_topic_and_inbox_decisions() {
        let profile = default_runtime_provider_profile(1);
        let settings = AppSettings {
            revision: 0,
            knowledge_root: "/tmp/tino-tests".into(),
            runtime_provider_profiles: vec![profile.clone()],
            active_runtime_provider_id: profile.id,
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: 7,
            clipboard_capture_enabled: true,
            clipboard_excluded_source_apps: Vec::new(),
            clipboard_excluded_keywords: Vec::new(),
            shortcut_overrides: Default::default(),
        };
        let result = compile_batch_with_capability(
            &settings,
            &sample_batch(),
            &[TopicIndexEntry {
                topic_slug: "rust-runtime".into(),
                topic_name: "Rust Runtime".into(),
                topic_summary: "Rust-owned background runtime decisions".into(),
                recent_tags: vec!["rust".into(), "runtime".into()],
                last_updated_at: "2026-04-12T12:00:00+08:00".into(),
            }],
        )
        .expect("mock compile should work");

        assert_eq!(result.decisions.len(), 2);
        assert!(result
            .decisions
            .iter()
            .any(|decision| decision.disposition == BatchCompileDisposition::WriteTopic));
        assert!(result
            .decisions
            .iter()
            .any(|decision| decision.disposition == BatchCompileDisposition::WriteInbox));
    }

    #[test]
    fn reports_specific_reason_for_invalid_active_provider() {
        let mut profile = default_runtime_provider_profile(1);
        profile.api_key = "sk-test-1234 5678".into();

        let reason = background_compile_unavailable_reason(Some(&profile));

        assert_eq!(
            reason,
            "Active provider \"Provider 1\" is invalid for background compile: runtime provider \"Provider 1\" apiKey cannot contain whitespace"
        );
    }
}
