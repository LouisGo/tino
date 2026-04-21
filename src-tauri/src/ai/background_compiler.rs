use chrono::{DateTime, Duration, FixedOffset, Local};
use std::{collections::BTreeMap, path::Path, time::SystemTime};
use uuid::Uuid;

use crate::{
    ai::{
        batch_store::{load_stored_batches, save_stored_batch, StoredBatchFile},
        capability::{background_compile_enabled, compile_batch_with_capability},
        contracts::{
            BatchCompileDecision, BatchCompileDisposition, BatchCompileInput, BatchCompileJob,
            BatchCompileJobStatus, BatchCompileRuntimeStatus, BatchCompileTrigger,
            KnowledgeWriteDestination, PersistedKnowledgeWrite,
        },
        knowledge_writer::{
            inbox_file_path, relative_output_path, render_inline_code_list,
            render_source_capture_marker, render_source_fragments, render_tag_list,
            sanitize_inline_markdown, slugify_topic_value, topic_file_path,
            upsert_inbox_markdown_file, upsert_topic_markdown_file,
        },
        runtime_store::{
            append_audit_event, append_write_log_entry, load_job, load_or_bootstrap_runtime,
            persist_runtime, save_job, BatchCompilerAuditEvent, PersistedBatchCompilerRuntime,
        },
        topic_index::{load_topic_index_entries, refresh_topic_index_entry},
    },
    app_state::AppSettings,
    clipboard::types::CaptureRecord,
    error::{AppError, AppResult},
};

const RETRY_BACKOFF_SECONDS: i64 = 60;
const MAX_BATCH_COMPILE_ATTEMPTS: u32 = 3;

const BATCH_STATUS_PENDING_AI: &str = "pending_ai";
const BATCH_STATUS_READY: &str = "ready";
const BATCH_STATUS_RUNNING: &str = "running";
const BATCH_STATUS_PERSISTING: &str = "persisting";
const BATCH_STATUS_PERSISTED: &str = "persisted";
const BATCH_STATUS_FAILED: &str = "failed";

pub fn has_background_compile_candidates(knowledge_root: &Path) -> AppResult<bool> {
    Ok(load_stored_batches(knowledge_root)?
        .into_iter()
        .any(|batch| is_background_candidate_status(&batch.status)))
}

pub fn run_background_compile_cycle(settings: &AppSettings) -> AppResult<()> {
    let knowledge_root = settings.knowledge_root_path();
    load_or_bootstrap_runtime(&knowledge_root)?;
    if !background_compile_enabled(settings) {
        update_runtime(&knowledge_root, |runtime, timestamp| {
            runtime.status = BatchCompileRuntimeStatus::AwaitingCapability;
            runtime.current_job_id = None;
            runtime.last_transition_at = Some(timestamp);
            runtime.last_error = None;
            runtime.next_retry_at = None;
        })?;
        return Ok(());
    }

    loop {
        match select_next_batch(&knowledge_root)? {
            NextBatchSelection::Ready(batch) => {
                process_batch_compile(settings, &knowledge_root, batch)?;
            }
            NextBatchSelection::RetryBackoff {
                next_retry_at,
                last_error,
            } => {
                update_runtime(&knowledge_root, |runtime, timestamp| {
                    runtime.status = BatchCompileRuntimeStatus::RetryBackoff;
                    runtime.current_job_id = None;
                    runtime.last_transition_at = Some(timestamp.clone());
                    runtime.last_error = last_error.clone();
                    runtime.next_retry_at = Some(next_retry_at.clone());
                })?;
                break;
            }
            NextBatchSelection::Idle => {
                update_runtime(&knowledge_root, |runtime, timestamp| {
                    runtime.status = BatchCompileRuntimeStatus::Idle;
                    runtime.current_job_id = None;
                    runtime.last_transition_at = Some(timestamp);
                    runtime.next_retry_at = None;
                })?;
                break;
            }
        }
    }

    Ok(())
}

enum NextBatchSelection {
    Ready(StoredBatchFile),
    RetryBackoff {
        next_retry_at: String,
        last_error: Option<String>,
    },
    Idle,
}

