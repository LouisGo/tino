use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::Duration as StdDuration,
};

use chrono::{DateTime, Duration, FixedOffset, Local};
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension, Row};

const SQLITE_FILE_NAME: &str = "tino.db";
const CAPTURE_HISTORY_SCHEMA_VERSION: i32 = 4;

#[derive(Debug, Clone)]
pub struct CaptureHistoryUpsert {
    pub id: String,
    pub captured_at: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub source_app_icon_path: Option<String>,
    pub content_kind: String,
    pub preview: String,
    pub secondary_preview: Option<String>,
    pub status: String,
    pub raw_text: String,
    pub ocr_text: Option<String>,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
    pub hash: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CaptureHistoryEntry {
    pub id: String,
    pub captured_at: String,
    pub source: String,
    pub source_app_name: Option<String>,
    pub source_app_bundle_id: Option<String>,
    pub source_app_icon_path: Option<String>,
    pub content_kind: String,
    pub preview: String,
    pub secondary_preview: Option<String>,
    pub status: String,
    pub raw_text: String,
    pub ocr_text: Option<String>,
    pub raw_rich: Option<String>,
    pub raw_rich_format: Option<String>,
    pub link_url: Option<String>,
    pub asset_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub byte_size: Option<u64>,
    pub hash: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct CaptureHistorySummary {
    pub total: usize,
    pub text: usize,
    pub links: usize,
    pub images: usize,
    pub videos: usize,
    pub files: usize,
}

pub struct CaptureHistoryPage {
    pub captures: Vec<CaptureHistoryEntry>,
    pub total: usize,
    pub summary: CaptureHistorySummary,
}

pub struct CaptureHistoryQuery {
    pub history_days: u16,
    pub excluded_capture_ids: Vec<String>,
    pub search: String,
    pub filter: String,
    pub page: usize,
    pub page_size: usize,
}

pub struct CaptureHistoryStore {
    db_path: PathBuf,
}

impl CaptureHistoryStore {
    pub fn new(storage_root: &Path) -> Result<Self, String> {
        let store = Self {
            db_path: storage_root.join(SQLITE_FILE_NAME),
        };
        store.ensure_schema()?;
        Ok(store)
    }

    pub fn upsert_capture(&self, capture: &CaptureHistoryUpsert) -> Result<(), String> {
        let connection = self.open_connection()?;
        let timestamp = now_rfc3339();
        let captured_day = capture_day(&capture.captured_at)?;
        let captured_at_epoch_ms = captured_at_epoch_ms(&capture.captured_at)?;

        connection
            .execute(
                r#"
                INSERT INTO capture_history (
                    id,
                    captured_at,
                    captured_at_epoch_ms,
                    captured_day,
                    source,
                    source_app_name,
                    source_app_bundle_id,
                    source_app_icon_path,
                    content_kind,
                    preview,
                    secondary_preview,
                    status,
                    raw_text,
                    ocr_text,
                    raw_rich,
                    raw_rich_format,
                    link_url,
                    asset_path,
                    thumbnail_path,
                    image_width,
                    image_height,
                    byte_size,
                    hash,
                    created_at,
                    updated_at
                )
                VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25
                )
                ON CONFLICT(id) DO UPDATE SET
                    captured_at = excluded.captured_at,
                    captured_at_epoch_ms = excluded.captured_at_epoch_ms,
                    captured_day = excluded.captured_day,
                    source = excluded.source,
                    source_app_name = excluded.source_app_name,
                    source_app_bundle_id = excluded.source_app_bundle_id,
                    source_app_icon_path = excluded.source_app_icon_path,
                    content_kind = excluded.content_kind,
                    preview = excluded.preview,
                    secondary_preview = excluded.secondary_preview,
                    status = excluded.status,
                    raw_text = excluded.raw_text,
                    ocr_text = COALESCE(excluded.ocr_text, capture_history.ocr_text),
                    raw_rich = excluded.raw_rich,
                    raw_rich_format = excluded.raw_rich_format,
                    link_url = excluded.link_url,
                    asset_path = excluded.asset_path,
                    thumbnail_path = excluded.thumbnail_path,
                    image_width = excluded.image_width,
                    image_height = excluded.image_height,
                    byte_size = excluded.byte_size,
                    hash = COALESCE(excluded.hash, capture_history.hash),
                    updated_at = excluded.updated_at
                "#,
                params![
                    &capture.id,
                    &capture.captured_at,
                    captured_at_epoch_ms,
                    &captured_day,
                    &capture.source,
                    capture.source_app_name.as_deref(),
                    capture.source_app_bundle_id.as_deref(),
                    capture.source_app_icon_path.as_deref(),
                    &capture.content_kind,
                    &capture.preview,
                    capture.secondary_preview.as_deref(),
                    &capture.status,
                    &capture.raw_text,
                    capture.ocr_text.as_deref(),
                    capture.raw_rich.as_deref(),
                    capture.raw_rich_format.as_deref(),
                    capture.link_url.as_deref(),
                    capture.asset_path.as_deref(),
                    capture.thumbnail_path.as_deref(),
                    capture.image_width,
                    capture.image_height,
                    capture.byte_size,
                    capture.hash.as_deref(),
                    &timestamp,
                    &timestamp,
                ],
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    pub fn promote_capture_reuse(
        &self,
        capture_id: &str,
        hash: &str,
        replayed_at: &str,
    ) -> Result<bool, String> {
        let mut connection = self.open_connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let timestamp = now_rfc3339();
        let replayed_day = capture_day(replayed_at)?;
        let replayed_at_epoch_ms = captured_at_epoch_ms(replayed_at)?;
        let changed = transaction
            .execute(
                r#"
                UPDATE capture_history
                SET
                    captured_at = ?1,
                    captured_at_epoch_ms = ?2,
                    captured_day = ?3,
                    updated_at = ?4
                WHERE id = ?5
                "#,
                params![
                    replayed_at,
                    replayed_at_epoch_ms,
                    &replayed_day,
                    &timestamp,
                    capture_id
                ],
            )
            .map_err(|error| error.to_string())?;

        if changed == 0 {
            transaction.rollback().map_err(|error| error.to_string())?;
            return Ok(false);
        }

        if !hash.trim().is_empty() {
            transaction
                .execute(
                    "DELETE FROM capture_history WHERE hash = ?1 AND id <> ?2",
                    params![hash, capture_id],
                )
                .map_err(|error| error.to_string())?;
        }

        transaction.commit().map_err(|error| error.to_string())?;
        Ok(true)
    }

    pub fn list_recent_captures(
        &self,
        history_days: u16,
        limit: usize,
    ) -> Result<Vec<CaptureHistoryEntry>, String> {
        let connection = self.open_connection()?;
        let cutoff_epoch_ms = history_cutoff_epoch_ms(history_days);
        let mut statement = connection
            .prepare(
                r#"
                SELECT
                    id,
                    captured_at,
                    source,
                    source_app_name,
                    source_app_bundle_id,
                    source_app_icon_path,
                    content_kind,
                    preview,
                    secondary_preview,
                    status,
                    raw_text,
                    ocr_text,
                    raw_rich,
                    raw_rich_format,
                    link_url,
                    asset_path,
                    thumbnail_path,
                    image_width,
                    image_height,
                    byte_size,
                    hash,
                    created_at,
                    updated_at
                FROM capture_history
                WHERE captured_at_epoch_ms >= ?1
                  AND status IN ('archived', 'queued')
                ORDER BY captured_at_epoch_ms DESC, captured_at DESC, id DESC
                LIMIT ?2
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map(
                params![cutoff_epoch_ms, limit as i64],
                map_capture_history_entry_row,
            )
            .map_err(|error| error.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn query_page(&self, query: &CaptureHistoryQuery) -> Result<CaptureHistoryPage, String> {
        let connection = self.open_connection()?;
        let summary = query_summary(&connection, query)?;
        let total = query_filtered_total(&connection, query)?;
        let captures = query_filtered_captures(&connection, query)?;

        Ok(CaptureHistoryPage {
            captures,
            total,
            summary,
        })
    }

    pub fn replace_retained_history(
        &self,
        captures: &[CaptureHistoryUpsert],
    ) -> Result<(), String> {
        let mut connection = self.open_connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM capture_history", [])
            .map_err(|error| error.to_string())?;

        {
            let mut statement = transaction
                .prepare(
                    r#"
                    INSERT INTO capture_history (
                        id,
                        captured_at,
                        captured_at_epoch_ms,
                        captured_day,
                        source,
                        source_app_name,
                        source_app_bundle_id,
                        source_app_icon_path,
                        content_kind,
                        preview,
                        secondary_preview,
                        status,
                        raw_text,
                        ocr_text,
                        raw_rich,
                        raw_rich_format,
                        link_url,
                        asset_path,
                        thumbnail_path,
                        image_width,
                        image_height,
                        byte_size,
                        hash,
                        created_at,
                        updated_at
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25
                    )
                    "#,
                )
                .map_err(|error| error.to_string())?;

            for capture in captures {
                let timestamp = now_rfc3339();
                let captured_day = capture_day(&capture.captured_at)?;
                let captured_at_epoch_ms = captured_at_epoch_ms(&capture.captured_at)?;
                statement
                    .execute(params![
                        &capture.id,
                        &capture.captured_at,
                        captured_at_epoch_ms,
                        &captured_day,
                        &capture.source,
                        capture.source_app_name.as_deref(),
                        capture.source_app_bundle_id.as_deref(),
                        capture.source_app_icon_path.as_deref(),
                        &capture.content_kind,
                        &capture.preview,
                        capture.secondary_preview.as_deref(),
                        &capture.status,
                        &capture.raw_text,
                        capture.ocr_text.as_deref(),
                        capture.raw_rich.as_deref(),
                        capture.raw_rich_format.as_deref(),
                        capture.link_url.as_deref(),
                        capture.asset_path.as_deref(),
                        capture.thumbnail_path.as_deref(),
                        capture.image_width,
                        capture.image_height,
                        capture.byte_size,
                        capture.hash.as_deref(),
                        &timestamp,
                        &timestamp,
                    ])
                    .map_err(|error| error.to_string())?;
            }
        }

        transaction.commit().map_err(|error| error.to_string())?;
        checkpoint_and_vacuum(&connection)
    }

    pub fn delete_capture(&self, capture_id: &str) -> Result<bool, String> {
        let connection = self.open_connection()?;
        let changed = connection
            .execute("DELETE FROM capture_history WHERE id = ?1", [capture_id])
            .map_err(|error| error.to_string())?;

        Ok(changed > 0)
    }

    pub fn update_capture_ocr_text(
        &self,
        capture_id: &str,
        ocr_text: &str,
    ) -> Result<bool, String> {
        let normalized = ocr_text.trim();
        if normalized.is_empty() {
            return Ok(false);
        }

        let connection = self.open_connection()?;
        let changed = connection
            .execute(
                r#"
                UPDATE capture_history
                SET
                    ocr_text = ?1,
                    updated_at = ?2
                WHERE id = ?3
                  AND (ocr_text IS NULL OR ocr_text <> ?1)
                "#,
                params![normalized, now_rfc3339(), capture_id],
            )
            .map_err(|error| error.to_string())?;

        Ok(changed > 0)
    }

    pub fn delete_before_capture_timestamp(&self, cutoff_epoch_ms: i64) -> Result<(), String> {
        let connection = self.open_connection()?;
        connection
            .execute(
                "DELETE FROM capture_history WHERE captured_at_epoch_ms < ?1",
                [cutoff_epoch_ms],
            )
            .map_err(|error| error.to_string())?;
        checkpoint_and_vacuum(&connection)
    }

    pub fn delete_days(&self, days: &[String]) -> Result<(), String> {
        if days.is_empty() {
            return Ok(());
        }

        let mut connection = self.open_connection()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        {
            let mut statement = transaction
                .prepare("DELETE FROM capture_history WHERE captured_day = ?1")
                .map_err(|error| error.to_string())?;
            for day in days {
                statement
                    .execute([day])
                    .map_err(|error| error.to_string())?;
            }
        }
        transaction.commit().map_err(|error| error.to_string())?;
        checkpoint_and_vacuum(&connection)
    }

    pub fn estimate_usage_by_day(&self) -> Result<BTreeMap<String, u64>, String> {
        let connection = self.open_connection()?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT
                    captured_day,
                    SUM(
                        120 +
                        length(id) +
                        length(captured_at) +
                        length(captured_day) +
                        length(source) +
                        COALESCE(length(source_app_name), 0) +
                        COALESCE(length(source_app_bundle_id), 0) +
                        COALESCE(length(source_app_icon_path), 0) +
                        length(content_kind) +
                        length(preview) +
                        COALESCE(length(secondary_preview), 0) +
                        length(status) +
                        length(raw_text) +
                        COALESCE(length(ocr_text), 0) +
                        COALESCE(length(raw_rich), 0) +
                        COALESCE(length(raw_rich_format), 0) +
                        COALESCE(length(link_url), 0) +
                        COALESCE(length(asset_path), 0) +
                        COALESCE(length(thumbnail_path), 0) +
                        COALESCE(length(hash), 0) +
                        COALESCE(length(created_at), 0) +
                        COALESCE(length(updated_at), 0)
                    ) AS estimated_bytes
                FROM capture_history
                GROUP BY captured_day
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], |row| {
                let day: String = row.get(0)?;
                let estimated: i64 = row.get(1)?;
                Ok((day, estimated.max(0) as u64))
            })
            .map_err(|error| error.to_string())?;

        let mut usage = BTreeMap::new();
        for row in rows {
            let (day, bytes) = row.map_err(|error| error.to_string())?;
            usage.insert(day, bytes);
        }

        Ok(usage)
    }

    fn ensure_schema(&self) -> Result<(), String> {
        let connection = self.open_connection()?;
        run_migrations(&connection)
    }

    fn open_connection(&self) -> Result<Connection, String> {
        if let Some(parent) = self.db_path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let connection = Connection::open(&self.db_path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(StdDuration::from_secs(2))
            .map_err(|error| error.to_string())?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(|error| error.to_string())?;
        connection
            .pragma_update(None, "synchronous", "NORMAL")
            .map_err(|error| error.to_string())?;

        Ok(connection)
    }
}

fn run_migrations(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS capture_history (
                id TEXT PRIMARY KEY,
                captured_at TEXT NOT NULL,
                captured_at_epoch_ms INTEGER NOT NULL DEFAULT 0,
                captured_day TEXT NOT NULL,
                source TEXT NOT NULL,
                source_app_name TEXT,
                source_app_bundle_id TEXT,
                source_app_icon_path TEXT,
                content_kind TEXT NOT NULL,
                preview TEXT NOT NULL,
                secondary_preview TEXT,
                status TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                ocr_text TEXT,
                raw_rich TEXT,
                raw_rich_format TEXT,
                link_url TEXT,
                asset_path TEXT,
                thumbnail_path TEXT,
                image_width INTEGER,
                image_height INTEGER,
                byte_size INTEGER,
                hash TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )
        .map_err(|error| error.to_string())?;

    if !column_exists(connection, "capture_history", "hash")? {
        connection
            .execute("ALTER TABLE capture_history ADD COLUMN hash TEXT", [])
            .map_err(|error| error.to_string())?;
    }

    if !column_exists(connection, "capture_history", "ocr_text")? {
        connection
            .execute("ALTER TABLE capture_history ADD COLUMN ocr_text TEXT", [])
            .map_err(|error| error.to_string())?;
    }

    if !column_exists(connection, "capture_history", "captured_at_epoch_ms")? {
        connection
            .execute(
                "ALTER TABLE capture_history ADD COLUMN captured_at_epoch_ms INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|error| error.to_string())?;
    }

    backfill_captured_at_epoch_ms(connection)?;

    connection
        .execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_capture_history_captured_at
            ON capture_history (captured_at DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_captured_at_epoch_ms
            ON capture_history (captured_at_epoch_ms DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_captured_day
            ON capture_history (captured_day DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_status_captured_at
            ON capture_history (status, captured_at DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_status_captured_at_epoch_ms
            ON capture_history (status, captured_at_epoch_ms DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_kind_captured_at
            ON capture_history (content_kind, captured_at DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_hash_captured_at
            ON capture_history (hash, captured_at DESC);
            "#,
        )
        .map_err(|error| error.to_string())?;

    let version = current_user_version(connection)?;
    if version < CAPTURE_HISTORY_SCHEMA_VERSION {
        connection
            .pragma_update(None, "user_version", CAPTURE_HISTORY_SCHEMA_VERSION)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn current_user_version(connection: &Connection) -> Result<i32, String> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "failed to read sqlite user_version".to_string())
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut statement = connection
        .prepare(&pragma)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;

    for row in rows {
        if row.map_err(|error| error.to_string())? == column {
            return Ok(true);
        }
    }

    Ok(false)
}

fn backfill_captured_at_epoch_ms(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT id, captured_at
            FROM capture_history
            WHERE captured_at_epoch_ms IS NULL OR captured_at_epoch_ms = 0
            "#,
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;

    let pending = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for (id, captured_at) in pending {
        connection
            .execute(
                "UPDATE capture_history SET captured_at_epoch_ms = ?1 WHERE id = ?2",
                params![captured_at_epoch_ms(&captured_at)?, id],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn query_summary(
    connection: &Connection,
    query: &CaptureHistoryQuery,
) -> Result<CaptureHistorySummary, String> {
    let (where_sql, params) = build_where_clause(
        query.history_days,
        &query.excluded_capture_ids,
        &query.search,
        "all",
    );
    let sql = format!(
        r#"
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN content_kind IN ('plain_text', 'rich_text') THEN 1 ELSE 0 END) AS text_count,
            SUM(CASE WHEN content_kind = 'link' THEN 1 ELSE 0 END) AS link_count,
            SUM(CASE WHEN content_kind = 'image' THEN 1 ELSE 0 END) AS image_count,
            SUM(CASE WHEN content_kind = 'video' THEN 1 ELSE 0 END) AS video_count,
            SUM(CASE WHEN content_kind = 'file' THEN 1 ELSE 0 END) AS file_count
        FROM capture_history
        WHERE {where_sql}
        "#
    );

    connection
        .query_row(&sql, params_from_iter(params.iter()), |row| {
            Ok(CaptureHistorySummary {
                total: row.get::<_, i64>(0)?.max(0) as usize,
                text: row.get::<_, Option<i64>>(1)?.unwrap_or_default().max(0) as usize,
                links: row.get::<_, Option<i64>>(2)?.unwrap_or_default().max(0) as usize,
                images: row.get::<_, Option<i64>>(3)?.unwrap_or_default().max(0) as usize,
                videos: row.get::<_, Option<i64>>(4)?.unwrap_or_default().max(0) as usize,
                files: row.get::<_, Option<i64>>(5)?.unwrap_or_default().max(0) as usize,
            })
        })
        .map_err(|error| error.to_string())
}

fn query_filtered_total(
    connection: &Connection,
    query: &CaptureHistoryQuery,
) -> Result<usize, String> {
    let (where_sql, params) = build_where_clause(
        query.history_days,
        &query.excluded_capture_ids,
        &query.search,
        &query.filter,
    );
    let sql = format!("SELECT COUNT(*) FROM capture_history WHERE {where_sql}");

    connection
        .query_row(&sql, params_from_iter(params.iter()), |row| {
            row.get::<_, i64>(0)
        })
        .map(|value| value.max(0) as usize)
        .map_err(|error| error.to_string())
}

fn query_filtered_captures(
    connection: &Connection,
    query: &CaptureHistoryQuery,
) -> Result<Vec<CaptureHistoryEntry>, String> {
    let page_size = query.page_size.clamp(1, 100);
    let offset = query.page.saturating_mul(page_size);
    let (where_sql, mut params) = build_where_clause(
        query.history_days,
        &query.excluded_capture_ids,
        &query.search,
        &query.filter,
    );
    let sql = format!(
        r#"
        SELECT
            id,
            captured_at,
            source,
            source_app_name,
            source_app_bundle_id,
            source_app_icon_path,
            content_kind,
            preview,
            secondary_preview,
            status,
            raw_text,
            ocr_text,
            raw_rich,
            raw_rich_format,
            link_url,
            asset_path,
            thumbnail_path,
            image_width,
            image_height,
            byte_size,
            hash,
            created_at,
            updated_at
        FROM capture_history
        WHERE {where_sql}
        ORDER BY captured_at_epoch_ms DESC, captured_at DESC, id DESC
        LIMIT ? OFFSET ?
        "#
    );
    params.push(Value::Integer(page_size as i64));
    params.push(Value::Integer(offset as i64));

    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(
            params_from_iter(params.iter()),
            map_capture_history_entry_row,
        )
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn build_where_clause(
    history_days: u16,
    excluded_capture_ids: &[String],
    search: &str,
    filter: &str,
) -> (String, Vec<Value>) {
    let mut clauses = vec![
        "captured_at_epoch_ms >= ?".to_string(),
        "status IN ('archived', 'queued')".to_string(),
    ];
    let mut params = vec![Value::Integer(history_cutoff_epoch_ms(history_days))];

    if !excluded_capture_ids.is_empty() {
        let placeholders = (0..excluded_capture_ids.len())
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        clauses.push(format!("id NOT IN ({placeholders})"));
        params.extend(excluded_capture_ids.iter().cloned().map(Value::Text));
    }

    let normalized_search = search.trim().to_ascii_lowercase();
    if !normalized_search.is_empty() {
        clauses.push(
            "LOWER(source || ' ' || COALESCE(source_app_name, '') || ' ' || COALESCE(source_app_bundle_id, '') || ' ' || preview || ' ' || COALESCE(secondary_preview, '') || ' ' || raw_text || ' ' || COALESCE(ocr_text, '') || ' ' || COALESCE(link_url, '')) LIKE ?".into(),
        );
        params.push(Value::Text(format!("%{normalized_search}%")));
    }

    match filter.trim().to_ascii_lowercase().as_str() {
        "text" => clauses.push("content_kind IN ('plain_text', 'rich_text')".into()),
        "link" => clauses.push("content_kind = 'link'".into()),
        "image" => clauses.push("content_kind = 'image'".into()),
        "video" => clauses.push("content_kind = 'video'".into()),
        "file" => clauses.push("content_kind = 'file'".into()),
        _ => {}
    }

    (clauses.join(" AND "), params)
}

fn checkpoint_and_vacuum(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
        .map_err(|error| error.to_string())
}

fn map_capture_history_entry_row(row: &Row<'_>) -> rusqlite::Result<CaptureHistoryEntry> {
    Ok(CaptureHistoryEntry {
        id: row.get(0)?,
        captured_at: row.get(1)?,
        source: row.get(2)?,
        source_app_name: row.get(3)?,
        source_app_bundle_id: row.get(4)?,
        source_app_icon_path: row.get(5)?,
        content_kind: row.get(6)?,
        preview: row.get(7)?,
        secondary_preview: row.get(8)?,
        status: row.get(9)?,
        raw_text: row.get(10)?,
        ocr_text: row.get(11)?,
        raw_rich: row.get(12)?,
        raw_rich_format: row.get(13)?,
        link_url: row.get(14)?,
        asset_path: row.get(15)?,
        thumbnail_path: row.get(16)?,
        image_width: row.get(17)?,
        image_height: row.get(18)?,
        byte_size: row.get(19)?,
        hash: row.get(20)?,
        created_at: row.get(21)?,
        updated_at: row.get(22)?,
    })
}

fn history_cutoff_epoch_ms(history_days: u16) -> i64 {
    let retained_days = history_days.max(1);
    (Local::now().fixed_offset() - Duration::days(i64::from(retained_days))).timestamp_millis()
}

fn capture_day(captured_at: &str) -> Result<String, String> {
    let parsed = DateTime::<FixedOffset>::parse_from_rfc3339(captured_at)
        .map_err(|error| error.to_string())?;
    Ok(parsed.format("%Y-%m-%d").to_string())
}

fn captured_at_epoch_ms(captured_at: &str) -> Result<i64, String> {
    DateTime::<FixedOffset>::parse_from_rfc3339(captured_at)
        .map(|parsed| parsed.timestamp_millis())
        .map_err(|error| error.to_string())
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn unique_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "tino-capture-history-store-{}",
            Uuid::now_v7().simple()
        ))
    }

    fn sample_upsert(id: &str, kind: &str, status: &str, raw_text: &str) -> CaptureHistoryUpsert {
        CaptureHistoryUpsert {
            id: id.into(),
            captured_at: now_rfc3339(),
            source: "clipboard".into(),
            source_app_name: Some("Tino".into()),
            source_app_bundle_id: Some("dev.tino".into()),
            source_app_icon_path: None,
            content_kind: kind.into(),
            preview: raw_text.into(),
            secondary_preview: None,
            status: status.into(),
            raw_text: raw_text.into(),
            ocr_text: None,
            raw_rich: None,
            raw_rich_format: None,
            link_url: None,
            asset_path: None,
            thumbnail_path: None,
            image_width: None,
            image_height: None,
            byte_size: None,
            hash: Some(format!("hash-{id}")),
        }
    }

    fn sample_upsert_at(
        id: &str,
        kind: &str,
        status: &str,
        raw_text: &str,
        captured_at: String,
    ) -> CaptureHistoryUpsert {
        let mut capture = sample_upsert(id, kind, status, raw_text);
        capture.captured_at = captured_at;
        capture
    }

    #[test]
    fn migrates_legacy_schema_to_v2() {
        let root = unique_root();
        let system_dir = root.join("_system");
        fs::create_dir_all(&system_dir).expect("system dir should be created");
        let db_path = system_dir.join(SQLITE_FILE_NAME);
        let connection = Connection::open(&db_path).expect("legacy db should open");
        connection
            .execute_batch(
                r#"
                CREATE TABLE capture_history (
                    id TEXT PRIMARY KEY,
                    captured_at TEXT NOT NULL,
                    captured_day TEXT NOT NULL,
                    source TEXT NOT NULL,
                    source_app_name TEXT,
                    source_app_bundle_id TEXT,
                    source_app_icon_path TEXT,
                    content_kind TEXT NOT NULL,
                    preview TEXT NOT NULL,
                    secondary_preview TEXT,
                    status TEXT NOT NULL,
                    raw_text TEXT NOT NULL,
                    raw_rich TEXT,
                    raw_rich_format TEXT,
                    link_url TEXT,
                    asset_path TEXT,
                    thumbnail_path TEXT,
                    image_width INTEGER,
                    image_height INTEGER,
                    byte_size INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                "#,
            )
            .expect("legacy schema should be created");
        drop(connection);

        let store = CaptureHistoryStore::new(&root).expect("store init should migrate schema");
        let migrated = store.open_connection().expect("migrated db should open");
        assert!(
            column_exists(&migrated, "capture_history", "hash").expect("column check should work")
        );
        let version = current_user_version(&migrated).expect("user version should be readable");
        assert_eq!(version, CAPTURE_HISTORY_SCHEMA_VERSION);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_page_applies_filter_and_summary() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        store
            .upsert_capture(&sample_upsert(
                "cap_text",
                "plain_text",
                "archived",
                "rust clipboard",
            ))
            .expect("text capture should insert");
        store
            .upsert_capture(&sample_upsert(
                "cap_link",
                "link",
                "queued",
                "https://openai.com",
            ))
            .expect("link capture should insert");
        store
            .upsert_capture(&sample_upsert(
                "cap_filtered",
                "plain_text",
                "filtered",
                "ignore me",
            ))
            .expect("filtered capture should insert");

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 1,
                excluded_capture_ids: Vec::new(),
                search: "rust".into(),
                filter: "text".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.summary.total, 1);
        assert_eq!(result.summary.text, 1);
        assert_eq!(result.summary.links, 0);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(result.captures[0].id, "cap_text");
        assert_eq!(result.captures[0].hash.as_deref(), Some("hash-cap_text"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn delete_capture_removes_matching_row_only() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        store
            .upsert_capture(&sample_upsert(
                "cap_text",
                "plain_text",
                "archived",
                "rust clipboard",
            ))
            .expect("text capture should insert");
        store
            .upsert_capture(&sample_upsert(
                "cap_link",
                "link",
                "queued",
                "https://openai.com",
            ))
            .expect("link capture should insert");

        let deleted = store
            .delete_capture("cap_text")
            .expect("delete should succeed");
        assert!(deleted);

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 1,
                excluded_capture_ids: Vec::new(),
                search: String::new(),
                filter: "all".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.summary.total, 1);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(result.captures[0].id, "cap_link");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_page_matches_ocr_text_for_image_captures() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        let mut image = sample_upsert(
            "cap_image",
            "image",
            "archived",
            "Clipboard image · 1200x800",
        );
        image.ocr_text = Some("Launch checklist".into());

        store
            .upsert_capture(&image)
            .expect("image capture should insert");

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 1,
                excluded_capture_ids: Vec::new(),
                search: "launch".into(),
                filter: "image".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(
            result.captures[0].ocr_text.as_deref(),
            Some("Launch checklist")
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_page_counts_and_filters_file_reference_kinds() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        store
            .upsert_capture(&sample_upsert(
                "cap_video",
                "video",
                "archived",
                "/tmp/clip.mov",
            ))
            .expect("video capture should insert");
        store
            .upsert_capture(&sample_upsert(
                "cap_file",
                "file",
                "queued",
                "/tmp/installer.dmg",
            ))
            .expect("file capture should insert");

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 1,
                excluded_capture_ids: Vec::new(),
                search: String::new(),
                filter: "video".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.summary.total, 2);
        assert_eq!(result.summary.videos, 1);
        assert_eq!(result.summary.files, 1);
        assert_eq!(result.captures[0].id, "cap_video");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_page_excludes_requested_capture_ids() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        store
            .upsert_capture(&sample_upsert(
                "cap_oldest",
                "plain_text",
                "archived",
                "rust clipboard",
            ))
            .expect("oldest capture should insert");
        store
            .upsert_capture(&sample_upsert(
                "cap_newest",
                "plain_text",
                "archived",
                "clipboard board",
            ))
            .expect("newest capture should insert");

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 1,
                excluded_capture_ids: vec!["cap_oldest".into()],
                search: String::new(),
                filter: "all".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.summary.total, 1);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(result.captures[0].id, "cap_newest");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn query_page_uses_precise_per_entry_retention_window() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        let now = Local::now().fixed_offset();

        store
            .upsert_capture(&sample_upsert_at(
                "cap_expired",
                "plain_text",
                "archived",
                "expired clipboard",
                (now - Duration::days(1) - Duration::minutes(1)).to_rfc3339(),
            ))
            .expect("expired capture should insert");
        store
            .upsert_capture(&sample_upsert_at(
                "cap_retained",
                "plain_text",
                "archived",
                "retained clipboard",
                (now - Duration::days(1) + Duration::minutes(1)).to_rfc3339(),
            ))
            .expect("retained capture should insert");

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 1,
                excluded_capture_ids: Vec::new(),
                search: String::new(),
                filter: "all".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.summary.total, 1);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(result.captures[0].id, "cap_retained");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn delete_before_capture_timestamp_removes_only_expired_rows() {
        let root = unique_root();
        let store = CaptureHistoryStore::new(&root).expect("store should initialize");
        let now = Local::now().fixed_offset();

        store
            .upsert_capture(&sample_upsert_at(
                "cap_expired",
                "plain_text",
                "archived",
                "expired clipboard",
                (now - Duration::days(1) - Duration::minutes(1)).to_rfc3339(),
            ))
            .expect("expired capture should insert");
        store
            .upsert_capture(&sample_upsert_at(
                "cap_retained",
                "plain_text",
                "archived",
                "retained clipboard",
                (now - Duration::days(1) + Duration::minutes(1)).to_rfc3339(),
            ))
            .expect("retained capture should insert");

        store
            .delete_before_capture_timestamp(history_cutoff_epoch_ms(1))
            .expect("precise retention prune should succeed");

        let result = store
            .query_page(&CaptureHistoryQuery {
                history_days: 7,
                excluded_capture_ids: Vec::new(),
                search: String::new(),
                filter: "all".into(),
                page: 0,
                page_size: 20,
            })
            .expect("query should succeed");

        assert_eq!(result.total, 1);
        assert_eq!(result.captures.len(), 1);
        assert_eq!(result.captures[0].id, "cap_retained");

        let _ = fs::remove_dir_all(root);
    }
}
