use crate::{
    ai::{
        batch_store::load_stored_batch,
        capability::{compile_batch_with_capability, resolve_background_compile_capability},
        contracts::{
            AiSystemSnapshot, BatchCompilePreviewResult, RecordFeedbackEventInput,
            RecordFeedbackEventResult,
        },
        system::{load_ai_system_snapshot, record_feedback_event},
        topic_index::load_topic_index_entries,
    },
    app_state::AppState,
};
use tauri::State;

use super::run_blocking_command;

#[tauri::command]
#[specta::specta]
pub async fn get_ai_system_snapshot(
    state: State<'_, AppState>,
) -> Result<AiSystemSnapshot, String> {
    let state = state.inner().clone();
    run_blocking_command(move || load_ai_system_snapshot(&state)).await
}

#[tauri::command]
#[specta::specta]
pub async fn record_ai_feedback_event(
    state: State<'_, AppState>,
    input: RecordFeedbackEventInput,
) -> Result<RecordFeedbackEventResult, String> {
    let state = state.inner().clone();
    run_blocking_command(move || record_feedback_event(&state, input)).await
}

#[tauri::command]
#[specta::specta]
pub async fn preview_ai_batch_compile(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<BatchCompilePreviewResult, String> {
    let state = state.inner().clone();
    run_blocking_command(move || {
        let settings = state.current_settings()?;
        let knowledge_root = settings.knowledge_root_path();
        let capability = resolve_background_compile_capability(&settings);
        let batch =
            load_stored_batch(&knowledge_root, &batch_id).map_err(|error| error.to_string())?;
        let topics =
            load_topic_index_entries(&knowledge_root).map_err(|error| error.to_string())?;
        let result = compile_batch_with_capability(&settings, &batch, &topics)
            .map_err(|error| error.to_string())?;

        Ok(BatchCompilePreviewResult {
            batch_id: batch.id,
            source_kind: capability.background_source_kind,
            source_label: result.source_label,
            decisions: result.decisions,
        })
    })
    .await
}
