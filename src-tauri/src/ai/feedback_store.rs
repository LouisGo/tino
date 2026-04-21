use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use super::contracts::{
    FeedbackEvent, FeedbackEventKind, QualitySnapshot, RecordFeedbackEventInput,
    RecordFeedbackEventResult,
};

const AI_MEMORY_DB_FILE_NAME: &str = "ai-memory.db";
const AI_MEMORY_SCHEMA_VERSION: i32 = 1;

pub struct AiFeedbackStore {
    db_path: PathBuf,
}

impl AiFeedbackStore {
    pub fn new(storage_root: &Path) -> Result<Self, String> {
        fs::create_dir_all(storage_root).map_err(|error| error.to_string())?;

        let store = Self {
            db_path: storage_root.join(AI_MEMORY_DB_FILE_NAME),
        };
        store.ensure_schema()?;
        Ok(store)
    }

    pub fn feedback_event_count(&self) -> Result<usize, String> {
        let connection = self.open_connection()?;
        let count = connection
            .query_row("SELECT COUNT(*) FROM ai_feedback_events", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| error.to_string())?;

        usize::try_from(count).map_err(|error| error.to_string())
    }

    pub fn latest_quality_snapshot(&self) -> Result<Option<QualitySnapshot>, String> {
        let connection = self.open_connection()?;
        connection
            .query_row(
                r#"
                SELECT
                    id,
                    generated_at,
                    total_feedback_events,
                    classification_feedback_count,
                    correction_event_count,
                    correction_rate,
                    topic_confirmed_count,
                    topic_reassigned_count,
                    inbox_reroute_count,
                    restored_to_topic_count,
                    discarded_count,
                    retained_count,
                    deleted_count,
                    viewed_count,
                    last_feedback_at
                FROM ai_quality_snapshots
                ORDER BY generated_at DESC, id DESC
                LIMIT 1
                "#,
                [],
                map_quality_snapshot_row,
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn record_feedback_event(
        &self,
        input: RecordFeedbackEventInput,
    ) -> Result<RecordFeedbackEventResult, String> {
        let mut connection = self.open_connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let event = build_feedback_event(input)?;

        transaction
            .execute(
                r#"
                INSERT INTO ai_feedback_events (
                    id,
                    kind,
                    source,
                    job_id,
                    write_id,
                    source_capture_ids_json,
                    topic_slug,
                    target_topic_slug,
                    recorded_at,
                    note
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![
                    &event.id,
                    event.kind.as_str(),
                    event.source.as_str(),
                    event.job_id.as_deref(),
                    event.write_id.as_deref(),
                    serde_json::to_string(&event.source_capture_ids)
                        .map_err(|error| error.to_string())?,
                    event.topic_slug.as_deref(),
                    event.target_topic_slug.as_deref(),
                    &event.recorded_at,
                    event.note.as_deref(),
                ],
            )
            .map_err(|error| error.to_string())?;

        let quality_snapshot = insert_quality_snapshot(&transaction)?;
        transaction.commit().map_err(|error| error.to_string())?;

        Ok(RecordFeedbackEventResult {
            event,
            quality_snapshot,
        })
    }

    fn ensure_schema(&self) -> Result<(), String> {
        let connection = self.open_connection()?;
        let current_version = connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
            .map_err(|error| error.to_string())?;

        if current_version > AI_MEMORY_SCHEMA_VERSION {
            return Err(format!(
                "ai memory schema version {} is newer than supported version {}",
                current_version, AI_MEMORY_SCHEMA_VERSION
            ));
        }

        if current_version == 0 {
            connection
                .execute_batch(
                    r#"
                    CREATE TABLE IF NOT EXISTS ai_feedback_events (
                        id TEXT PRIMARY KEY,
                        kind TEXT NOT NULL,
                        source TEXT NOT NULL,
                        job_id TEXT,
                        write_id TEXT,
                        source_capture_ids_json TEXT NOT NULL,
                        topic_slug TEXT,
                        target_topic_slug TEXT,
                        recorded_at TEXT NOT NULL,
                        note TEXT
                    );

                    CREATE INDEX IF NOT EXISTS ai_feedback_events_recorded_at_idx
                    ON ai_feedback_events(recorded_at DESC);

                    CREATE INDEX IF NOT EXISTS ai_feedback_events_kind_idx
                    ON ai_feedback_events(kind);

                    CREATE TABLE IF NOT EXISTS ai_quality_snapshots (
                        id TEXT PRIMARY KEY,
                        generated_at TEXT NOT NULL,
                        total_feedback_events INTEGER NOT NULL,
                        classification_feedback_count INTEGER NOT NULL,
                        correction_event_count INTEGER NOT NULL,
                        correction_rate REAL,
                        topic_confirmed_count INTEGER NOT NULL,
                        topic_reassigned_count INTEGER NOT NULL,
                        inbox_reroute_count INTEGER NOT NULL,
                        restored_to_topic_count INTEGER NOT NULL,
                        discarded_count INTEGER NOT NULL,
                        retained_count INTEGER NOT NULL,
                        deleted_count INTEGER NOT NULL,
                        viewed_count INTEGER NOT NULL,
                        last_feedback_at TEXT
                    );

                    CREATE INDEX IF NOT EXISTS ai_quality_snapshots_generated_at_idx
                    ON ai_quality_snapshots(generated_at DESC);
                    "#,
                )
                .map_err(|error| error.to_string())?;

            connection
                .pragma_update(None, "user_version", AI_MEMORY_SCHEMA_VERSION)
                .map_err(|error| error.to_string())?;
        }

        Ok(())
    }

    fn open_connection(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|error| error.to_string())
    }
}

fn build_feedback_event(input: RecordFeedbackEventInput) -> Result<FeedbackEvent, String> {
    let source_capture_ids = normalize_string_vec(input.source_capture_ids);
    let job_id = normalize_optional_string(input.job_id);
    let write_id = normalize_optional_string(input.write_id);
    let topic_slug = normalize_optional_string(input.topic_slug);
    let target_topic_slug = normalize_optional_string(input.target_topic_slug);
    let note = normalize_optional_string(input.note);

    match input.kind {
        FeedbackEventKind::TopicConfirmed
        | FeedbackEventKind::KnowledgeRetained
        | FeedbackEventKind::KnowledgeDeleted
        | FeedbackEventKind::TopicViewed => {
            if topic_slug.is_none() {
                return Err("topicSlug is required for the selected feedback kind".into());
            }
        }
        FeedbackEventKind::TopicReassigned => {
            let Some(source_topic_slug) = topic_slug.as_ref() else {
                return Err("topicSlug is required for topic reassignment".into());
            };
            let Some(target_topic_slug) = target_topic_slug.as_ref() else {
                return Err("targetTopicSlug is required for topic reassignment".into());
            };

            if source_topic_slug == target_topic_slug {
                return Err(
                    "topic reassignment requires different topicSlug and targetTopicSlug".into(),
                );
            }
        }
        FeedbackEventKind::RestoredToTopic => {
            if target_topic_slug.is_none() {
                return Err(
                    "targetTopicSlug is required when restoring a result to a topic".into(),
                );
            }
        }
        FeedbackEventKind::RoutedToInbox | FeedbackEventKind::DiscardedAsNoise => {}
    }

    Ok(FeedbackEvent {
        id: format!("feedback_{}", Uuid::now_v7().simple()),
        kind: input.kind,
        source: input.source,
        job_id,
        write_id,
        source_capture_ids,
        topic_slug,
        target_topic_slug,
        recorded_at: crate::format_system_time_rfc3339(SystemTime::now())?,
        note,
    })
}

fn insert_quality_snapshot(transaction: &Transaction<'_>) -> Result<QualitySnapshot, String> {
    let total_feedback_events = count_feedback_events(transaction, None)?;
    let topic_confirmed_count = count_feedback_events(
        transaction,
        Some(FeedbackEventKind::TopicConfirmed.as_str()),
    )?;
    let topic_reassigned_count = count_feedback_events(
        transaction,
        Some(FeedbackEventKind::TopicReassigned.as_str()),
    )?;
    let inbox_reroute_count =
        count_feedback_events(transaction, Some(FeedbackEventKind::RoutedToInbox.as_str()))?;
    let restored_to_topic_count = count_feedback_events(
        transaction,
        Some(FeedbackEventKind::RestoredToTopic.as_str()),
    )?;
    let discarded_count = count_feedback_events(
        transaction,
        Some(FeedbackEventKind::DiscardedAsNoise.as_str()),
    )?;
    let retained_count = count_feedback_events(
        transaction,
        Some(FeedbackEventKind::KnowledgeRetained.as_str()),
    )?;
    let deleted_count = count_feedback_events(
        transaction,
        Some(FeedbackEventKind::KnowledgeDeleted.as_str()),
    )?;
    let viewed_count =
        count_feedback_events(transaction, Some(FeedbackEventKind::TopicViewed.as_str()))?;
    let classification_feedback_count = topic_confirmed_count
        + topic_reassigned_count
        + inbox_reroute_count
        + restored_to_topic_count
        + discarded_count;
    let correction_event_count =
        topic_reassigned_count + inbox_reroute_count + restored_to_topic_count + discarded_count;
    let correction_rate = if classification_feedback_count > 0 {
        Some(correction_event_count as f64 / classification_feedback_count as f64)
    } else {
        None
    };
    let last_feedback_at = transaction
        .query_row(
            "SELECT MAX(recorded_at) FROM ai_feedback_events",
            [],
            |row| row.get::<_, Option<String>>(0),
        )
        .map_err(|error| error.to_string())?;
    let snapshot = QualitySnapshot {
        id: format!("quality_{}", Uuid::now_v7().simple()),
        generated_at: crate::format_system_time_rfc3339(SystemTime::now())?,
        total_feedback_events,
        classification_feedback_count,
        correction_event_count,
        correction_rate,
        topic_confirmed_count,
        topic_reassigned_count,
        inbox_reroute_count,
        restored_to_topic_count,
        discarded_count,
        retained_count,
        deleted_count,
        viewed_count,
        last_feedback_at,
    };

    transaction
        .execute(
            r#"
            INSERT INTO ai_quality_snapshots (
                id,
                generated_at,
                total_feedback_events,
                classification_feedback_count,
                correction_event_count,
                correction_rate,
                topic_confirmed_count,
                topic_reassigned_count,
                inbox_reroute_count,
                restored_to_topic_count,
                discarded_count,
                retained_count,
                deleted_count,
                viewed_count,
                last_feedback_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
            params![
                &snapshot.id,
                &snapshot.generated_at,
                snapshot.total_feedback_events as i64,
                snapshot.classification_feedback_count as i64,
                snapshot.correction_event_count as i64,
                snapshot.correction_rate,
                snapshot.topic_confirmed_count as i64,
                snapshot.topic_reassigned_count as i64,
                snapshot.inbox_reroute_count as i64,
                snapshot.restored_to_topic_count as i64,
                snapshot.discarded_count as i64,
                snapshot.retained_count as i64,
                snapshot.deleted_count as i64,
                snapshot.viewed_count as i64,
                snapshot.last_feedback_at.as_deref(),
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(snapshot)
}

fn count_feedback_events(
    transaction: &Transaction<'_>,
    kind: Option<&str>,
) -> Result<usize, String> {
    let count = if let Some(kind) = kind {
        transaction
            .query_row(
                "SELECT COUNT(*) FROM ai_feedback_events WHERE kind = ?1",
                [kind],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| error.to_string())?
    } else {
        transaction
            .query_row("SELECT COUNT(*) FROM ai_feedback_events", [], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|error| error.to_string())?
    };

    usize::try_from(count).map_err(|error| error.to_string())
}

fn map_quality_snapshot_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<QualitySnapshot> {
    Ok(QualitySnapshot {
        id: row.get(0)?,
        generated_at: row.get(1)?,
        total_feedback_events: read_count(row, 2)?,
        classification_feedback_count: read_count(row, 3)?,
        correction_event_count: read_count(row, 4)?,
        correction_rate: row.get(5)?,
        topic_confirmed_count: read_count(row, 6)?,
        topic_reassigned_count: read_count(row, 7)?,
        inbox_reroute_count: read_count(row, 8)?,
        restored_to_topic_count: read_count(row, 9)?,
        discarded_count: read_count(row, 10)?,
        retained_count: read_count(row, 11)?,
        deleted_count: read_count(row, 12)?,
        viewed_count: read_count(row, 13)?,
        last_feedback_at: row.get(14)?,
    })
}

fn read_count(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<usize> {
    let value = row.get::<_, i64>(index)?;
    Ok(usize::try_from(value).unwrap_or(0))
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn normalize_string_vec(values: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();

    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() || normalized.iter().any(|existing| existing == trimmed) {
            continue;
        }

        normalized.push(trimmed.to_string());
    }

    normalized
}

#[cfg(test)]
mod tests {
    use super::AiFeedbackStore;
    use crate::ai::contracts::{FeedbackEventKind, FeedbackEventSource, RecordFeedbackEventInput};
    use std::{fs, path::PathBuf};
    use uuid::Uuid;

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tino-ai-feedback-tests-{}",
            Uuid::now_v7().simple()
        ))
    }

    #[test]
    fn new_store_has_no_quality_snapshot() {
        let root = unique_root();
        let store = AiFeedbackStore::new(&root).expect("store should initialize");

        let snapshot = store
            .latest_quality_snapshot()
            .expect("quality snapshot query should work");

        assert!(snapshot.is_none());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn record_feedback_event_updates_quality_rollup() {
        let root = unique_root();
        let store = AiFeedbackStore::new(&root).expect("store should initialize");

        let first = store
            .record_feedback_event(RecordFeedbackEventInput {
                kind: FeedbackEventKind::TopicConfirmed,
                source: FeedbackEventSource::User,
                job_id: Some("job_1".into()),
                write_id: Some("write_1".into()),
                source_capture_ids: vec!["cap_1".into()],
                topic_slug: Some("rust".into()),
                target_topic_slug: None,
                note: Some("looked right".into()),
            })
            .expect("first feedback event should record");
        assert_eq!(first.quality_snapshot.total_feedback_events, 1);
        assert_eq!(first.quality_snapshot.classification_feedback_count, 1);
        assert_eq!(first.quality_snapshot.correction_event_count, 0);
        assert_eq!(first.quality_snapshot.correction_rate, Some(0.0));

        let second = store
            .record_feedback_event(RecordFeedbackEventInput {
                kind: FeedbackEventKind::TopicReassigned,
                source: FeedbackEventSource::User,
                job_id: Some("job_1".into()),
                write_id: Some("write_1".into()),
                source_capture_ids: vec!["cap_1".into(), "cap_2".into()],
                topic_slug: Some("rust".into()),
                target_topic_slug: Some("tauri".into()),
                note: Some("belongs in tauri".into()),
            })
            .expect("second feedback event should record");
        assert_eq!(second.quality_snapshot.total_feedback_events, 2);
        assert_eq!(second.quality_snapshot.classification_feedback_count, 2);
        assert_eq!(second.quality_snapshot.correction_event_count, 1);
        assert_eq!(second.quality_snapshot.correction_rate, Some(0.5));

        let latest_snapshot = store
            .latest_quality_snapshot()
            .expect("latest quality snapshot query should work")
            .expect("latest quality snapshot should exist");
        assert_eq!(latest_snapshot.topic_confirmed_count, 1);
        assert_eq!(latest_snapshot.topic_reassigned_count, 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn topic_reassignment_requires_target_topic_slug() {
        let root = unique_root();
        let store = AiFeedbackStore::new(&root).expect("store should initialize");

        let error = store
            .record_feedback_event(RecordFeedbackEventInput {
                kind: FeedbackEventKind::TopicReassigned,
                source: FeedbackEventSource::User,
                job_id: Some("job_1".into()),
                write_id: None,
                source_capture_ids: vec!["cap_1".into()],
                topic_slug: Some("rust".into()),
                target_topic_slug: None,
                note: None,
            })
            .expect_err("invalid reassignment should fail");

        assert!(error.contains("targetTopicSlug"));

        let _ = fs::remove_dir_all(root);
    }
}
