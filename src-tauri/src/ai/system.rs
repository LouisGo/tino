use crate::{
    ai::{
        capability::resolve_background_compile_capability,
        contracts::{
            AiSystemPhase, AiSystemSnapshot, BatchCompileRuntimeStatus,
            BatchCompilerRuntimeSnapshot, RecordFeedbackEventInput, RecordFeedbackEventResult,
        },
        feedback_store::AiFeedbackStore,
        runtime_store::{list_jobs, load_job, load_or_bootstrap_runtime, load_recent_writes},
    },
    app_state::{
        runtime::{count_ready_batches, queue_depth_for_root},
        AppState,
    },
};

pub fn load_ai_system_snapshot(state: &AppState) -> Result<AiSystemSnapshot, String> {
    let settings = state.current_settings()?;
    let knowledge_root = settings.knowledge_root_path();
    let feedback_store = AiFeedbackStore::new(&state.app_data_dir())?;
    let capability = resolve_background_compile_capability(&settings);
    let persisted_runtime =
        load_or_bootstrap_runtime(&knowledge_root).map_err(|error| error.to_string())?;
    let active_job = persisted_runtime
        .current_job_id
        .as_deref()
        .map(|job_id| load_job(&knowledge_root, job_id))
        .transpose()
        .map_err(|error| error.to_string())?
        .flatten();
    let recent_jobs = list_jobs(&knowledge_root, 10).map_err(|error| error.to_string())?;
    let recent_writes =
        load_recent_writes(&knowledge_root, 10).map_err(|error| error.to_string())?;
    let background_compile_configured = capability.background_compile_configured;

    Ok(AiSystemSnapshot {
        phase: AiSystemPhase::BackgroundCompiler,
        capability,
        background_compile_write_mode: settings.background_compile_write_mode,
        runtime: BatchCompilerRuntimeSnapshot {
            status: if !background_compile_configured
                && matches!(
                    persisted_runtime.status,
                    BatchCompileRuntimeStatus::NotBootstrapped
                ) {
                BatchCompileRuntimeStatus::AwaitingCapability
            } else {
                persisted_runtime.status
            },
            observed_pending_capture_count: queue_depth_for_root(&knowledge_root)?,
            observed_batch_backlog_count: count_ready_batches(&knowledge_root)?,
            active_job,
            last_transition_at: persisted_runtime.last_transition_at,
            last_error: persisted_runtime.last_error,
        },
        feedback_event_count: feedback_store.feedback_event_count()?,
        latest_quality_snapshot: feedback_store.latest_quality_snapshot()?,
        recent_jobs,
        recent_writes,
    })
}

pub fn record_feedback_event(
    state: &AppState,
    input: RecordFeedbackEventInput,
) -> Result<RecordFeedbackEventResult, String> {
    AiFeedbackStore::new(&state.app_data_dir())?.record_feedback_event(input)
}
