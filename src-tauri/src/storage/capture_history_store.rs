use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::Duration as StdDuration,
};

use chrono::{DateTime, Duration, FixedOffset, Local};
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension, Row};

const SQLITE_FILE_NAME: &str = "tino.db";
const CAPTURE_HISTORY_SCHEMA_VERSION: i32 = 2;

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
}

pub struct CaptureHistoryPage {
    pub captures: Vec<CaptureHistoryEntry>,
    pub total: usize,
    pub summary: CaptureHistorySummary,
}

pub struct CaptureHistoryQuery {
    pub history_days: u16,
    pub search: String,
    pub filter: String,
    pub page: usize,
    pub page_size: usize,
}

pub struct CaptureHistoryStore {
    db_path: PathBuf,
}

impl CaptureHistoryStore {
    pub fn new(knowledge_root: &Path) -> Result<Self, String> {
        let store = Self {
            db_path: knowledge_root.join("_system").join(SQLITE_FILE_NAME),
        };
        store.ensure_schema()?;
        Ok(store)
    }

    pub fn upsert_capture(&self, capture: &CaptureHistoryUpsert) -> Result<(), String> {
        let connection = self.open_connection()?;
        let timestamp = now_rfc3339();
        let captured_day = capture_day(&capture.captured_at)?;

        connection
            .execute(
                r#"
                INSERT INTO capture_history (
                    id,
                    captured_at,
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
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
                )
                ON CONFLICT(id) DO UPDATE SET
                    captured_at = excluded.captured_at,
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

    pub fn list_recent_captures(
        &self,
        history_days: u16,
        limit: usize,
    ) -> Result<Vec<CaptureHistoryEntry>, String> {
        let connection = self.open_connection()?;
        let cutoff_day = history_cutoff_day(history_days);
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
                WHERE captured_day >= ?1
                  AND status IN ('archived', 'queued')
                ORDER BY captured_at DESC, id DESC
                LIMIT ?2
                "#,
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map(
                params![cutoff_day, limit as i64],
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
                        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
                    )
                    "#,
                )
                .map_err(|error| error.to_string())?;

            for capture in captures {
                let timestamp = now_rfc3339();
                let captured_day = capture_day(&capture.captured_at)?;
                statement
                    .execute(params![
                        &capture.id,
                        &capture.captured_at,
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

    pub fn delete_before_day(&self, cutoff: &str) -> Result<(), String> {
        let connection = self.open_connection()?;
        connection
            .execute(
                "DELETE FROM capture_history WHERE captured_day < ?1",
                [cutoff],
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

    connection
        .execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_capture_history_captured_at
            ON capture_history (captured_at DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_captured_day
            ON capture_history (captured_day DESC);

            CREATE INDEX IF NOT EXISTS idx_capture_history_status_captured_at
            ON capture_history (status, captured_at DESC);

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

fn query_summary(
    connection: &Connection,
    query: &CaptureHistoryQuery,
) -> Result<CaptureHistorySummary, String> {
    let (where_sql, params) = build_where_clause(query.history_days, &query.search, "all");
    let sql = format!(
        r#"
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN content_kind IN ('plain_text', 'rich_text') THEN 1 ELSE 0 END) AS text_count,
            SUM(CASE WHEN content_kind = 'link' THEN 1 ELSE 0 END) AS link_count,
            SUM(CASE WHEN content_kind = 'image' THEN 1 ELSE 0 END) AS image_count
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
            })
        })
        .map_err(|error| error.to_string())
}

fn query_filtered_total(
    connection: &Connection,
    query: &CaptureHistoryQuery,
) -> Result<usize, String> {
    let (where_sql, params) = build_where_clause(query.history_days, &query.search, &query.filter);
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
    let (where_sql, mut params) =
        build_where_clause(query.history_days, &query.search, &query.filter);
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
        ORDER BY captured_at DESC, id DESC
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

fn build_where_clause(history_days: u16, search: &str, filter: &str) -> (String, Vec<Value>) {
    let mut clauses = vec![
        "captured_day >= ?".to_string(),
        "status IN ('archived', 'queued')".to_string(),
    ];
    let mut params = vec![Value::Text(history_cutoff_day(history_days))];

    let normalized_search = search.trim().to_ascii_lowercase();
    if !normalized_search.is_empty() {
        clauses.push(
            "LOWER(source || ' ' || COALESCE(source_app_name, '') || ' ' || COALESCE(source_app_bundle_id, '') || ' ' || preview || ' ' || COALESCE(secondary_preview, '') || ' ' || raw_text || ' ' || COALESCE(link_url, '')) LIKE ?".into(),
        );
        params.push(Value::Text(format!("%{normalized_search}%")));
    }

    match filter.trim().to_ascii_lowercase().as_str() {
        "text" => clauses.push("content_kind IN ('plain_text', 'rich_text')".into()),
        "link" => clauses.push("content_kind = 'link'".into()),
        "image" => clauses.push("content_kind = 'image'".into()),
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
        raw_rich: row.get(11)?,
        raw_rich_format: row.get(12)?,
        link_url: row.get(13)?,
        asset_path: row.get(14)?,
        thumbnail_path: row.get(15)?,
        image_width: row.get(16)?,
        image_height: row.get(17)?,
        byte_size: row.get(18)?,
        hash: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

fn history_cutoff_day(history_days: u16) -> String {
    let retained_days = history_days.max(1);
    let cutoff = Local::now().date_naive() - Duration::days(i64::from(retained_days - 1));
    cutoff.format("%Y-%m-%d").to_string()
}

fn capture_day(captured_at: &str) -> Result<String, String> {
    let parsed = DateTime::<FixedOffset>::parse_from_rfc3339(captured_at)
        .map_err(|error| error.to_string())?;
    Ok(parsed.format("%Y-%m-%d").to_string())
}

fn now_rfc3339() -> String {
    Local::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("tino-capture-history-store-{suffix}"))
    }

    fn sample_upsert(id: &str, kind: &str, status: &str, raw_text: &str) -> CaptureHistoryUpsert {
        CaptureHistoryUpsert {
            id: id.into(),
            captured_at: "2026-04-04T12:00:00+08:00".into(),
            source: "clipboard".into(),
            source_app_name: Some("Tino".into()),
            source_app_bundle_id: Some("dev.tino".into()),
            source_app_icon_path: None,
            content_kind: kind.into(),
            preview: raw_text.into(),
            secondary_preview: None,
            status: status.into(),
            raw_text: raw_text.into(),
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
}
