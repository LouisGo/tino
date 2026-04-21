// Legacy `/ai review` compatibility bridge.
// Keep legacy batch/review DTOs and persistence wiring here so `commands/ai.rs`
// remains a thin IPC adapter instead of a feature home.
use crate::ai::{
    batch_store::{load_stored_batch, load_stored_batches, StoredBatchFile},
    contracts::{
        BatchCompileDecision, BatchCompileDisposition, BatchCompileInput, BatchCompileJob,
        BatchCompileJobStatus, BatchCompileRuntimeStatus, BatchCompileTrigger,
        KnowledgeWriteDestination, PersistedKnowledgeWrite,
    },
    knowledge_writer::{
        inbox_file_path, relative_output_path, render_inline_code_list, render_source_fragments,
        render_tag_list, sanitize_inline_markdown, slugify_topic_value, topic_file_path,
        upsert_inbox_markdown_file, upsert_topic_markdown_file,
    },
    runtime_store::{
        append_audit_event, append_write_log_entry, save_job, BatchCompilerAuditEvent,
    },
    topic_index::{load_topic_index_entries, refresh_topic_index_entry, TopicIndexEntry},
};
use crate::app_state::AppState;
use crate::clipboard::types::CaptureRecord;
use crate::error::{AppError, AppResult, IpcError, IpcResult};
use crate::storage::knowledge_root::ensure_knowledge_root_layout;
use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

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

