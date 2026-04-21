use serde::{Deserialize, Serialize};

use crate::{
    ai::{
        batch_store::StoredBatchFile,
        capability::compile_batch_with_injected_mock,
        contracts::{BatchCompileDecision, BatchCompileDisposition},
        provider_compile::compile_batch_with_provider,
        topic_index::TopicIndexEntry,
    },
    clipboard::types::CaptureRecord,
    locale::AppLocale,
    runtime_provider::{RuntimeProviderProfile, RuntimeProviderVendor},
};

const INJECTED_MOCK_SOURCE_LABEL: &str = "Injected Mock Compiler";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiQualityReplayMode {
    Mock,
    Live,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayRequest {
    pub mode: AiQualityReplayMode,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub provider: Option<AiQualityReplayProvider>,
    #[serde(default)]
    pub fixtures: Vec<AiQualityReplayFixture>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayProvider {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub name: String,
    pub vendor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayFixture {
    pub fixture_id: String,
    pub batch: AiQualityReplayBatch,
    #[serde(default)]
    pub captures: Vec<AiQualityReplayCapture>,
    #[serde(default)]
    pub available_topics: Vec<AiQualityReplayTopic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayBatch {
    pub id: String,
    #[serde(default)]
    pub runtime_state: String,
    pub created_at: String,
    pub trigger_reason: String,
    pub capture_count: usize,
    pub first_captured_at: String,
    pub last_captured_at: String,
    pub source_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AiQualityReplayCapture {
    pub id: String,
    pub source: String,
    pub source_app_bundle_id: Option<String>,
    pub source_app_name: Option<String>,
    pub captured_at: String,
    pub content_kind: String,
    pub link_url: Option<String>,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub raw_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayTopic {
    pub last_updated_at: String,
    pub recent_tags: Vec<String>,
    pub topic_name: String,
    pub topic_slug: String,
    pub topic_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayResponse {
    pub results: Vec<AiQualityReplayFixtureResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayFixtureResult {
    pub decisions: Vec<AiQualityReplayDecision>,
    pub error: Option<String>,
    pub fixture_id: String,
    pub source_kind: AiQualityReplaySourceKind,
    pub source_label: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiQualityReplaySourceKind {
    InjectedMock,
    ProviderProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQualityReplayDecision {
    pub confidence: f64,
    pub decision_id: String,
    pub disposition: AiQualityReplayDecisionDisposition,
    pub key_points: Vec<String>,
    pub rationale: String,
    pub source_capture_ids: Vec<String>,
    pub summary: String,
    pub tags: Vec<String>,
    pub title: String,
    pub topic_name: Option<String>,
    pub topic_slug: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiQualityReplayDecisionDisposition {
    WriteTopic,
    WriteInbox,
    DiscardNoise,
}

pub fn compile_bundle(input: AiQualityReplayRequest) -> Result<AiQualityReplayResponse, String> {
    let locale = parse_locale(input.locale.as_deref())?;
    let source_kind = match input.mode {
        AiQualityReplayMode::Mock => AiQualityReplaySourceKind::InjectedMock,
        AiQualityReplayMode::Live => AiQualityReplaySourceKind::ProviderProfile,
    };
    let provider = match input.mode {
        AiQualityReplayMode::Mock => None,
        AiQualityReplayMode::Live => {
            Some(build_runtime_provider(input.provider.ok_or_else(
                || "Replay provider is required for live mode.".to_string(),
            )?)?)
        }
    };

    let mut results = Vec::with_capacity(input.fixtures.len());
    for fixture in input.fixtures {
        let stored_batch = fixture.to_stored_batch();
        let available_topics = fixture
            .available_topics
            .into_iter()
            .map(AiQualityReplayTopic::into_topic_index_entry)
            .collect::<Vec<_>>();
        let default_source_label = provider
            .as_ref()
            .map(|profile| replay_provider_label(profile))
            .unwrap_or_else(|| INJECTED_MOCK_SOURCE_LABEL.to_string());

        let compile_result = match input.mode {
            AiQualityReplayMode::Mock => {
                compile_batch_with_injected_mock(&stored_batch, &available_topics)
                    .map(|result| (result.source_label, result.decisions))
                    .map_err(|error| error.to_string())
            }
            AiQualityReplayMode::Live => compile_batch_with_provider(
                provider.as_ref().expect("provider must exist in live mode"),
                &stored_batch,
                &available_topics,
                locale,
            )
            .map(|result| (result.source_label, result.decisions))
            .map_err(|error| error.to_string()),
        };

        match compile_result {
            Ok((source_label, decisions)) => results.push(AiQualityReplayFixtureResult {
                decisions: decisions.into_iter().map(map_decision).collect(),
                error: None,
                fixture_id: fixture.fixture_id,
                source_kind,
                source_label,
            }),
            Err(error) => results.push(AiQualityReplayFixtureResult {
                decisions: Vec::new(),
                error: Some(error),
                fixture_id: fixture.fixture_id,
                source_kind,
                source_label: default_source_label.clone(),
            }),
        }
    }

    Ok(AiQualityReplayResponse { results })
}

impl AiQualityReplayFixture {
    fn to_stored_batch(&self) -> StoredBatchFile {
        StoredBatchFile {
            id: self.batch.id.clone(),
            status: normalize_runtime_state(&self.batch.runtime_state),
            created_at: self.batch.created_at.clone(),
            trigger_reason: self.batch.trigger_reason.clone(),
            capture_count: self.batch.capture_count,
            first_captured_at: self.batch.first_captured_at.clone(),
            last_captured_at: self.batch.last_captured_at.clone(),
            source_ids: self.batch.source_ids.clone(),
            captures: self
                .captures
                .iter()
                .cloned()
                .map(AiQualityReplayCapture::into_capture_record)
                .collect(),
        }
    }
}

impl AiQualityReplayCapture {
    fn into_capture_record(self) -> CaptureRecord {
        CaptureRecord {
            id: self.id,
            source: self.source,
            source_app_name: self.source_app_name,
            source_app_bundle_id: self.source_app_bundle_id,
            captured_at: self.captured_at,
            content_kind: self.content_kind,
            raw_text: self.raw_text,
            raw_rich: self.raw_rich,
            raw_rich_format: self.raw_rich_format,
            link_url: self.link_url,
            ..CaptureRecord::default()
        }
    }
}

impl AiQualityReplayTopic {
    fn into_topic_index_entry(self) -> TopicIndexEntry {
        TopicIndexEntry {
            topic_slug: self.topic_slug,
            topic_name: self.topic_name,
            topic_summary: self.topic_summary,
            recent_tags: self.recent_tags,
            last_updated_at: self.last_updated_at,
        }
    }
}

fn build_runtime_provider(
    provider: AiQualityReplayProvider,
) -> Result<RuntimeProviderProfile, String> {
    Ok(RuntimeProviderProfile {
        id: "ai_quality_replay".into(),
        name: trim_to_option(&provider.name).unwrap_or_else(|| "AI Quality Replay".to_string()),
        vendor: parse_vendor(&provider.vendor)?,
        base_url: provider.base_url,
        api_key: provider.api_key,
        model: provider.model,
    }
    .normalized("AI Quality Replay"))
}

fn parse_vendor(value: &str) -> Result<RuntimeProviderVendor, String> {
    match value.trim().to_lowercase().as_str() {
        "openai" => Ok(RuntimeProviderVendor::Openai),
        "deepseek" => Ok(RuntimeProviderVendor::Deepseek),
        other => Err(format!("Unsupported replay provider vendor: {other}")),
    }
}

fn parse_locale(value: Option<&str>) -> Result<AppLocale, String> {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        None | Some("en-US") => Ok(AppLocale::EnUs),
        Some("zh-CN") => Ok(AppLocale::ZhCn),
        Some(other) => Err(format!("Unsupported replay locale: {other}")),
    }
}

fn trim_to_option(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn normalize_runtime_state(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "ready".into()
    } else {
        trimmed.to_string()
    }
}

fn replay_provider_label(profile: &RuntimeProviderProfile) -> String {
    trim_to_option(&profile.name).unwrap_or_else(|| "AI Quality Replay".into())
}

fn map_decision(decision: BatchCompileDecision) -> AiQualityReplayDecision {
    AiQualityReplayDecision {
        confidence: decision.confidence,
        decision_id: decision.decision_id,
        disposition: match decision.disposition {
            BatchCompileDisposition::WriteTopic => AiQualityReplayDecisionDisposition::WriteTopic,
            BatchCompileDisposition::WriteInbox => AiQualityReplayDecisionDisposition::WriteInbox,
            BatchCompileDisposition::DiscardNoise => {
                AiQualityReplayDecisionDisposition::DiscardNoise
            }
        },
        key_points: decision.key_points,
        rationale: decision.rationale,
        source_capture_ids: decision.source_capture_ids,
        summary: decision.summary,
        tags: decision.tags,
        title: decision.title,
        topic_name: decision.topic_name,
        topic_slug: decision.topic_slug,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        compile_bundle, AiQualityReplayBatch, AiQualityReplayCapture,
        AiQualityReplayDecisionDisposition, AiQualityReplayFixture, AiQualityReplayMode,
        AiQualityReplayRequest, AiQualityReplaySourceKind, AiQualityReplayTopic,
    };

    #[test]
    fn compile_bundle_runs_injected_mock_pipeline() {
        let response = compile_bundle(AiQualityReplayRequest {
            mode: AiQualityReplayMode::Mock,
            locale: Some("en-US".into()),
            provider: None,
            fixtures: vec![AiQualityReplayFixture {
                fixture_id: "fixture_mock".into(),
                batch: AiQualityReplayBatch {
                    id: "batch_mock".into(),
                    runtime_state: "ready".into(),
                    created_at: "2026-04-21T00:00:00Z".into(),
                    trigger_reason: "manual_replay".into(),
                    capture_count: 2,
                    first_captured_at: "2026-04-21T00:00:00Z".into(),
                    last_captured_at: "2026-04-21T00:01:00Z".into(),
                    source_ids: vec!["cap_1".into(), "cap_2".into()],
                },
                captures: vec![
                    AiQualityReplayCapture {
                        id: "cap_1".into(),
                        source: "clipboard".into(),
                        source_app_name: Some("Obsidian".into()),
                        source_app_bundle_id: Some("md.obsidian".into()),
                        captured_at: "2026-04-21T00:00:00Z".into(),
                        content_kind: "plain_text".into(),
                        raw_text: "Rust runtime should own background compile orchestration."
                            .into(),
                        ..AiQualityReplayCapture::default()
                    },
                    AiQualityReplayCapture {
                        id: "cap_2".into(),
                        source: "clipboard".into(),
                        source_app_name: Some("Safari".into()),
                        source_app_bundle_id: Some("com.apple.Safari".into()),
                        captured_at: "2026-04-21T00:01:00Z".into(),
                        content_kind: "link".into(),
                        raw_text: "https://example.com/background-compile".into(),
                        link_url: Some("https://example.com/background-compile".into()),
                        ..AiQualityReplayCapture::default()
                    },
                ],
                available_topics: vec![AiQualityReplayTopic {
                    topic_slug: "rust-background-compiler".into(),
                    topic_name: "Rust Background Compiler".into(),
                    topic_summary: "Rust-owned compile runtime.".into(),
                    recent_tags: vec!["rust".into(), "compiler".into()],
                    last_updated_at: "2026-04-20T00:00:00Z".into(),
                }],
            }],
        })
        .expect("mock replay should compile");

        assert_eq!(response.results.len(), 1);
        let result = &response.results[0];
        assert_eq!(result.source_kind, AiQualityReplaySourceKind::InjectedMock);
        assert_eq!(result.error, None);
        assert_eq!(result.decisions.len(), 2);
        assert_eq!(
            result.decisions[0].disposition,
            AiQualityReplayDecisionDisposition::WriteTopic
        );
        assert_eq!(
            result.decisions[1].disposition,
            AiQualityReplayDecisionDisposition::WriteInbox
        );
    }

    #[test]
    fn compile_bundle_requires_provider_for_live_mode() {
        let error = compile_bundle(AiQualityReplayRequest {
            mode: AiQualityReplayMode::Live,
            locale: Some("en-US".into()),
            provider: None,
            fixtures: Vec::new(),
        })
        .expect_err("live replay should require a provider");

        assert_eq!(error, "Replay provider is required for live mode.");
    }
}