fn select_next_batch(knowledge_root: &Path) -> AppResult<NextBatchSelection> {
    let mut batches = load_stored_batches(knowledge_root)?;
    batches.sort_by(|left, right| {
        left.created_at
            .cmp(&right.created_at)
            .then_with(|| left.id.cmp(&right.id))
    });

    let now = Local::now().fixed_offset();
    let mut earliest_retry: Option<(DateTime<FixedOffset>, Option<String>)> = None;

    for batch in batches {
        if !is_background_candidate_status(&batch.status) {
            continue;
        }

        let maybe_job = load_job(knowledge_root, &batch.id)?;
        if let Some(job) = maybe_job.as_ref() {
            if matches!(
                job.status,
                BatchCompileJobStatus::Persisted | BatchCompileJobStatus::Abandoned
            ) {
                continue;
            }

            if matches!(job.status, BatchCompileJobStatus::Failed)
                && job.attempt < MAX_BATCH_COMPILE_ATTEMPTS
            {
                if let Some(retry_at) = next_retry_at_for_job(job)? {
                    if retry_at > now {
                        let should_replace = earliest_retry
                            .as_ref()
                            .map(|(current, _)| retry_at < *current)
                            .unwrap_or(true);
                        if should_replace {
                            earliest_retry = Some((retry_at, job.failure_reason.clone()));
                        }
                        continue;
                    }
                }
            }
        }

        return Ok(NextBatchSelection::Ready(batch));
    }

    if let Some((next_retry_at, last_error)) = earliest_retry {
        Ok(NextBatchSelection::RetryBackoff {
            next_retry_at: next_retry_at.to_rfc3339(),
            last_error,
        })
    } else {
        Ok(NextBatchSelection::Idle)
    }
}