pub fn list_ready_ai_batches(state: AppState) -> IpcResult<Vec<AiBatchSummary>> {
    let knowledge_root = state
        .current_settings()
        .map_err(AppError::from)
        .map_err(IpcError::from)?
        .knowledge_root_path();
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

pub fn get_ai_batch_payload(state: AppState, batch_id: String) -> IpcResult<AiBatchPayload> {
    let knowledge_root = state
        .current_settings()
        .map_err(AppError::from)
        .map_err(IpcError::from)?
        .knowledge_root_path();
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

pub fn apply_batch_decision(
    state: AppState,
    request: ApplyBatchDecisionRequest,
) -> IpcResult<ApplyBatchDecisionResult> {
    let batch_id = request.batch_id.trim();
    if batch_id.is_empty() {
        return Err(IpcError::from(AppError::validation("batchId is required")));
    }

    let knowledge_root = state
        .current_settings()
        .map_err(AppError::from)
        .map_err(IpcError::from)?
        .knowledge_root_path();
    let mut stored_batch = load_stored_batch(&knowledge_root, batch_id)?;
    if !matches!(
        map_batch_runtime_state(&stored_batch.status),
        AiBatchRuntimeState::Ready
    ) {
        return Err(IpcError::from(AppError::state_conflict(
            "batch is no longer ready for review",
        )));
    }

    if request.review.batch_id != batch_id {
        return Err(IpcError::from(AppError::validation(
            "review.batchId must match batchId",
        )));
    }

    let review_id = request.review.review_id.trim();
    if review_id.is_empty() {
        return Err(IpcError::from(AppError::validation(
            "review.reviewId is required",
        )));
    }

    if request.feedback.batch_id != batch_id {
        return Err(IpcError::from(AppError::validation(
            "feedback.batchId must match batchId",
        )));
    }

    if request.feedback.review_id != request.review.review_id {
        return Err(IpcError::from(AppError::validation(
            "feedback.reviewId must match review.reviewId",
        )));
    }

    let submitted_at = request.feedback.submitted_at.trim();
    if submitted_at.is_empty() {
        return Err(IpcError::from(AppError::validation(
            "feedback.submittedAt is required",
        )));
    }
    parse_rfc3339_timestamp(submitted_at)?;

    if request.review.clusters.is_empty() {
        return Err(IpcError::from(AppError::validation(
            "review.clusters must not be empty",
        )));
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
            return Err(IpcError::from(AppError::validation(
                "review.clusters[*].clusterId is required",
            )));
        }

        if !cluster_ids.insert(cluster_id.to_string()) {
            return Err(IpcError::from(AppError::validation(format!(
                "duplicate clusterId: {cluster_id}"
            ))));
        }

        if !(0.0..=1.0).contains(&cluster.confidence) {
            return Err(IpcError::from(AppError::validation(format!(
                "cluster {} has confidence outside the allowed range",
                cluster.cluster_id
            ))));
        }

        if cluster.source_ids.is_empty() {
            return Err(IpcError::from(AppError::validation(format!(
                "cluster {} must reference at least one sourceId",
                cluster.cluster_id
            ))));
        }

        if cluster.title.trim().is_empty() {
            return Err(IpcError::from(AppError::validation(format!(
                "cluster {} title is required",
                cluster.cluster_id
            ))));
        }

        if cluster.summary.trim().is_empty() {
            return Err(IpcError::from(AppError::validation(format!(
                "cluster {} summary is required",
                cluster.cluster_id
            ))));
        }

        if cluster.key_points.is_empty()
            || cluster
                .key_points
                .iter()
                .any(|value| value.trim().is_empty())
        {
            return Err(IpcError::from(AppError::validation(format!(
                "cluster {} must contain at least one non-empty key point",
                cluster.cluster_id
            ))));
        }

        for source_id in &cluster.source_ids {
            if !batch_source_ids.contains(source_id) {
                return Err(IpcError::from(AppError::validation(format!(
                    "cluster {} contains sourceId not present in batch: {}",
                    cluster.cluster_id, source_id
                ))));
            }

            if !assigned_source_ids.insert(source_id.clone()) {
                return Err(IpcError::from(AppError::validation(format!(
                    "sourceId {} was assigned to more than one cluster",
                    source_id
                ))));
            }
        }
    }

    for edited_cluster_id in &request.feedback.edited_cluster_ids {
        if !cluster_ids.contains(edited_cluster_id) {
            return Err(IpcError::from(AppError::validation(format!(
                "feedback.editedClusterIds contains unknown clusterId: {}",
                edited_cluster_id
            ))));
        }
    }

    ensure_knowledge_root_layout(&knowledge_root)
        .map_err(AppError::from)
        .map_err(IpcError::from)?;
    let saved_at = crate::format_system_time_rfc3339(std::time::SystemTime::now())
        .map_err(AppError::from)
        .map_err(IpcError::from)?;
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
    let persisted_writes =
        build_persisted_writes(batch_id, &request.review, &persisted_outputs, &saved_at)?;
    for persisted_write in &persisted_writes {
        append_write_log_entry(&knowledge_root, persisted_write).map_err(IpcError::from)?;
    }
    let persisted_job = build_persisted_job(
        &stored_batch,
        &request.review,
        &persisted_outputs,
        &persisted_writes,
        &saved_at,
    )?;
    save_job(&knowledge_root, &persisted_job).map_err(IpcError::from)?;
    append_audit_event(
        &knowledge_root,
        &BatchCompilerAuditEvent {
            id: format!("audit_{}", Uuid::now_v7().simple()),
            job_id: Some(persisted_job.id.clone()),
            status: BatchCompileRuntimeStatus::Idle,
            message: "legacy review persistence recorded a compile job snapshot".into(),
            recorded_at: saved_at.clone(),
        },
    )
    .map_err(IpcError::from)?;

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
    state
        .run_periodic_maintenance()
        .map_err(AppError::from)
        .map_err(IpcError::from)?;

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

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create AI output directory", error))?;
    }

    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::json("failed to serialize AI output file", error))?;
    fs::write(path, bytes).map_err(|error| AppError::io("failed to write AI output file", error))
}

