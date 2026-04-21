use crate::{
    ai::{
        contracts::{
            AiSystemSnapshot, BatchCompilePreviewResult, RecordFeedbackEventInput,
            RecordFeedbackEventResult,
        },
        ops,
        topic_index::TopicIndexEntry,
    },
    app_state::AppState,
    error::IpcResult,
};
use tauri::State;

use super::{run_blocking_command, run_blocking_ipc_command};

#[tauri::command]
#[specta::specta]
pub async fn get_topic_index_entries(
    state: State<'_, AppState>,
) -> IpcResult<Vec<TopicIndexEntry>> {
    let state = state.inner().clone();
    run_blocking_ipc_command(move || ops::get_topic_index_entries(&state)).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_ai_system_snapshot(
    state: State<'_, AppState>,
) -> Result<AiSystemSnapshot, String> {
    let state = state.inner().clone();
    run_blocking_command(move || ops::get_ai_system_snapshot(&state)).await
}

#[tauri::command]
#[specta::specta]
pub async fn record_ai_feedback_event(
    state: State<'_, AppState>,
    input: RecordFeedbackEventInput,
) -> Result<RecordFeedbackEventResult, String> {
    let state = state.inner().clone();
    run_blocking_command(move || ops::record_ai_feedback_event(&state, input)).await
}

#[tauri::command]
#[specta::specta]
pub async fn preview_ai_batch_compile(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<BatchCompilePreviewResult, String> {
    let state = state.inner().clone();
    run_blocking_command(move || ops::preview_ai_batch_compile(&state, batch_id)).await
}