fn process_batch_compile(
    settings: &AppSettings,
    knowledge_root: &Path,
    mut batch: StoredBatchFile,
) -> AppResult<()> {
    let attempt = load_job(knowledge_root, &batch.id)?
        .map(|job| job.attempt.saturating_add(1))
        .unwrap_or(1);
    let started_at = now_rfc3339()?;
    let mut job = build_running_job(&batch, attempt, &started_at);

    batch.status = BATCH_STATUS_RUNNING.into();
    save_stored_batch(knowledge_root, &batch)?;
    save_job(knowledge_root, &job)?;
    update_runtime(knowledge_root, |runtime, timestamp| {
        runtime.status = BatchCompileRuntimeStatus::Running;
        runtime.current_job_id = Some(batch.id.clone());
        runtime.last_transition_at = Some(timestamp);
        runtime.last_error = None;
        runtime.next_retry_at = None;
    })?;
    append_audit_event(
        knowledge_root,
        &audit_event(
            Some(batch.id.clone()),
            BatchCompileRuntimeStatus::Running,
            format!(
                "background compiler started batch {} attempt {}",
                batch.id, attempt
            ),
        )?,
    )?;

    let result = (|| -> AppResult<(String, Vec<BatchCompileDecision>, Vec<PersistedKnowledgeWrite>)> {
        let topics = load_topic_index_entries(knowledge_root)?;
        let compiled = compile_batch_with_capability(settings, &batch, &topics)?;
        job.status = BatchCompileJobStatus::ModelComplete;
        job.decisions = compiled.decisions.clone();
        save_job(knowledge_root, &job)?;

        batch.status = BATCH_STATUS_PERSISTING.into();
        save_stored_batch(knowledge_root, &batch)?;
        job.status = BatchCompileJobStatus::WritePending;
        save_job(knowledge_root, &job)?;

        let persisted_at = now_rfc3339()?;
        let writes = persist_compiled_decisions(
            knowledge_root,
            &batch,
            &job.id,
            &compiled.decisions,
            &persisted_at,
        )?;
        for write in &writes {
            append_write_log_entry(knowledge_root, write)?;
        }

        Ok((compiled.source_label, compiled.decisions, writes))
    })();

    match result {
        Ok((source_label, decisions, writes)) => {
            let finished_at = now_rfc3339()?;
            batch.status = BATCH_STATUS_PERSISTED.into();
            save_stored_batch(knowledge_root, &batch)?;

            job.status = BatchCompileJobStatus::Persisted;
            job.finished_at = Some(finished_at.clone());
            job.decisions = decisions;
            job.persisted_writes = writes.clone();
            job.failure_reason = None;
            save_job(knowledge_root, &job)?;

            update_runtime(knowledge_root, |runtime, timestamp| {
                runtime.status = BatchCompileRuntimeStatus::Idle;
                runtime.current_job_id = None;
                runtime.last_transition_at = Some(timestamp);
                runtime.last_error = None;
                runtime.next_retry_at = None;
            })?;
            append_audit_event(
                knowledge_root,
                &audit_event(
                    Some(batch.id.clone()),
                    BatchCompileRuntimeStatus::Idle,
                    format!(
                        "background compiler persisted batch {} with {} write(s) via {}",
                        batch.id,
                        writes.len(),
                        source_label
                    ),
                )?,
            )?;
        }
        Err(error) => {
            let abandon = attempt >= MAX_BATCH_COMPILE_ATTEMPTS;
            let failure_reason = error.to_string();
            let finished_at = now_rfc3339()?;
            batch.status = if abandon {
                BATCH_STATUS_FAILED.into()
            } else {
                BATCH_STATUS_READY.into()
            };
            save_stored_batch(knowledge_root, &batch)?;

            job.status = if abandon {
                BatchCompileJobStatus::Abandoned
            } else {
                BatchCompileJobStatus::Failed
            };
            job.finished_at = Some(finished_at.clone());
            job.failure_reason = Some(failure_reason.clone());
            save_job(knowledge_root, &job)?;

            if abandon {
                update_runtime(knowledge_root, |runtime, timestamp| {
                    runtime.status = BatchCompileRuntimeStatus::Idle;
                    runtime.current_job_id = None;
                    runtime.last_transition_at = Some(timestamp);
                    runtime.last_error = Some(failure_reason.clone());
                    runtime.next_retry_at = None;
                })?;
                append_audit_event(
                    knowledge_root,
                    &audit_event(
                        Some(batch.id.clone()),
                        BatchCompileRuntimeStatus::Idle,
                        format!(
                            "background compiler abandoned batch {} after {} attempt(s): {}",
                            batch.id, attempt, failure_reason
                        ),
                    )?,
                )?;
            } else {
                let next_retry_at = (Local::now().fixed_offset()
                    + Duration::seconds(RETRY_BACKOFF_SECONDS))
                .to_rfc3339();
                update_runtime(knowledge_root, |runtime, timestamp| {
                    runtime.status = BatchCompileRuntimeStatus::RetryBackoff;
                    runtime.current_job_id = None;
                    runtime.last_transition_at = Some(timestamp);
                    runtime.last_error = Some(failure_reason.clone());
                    runtime.next_retry_at = Some(next_retry_at.clone());
                })?;
                append_audit_event(
                    knowledge_root,
                    &audit_event(
                        Some(batch.id.clone()),
                        BatchCompileRuntimeStatus::RetryBackoff,
                        format!(
                            "background compiler failed batch {} attempt {} and scheduled retry at {}: {}",
                            batch.id, attempt, next_retry_at, failure_reason
                        ),
                    )?,
                )?;
            }
        }
    }

    Ok(())
}

