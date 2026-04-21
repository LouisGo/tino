use crate::{
    ai::{
        batch_store::load_stored_batch,
        capability::{compile_batch_with_capability, resolve_background_compile_capability},
        contracts::{
            AiSystemSnapshot, BatchCompilePreviewResult, RecordFeedbackEventInput,
            RecordFeedbackEventResult,
        },
        system,
        topic_index::{load_topic_index_entries, TopicIndexEntry},
    },
    app_state::AppState,
    error::{AppError, IpcError, IpcResult},
};

pub fn get_topic_index_entries(state: &AppState) -> IpcResult<Vec<TopicIndexEntry>> {
    let knowledge_root = state
        .current_settings()
        .map_err(AppError::from)
        .map_err(IpcError::from)?
        .knowledge_root_path();
    load_topic_index_entries(&knowledge_root).map_err(IpcError::from)
}

pub fn get_ai_system_snapshot(state: &AppState) -> Result<AiSystemSnapshot, String> {
    system::load_ai_system_snapshot(state)
}

pub fn record_ai_feedback_event(
    state: &AppState,
    input: RecordFeedbackEventInput,
) -> Result<RecordFeedbackEventResult, String> {
    system::record_feedback_event(state, input)
}

pub fn preview_ai_batch_compile(
    state: &AppState,
    batch_id: String,
) -> Result<BatchCompilePreviewResult, String> {
    let settings = state.current_settings()?;
    let knowledge_root = settings.knowledge_root_path();
    let capability = resolve_background_compile_capability(&settings);
    let batch = load_stored_batch(&knowledge_root, &batch_id).map_err(|error| error.to_string())?;
    let topics = load_topic_index_entries(&knowledge_root).map_err(|error| error.to_string())?;
    let result = compile_batch_with_capability(&settings, &batch, &topics)
        .map_err(|error| error.to_string())?;

    Ok(BatchCompilePreviewResult {
        batch_id: batch.id,
        source_kind: capability.background_source_kind,
        source_label: result.source_label,
        decisions: result.decisions,
    })
}
