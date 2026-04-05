use crate::app_state::{AppState, CaptureRecord};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::State;

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
#[serde(rename_all = "camelCase")]
pub struct ApplyBatchDecisionResult {
    pub batch_id: String,
    pub accepted: bool,
    pub mocked: bool,
    pub runtime_state: AiBatchRuntimeState,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedReviewSubmission {
    saved_at: String,
    batch_id: String,
    review_id: String,
    review: BatchDecisionReview,
    feedback: ReviewFeedbackRecord,
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

    if request.review.clusters.is_empty() {
        return Err("review.clusters must not be empty".into());
    }

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

        for source_id in &cluster.source_ids {
            if !batch_source_ids.contains(source_id) {
                return Err(format!(
                    "cluster {} contains sourceId not present in batch: {}",
                    cluster.cluster_id, source_id
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

    let review_submission = PersistedReviewSubmission {
        saved_at: crate::format_system_time_rfc3339(std::time::SystemTime::now())?,
        batch_id: batch_id.to_string(),
        review_id: review_id.to_string(),
        review: request.review.clone(),
        feedback: request.feedback.clone(),
    };
    write_json_file(
        &review_file_path(&knowledge_root, review_id),
        &review_submission,
    )?;

    stored_batch.status = "reviewed".into();
    write_json_file(&batch_file_path(&knowledge_root, batch_id), &stored_batch)?;
    state.run_periodic_maintenance()?;

    Ok(ApplyBatchDecisionResult {
        batch_id: batch_id.to_string(),
        accepted: true,
        mocked: false,
        runtime_state: AiBatchRuntimeState::Reviewed,
        message: "Review saved. Knowledge persistence remains disabled in this phase.".into(),
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
        let topic_summary = content
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty() && !line.starts_with('#'))
            .unwrap_or("Topic summary unavailable.")
            .to_string();
        let metadata = path.metadata().map_err(|error| error.to_string())?;
        let last_updated_at = metadata
            .modified()
            .ok()
            .map(crate::format_system_time_rfc3339)
            .transpose()?
            .unwrap_or_default();

        entries.push(TopicIndexEntry {
            topic_slug: topic_slug.to_string(),
            topic_name: topic_slug.replace('-', " "),
            topic_summary,
            recent_tags: Vec::new(),
            last_updated_at,
        });
    }

    entries.sort_by(|left, right| right.last_updated_at.cmp(&left.last_updated_at));
    Ok(entries)
}