fn persist_compiled_decisions(
    knowledge_root: &Path,
    batch: &StoredBatchFile,
    job_id: &str,
    decisions: &[BatchCompileDecision],
    persisted_at: &str,
) -> AppResult<Vec<PersistedKnowledgeWrite>> {
    let captures_by_id = batch
        .captures
        .iter()
        .map(|capture| (capture.id.as_str(), capture))
        .collect::<BTreeMap<_, _>>();
    let mut writes = Vec::new();
    let mut touched_topics = Vec::new();

    for decision in decisions {
        let source_captures = decision
            .source_capture_ids
            .iter()
            .map(|source_id| {
                captures_by_id
                    .get(source_id.as_str())
                    .copied()
                    .ok_or_else(|| {
                        AppError::internal(format!(
                            "compile decision {} references missing source capture {}",
                            decision.decision_id, source_id
                        ))
                    })
            })
            .collect::<AppResult<Vec<_>>>()?;

        match decision.disposition {
            BatchCompileDisposition::WriteTopic => {
                let topic_slug = resolve_topic_slug(decision);
                let topic_name = resolve_topic_name(decision, &topic_slug);
                let path = topic_file_path(knowledge_root, &topic_slug);
                let section_marker = render_source_capture_marker(&decision.source_capture_ids);
                let section_markdown = render_compiled_decision_section(
                    batch,
                    job_id,
                    decision,
                    &section_marker,
                    &source_captures,
                    persisted_at,
                    KnowledgeWriteDestination::Topic,
                    Some((&topic_slug, &topic_name)),
                );
                let wrote = upsert_topic_markdown_file(
                    &path,
                    &topic_name,
                    &decision.summary,
                    &decision.tags,
                    persisted_at,
                    &section_marker,
                    &section_markdown,
                )?;
                if wrote {
                    touched_topics.push(topic_slug.clone());
                    writes.push(PersistedKnowledgeWrite {
                        write_id: format!("write_{}", Uuid::now_v7().simple()),
                        job_id: job_id.to_string(),
                        decision_id: decision.decision_id.clone(),
                        destination: KnowledgeWriteDestination::Topic,
                        knowledge_path: relative_output_path(knowledge_root, &path),
                        topic_slug: Some(topic_slug),
                        topic_name: Some(topic_name),
                        title: decision.title.clone(),
                        source_capture_ids: decision.source_capture_ids.clone(),
                        persisted_at: persisted_at.to_string(),
                    });
                }
            }
            BatchCompileDisposition::WriteInbox => {
                let path = inbox_file_path(knowledge_root, persisted_at)?;
                let timestamp = parse_rfc3339(persisted_at)?;
                let section_marker = render_source_capture_marker(&decision.source_capture_ids);
                let section_markdown = render_compiled_decision_section(
                    batch,
                    job_id,
                    decision,
                    &section_marker,
                    &source_captures,
                    persisted_at,
                    KnowledgeWriteDestination::Inbox,
                    None,
                );
                let wrote = upsert_inbox_markdown_file(
                    &path,
                    &timestamp.format("%Y-%m-%d").to_string(),
                    persisted_at,
                    &section_marker,
                    &section_markdown,
                )?;
                if wrote {
                    writes.push(PersistedKnowledgeWrite {
                        write_id: format!("write_{}", Uuid::now_v7().simple()),
                        job_id: job_id.to_string(),
                        decision_id: decision.decision_id.clone(),
                        destination: KnowledgeWriteDestination::Inbox,
                        knowledge_path: relative_output_path(knowledge_root, &path),
                        topic_slug: None,
                        topic_name: None,
                        title: decision.title.clone(),
                        source_capture_ids: decision.source_capture_ids.clone(),
                        persisted_at: persisted_at.to_string(),
                    });
                }
            }
            BatchCompileDisposition::DiscardNoise => {}
        }
    }

    touched_topics.sort();
    touched_topics.dedup();
    for topic_slug in touched_topics {
        refresh_topic_index_entry(knowledge_root, &topic_slug)?;
    }

    Ok(writes)
}

fn render_compiled_decision_section(
    batch: &StoredBatchFile,
    job_id: &str,
    decision: &BatchCompileDecision,
    section_marker: &str,
    source_captures: &[&CaptureRecord],
    persisted_at: &str,
    destination: KnowledgeWriteDestination,
    topic: Option<(&str, &str)>,
) -> String {
    let mut section = String::new();
    section.push_str(section_marker);
    section.push('\n');
    section.push_str(&format!(
        "## {} `{}`\n",
        persisted_at,
        sanitize_inline_markdown(&decision.title)
    ));
    section.push_str(&format!("- Batch: `{}`\n", batch.id));
    section.push_str(&format!("- Job: `{job_id}`\n"));
    section.push_str("- Compiler: `background_compile`\n");
    section.push_str(&format!(
        "- Destination: `{}`\n",
        knowledge_destination_label(destination)
    ));
    if let Some((topic_slug, topic_name)) = topic {
        section.push_str(&format!(
            "- Topic: {} [`{}`]\n",
            sanitize_inline_markdown(topic_name),
            topic_slug
        ));
    }
    section.push_str(&format!("- Confidence: `{:.2}`\n", decision.confidence));
    section.push_str(&format!("- Tags: {}\n", render_tag_list(&decision.tags)));
    section.push_str(&format!(
        "- Source IDs: {}\n",
        render_inline_code_list(&decision.source_capture_ids)
    ));
    section.push_str(&format!("- Persisted at: `{persisted_at}`\n\n"));
    section.push_str("### Summary\n");
    section.push_str(decision.summary.trim());
    section.push_str("\n\n### Key Points\n");
    for key_point in &decision.key_points {
        section.push_str(&format!("- {}\n", key_point.trim()));
    }
    section.push_str("\n### Model Rationale\n");
    section.push_str(decision.rationale.trim());
    section.push_str("\n\n### Source Fragments\n");
    section.push_str(&render_source_fragments(source_captures));
    section
}

