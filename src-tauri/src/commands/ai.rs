use crate::app_state::AppState;
use crate::clipboard::types::CaptureRecord;
use crate::storage::knowledge_root::ensure_knowledge_root_layout;
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

const TOPIC_BODY_MARKER: &str = "<!-- tino-topic-body -->";
const INBOX_BODY_MARKER: &str = "<!-- tino-inbox-body -->";

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AiBatchRuntimeState {
    Ready,
    Running,
    SchemaFailed,
    ReviewPending,
    Reviewed,
    Persisting,
    Persisted,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AiDecision {
    ArchiveToTopic,
    SendToInbox,
    Discard,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ReviewAction {
    AcceptAll,
    AcceptWithEdits,
    RerouteToInbox,
    RerouteTopic,
    Discard,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiBatchSummary {
    pub id: String,
    pub runtime_state: AiBatchRuntimeState,
    pub created_at: String,
    pub trigger_reason: String,
    pub capture_count: usize,
    pub first_captured_at: String,
    pub last_captured_at: String,
    pub source_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiBatchCapture {
    pub id: String,
    pub content_kind: String,
    pub captured_at: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub preview: String,
    pub raw_text: String,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TopicIndexEntry {
    pub topic_slug: String,
    pub topic_name: String,
    pub topic_summary: String,
    pub recent_tags: Vec<String>,
    pub last_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PossibleTopicSuggestion {
    pub topic_slug: String,
    pub topic_name: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BatchDecisionCluster {
    pub cluster_id: String,
    pub source_ids: Vec<String>,
    pub decision: AiDecision,
    pub topic_slug_suggestion: Option<String>,
    pub topic_name_suggestion: Option<String>,
    pub title: String,
    pub summary: String,
    pub key_points: Vec<String>,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub reason: String,
    pub possible_topics: Vec<PossibleTopicSuggestion>,
    pub missing_context: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BatchDecisionReview {
    pub review_id: String,
    pub batch_id: String,
    pub runtime_state: AiBatchRuntimeState,
    pub created_at: String,
    pub model_schema_version: String,
    pub clusters: Vec<BatchDecisionCluster>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewFeedbackRecord {
    pub batch_id: String,
    pub review_id: String,
    pub action: ReviewAction,
    pub edited_cluster_ids: Vec<String>,
    pub note: Option<String>,
    pub submitted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplyBatchDecisionRequest {
    pub batch_id: String,
    pub review: BatchDecisionReview,
    pub feedback: ReviewFeedbackRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PersistedKnowledgeDestination {
    Topic,
    Inbox,
    Discard,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PersistedKnowledgeOutput {
    pub cluster_id: String,
    pub destination: PersistedKnowledgeDestination,
    pub file_path: Option<String>,
    pub topic_slug: Option<String>,
    pub topic_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplyBatchDecisionResult {
    pub batch_id: String,
    pub accepted: bool,
    pub mocked: bool,
    pub runtime_state: AiBatchRuntimeState,
    pub message: String,
    pub persisted_outputs: Vec<PersistedKnowledgeOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedReviewSubmission {
    saved_at: String,
    batch_id: String,
    review_id: String,
    review: BatchDecisionReview,
    feedback: ReviewFeedbackRecord,
    persisted_outputs: Vec<PersistedKnowledgeOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiBatchPayload {
    pub batch: AiBatchSummary,
    pub captures: Vec<AiBatchCapture>,
    pub available_topics: Vec<TopicIndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredBatchFile {
    id: String,
    status: String,
    created_at: String,
    trigger_reason: String,
    capture_count: usize,
    first_captured_at: String,
    last_captured_at: String,
    source_ids: Vec<String>,
    captures: Vec<CaptureRecord>,
}

#[tauri::command]
#[specta::specta]
pub fn list_ready_ai_batches(state: State<'_, AppState>) -> Result<Vec<AiBatchSummary>, String> {
    let knowledge_root = state.current_settings()?.knowledge_root_path();
    let mut summaries = load_stored_batches(&knowledge_root)?
        .into_iter()
        .filter(|batch| {
            matches!(
                map_batch_runtime_state(&batch.status),
                AiBatchRuntimeState::Ready
            )
        })
        .map(stored_batch_summary)
        .collect::<Vec<_>>();

    summaries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(summaries)
}

#[tauri::command]
#[specta::specta]
pub fn get_ai_batch_payload(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<AiBatchPayload, String> {
    let knowledge_root = state.current_settings()?.knowledge_root_path();
    let stored_batch = load_stored_batch(&knowledge_root, &batch_id)?;

    Ok(AiBatchPayload {
        batch: stored_batch_summary(stored_batch.clone()),
        captures: stored_batch
            .captures
            .iter()
            .map(ai_batch_capture)
            .collect::<Vec<_>>(),
        available_topics: load_topic_index_entries(&knowledge_root)?,
    })
}

#[tauri::command]
#[specta::specta]
pub fn get_topic_index_entries(state: State<'_, AppState>) -> Result<Vec<TopicIndexEntry>, String> {
    let knowledge_root = state.current_settings()?.knowledge_root_path();
    load_topic_index_entries(&knowledge_root)
}

#[tauri::command]
#[specta::specta]
pub fn apply_batch_decision(
    state: State<'_, AppState>,
    request: ApplyBatchDecisionRequest,
) -> Result<ApplyBatchDecisionResult, String> {
    let batch_id = request.batch_id.trim();
    if batch_id.is_empty() {
        return Err("batchId is required".into());
    }

    let knowledge_root = state.current_settings()?.knowledge_root_path();
    let mut stored_batch = load_stored_batch(&knowledge_root, batch_id)?;
    if !matches!(
        map_batch_runtime_state(&stored_batch.status),
        AiBatchRuntimeState::Ready
    ) {
        return Err("batch is no longer ready for review".into());
    }

    if request.review.batch_id != batch_id {
        return Err("review.batchId must match batchId".into());
    }

    let review_id = request.review.review_id.trim();
    if review_id.is_empty() {
        return Err("review.reviewId is required".into());
    }

    if request.feedback.batch_id != batch_id {
        return Err("feedback.batchId must match batchId".into());
    }

    if request.feedback.review_id != request.review.review_id {
        return Err("feedback.reviewId must match review.reviewId".into());
    }

    let submitted_at = request.feedback.submitted_at.trim();
    if submitted_at.is_empty() {
        return Err("feedback.submittedAt is required".into());
    }
    parse_rfc3339_timestamp(submitted_at)?;

    if request.review.clusters.is_empty() {
        return Err("review.clusters must not be empty".into());
    }

    let mut assigned_source_ids = BTreeSet::new();
    let mut cluster_ids = BTreeSet::new();
    let batch_source_ids = stored_batch
        .source_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();

    for cluster in &request.review.clusters {
        let cluster_id = cluster.cluster_id.trim();
        if cluster_id.is_empty() {
            return Err("review.clusters[*].clusterId is required".into());
        }

        if !cluster_ids.insert(cluster_id.to_string()) {
            return Err(format!("duplicate clusterId: {cluster_id}"));
        }

        if !(0.0..=1.0).contains(&cluster.confidence) {
            return Err(format!(
                "cluster {} has confidence outside the allowed range",
                cluster.cluster_id
            ));
        }

        if cluster.source_ids.is_empty() {
            return Err(format!(
                "cluster {} must reference at least one sourceId",
                cluster.cluster_id
            ));
        }

        if cluster.title.trim().is_empty() {
            return Err(format!("cluster {} title is required", cluster.cluster_id));
        }

        if cluster.summary.trim().is_empty() {
            return Err(format!(
                "cluster {} summary is required",
                cluster.cluster_id
            ));
        }

        if cluster.key_points.is_empty()
            || cluster
                .key_points
                .iter()
                .any(|value| value.trim().is_empty())
        {
            return Err(format!(
                "cluster {} must contain at least one non-empty key point",
                cluster.cluster_id
            ));
        }

        for source_id in &cluster.source_ids {
            if !batch_source_ids.contains(source_id) {
                return Err(format!(
                    "cluster {} contains sourceId not present in batch: {}",
                    cluster.cluster_id, source_id
                ));
            }

            if !assigned_source_ids.insert(source_id.clone()) {
                return Err(format!(
                    "sourceId {} was assigned to more than one cluster",
                    source_id
                ));
            }
        }
    }

    for edited_cluster_id in &request.feedback.edited_cluster_ids {
        if !cluster_ids.contains(edited_cluster_id) {
            return Err(format!(
                "feedback.editedClusterIds contains unknown clusterId: {}",
                edited_cluster_id
            ));
        }
    }

    ensure_knowledge_root_layout(&knowledge_root)?;
    let saved_at = crate::format_system_time_rfc3339(std::time::SystemTime::now())?;
    let review_submission = PersistedReviewSubmission {
        saved_at: saved_at.clone(),
        batch_id: batch_id.to_string(),
        review_id: review_id.to_string(),
        review: request.review.clone(),
        feedback: request.feedback.clone(),
        persisted_outputs: Vec::new(),
    };
    write_json_file(
        &review_file_path(&knowledge_root, review_id),
        &review_submission,
    )?;

    let persisted_outputs = persist_review_outputs(
        &knowledge_root,
        &stored_batch,
        &request.review,
        &request.feedback,
        &saved_at,
    )?;

    let persisted_review_submission = PersistedReviewSubmission {
        persisted_outputs: persisted_outputs.clone(),
        ..review_submission
    };
    write_json_file(
        &review_file_path(&knowledge_root, review_id),
        &persisted_review_submission,
    )?;

    stored_batch.status = "persisted".into();
    write_json_file(&batch_file_path(&knowledge_root, batch_id), &stored_batch)?;
    state.run_periodic_maintenance()?;

    Ok(ApplyBatchDecisionResult {
        batch_id: batch_id.to_string(),
        accepted: true,
        mocked: false,
        runtime_state: AiBatchRuntimeState::Persisted,
        message: build_persistence_message(&persisted_outputs),
        persisted_outputs,
    })
}

fn stored_batch_summary(batch: StoredBatchFile) -> AiBatchSummary {
    AiBatchSummary {
        id: batch.id,
        runtime_state: map_batch_runtime_state(&batch.status),
        created_at: batch.created_at,
        trigger_reason: batch.trigger_reason,
        capture_count: batch.capture_count,
        first_captured_at: batch.first_captured_at,
        last_captured_at: batch.last_captured_at,
        source_ids: batch.source_ids,
    }
}

fn ai_batch_capture(capture: &CaptureRecord) -> AiBatchCapture {
    AiBatchCapture {
        id: capture.id.clone(),
        content_kind: capture.content_kind.clone(),
        captured_at: capture.captured_at.clone(),
        source: capture.source.clone(),
        source_app_name: capture.source_app_name.clone(),
        source_app_bundle_id: capture.source_app_bundle_id.clone(),
        preview: build_capture_preview(capture),
        raw_text: capture.raw_text.clone(),
        raw_rich: capture.raw_rich.clone(),
        raw_rich_format: capture.raw_rich_format.clone(),
        link_url: capture.link_url.clone(),
    }
}

fn build_capture_preview(capture: &CaptureRecord) -> String {
    if capture.content_kind == "link" {
        if let Some(link_url) = capture.link_url.as_deref() {
            if !link_url.trim().is_empty() {
                return link_url.trim().to_string();
            }
        }
    }

    if capture.content_kind == "image" {
        return "Clipboard image".into();
    }

    let compact = capture
        .raw_text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if compact.is_empty() {
        return "(empty capture)".into();
    }

    let mut preview = compact.chars().take(120).collect::<String>();
    if compact.chars().count() > 120 {
        preview.push('…');
    }

    preview
}

fn map_batch_runtime_state(status: &str) -> AiBatchRuntimeState {
    match status.trim() {
        "pending_ai" | "ready" => AiBatchRuntimeState::Ready,
        "running" => AiBatchRuntimeState::Running,
        "schema_failed" => AiBatchRuntimeState::SchemaFailed,
        "review_pending" => AiBatchRuntimeState::ReviewPending,
        "reviewed" => AiBatchRuntimeState::Reviewed,
        "persisting" => AiBatchRuntimeState::Persisting,
        "persisted" => AiBatchRuntimeState::Persisted,
        _ => AiBatchRuntimeState::Failed,
    }
}

fn load_stored_batches(knowledge_root: &Path) -> Result<Vec<StoredBatchFile>, String> {
    let batches_dir = knowledge_root.join("_system").join("batches");
    if !batches_dir.exists() {
        return Ok(Vec::new());
    }

    let mut batches = Vec::new();
    for entry in fs::read_dir(batches_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        let batch =
            serde_json::from_slice::<StoredBatchFile>(&bytes).map_err(|error| error.to_string())?;
        batches.push(batch);
    }

    Ok(batches)
}

fn load_stored_batch(knowledge_root: &Path, batch_id: &str) -> Result<StoredBatchFile, String> {
    let normalized_id = batch_id.trim();
    if normalized_id.is_empty() {
        return Err("batchId is required".into());
    }

    let path = batch_file_path(knowledge_root, normalized_id);
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice::<StoredBatchFile>(&bytes).map_err(|error| error.to_string())
}

fn batch_file_path(knowledge_root: &Path, batch_id: &str) -> PathBuf {
    knowledge_root
        .join("_system")
        .join("batches")
        .join(format!("{batch_id}.json"))
}

fn review_file_path(knowledge_root: &Path, review_id: &str) -> PathBuf {
    knowledge_root
        .join("_system")
        .join("reviews")
        .join(format!("{review_id}.json"))
}

fn topic_file_path(knowledge_root: &Path, topic_slug: &str) -> PathBuf {
    knowledge_root
        .join("topics")
        .join(format!("{topic_slug}.md"))
}

fn inbox_file_path(knowledge_root: &Path, submitted_at: &str) -> Result<PathBuf, String> {
    let timestamp = parse_rfc3339_timestamp(submitted_at)?;
    let date = timestamp.format("%Y-%m-%d").to_string();
    Ok(knowledge_root.join("_inbox").join(format!("{date}.md")))
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

fn load_topic_index_entries(knowledge_root: &Path) -> Result<Vec<TopicIndexEntry>, String> {
    let topics_dir = knowledge_root.join("topics");
    if !topics_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(topics_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }

        let Some(topic_slug) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let topic_name = parse_topic_name(&content).unwrap_or_else(|| topic_slug.replace('-', " "));
        let topic_summary =
            parse_topic_summary(&content).unwrap_or_else(|| "Topic summary unavailable.".into());
        let metadata = path.metadata().map_err(|error| error.to_string())?;
        let last_updated_at = metadata
            .modified()
            .ok()
            .map(crate::format_system_time_rfc3339)
            .transpose()?
            .unwrap_or_default();

        entries.push(TopicIndexEntry {
            topic_slug: topic_slug.to_string(),
            topic_name,
            topic_summary,
            recent_tags: parse_topic_recent_tags(&content),
            last_updated_at,
        });
    }

    entries.sort_by(|left, right| right.last_updated_at.cmp(&left.last_updated_at));
    Ok(entries)
}

fn persist_review_outputs(
    knowledge_root: &Path,
    stored_batch: &StoredBatchFile,
    review: &BatchDecisionReview,
    feedback: &ReviewFeedbackRecord,
    saved_at: &str,
) -> Result<Vec<PersistedKnowledgeOutput>, String> {
    let captures_by_id = stored_batch
        .captures
        .iter()
        .map(|capture| (capture.id.clone(), capture))
        .collect::<BTreeMap<_, _>>();
    let mut persisted_outputs = Vec::with_capacity(review.clusters.len());

    for cluster in &review.clusters {
        let source_captures = cluster
            .source_ids
            .iter()
            .map(|source_id| {
                captures_by_id.get(source_id).copied().ok_or_else(|| {
                    format!(
                        "cluster {} references missing sourceId {}",
                        cluster.cluster_id, source_id
                    )
                })
            })
            .collect::<Result<Vec<_>, _>>()?;

        let effective_decision =
            resolve_effective_decision(cluster.decision.clone(), &feedback.action);

        match effective_decision {
            AiDecision::ArchiveToTopic => {
                let topic_slug = resolve_topic_slug(cluster);
                let topic_name = resolve_topic_name(cluster, &topic_slug);
                let path = topic_file_path(knowledge_root, &topic_slug);
                let section_marker = render_cluster_marker(&review.review_id, &cluster.cluster_id);
                let section_markdown = render_persisted_cluster_section(
                    stored_batch,
                    review,
                    feedback,
                    cluster,
                    &source_captures,
                    saved_at,
                    PersistedKnowledgeDestination::Topic,
                    Some((&topic_slug, &topic_name)),
                );
                upsert_topic_markdown_file(
                    &path,
                    &topic_name,
                    &cluster.summary,
                    &cluster.tags,
                    saved_at,
                    &section_marker,
                    &section_markdown,
                )?;
                persisted_outputs.push(PersistedKnowledgeOutput {
                    cluster_id: cluster.cluster_id.clone(),
                    destination: PersistedKnowledgeDestination::Topic,
                    file_path: Some(relative_output_path(knowledge_root, &path)),
                    topic_slug: Some(topic_slug),
                    topic_name: Some(topic_name),
                });
            }
            AiDecision::SendToInbox => {
                let path = inbox_file_path(knowledge_root, &feedback.submitted_at)?;
                let timestamp = parse_rfc3339_timestamp(&feedback.submitted_at)?;
                let section_marker = render_cluster_marker(&review.review_id, &cluster.cluster_id);
                let section_markdown = render_persisted_cluster_section(
                    stored_batch,
                    review,
                    feedback,
                    cluster,
                    &source_captures,
                    saved_at,
                    PersistedKnowledgeDestination::Inbox,
                    None,
                );
                upsert_inbox_markdown_file(
                    &path,
                    &timestamp.format("%Y-%m-%d").to_string(),
                    saved_at,
                    &section_marker,
                    &section_markdown,
                )?;
                persisted_outputs.push(PersistedKnowledgeOutput {
                    cluster_id: cluster.cluster_id.clone(),
                    destination: PersistedKnowledgeDestination::Inbox,
                    file_path: Some(relative_output_path(knowledge_root, &path)),
                    topic_slug: None,
                    topic_name: None,
                });
            }
            AiDecision::Discard => {
                persisted_outputs.push(PersistedKnowledgeOutput {
                    cluster_id: cluster.cluster_id.clone(),
                    destination: PersistedKnowledgeDestination::Discard,
                    file_path: None,
                    topic_slug: None,
                    topic_name: None,
                });
            }
        }
    }

    Ok(persisted_outputs)
}

fn resolve_effective_decision(
    cluster_decision: AiDecision,
    feedback_action: &ReviewAction,
) -> AiDecision {
    match feedback_action {
        ReviewAction::RerouteToInbox => match cluster_decision {
            AiDecision::Discard => AiDecision::Discard,
            _ => AiDecision::SendToInbox,
        },
        ReviewAction::Discard => AiDecision::Discard,
        _ => cluster_decision,
    }
}

fn resolve_topic_slug(cluster: &BatchDecisionCluster) -> String {
    let raw = cluster
        .topic_slug_suggestion
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(cluster.topic_name_suggestion.as_deref())
        .unwrap_or(cluster.title.as_str());

    slugify_topic_value(raw)
}

fn resolve_topic_name(cluster: &BatchDecisionCluster, topic_slug: &str) -> String {
    let trimmed = cluster
        .topic_name_suggestion
        .as_deref()
        .unwrap_or(cluster.title.as_str())
        .trim();

    if trimmed.is_empty() {
        topic_slug.replace('-', " ")
    } else {
        trimmed.into()
    }
}

fn slugify_topic_value(raw: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_dash = false;

    for character in raw.trim().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
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

fn upsert_topic_markdown_file(
    path: &Path,
    topic_name: &str,
    latest_summary: &str,
    recent_tags: &[String],
    updated_at: &str,
    section_marker: &str,
    section_markdown: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let next_content = if path.exists() {
        let existing = fs::read_to_string(path).map_err(|error| error.to_string())?;
        if existing.contains(section_marker) {
            return Ok(());
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

    fs::write(path, next_content).map_err(|error| error.to_string())
}

fn upsert_inbox_markdown_file(
    path: &Path,
    day: &str,
    updated_at: &str,
    section_marker: &str,
    section_markdown: &str,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let next_content = if path.exists() {
        let existing = fs::read_to_string(path).map_err(|error| error.to_string())?;
        if existing.contains(section_marker) {
            return Ok(());
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

    fs::write(path, next_content).map_err(|error| error.to_string())
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

fn render_persisted_cluster_section(
    stored_batch: &StoredBatchFile,
    review: &BatchDecisionReview,
    feedback: &ReviewFeedbackRecord,
    cluster: &BatchDecisionCluster,
    source_captures: &[&CaptureRecord],
    saved_at: &str,
    destination: PersistedKnowledgeDestination,
    topic: Option<(&str, &str)>,
) -> String {
    let mut section = String::new();
    let cluster_marker = render_cluster_marker(&review.review_id, &cluster.cluster_id);
    section.push_str(&cluster_marker);
    section.push('\n');
    section.push_str(&format!(
        "## {} `{}`\n",
        feedback.submitted_at,
        sanitize_inline_markdown(&cluster.title)
    ));
    section.push_str(&format!("- Batch: `{}`\n", stored_batch.id));
    section.push_str(&format!("- Review: `{}`\n", review.review_id));
    section.push_str(&format!(
        "- Applied as: `{}`\n",
        review_action_label(&feedback.action)
    ));
    section.push_str(&format!(
        "- Destination: `{}`\n",
        persisted_destination_label(&destination)
    ));
    if let Some((topic_slug, topic_name)) = topic {
        section.push_str(&format!(
            "- Topic: {} [`{}`]\n",
            sanitize_inline_markdown(topic_name),
            topic_slug
        ));
    }
    section.push_str(&format!("- Confidence: `{:.2}`\n", cluster.confidence));
    section.push_str(&format!("- Tags: {}\n", render_tag_list(&cluster.tags)));
    section.push_str(&format!(
        "- Source IDs: {}\n",
        render_inline_code_list(&cluster.source_ids)
    ));
    section.push_str(&format!("- Persisted at: `{saved_at}`\n\n"));
    section.push_str("### Summary\n");
    section.push_str(cluster.summary.trim());
    section.push_str("\n\n### Key Points\n");
    for key_point in &cluster.key_points {
        section.push_str(&format!("- {}\n", key_point.trim()));
    }
    section.push_str("\n### Why It Landed Here\n");
    section.push_str(cluster.reason.trim());
    section.push_str("\n\n### Source Fragments\n");
    section.push_str(&render_source_fragments(source_captures));

    if !cluster.missing_context.is_empty() {
        section.push_str("\n### Missing Context\n");
        for item in &cluster.missing_context {
            section.push_str(&format!("- {}\n", item.trim()));
        }
    }

    if !cluster.possible_topics.is_empty() {
        section.push_str("\n### Possible Topics\n");
        for topic in cluster.possible_topics.iter().take(3) {
            let reason = topic
                .reason
                .as_deref()
                .map(sanitize_inline_markdown)
                .unwrap_or_else(|| "No reason provided".into());
            section.push_str(&format!(
                "- {} [`{}`]: {}\n",
                sanitize_inline_markdown(&topic.topic_name),
                topic.topic_slug,
                reason
            ));
        }
    }

    section
}

fn render_cluster_marker(review_id: &str, cluster_id: &str) -> String {
    format!("<!-- tino-cluster:{review_id}:{cluster_id} -->")
}

fn render_source_fragments(source_captures: &[&CaptureRecord]) -> String {
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

fn truncate_inline_text(value: &str, limit: usize) -> String {
    let mut truncated = value.chars().take(limit).collect::<String>();
    if value.chars().count() > limit {
        truncated.push('…');
    }
    truncated
}

fn render_inline_code_list(values: &[String]) -> String {
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

fn render_tag_list(tags: &[String]) -> String {
    if tags.is_empty() {
        "none".into()
    } else {
        tags.join(", ")
    }
}

fn relative_output_path(knowledge_root: &Path, path: &Path) -> String {
    path.strip_prefix(knowledge_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

fn persisted_destination_label(destination: &PersistedKnowledgeDestination) -> &'static str {
    match destination {
        PersistedKnowledgeDestination::Topic => "topic",
        PersistedKnowledgeDestination::Inbox => "inbox",
        PersistedKnowledgeDestination::Discard => "discard",
    }
}

fn review_action_label(action: &ReviewAction) -> &'static str {
    match action {
        ReviewAction::AcceptAll => "accept_all",
        ReviewAction::AcceptWithEdits => "accept_with_edits",
        ReviewAction::RerouteToInbox => "reroute_to_inbox",
        ReviewAction::RerouteTopic => "reroute_topic",
        ReviewAction::Discard => "discard",
    }
}

fn build_persistence_message(outputs: &[PersistedKnowledgeOutput]) -> String {
    let topic_count = outputs
        .iter()
        .filter(|output| matches!(output.destination, PersistedKnowledgeDestination::Topic))
        .count();
    let inbox_count = outputs
        .iter()
        .filter(|output| matches!(output.destination, PersistedKnowledgeDestination::Inbox))
        .count();
    let discard_count = outputs
        .iter()
        .filter(|output| matches!(output.destination, PersistedKnowledgeDestination::Discard))
        .count();

    format!(
        "Review saved and persisted: {topic_count} topic section(s), {inbox_count} inbox item(s), {discard_count} discarded."
    )
}

fn parse_topic_name(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("# ")
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

fn parse_topic_summary(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .map(normalize_topic_summary_line)
        .filter(|value| !value.is_empty())
}

fn normalize_topic_summary_line(line: &str) -> String {
    line.trim()
        .trim_start_matches("> Latest summary:")
        .trim_start_matches("Latest summary:")
        .trim()
        .to_string()
}

fn parse_topic_recent_tags(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .find_map(|line| {
            line.strip_prefix("> Recent tags:")
                .or_else(|| line.strip_prefix("Recent tags:"))
        })
        .map(|line| {
            line.split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty() && *value != "none")
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_rfc3339_timestamp(value: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(value.trim())
        .map_err(|error| format!("invalid RFC3339 timestamp: {error}"))
}

fn sanitize_inline_markdown(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}
