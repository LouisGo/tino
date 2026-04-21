use std::{fs, io::ErrorKind, path::Path};

use serde::{Deserialize, Serialize};

use crate::{
    clipboard::types::CaptureRecord,
    error::{AppError, AppResult},
    storage::knowledge_root::{batch_file_path, batches_dir_path, ensure_knowledge_root_layout},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredBatchFile {
    pub id: String,
    pub status: String,
    pub created_at: String,
    pub trigger_reason: String,
    pub capture_count: usize,
    pub first_captured_at: String,
    pub last_captured_at: String,
    pub source_ids: Vec<String>,
    pub captures: Vec<CaptureRecord>,
}

pub fn load_stored_batches(knowledge_root: &Path) -> AppResult<Vec<StoredBatchFile>> {
    let batches_dir = batches_dir_path(knowledge_root);
    if !batches_dir.exists() {
        return Ok(Vec::new());
    }

    let mut batches = Vec::new();
    for entry in fs::read_dir(&batches_dir)
        .map_err(|error| AppError::io("failed to read AI batch directory", error))?
    {
        let entry = entry
            .map_err(|error| AppError::io("failed to read AI batch directory entry", error))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let bytes = fs::read(&path)
            .map_err(|error| AppError::io("failed to read stored AI batch file", error))?;
        let batch = serde_json::from_slice::<StoredBatchFile>(&bytes)
            .map_err(|error| AppError::json("failed to parse stored AI batch file", error))?;
        batches.push(batch);
    }

    Ok(batches)
}

pub fn load_stored_batch(knowledge_root: &Path, batch_id: &str) -> AppResult<StoredBatchFile> {
    let normalized_id = batch_id.trim();
    if normalized_id.is_empty() {
        return Err(AppError::validation("batchId is required"));
    }

    let path = crate::storage::knowledge_root::batch_file_path(knowledge_root, normalized_id);
    let bytes = fs::read(&path).map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::not_found(format!("batch {normalized_id} was not found"))
        } else {
            AppError::io("failed to read stored AI batch file", error)
        }
    })?;
    serde_json::from_slice::<StoredBatchFile>(&bytes)
        .map_err(|error| AppError::json("failed to parse stored AI batch file", error))
}

pub fn save_stored_batch(knowledge_root: &Path, batch: &StoredBatchFile) -> AppResult<()> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;
    let bytes = serde_json::to_vec_pretty(batch)
        .map_err(|error| AppError::json("failed to serialize stored AI batch file", error))?;
    fs::write(batch_file_path(knowledge_root, &batch.id), bytes)
        .map_err(|error| AppError::io("failed to write stored AI batch file", error))
}
