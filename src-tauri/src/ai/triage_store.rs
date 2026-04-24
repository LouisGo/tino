use std::{
    fs,
    path::Path,
};

use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Serialize};

use crate::{
    ai::{
        batch_store::StoredBatchFile,
        contracts::{BackgroundCompileWriteMode, BatchCompileDecision, BatchCompileInput},
    },
    clipboard::types::CaptureRecord,
    error::{AppError, AppResult},
    storage::knowledge_root::{
        ai_triage_artifact_file_path, ai_triage_dir_path, ensure_knowledge_root_layout,
    },
};

const AI_TRIAGE_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTriageArtifact {
    pub version: u8,
    pub batch_id: String,
    pub job_id: String,
    pub attempt: u32,
    pub partition_day: String,
    pub batch_created_at: String,
    pub compiled_at: String,
    pub source_label: String,
    pub write_mode: BackgroundCompileWriteMode,
    pub input: BatchCompileInput,
    pub captures: Vec<CaptureRecord>,
    pub decisions: Vec<BatchCompileDecision>,
}

impl PersistedTriageArtifact {
    pub fn from_batch_compile(
        batch: &StoredBatchFile,
        job_id: &str,
        input: &BatchCompileInput,
        attempt: u32,
        source_label: &str,
        write_mode: BackgroundCompileWriteMode,
        compiled_at: &str,
        decisions: &[BatchCompileDecision],
    ) -> Self {
        let partition_day = resolve_partition_day(input.first_captured_at.as_deref(), compiled_at);
        Self {
            version: AI_TRIAGE_SCHEMA_VERSION,
            batch_id: batch.id.clone(),
            job_id: job_id.to_string(),
            attempt,
            partition_day,
            batch_created_at: batch.created_at.clone(),
            compiled_at: compiled_at.to_string(),
            source_label: source_label.to_string(),
            write_mode,
            input: input.clone(),
            captures: batch.captures.clone(),
            decisions: decisions.to_vec(),
        }
    }
}

pub fn save_triage_artifact(
    knowledge_root: &Path,
    artifact: &PersistedTriageArtifact,
) -> AppResult<()> {
    ensure_knowledge_root_layout(knowledge_root).map_err(AppError::from)?;
    let bytes = serde_json::to_vec_pretty(artifact)
        .map_err(|error| AppError::json("failed to serialize triage artifact", error))?;
    let path = ai_triage_artifact_file_path(
        knowledge_root,
        &artifact.partition_day,
        &artifact.batch_id,
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| AppError::io("failed to create triage artifact directory", error))?;
    }
    fs::write(path, bytes).map_err(|error| AppError::io("failed to write triage artifact", error))
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn list_recent_triage_artifacts(
    knowledge_root: &Path,
    limit: usize,
) -> AppResult<Vec<PersistedTriageArtifact>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let triage_dir = ai_triage_dir_path(knowledge_root);
    if !triage_dir.exists() {
        return Ok(Vec::new());
    }

    let mut artifacts = Vec::new();
    for day_entry in fs::read_dir(&triage_dir)
        .map_err(|error| AppError::io("failed to read triage artifact directory", error))?
    {
        let day_entry = day_entry
            .map_err(|error| AppError::io("failed to read triage artifact directory entry", error))?;
        let day_path = day_entry.path();
        if !day_path.is_dir() {
            continue;
        }

        for artifact_entry in fs::read_dir(&day_path)
            .map_err(|error| AppError::io("failed to read triage artifact partition", error))?
        {
            let artifact_entry = artifact_entry.map_err(|error| {
                AppError::io("failed to read triage artifact partition entry", error)
            })?;
            let artifact_path = artifact_entry.path();
            if artifact_path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }

            let bytes = fs::read(&artifact_path)
                .map_err(|error| AppError::io("failed to read triage artifact file", error))?;
            let artifact = serde_json::from_slice::<PersistedTriageArtifact>(&bytes)
                .map_err(|error| AppError::json("failed to parse triage artifact file", error))?;
            artifacts.push(artifact);
        }
    }

    artifacts.sort_by(|left, right| {
        right
            .compiled_at
            .cmp(&left.compiled_at)
            .then_with(|| right.batch_id.cmp(&left.batch_id))
    });
    artifacts.truncate(limit);
    Ok(artifacts)
}

fn resolve_partition_day(first_captured_at: Option<&str>, compiled_at: &str) -> String {
    first_captured_at
        .and_then(parse_partition_day)
        .or_else(|| parse_partition_day(compiled_at))
        .unwrap_or_else(|| compiled_at.trim().chars().take(10).collect())
}

