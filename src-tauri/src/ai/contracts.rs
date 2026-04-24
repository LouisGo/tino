use crate::runtime_provider::RuntimeProviderVendor;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiSystemPhase {
    ContractReset,
    StorageReset,
    CapabilityBoundary,
    BackgroundCompiler,
    QualityLoop,
    AiOps,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundCompileSourceKind {
    InjectedMock,
    ProviderProfile,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundCompileWriteMode {
    LegacyLive,
    SandboxOnly,
    DigestGated,
}

impl BackgroundCompileWriteMode {
    pub fn persists_live_writes(self) -> bool {
        matches!(self, Self::LegacyLive)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatchCompileTrigger {
    CaptureCount,
    MaxWait,
    ManualReplay,
    ManualRetry,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatchCompileRuntimeStatus {
    NotBootstrapped,
    AwaitingCapability,
    Idle,
    Running,
    RetryBackoff,
    Blocked,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatchCompileJobStatus {
    Queued,
    Running,
    ModelComplete,
    WritePending,
    Persisted,
    Failed,
    Abandoned,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BatchCompileDisposition {
    WriteTopic,
    WriteInbox,
    DiscardNoise,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompileInput {
    pub batch_id: Option<String>,
    pub trigger: BatchCompileTrigger,
    pub capture_count: usize,
    pub source_capture_ids: Vec<String>,
    pub first_captured_at: Option<String>,
    pub last_captured_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompileDecision {
    pub decision_id: String,
    pub disposition: BatchCompileDisposition,
    pub source_capture_ids: Vec<String>,
    pub topic_slug: Option<String>,
    pub topic_name: Option<String>,
    pub title: String,
    pub summary: String,
    pub key_points: Vec<String>,
    pub tags: Vec<String>,
    pub confidence: f64,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompileJob {
    pub id: String,
    pub status: BatchCompileJobStatus,
    pub queued_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub attempt: u32,
    pub input: BatchCompileInput,
    pub decisions: Vec<BatchCompileDecision>,
    pub persisted_writes: Vec<PersistedKnowledgeWrite>,
    pub failure_reason: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeWriteDestination {
    Topic,
    Inbox,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PersistedKnowledgeWrite {
    pub write_id: String,
    pub job_id: String,
    pub decision_id: String,
    pub destination: KnowledgeWriteDestination,
    pub knowledge_path: String,
    pub topic_slug: Option<String>,
    pub topic_name: Option<String>,
    pub title: String,
    pub source_capture_ids: Vec<String>,
    pub persisted_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackEventKind {
    TopicConfirmed,
    TopicReassigned,
    RoutedToInbox,
    RestoredToTopic,
    DiscardedAsNoise,
    KnowledgeRetained,
    KnowledgeDeleted,
    TopicViewed,
}

impl FeedbackEventKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TopicConfirmed => "topic_confirmed",
            Self::TopicReassigned => "topic_reassigned",
            Self::RoutedToInbox => "routed_to_inbox",
            Self::RestoredToTopic => "restored_to_topic",
            Self::DiscardedAsNoise => "discarded_as_noise",
            Self::KnowledgeRetained => "knowledge_retained",
            Self::KnowledgeDeleted => "knowledge_deleted",
            Self::TopicViewed => "topic_viewed",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackEventSource {
    User,
    System,
    Migration,
}

impl FeedbackEventSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::System => "system",
            Self::Migration => "migration",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackEvent {
    pub id: String,
    pub kind: FeedbackEventKind,
    pub source: FeedbackEventSource,
    pub job_id: Option<String>,
    pub write_id: Option<String>,
    pub source_capture_ids: Vec<String>,
    pub topic_slug: Option<String>,
    pub target_topic_slug: Option<String>,
    pub recorded_at: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordFeedbackEventInput {
    pub kind: FeedbackEventKind,
    pub source: FeedbackEventSource,
    pub job_id: Option<String>,
    pub write_id: Option<String>,
    pub source_capture_ids: Vec<String>,
    pub topic_slug: Option<String>,
    pub target_topic_slug: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QualitySnapshot {
    pub id: String,
    pub generated_at: String,
    pub total_feedback_events: usize,
    pub classification_feedback_count: usize,
    pub correction_event_count: usize,
    pub correction_rate: Option<f64>,
    pub topic_confirmed_count: usize,
    pub topic_reassigned_count: usize,
    pub inbox_reroute_count: usize,
    pub restored_to_topic_count: usize,
    pub discarded_count: usize,
    pub retained_count: usize,
    pub deleted_count: usize,
    pub viewed_count: usize,
    pub last_feedback_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecordFeedbackEventResult {
    pub event: FeedbackEvent,
    pub quality_snapshot: QualitySnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiCapabilitySnapshot {
    pub interactive_configured: bool,
    pub background_compile_configured: bool,
    pub background_source_kind: BackgroundCompileSourceKind,
    pub background_source_label: String,
    pub background_source_reason: Option<String>,
    pub active_provider_id: Option<String>,
    pub active_provider_name: Option<String>,
    pub active_vendor: Option<RuntimeProviderVendor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompilerRuntimeSnapshot {
    pub status: BatchCompileRuntimeStatus,
    pub observed_pending_capture_count: usize,
    pub observed_batch_backlog_count: usize,
    pub active_job: Option<BatchCompileJob>,
    pub last_transition_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSystemSnapshot {
    pub phase: AiSystemPhase,
    pub capability: AiCapabilitySnapshot,
    pub background_compile_write_mode: BackgroundCompileWriteMode,
    pub runtime: BatchCompilerRuntimeSnapshot,
    pub feedback_event_count: usize,
    pub latest_quality_snapshot: Option<QualitySnapshot>,
    pub recent_jobs: Vec<BatchCompileJob>,
    pub recent_writes: Vec<PersistedKnowledgeWrite>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompilePreviewResult {
    pub batch_id: String,
    pub source_kind: BackgroundCompileSourceKind,
    pub source_label: String,
    pub decisions: Vec<BatchCompileDecision>,
}