fn persist_review_outputs(
    knowledge_root: &Path,
    stored_batch: &StoredBatchFile,
    review: &BatchDecisionReview,
    feedback: &ReviewFeedbackRecord,
    saved_at: &str,
) -> AppResult<Vec<PersistedKnowledgeOutput>> {
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
                    AppError::internal(format!(
                        "cluster {} references missing sourceId {}",
                        cluster.cluster_id, source_id
                    ))
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
                refresh_topic_index_entry(knowledge_root, &topic_slug)?;
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

fn build_persisted_writes(
    batch_id: &str,
    review: &BatchDecisionReview,
    outputs: &[PersistedKnowledgeOutput],
    saved_at: &str,
) -> AppResult<Vec<PersistedKnowledgeWrite>> {
    let clusters_by_id = review
        .clusters
        .iter()
        .map(|cluster| (cluster.cluster_id.as_str(), cluster))
        .collect::<BTreeMap<_, _>>();
    let mut writes = Vec::new();

    for output in outputs {
        let Some(knowledge_path) = output.file_path.as_ref() else {
            continue;
        };
        let Some(cluster) = clusters_by_id.get(output.cluster_id.as_str()) else {
            return Err(AppError::internal(format!(
                "persisted output references missing cluster {}",
                output.cluster_id
            )));
        };
        let destination = match output.destination {
            PersistedKnowledgeDestination::Topic => KnowledgeWriteDestination::Topic,
            PersistedKnowledgeDestination::Inbox => KnowledgeWriteDestination::Inbox,
            PersistedKnowledgeDestination::Discard => continue,
        };

        writes.push(PersistedKnowledgeWrite {
            write_id: format!("write_{}", Uuid::now_v7().simple()),
            job_id: batch_id.to_string(),
            decision_id: output.cluster_id.clone(),
            destination,
            knowledge_path: knowledge_path.clone(),
            topic_slug: output.topic_slug.clone(),
            topic_name: output.topic_name.clone(),
            title: cluster.title.clone(),
            source_capture_ids: cluster.source_ids.clone(),
            persisted_at: saved_at.to_string(),
        });
    }

    Ok(writes)
}

fn build_persisted_job(
    stored_batch: &StoredBatchFile,
    review: &BatchDecisionReview,
    outputs: &[PersistedKnowledgeOutput],
    persisted_writes: &[PersistedKnowledgeWrite],
    saved_at: &str,
) -> AppResult<BatchCompileJob> {
    let outputs_by_cluster_id = outputs
        .iter()
        .map(|output| (output.cluster_id.as_str(), output))
        .collect::<BTreeMap<_, _>>();
    let decisions = review
        .clusters
        .iter()
        .map(|cluster| {
            let output = outputs_by_cluster_id
                .get(cluster.cluster_id.as_str())
                .ok_or_else(|| {
                    AppError::internal(format!(
                        "persisted job build missing output for cluster {}",
                        cluster.cluster_id
                    ))
                })?;

            Ok(BatchCompileDecision {
                decision_id: cluster.cluster_id.clone(),
                disposition: match output.destination {
                    PersistedKnowledgeDestination::Topic => BatchCompileDisposition::WriteTopic,
                    PersistedKnowledgeDestination::Inbox => BatchCompileDisposition::WriteInbox,
                    PersistedKnowledgeDestination::Discard => BatchCompileDisposition::DiscardNoise,
                },
                source_capture_ids: cluster.source_ids.clone(),
                topic_slug: output.topic_slug.clone(),
                topic_name: output.topic_name.clone(),
                title: cluster.title.clone(),
                summary: cluster.summary.clone(),
                key_points: cluster.key_points.clone(),
                tags: cluster.tags.clone(),
                confidence: cluster.confidence,
                rationale: cluster.reason.clone(),
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(BatchCompileJob {
        id: stored_batch.id.clone(),
        status: BatchCompileJobStatus::Persisted,
        queued_at: stored_batch.created_at.clone(),
        started_at: Some(review.created_at.clone()),
        finished_at: Some(saved_at.to_string()),
        attempt: 1,
        input: BatchCompileInput {
            batch_id: Some(stored_batch.id.clone()),
            trigger: map_legacy_trigger_reason(&stored_batch.trigger_reason),
            capture_count: stored_batch.capture_count,
            source_capture_ids: stored_batch.source_ids.clone(),
            first_captured_at: Some(stored_batch.first_captured_at.clone()),
            last_captured_at: Some(stored_batch.last_captured_at.clone()),
        },
        decisions,
        persisted_writes: persisted_writes.to_vec(),
        failure_reason: None,
    })
}

fn map_legacy_trigger_reason(trigger_reason: &str) -> BatchCompileTrigger {
    match trigger_reason.trim() {
        "capture_count" => BatchCompileTrigger::CaptureCount,
        "max_wait" => BatchCompileTrigger::MaxWait,
        "manual_retry" => BatchCompileTrigger::ManualRetry,
        _ => BatchCompileTrigger::ManualReplay,
    }
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

fn parse_rfc3339_timestamp(value: &str) -> AppResult<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value.trim())
        .map_err(|error| AppError::validation(format!("invalid RFC3339 timestamp: {error}")))
}