fn build_running_job(batch: &StoredBatchFile, attempt: u32, started_at: &str) -> BatchCompileJob {
    BatchCompileJob {
        id: batch.id.clone(),
        status: BatchCompileJobStatus::Running,
        queued_at: batch.created_at.clone(),
        started_at: Some(started_at.to_string()),
        finished_at: None,
        attempt,
        input: BatchCompileInput {
            batch_id: Some(batch.id.clone()),
            trigger: map_batch_trigger(&batch.trigger_reason),
            capture_count: batch.capture_count,
            source_capture_ids: batch.source_ids.clone(),
            first_captured_at: Some(batch.first_captured_at.clone()),
            last_captured_at: Some(batch.last_captured_at.clone()),
        },
        decisions: Vec::new(),
        persisted_writes: Vec::new(),
        failure_reason: None,
    }
}

fn update_runtime<F>(knowledge_root: &Path, mutate: F) -> AppResult<PersistedBatchCompilerRuntime>
where
    F: FnOnce(&mut PersistedBatchCompilerRuntime, String),
{
    let mut runtime = load_or_bootstrap_runtime(knowledge_root)?;
    let timestamp = now_rfc3339()?;
    mutate(&mut runtime, timestamp.clone());
    runtime.updated_at = timestamp;
    persist_runtime(knowledge_root, &runtime)?;
    Ok(runtime)
}

fn audit_event(
    job_id: Option<String>,
    status: BatchCompileRuntimeStatus,
    message: String,
) -> AppResult<BatchCompilerAuditEvent> {
    Ok(BatchCompilerAuditEvent {
        id: format!("audit_{}", Uuid::now_v7().simple()),
        job_id,
        status,
        message,
        recorded_at: now_rfc3339()?,
    })
}

fn next_retry_at_for_job(job: &BatchCompileJob) -> AppResult<Option<DateTime<FixedOffset>>> {
    let Some(finished_at) = job.finished_at.as_deref() else {
        return Ok(None);
    };

    let finished_at = parse_rfc3339(finished_at)?;
    Ok(Some(finished_at + Duration::seconds(RETRY_BACKOFF_SECONDS)))
}

fn parse_rfc3339(value: &str) -> AppResult<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value.trim())
        .map_err(|error| AppError::validation(format!("invalid RFC3339 timestamp: {error}")))
}

fn now_rfc3339() -> AppResult<String> {
    crate::format_system_time_rfc3339(SystemTime::now()).map_err(AppError::from)
}

fn is_background_candidate_status(status: &str) -> bool {
    matches!(
        status.trim(),
        BATCH_STATUS_PENDING_AI
            | BATCH_STATUS_READY
            | BATCH_STATUS_RUNNING
            | BATCH_STATUS_PERSISTING
    )
}

fn map_batch_trigger(trigger_reason: &str) -> BatchCompileTrigger {
    match trigger_reason.trim() {
        "capture_count" => BatchCompileTrigger::CaptureCount,
        "max_wait" => BatchCompileTrigger::MaxWait,
        "manual_retry" => BatchCompileTrigger::ManualRetry,
        _ => BatchCompileTrigger::ManualReplay,
    }
}

fn resolve_topic_slug(decision: &BatchCompileDecision) -> String {
    decision
        .topic_slug
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(slugify_topic_value)
        .or_else(|| {
            decision
                .topic_name
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(slugify_topic_value)
        })
        .unwrap_or_else(|| slugify_topic_value(&decision.title))
}

fn resolve_topic_name(decision: &BatchCompileDecision, topic_slug: &str) -> String {
    decision
        .topic_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| topic_slug.replace('-', " "))
}

