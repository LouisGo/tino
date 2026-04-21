use super::run_blocking_ipc_command;
use crate::{
    ai::legacy_review::{
        self, AiBatchPayload, AiBatchSummary, ApplyBatchDecisionRequest, ApplyBatchDecisionResult,
    },
    app_state::AppState,
    error::IpcResult,
    ipc_events::AiSystemUpdated,
};
use tauri::State;

// Legacy `/ai review` IPC surface. Business logic lives under `ai::legacy_review`.

#[tauri::command]
#[specta::specta]
pub async fn list_ready_ai_batches(state: State<'_, AppState>) -> IpcResult<Vec<AiBatchSummary>> {
    let state = state.inner().clone();
    run_blocking_ipc_command(move || legacy_review::list_ready_ai_batches(state)).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_ai_batch_payload(
    state: State<'_, AppState>,
    batch_id: String,
) -> IpcResult<AiBatchPayload> {
    let state = state.inner().clone();
    run_blocking_ipc_command(move || legacy_review::get_ai_batch_payload(state, batch_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn apply_batch_decision(
    state: State<'_, AppState>,
    request: ApplyBatchDecisionRequest,
) -> IpcResult<ApplyBatchDecisionResult> {
    let command_state = state.inner().clone();
    let notify_state = state.inner().clone();
    let result = run_blocking_ipc_command(move || {
        legacy_review::apply_batch_decision(command_state, request)
    })
    .await;
    if result.is_ok() {
        notify_state.emit_ai_system_updated(AiSystemUpdated::legacy_review_persisted());
    }

    result
}
