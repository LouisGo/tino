use std::{
    fs,
    path::{Path, PathBuf},
};

const RUNTIME_FILE_NAME: &str = "runtime.json";
const QUEUE_FILE_NAME: &str = "queue.json";
const FILTERS_LOG_FILE_NAME: &str = "filters.log";
const BATCHES_DIR_NAME: &str = "batches";
const ASSETS_DIR_NAME: &str = "assets";

pub(crate) fn runtime_file_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(RUNTIME_FILE_NAME)
}

pub(crate) fn queue_file_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(QUEUE_FILE_NAME)
}

pub(crate) fn filters_log_file_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(FILTERS_LOG_FILE_NAME)
}

pub(crate) fn assets_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join(ASSETS_DIR_NAME)
}

pub(crate) fn batches_dir_path(knowledge_root: &Path) -> PathBuf {
    knowledge_root.join("_system").join(BATCHES_DIR_NAME)
}

pub(crate) fn ensure_knowledge_root_layout(knowledge_root: &Path) -> Result<(), String> {
    fs::create_dir_all(knowledge_root.join("daily")).map_err(|error| error.to_string())?;
    fs::create_dir_all(knowledge_root.join("_system")).map_err(|error| error.to_string())?;
    fs::create_dir_all(assets_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    fs::create_dir_all(batches_dir_path(knowledge_root)).map_err(|error| error.to_string())?;
    Ok(())
}
