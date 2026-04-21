use std::{
    fs,
    path::{Path, PathBuf},
};

const RUNTIME_FILE_NAME: &str = "runtime.json";
const QUEUE_FILE_NAME: &str = "queue.json";
const FILTERS_LOG_FILE_NAME: &str = "filters.log";
const BATCHES_DIR_NAME: &str = "batches";
const ASSETS_DIR_NAME: &str = "assets";
const TOPICS_DIR_NAME: &str = "topics";
const INBOX_DIR_NAME: &str = "_inbox";
const AI_SYSTEM_DIR_NAME: &str = "ai";
const AI_RUNTIME_FILE_NAME: &str = "runtime.json";
const AI_JOBS_DIR_NAME: &str = "jobs";
const AI_WRITE_LOG_FILE_NAME: &str = "writes.jsonl";
const AI_JOB_AUDIT_LOG_FILE_NAME: &str = "job-audit.jsonl";
const TOPIC_INDEX_FILE_NAME: &str = "topic-index.json";

pub(crate) fn system_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system")
}

pub(crate) fn runtime_file_path(knowledge_root: &Path) -> PathBuf {
    system_dir_path(knowledge_root).join(RUNTIME_FILE_NAME)
}

pub(crate) fn queue_file_path(knowledge_root: &Path) -> PathBuf {
    system_dir_path(knowledge_root).join(QUEUE_FILE_NAME)
}

pub(crate) fn filters_log_file_path(knowledge_root: &Path) -> PathBuf {
    system_dir_path(knowledge_root).join(FILTERS_LOG_FILE_NAME)
}

pub(crate) fn assets_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join(ASSETS_DIR_NAME)
}

pub(crate) fn batches_dir_path(knowledge_root: &Path) -> PathBuf {
    system_dir_path(knowledge_root).join(BATCHES_DIR_NAME)
}

pub(crate) fn batch_file_path(knowledge_root: &Path, batch_id: &str) -> PathBuf {
    batches_dir_path(knowledge_root).join(format!("{batch_id}.json"))
}

pub(crate) fn topics_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join(TOPICS_DIR_NAME)
}

pub(crate) fn inbox_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join(INBOX_DIR_NAME)
}

pub(crate) fn ai_system_dir_path(knowledge_root: &Path) -> PathBuf {
    system_dir_path(knowledge_root).join(AI_SYSTEM_DIR_NAME)
}

pub(crate) fn ai_runtime_file_path(knowledge_root: &Path) -> PathBuf {
    ai_system_dir_path(knowledge_root).join(AI_RUNTIME_FILE_NAME)
}

pub(crate) fn ai_jobs_dir_path(knowledge_root: &Path) -> PathBuf {
    ai_system_dir_path(knowledge_root).join(AI_JOBS_DIR_NAME)
}

pub(crate) fn ai_job_file_path(knowledge_root: &Path, job_id: &str) -> PathBuf {
    ai_jobs_dir_path(knowledge_root).join(format!("{job_id}.json"))
}

pub(crate) fn ai_write_log_file_path(knowledge_root: &Path) -> PathBuf {
    ai_system_dir_path(knowledge_root).join(AI_WRITE_LOG_FILE_NAME)
}

pub(crate) fn ai_job_audit_log_file_path(knowledge_root: &Path) -> PathBuf {
    ai_system_dir_path(knowledge_root).join(AI_JOB_AUDIT_LOG_FILE_NAME)
}

pub(crate) fn topic_index_file_path(knowledge_root: &Path) -> PathBuf {
    system_dir_path(knowledge_root).join(TOPIC_INDEX_FILE_NAME)
}

pub(crate) fn ensure_knowledge_root_layout(knowledge_root: &Path) -> Result<(), String> {
    fs::create_dir_all(knowledge_root.join("daily")).map_err(|error| error.to_string())?;
    fs::create_dir_all(system_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(topics_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(inbox_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(assets_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(batches_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(ai_jobs_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    Ok(())
}