fn parse_partition_day(value: &str) -> Option<String> {
    DateTime::<FixedOffset>::parse_from_rfc3339(value.trim())
        .ok()
        .map(|timestamp| timestamp.format("%Y-%m-%d").to_string())
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use uuid::Uuid;

    use crate::{
        ai::{
            batch_store::StoredBatchFile,
            contracts::{
                BackgroundCompileWriteMode, BatchCompileDecision, BatchCompileDisposition,
                BatchCompileInput, BatchCompileTrigger,
            },
        },
        clipboard::types::CaptureRecord,
    };

    use super::{list_recent_triage_artifacts, save_triage_artifact, PersistedTriageArtifact};

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!("tino-triage-store-tests-{}", Uuid::now_v7().simple()))
    }

    fn sample_batch(id: &str, first_captured_at: &str) -> StoredBatchFile {
        StoredBatchFile {
            id: id.to_string(),
            status: "persisted".into(),
            created_at: "2026-04-22T09:00:00+08:00".into(),
            trigger_reason: "capture_count".into(),
            capture_count: 1,
            first_captured_at: first_captured_at.to_string(),
            last_captured_at: first_captured_at.to_string(),
            source_ids: vec![format!("cap_{id}")],
            captures: vec![CaptureRecord {
                id: format!("cap_{id}"),
                source: "clipboard".into(),
                source_app_name: Some("Notes".into()),
                source_app_bundle_id: Some("dev.notes".into()),
                source_app_icon_path: None,
                captured_at: first_captured_at.to_string(),
                content_kind: "plain_text".into(),
                raw_text: "Triage artifact should preserve compile decisions.".into(),
                raw_rich: None,
                raw_rich_format: None,
                link_url: None,
                link_metadata: None,
                asset_path: None,
                thumbnail_path: None,
                image_width: None,
                image_height: None,
                byte_size: None,
                hash: format!("hash_{id}"),
                image_bytes: None,
                source_app_icon_bytes: None,
            }],
        }
    }

    fn sample_input(batch_id: &str, first_captured_at: &str) -> BatchCompileInput {
        BatchCompileInput {
            batch_id: Some(batch_id.to_string()),
            trigger: BatchCompileTrigger::CaptureCount,
            capture_count: 1,
            source_capture_ids: vec![format!("cap_{batch_id}")],
            first_captured_at: Some(first_captured_at.to_string()),
            last_captured_at: Some(first_captured_at.to_string()),
        }
    }

    fn sample_decisions(batch_id: &str) -> Vec<BatchCompileDecision> {
        vec![BatchCompileDecision {
            decision_id: format!("decision_{batch_id}"),
            disposition: BatchCompileDisposition::WriteTopic,
            source_capture_ids: vec![format!("cap_{batch_id}")],
            topic_slug: Some("triage".into()),
            topic_name: Some("Triage".into()),
            title: "Triage".into(),
            summary: "summary".into(),
            key_points: vec!["point".into()],
            tags: vec!["triage".into()],
            confidence: 0.8,
            rationale: "reason".into(),
        }]
    }

    #[test]
    fn saves_triage_artifact_under_partition_day() {
        let root = unique_root();
        let batch = sample_batch("batch_alpha", "2026-04-20T08:30:00+08:00");
        let artifact = PersistedTriageArtifact::from_batch_compile(
            &batch,
            "job_alpha",
            &sample_input("batch_alpha", "2026-04-20T08:30:00+08:00"),
            1,
            "Injected Mock Compiler",
            BackgroundCompileWriteMode::SandboxOnly,
            "2026-04-22T09:10:00+08:00",
            &sample_decisions("batch_alpha"),
        );

        save_triage_artifact(&root, &artifact).expect("artifact should save");

        let path = root
            .join("_system/ai/triage/2026-04-20/batch_alpha.json");
        assert!(path.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn list_recent_triage_artifacts_returns_newest_first() {
        let root = unique_root();
        let older_batch = sample_batch("batch_old", "2026-04-20T08:30:00+08:00");
        let newer_batch = sample_batch("batch_new", "2026-04-21T11:00:00+08:00");

        save_triage_artifact(
            &root,
            &PersistedTriageArtifact::from_batch_compile(
                &older_batch,
                "job_old",
                &sample_input("batch_old", "2026-04-20T08:30:00+08:00"),
                1,
                "Injected Mock Compiler",
                BackgroundCompileWriteMode::SandboxOnly,
                "2026-04-22T09:10:00+08:00",
                &sample_decisions("batch_old"),
            ),
        )
        .expect("older artifact should save");
        save_triage_artifact(
            &root,
            &PersistedTriageArtifact::from_batch_compile(
                &newer_batch,
                "job_new",
                &sample_input("batch_new", "2026-04-21T11:00:00+08:00"),
                2,
                "Injected Mock Compiler",
                BackgroundCompileWriteMode::LegacyLive,
                "2026-04-22T09:20:00+08:00",
                &sample_decisions("batch_new"),
            ),
        )
        .expect("newer artifact should save");

        let artifacts = list_recent_triage_artifacts(&root, 10).expect("artifacts should list");
        assert_eq!(artifacts.len(), 2);
        assert_eq!(artifacts[0].batch_id, "batch_new");
        assert_eq!(artifacts[1].batch_id, "batch_old");

        let _ = fs::remove_dir_all(root);
    }
}
