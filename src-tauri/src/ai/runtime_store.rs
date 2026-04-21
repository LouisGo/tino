use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

use serde::{Deserialize, Serialize};

use crate::{
    ai::contracts::{BatchCompileJob, BatchCompileRuntimeStatus, PersistedKnowledgeWrite},
    error::{AppError, AppResult},
    storage::knowledge_root::{
        ai_job_audit_log_file_path, ai_job_file_path, ai_jobs_dir_path, ai_runtime_file_path,
        ai_write_log_file_path, ensure_knowledge_root_layout,
    },
};

const AI_RUNTIME_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedBatchCompilerRuntime {
    pub version: u8,
    pub status: BatchCompileRuntimeStatus,
    pub current_job_id: Option<String>,
    pub last_transition_at: Option<String>,
    pub last_error: Option<String>,
    pub next_retry_at: Option<String>,
    pub updated_at: String,
}

impl Default for PersistedBatchCompilerRuntime {
    fn default() -> Self {
        Self {
            version: AI_RUNTIME_SCHEMA_VERSION,
            status: BatchCompileRuntimeStatus::NotBootstrapped,
            current_job_id: None,
            last_transition_at: None,
            last_error: None,
            next_retry_at: None,
            updated_at: crate::format_system_time_rfc3339(std::time::SystemTime::now())
                .unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCompilerAuditEvent {
    pub id: String,
    pub job_id: Option<String>,
    pub status: BatchCompileRuntimeStatus,
    pub message: String,
    pub recorded_at: String,
}

pub fn load_or_bootstrap_runtime(
    knowledge_root: &Path,
) -> AppResult<PersistedBatchCompilerRuntime> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;

    let path = ai_runtime_file_path(knowledge_root);
    if !path.exists() {
        let runtime = PersistedBatchCompilerRuntime::default();
        persist_runtime(knowledge_root, &runtime)?;
        return Ok(runtime);
    }

    let bytes =
        fs::read(&path).map_err(|error| AppError::io("failed to read AI runtime file", error))?;
    serde_json::from_slice::<PersistedBatchCompilerRuntime>(&bytes)
        .map_err(|error| AppError::json("failed to parse AI runtime file", error))
}

pub fn persist_runtime(
    knowledge_root: &Path,
    runtime: &PersistedBatchCompilerRuntime,
) -> AppResult<()> {
    write_json_file(&ai_runtime_file_path(knowledge_root), runtime)
}

pub fn save_job(knowledge_root: &Path, job: &BatchCompileJob) -> AppResult<()> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;
    write_json_file(&ai_job_file_path(knowledge_root, &job.id), job)
}

pub fn load_job(knowledge_root: &Path, job_id: &str) -> AppResult<Option<BatchCompileJob>> {
    let trimmed_job_id = job_id.trim();
    if trimmed_job_id.is_empty() {
        return Ok(None);
    }

    let path = ai_job_file_path(knowledge_root, trimmed_job_id);
    if !path.exists() {
        return Ok(None);
    }

    let bytes =
        fs::read(path).map_err(|error| AppError::io("failed to read AI job file", error))?;
    let job = serde_json::from_slice::<BatchCompileJob>(&bytes)
        .map_err(|error| AppError::json("failed to parse AI job file", error))?;
    Ok(Some(job))
}

pub fn list_jobs(knowledge_root: &Path, limit: usize) -> AppResult<Vec<BatchCompileJob>> {
    let jobs_dir = ai_jobs_dir_path(knowledge_root);
    if !jobs_dir.exists() {
        return Ok(Vec::new());
    }

    let mut jobs = Vec::new();
    for entry in fs::read_dir(&jobs_dir)
        .map_err(|error| AppError::io("failed to read AI job directory", error))?
    {
        let entry =
            entry.map_err(|error| AppError::io("failed to read AI job directory entry", error))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let bytes =
            fs::read(&path).map_err(|error| AppError::io("failed to read AI job file", error))?;
        let job = serde_json::from_slice::<BatchCompileJob>(&bytes)
            .map_err(|error| AppError::json("failed to parse AI job file", error))?;
        jobs.push(job);
    }

    jobs.sort_by(|left, right| {
        right
            .queued_at
            .cmp(&left.queued_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    jobs.truncate(limit);

    Ok(jobs)
}

pub fn append_write_log_entry(
    knowledge_root: &Path,
    write: &PersistedKnowledgeWrite,
) -> AppResult<()> {
    append_json_line(
        &ai_write_log_file_path(knowledge_root),
        write,
        "failed to append AI write log",
    )
}

pub fn load_recent_writes(
    knowledge_root: &Path,
    limit: usize,
) -> AppResult<Vec<PersistedKnowledgeWrite>> {
    load_recent_json_lines(
        &ai_write_log_file_path(knowledge_root),
        limit,
        "failed to read AI write log",
        "failed to parse AI write log entry",
    )
}

pub fn append_audit_event(knowledge_root: &Path, event: &BatchCompilerAuditEvent) -> AppResult<()> {
    append_json_line(
        &ai_job_audit_log_file_path(knowledge_root),
        event,
        "failed to append AI job audit log",
    )
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create AI storage directory", error))?;
    }

    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| AppError::json("failed to serialize AI storage file", error))?;
    fs::write(path, bytes).map_err(|error| AppError::io("failed to write AI storage file", error))
}

fn append_json_line<T: Serialize>(path: &Path, value: &T, context: &'static str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create AI log directory", error))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| AppError::io(context, error))?;
    let line = serde_json::to_vec(value)
        .map_err(|error| AppError::json("failed to serialize AI log entry", error))?;
    file.write_all(&line)
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|error| AppError::io(context, error))
}

fn load_recent_json_lines<T: for<'de> Deserialize<'de>>(
    path: &Path,
    limit: usize,
    read_context: &'static str,
    parse_context: &'static str,
) -> AppResult<Vec<T>> {
    if !path.exists() || limit == 0 {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path).map_err(|error| AppError::io(read_context, error))?;
    let mut items = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .rev()
        .take(limit)
        .map(|line| {
            serde_json::from_str::<T>(line).map_err(|error| AppError::json(parse_context, error))
        })
        .collect::<AppResult<Vec<_>>>()?;
    items.reverse();
    Ok(items)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use uuid::Uuid;

    use crate::ai::contracts::{
        BatchCompileDisposition, BatchCompileInput, BatchCompileJob, BatchCompileJobStatus,
        BatchCompileTrigger, KnowledgeWriteDestination, PersistedKnowledgeWrite,
    };

    use super::{
        append_write_log_entry, list_jobs, load_or_bootstrap_runtime, load_recent_writes, save_job,
    };

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!("tino-ai-runtime-tests-{}", Uuid::now_v7().simple()))
    }

    fn sample_job(id: &str, queued_at: &str) -> BatchCompileJob {
        BatchCompileJob {
            id: id.into(),
            status: BatchCompileJobStatus::Queued,
            queued_at: queued_at.into(),
            started_at: None,
            finished_at: None,
            attempt: 1,
            input: BatchCompileInput {
                batch_id: Some(format!("batch_{id}")),
                trigger: BatchCompileTrigger::CaptureCount,
                capture_count: 2,
                source_capture_ids: vec!["cap_1".into(), "cap_2".into()],
                first_captured_at: Some(queued_at.into()),
                last_captured_at: Some(queued_at.into()),
            },
            decisions: vec![crate::ai::contracts::BatchCompileDecision {
                decision_id: format!("decision_{id}"),
                disposition: BatchCompileDisposition::WriteTopic,
                source_capture_ids: vec!["cap_1".into()],
                topic_slug: Some("rust".into()),
                topic_name: Some("Rust".into()),
                title: "Rust".into(),
                summary: "summary".into(),
                key_points: vec!["point".into()],
                tags: vec!["rust".into()],
                confidence: 0.9,
                rationale: "reason".into(),
            }],
            persisted_writes: Vec::new(),
            failure_reason: None,
        }
    }

    #[test]
    fn load_or_bootstrap_runtime_creates_default_runtime_file() {
        let root = unique_root();
        let runtime = load_or_bootstrap_runtime(&root).expect("runtime should bootstrap");

        assert_eq!(runtime.version, 1);
        assert!(root.join("_system/ai/runtime.json").exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_jobs_returns_newest_first() {
        let root = unique_root();
        save_job(&root, &sample_job("job_1", "2026-04-13T10:00:00+08:00"))
            .expect("first job should save");
        save_job(&root, &sample_job("job_2", "2026-04-13T11:00:00+08:00"))
            .expect("second job should save");

        let jobs = list_jobs(&root, 10).expect("jobs should load");
        assert_eq!(jobs.len(), 2);
        assert_eq!(jobs[0].id, "job_2");
        assert_eq!(jobs[1].id, "job_1");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn append_write_log_entry_can_be_read_back() {
        let root = unique_root();
        append_write_log_entry(
            &root,
            &PersistedKnowledgeWrite {
                write_id: "write_1".into(),
                job_id: "job_1".into(),
                decision_id: "decision_1".into(),
                destination: KnowledgeWriteDestination::Topic,
                knowledge_path: "topics/rust.md".into(),
                topic_slug: Some("rust".into()),
                topic_name: Some("Rust".into()),
                title: "Rust".into(),
                source_capture_ids: vec!["cap_1".into()],
                persisted_at: "2026-04-13T11:00:00+08:00".into(),
            },
        )
        .expect("write log append should work");

        let writes = load_recent_writes(&root, 10).expect("write log should load");
        assert_eq!(writes.len(), 1);
        assert_eq!(writes[0].write_id, "write_1");

        let _ = fs::remove_dir_all(root);
    }
}