fn knowledge_destination_label(destination: KnowledgeWriteDestination) -> &'static str {
    match destination {
        KnowledgeWriteDestination::Topic => "topic",
        KnowledgeWriteDestination::Inbox => "inbox",
    }
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Duration, Local};
    use std::{collections::BTreeMap, fs, path::PathBuf};

    use crate::{
        ai::{
            batch_store::{load_stored_batch, save_stored_batch, StoredBatchFile},
            runtime_store::{load_job, load_or_bootstrap_runtime},
        },
        app_state::AppSettings,
        clipboard::types::CaptureRecord,
        locale::AppLocalePreference,
    };

    use super::{
        run_background_compile_cycle, BATCH_STATUS_PENDING_AI, BATCH_STATUS_READY,
        RETRY_BACKOFF_SECONDS,
    };

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tino-background-compiler-tests-{}",
            uuid::Uuid::now_v7().simple()
        ))
    }

    fn test_settings(root: &PathBuf) -> AppSettings {
        AppSettings {
            revision: 0,
            knowledge_root: root.display().to_string(),
            runtime_provider_profiles: Vec::new(),
            active_runtime_provider_id: String::new(),
            locale_preference: AppLocalePreference::default(),
            clipboard_history_days: 7,
            clipboard_capture_enabled: true,
            clipboard_excluded_source_apps: Vec::new(),
            clipboard_excluded_keywords: Vec::new(),
            shortcut_overrides: BTreeMap::new(),
        }
    }

    fn sample_capture(id: &str, content_kind: &str, raw_text: &str) -> CaptureRecord {
        CaptureRecord {
            id: id.into(),
            source: "clipboard".into(),
            source_app_name: Some("Notes".into()),
            source_app_bundle_id: Some("dev.notes".into()),
            source_app_icon_path: None,
            content_kind: content_kind.into(),
            captured_at: "2026-04-13T12:00:00+08:00".into(),
            raw_text: raw_text.into(),
            raw_rich: None,
            raw_rich_format: None,
            link_url: (content_kind == "link").then(|| raw_text.to_string()),
            link_metadata: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash: format!("hash-{id}"),
            image_bytes: None,
            source_app_icon_bytes: None,
        }
    }

    fn single_inbox_file(root: &PathBuf) -> PathBuf {
        fs::read_dir(root.join("_inbox"))
            .expect("inbox dir should exist")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .next()
            .expect("inbox file should exist")
    }

    #[test]
    fn run_background_compile_cycle_persists_topic_and_inbox_outputs() {
        let root = unique_root();
        let settings = test_settings(&root);
        save_stored_batch(
            &root,
            &StoredBatchFile {
                id: "batch_topic".into(),
                status: BATCH_STATUS_PENDING_AI.into(),
                created_at: "2026-04-13T12:00:00+08:00".into(),
                trigger_reason: "capture_count".into(),
                capture_count: 2,
                first_captured_at: "2026-04-13T11:58:00+08:00".into(),
                last_captured_at: "2026-04-13T12:00:00+08:00".into(),
                source_ids: vec!["cap_text".into(), "cap_link".into()],
                captures: vec![
                    sample_capture(
                        "cap_text",
                        "plain_text",
                        "Rust background compile should persist real knowledge.",
                    ),
                    sample_capture("cap_link", "link", "https://example.com/reference"),
                ],
            },
        )
        .expect("batch should save");

        run_background_compile_cycle(&settings).expect("background compile should succeed");

        let batch = load_stored_batch(&root, "batch_topic").expect("batch should load");
        assert_eq!(batch.status, "persisted");
        assert!(root.join("topics").exists());
        assert!(single_inbox_file(&root).exists());

        let rust_topic = fs::read_dir(root.join("topics"))
            .expect("topics dir should exist")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .collect::<Vec<_>>();
        assert_eq!(rust_topic.len(), 1);

        let job = load_job(&root, "batch_topic")
            .expect("job should load")
            .expect("job should exist");
        assert_eq!(
            job.status,
            crate::ai::contracts::BatchCompileJobStatus::Persisted
        );
        assert_eq!(job.persisted_writes.len(), 2);

        let runtime = load_or_bootstrap_runtime(&root).expect("runtime should load");
        assert_eq!(
            runtime.status,
            crate::ai::contracts::BatchCompileRuntimeStatus::Idle
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_background_compile_cycle_schedules_retry_backoff_for_failed_batch() {
        let root = unique_root();
        let settings = test_settings(&root);
        save_stored_batch(
            &root,
            &StoredBatchFile {
                id: "batch_retry".into(),
                status: BATCH_STATUS_READY.into(),
                created_at: "2026-04-13T12:00:00+08:00".into(),
                trigger_reason: "capture_count".into(),
                capture_count: 0,
                first_captured_at: "2026-04-13T12:00:00+08:00".into(),
                last_captured_at: "2026-04-13T12:00:00+08:00".into(),
                source_ids: Vec::new(),
                captures: Vec::new(),
            },
        )
        .expect("batch should save");

        run_background_compile_cycle(&settings).expect("background compile should record retry");

        let batch = load_stored_batch(&root, "batch_retry").expect("batch should load");
        assert_eq!(batch.status, BATCH_STATUS_READY);

        let job = load_job(&root, "batch_retry")
            .expect("job should load")
            .expect("job should exist");
        assert_eq!(
            job.status,
            crate::ai::contracts::BatchCompileJobStatus::Failed
        );
        assert_eq!(job.attempt, 1);

        let runtime = load_or_bootstrap_runtime(&root).expect("runtime should load");
        assert_eq!(
            runtime.status,
            crate::ai::contracts::BatchCompileRuntimeStatus::RetryBackoff
        );
        let retry_at = runtime.next_retry_at.expect("retry time should be set");
        let retry_at = DateTime::parse_from_rfc3339(&retry_at).expect("retry time should parse");
        let now = Local::now().fixed_offset();
        assert!(retry_at >= now + Duration::seconds(RETRY_BACKOFF_SECONDS - 5));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn run_background_compile_cycle_skips_duplicate_writes_for_same_source_ids() {
        let root = unique_root();
        let settings = test_settings(&root);

        let duplicate_captures = vec![
            sample_capture(
                "cap_text",
                "plain_text",
                "Rust background compile should persist real knowledge.",
            ),
            sample_capture("cap_link", "link", "https://example.com/reference"),
        ];

        save_stored_batch(
            &root,
            &StoredBatchFile {
                id: "batch_topic_a".into(),
                status: BATCH_STATUS_PENDING_AI.into(),
                created_at: "2026-04-13T12:00:00+08:00".into(),
                trigger_reason: "capture_count".into(),
                capture_count: duplicate_captures.len(),
                first_captured_at: "2026-04-13T11:58:00+08:00".into(),
                last_captured_at: "2026-04-13T12:00:00+08:00".into(),
                source_ids: vec!["cap_text".into(), "cap_link".into()],
                captures: duplicate_captures.clone(),
            },
        )
        .expect("first batch should save");
        save_stored_batch(
            &root,
            &StoredBatchFile {
                id: "batch_topic_b".into(),
                status: BATCH_STATUS_PENDING_AI.into(),
                created_at: "2026-04-13T12:01:00+08:00".into(),
                trigger_reason: "manual_replay".into(),
                capture_count: duplicate_captures.len(),
                first_captured_at: "2026-04-13T11:58:00+08:00".into(),
                last_captured_at: "2026-04-13T12:00:00+08:00".into(),
                source_ids: vec!["cap_text".into(), "cap_link".into()],
                captures: duplicate_captures,
            },
        )
        .expect("second batch should save");

        run_background_compile_cycle(&settings).expect("background compile should succeed");

        let first_job = load_job(&root, "batch_topic_a")
            .expect("first job should load")
            .expect("first job should exist");
        let second_job = load_job(&root, "batch_topic_b")
            .expect("second job should load")
            .expect("second job should exist");
        assert_eq!(first_job.persisted_writes.len(), 2);
        assert!(second_job.persisted_writes.is_empty());

        let topic_path = fs::read_dir(root.join("topics"))
            .expect("topics dir should exist")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .next()
            .expect("topic file should exist");
        let topic_content = fs::read_to_string(topic_path).expect("topic file should read");
        assert_eq!(topic_content.matches("Source IDs: `cap_text`").count(), 1);

        let inbox_content =
            fs::read_to_string(single_inbox_file(&root)).expect("inbox file should read");
        assert_eq!(inbox_content.matches("Source IDs: `cap_link`").count(), 1);

        let _ = fs::remove_dir_all(root);
    }
}
