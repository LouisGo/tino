use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use crate::home_chat::{
    build_home_chat_preview, normalize_home_chat_content, normalize_home_chat_optional_content,
    normalize_home_chat_title, HomeChatConversationDetail, HomeChatConversationSummary,
    HomeChatConversationTitleSource, HomeChatConversationTitleStatus, HomeChatMessage,
    HomeChatMessageRole, HomeChatMessageStatus,
};

const SQLITE_FILE_NAME: &str = "interactive-chat.db";

pub struct InteractiveChatStore {
    db_path: PathBuf,
}

pub struct AssistantMessageUpdate<'a> {
    pub content: &'a str,
    pub reasoning_text: Option<&'a str>,
    pub status: HomeChatMessageStatus,
    pub error_message: Option<&'a str>,
    pub provider_label: Option<&'a str>,
    pub response_model: Option<&'a str>,
}

impl InteractiveChatStore {
    pub fn new(storage_root: &Path) -> Result<Self, String> {
        let store = Self {
            db_path: storage_root.join(SQLITE_FILE_NAME),
        };
        store.ensure_schema()?;
        Ok(store)
    }

    pub fn list_conversations(&self) -> Result<Vec<HomeChatConversationSummary>, String> {
        let connection = self.open_connection()?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT
                    id,
                    title,
                    title_status,
                    title_source,
                    preview_text,
                    message_count,
                    created_at,
                    updated_at,
                    last_message_at
                FROM chat_conversations
                ORDER BY last_message_at DESC, updated_at DESC, created_at DESC
                "#,
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], map_conversation_summary_row)
            .map_err(|error| error.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn get_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let connection = self.open_connection()?;
        self.get_conversation_with_connection(&connection, conversation_id)
    }

    pub fn create_conversation(
        &self,
        initial_user_message: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let normalized_message = normalize_home_chat_content(initial_user_message);
        let now = now_rfc3339();
        let conversation_id = Uuid::now_v7().to_string();
        let message_id = Uuid::now_v7().to_string();
        let preview_text = build_home_chat_preview(&normalized_message);
        let mut connection = self.open_connection()?;
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;

        tx.execute(
            r#"
            INSERT INTO chat_conversations (
                id,
                title,
                title_status,
                title_source,
                preview_text,
                message_count,
                created_at,
                updated_at,
                last_message_at
            ) VALUES (?1, NULL, ?2, NULL, ?3, 1, ?4, ?4, ?4)
            "#,
            params![
                &conversation_id,
                HomeChatConversationTitleStatus::Pending.as_storage_label(),
                preview_text.as_deref(),
                &now,
            ],
        )
        .map_err(|error| error.to_string())?;

        tx.execute(
            r#"
            INSERT INTO chat_messages (
                id,
                conversation_id,
                ordinal,
                role,
                content,
                reasoning_text,
                status,
                error_message,
                provider_label,
                response_model,
                created_at,
                updated_at
            ) VALUES (?1, ?2, 1, ?3, ?4, NULL, ?5, NULL, NULL, NULL, ?6, ?6)
            "#,
            params![
                &message_id,
                &conversation_id,
                HomeChatMessageRole::User.as_storage_label(),
                &normalized_message,
                HomeChatMessageStatus::Completed.as_storage_label(),
                &now,
            ],
        )
        .map_err(|error| error.to_string())?;

        tx.commit().map_err(|error| error.to_string())?;
        self.get_conversation(&conversation_id)
    }

    pub fn append_user_message(
        &self,
        conversation_id: &str,
        user_message: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let normalized_message = normalize_home_chat_content(user_message);
        let now = now_rfc3339();
        let mut connection = self.open_connection()?;
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let next_ordinal = self.next_message_ordinal(&tx, conversation_id)?;

        tx.execute(
            r#"
            INSERT INTO chat_messages (
                id,
                conversation_id,
                ordinal,
                role,
                content,
                reasoning_text,
                status,
                error_message,
                provider_label,
                response_model,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, NULL, NULL, NULL, ?7, ?7)
            "#,
            params![
                Uuid::now_v7().to_string(),
                conversation_id,
                next_ordinal,
                HomeChatMessageRole::User.as_storage_label(),
                normalized_message,
                HomeChatMessageStatus::Completed.as_storage_label(),
                &now,
            ],
        )
        .map_err(|error| error.to_string())?;

        self.update_conversation_after_message_change(
            &tx,
            conversation_id,
            build_home_chat_preview(&normalized_message),
            &now,
        )?;
        tx.commit().map_err(|error| error.to_string())?;
        self.get_conversation(conversation_id)
    }

    pub fn replace_latest_assistant_message(
        &self,
        conversation_id: &str,
        assistant: &AssistantMessageUpdate<'_>,
    ) -> Result<HomeChatConversationDetail, String> {
        let normalized_content = normalize_home_chat_content(assistant.content);
        let normalized_reasoning = normalize_home_chat_optional_content(assistant.reasoning_text);
        let normalized_error = normalize_home_chat_optional_content(assistant.error_message);
        let normalized_provider = normalize_home_chat_optional_content(assistant.provider_label);
        let normalized_response_model =
            normalize_home_chat_optional_content(assistant.response_model);
        let preview_text = build_home_chat_preview(&normalized_content).or_else(|| {
            normalized_error
                .as_ref()
                .and_then(|value| build_home_chat_preview(value))
        });
        let now = now_rfc3339();
        let mut connection = self.open_connection()?;
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let latest_message = self.latest_message_meta(&tx, conversation_id)?;

        if matches!(
            latest_message.as_ref().map(|message| message.role),
            Some(HomeChatMessageRole::Assistant)
        ) {
            tx.execute(
                r#"
                UPDATE chat_messages
                SET
                    content = ?1,
                    reasoning_text = ?2,
                    status = ?3,
                    error_message = ?4,
                    provider_label = ?5,
                    response_model = ?6,
                    updated_at = ?7
                WHERE id = ?8
                "#,
                params![
                    &normalized_content,
                    normalized_reasoning.as_deref(),
                    assistant.status.as_storage_label(),
                    normalized_error.as_deref(),
                    normalized_provider.as_deref(),
                    normalized_response_model.as_deref(),
                    &now,
                    latest_message.as_ref().map(|value| value.id.as_str()),
                ],
            )
            .map_err(|error| error.to_string())?;
        } else {
            let next_ordinal = latest_message
                .as_ref()
                .map(|value| value.ordinal.saturating_add(1))
                .unwrap_or(1);
            tx.execute(
                r#"
                INSERT INTO chat_messages (
                    id,
                    conversation_id,
                    ordinal,
                    role,
                    content,
                    reasoning_text,
                    status,
                    error_message,
                    provider_label,
                    response_model,
                    created_at,
                    updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
                "#,
                params![
                    Uuid::now_v7().to_string(),
                    conversation_id,
                    next_ordinal,
                    HomeChatMessageRole::Assistant.as_storage_label(),
                    &normalized_content,
                    normalized_reasoning.as_deref(),
                    assistant.status.as_storage_label(),
                    normalized_error.as_deref(),
                    normalized_provider.as_deref(),
                    normalized_response_model.as_deref(),
                    &now,
                ],
            )
            .map_err(|error| error.to_string())?;
        }

        self.update_conversation_after_message_change(&tx, conversation_id, preview_text, &now)?;
        tx.commit().map_err(|error| error.to_string())?;
        self.get_conversation(conversation_id)
    }

    pub fn rewrite_latest_user_message(
        &self,
        conversation_id: &str,
        user_message: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let normalized_message = normalize_home_chat_content(user_message);
        let now = now_rfc3339();
        let mut connection = self.open_connection()?;
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let latest_user = self
            .latest_user_message_meta(&tx, conversation_id)?
            .ok_or_else(|| "No user message found for the conversation.".to_string())?;

        tx.execute(
            r#"
            UPDATE chat_messages
            SET content = ?1, status = ?2, error_message = NULL, updated_at = ?3
            WHERE id = ?4
            "#,
            params![
                &normalized_message,
                HomeChatMessageStatus::Completed.as_storage_label(),
                &now,
                &latest_user.id,
            ],
        )
        .map_err(|error| error.to_string())?;

        tx.execute(
            "DELETE FROM chat_messages WHERE conversation_id = ?1 AND ordinal > ?2",
            params![conversation_id, latest_user.ordinal],
        )
        .map_err(|error| error.to_string())?;

        self.update_conversation_after_message_change(
            &tx,
            conversation_id,
            build_home_chat_preview(&normalized_message),
            &now,
        )?;
        tx.commit().map_err(|error| error.to_string())?;
        self.get_conversation(conversation_id)
    }

    pub fn update_conversation_title(
        &self,
        conversation_id: &str,
        title: &str,
        title_status: HomeChatConversationTitleStatus,
        title_source: HomeChatConversationTitleSource,
    ) -> Result<HomeChatConversationSummary, String> {
        let normalized_title = normalize_home_chat_title(title);
        let now = now_rfc3339();
        let connection = self.open_connection()?;

        connection
            .execute(
                r#"
                UPDATE chat_conversations
                SET
                    title = ?1,
                    title_status = ?2,
                    title_source = ?3,
                    updated_at = ?4
                WHERE id = ?5
                "#,
                params![
                    &normalized_title,
                    title_status.as_storage_label(),
                    title_source.as_storage_label(),
                    &now,
                    conversation_id,
                ],
            )
            .map_err(|error| error.to_string())?;

        self.get_conversation_summary_with_connection(&connection, conversation_id)?
            .ok_or_else(|| "Conversation not found.".to_string())
    }

    fn ensure_schema(&self) -> Result<(), String> {
        let connection = self.open_connection()?;
        connection
            .execute_batch(
                r#"
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS chat_conversations (
                    id TEXT PRIMARY KEY NOT NULL,
                    title TEXT,
                    title_status TEXT NOT NULL,
                    title_source TEXT,
                    preview_text TEXT,
                    message_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_message_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY NOT NULL,
                    conversation_id TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    reasoning_text TEXT,
                    status TEXT NOT NULL,
                    error_message TEXT,
                    provider_label TEXT,
                    response_model TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
                    UNIQUE(conversation_id, ordinal)
                );

                CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at
                ON chat_conversations(last_message_at DESC, updated_at DESC);

                CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_ordinal
                ON chat_messages(conversation_id, ordinal ASC);
                "#,
            )
            .map_err(|error| error.to_string())
    }

    fn open_connection(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|error| error.to_string())
    }

    fn next_message_ordinal(
        &self,
        tx: &Transaction<'_>,
        conversation_id: &str,
    ) -> Result<usize, String> {
        let next_ordinal = tx
            .query_row(
                "SELECT COALESCE(MAX(ordinal), 0) + 1 FROM chat_messages WHERE conversation_id = ?1",
                params![conversation_id],
                |row| row.get::<_, usize>(0),
            )
            .map_err(|error| error.to_string())?;

        if self.conversation_exists(tx, conversation_id)? {
            Ok(next_ordinal)
        } else {
            Err("Conversation not found.".into())
        }
    }

    fn conversation_exists(
        &self,
        tx: &Transaction<'_>,
        conversation_id: &str,
    ) -> Result<bool, String> {
        tx.query_row(
            "SELECT 1 FROM chat_conversations WHERE id = ?1 LIMIT 1",
            params![conversation_id],
            |_row| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|error| error.to_string())
    }

    fn update_conversation_after_message_change(
        &self,
        tx: &Transaction<'_>,
        conversation_id: &str,
        preview_text: Option<String>,
        timestamp: &str,
    ) -> Result<(), String> {
        let message_count = tx
            .query_row(
                "SELECT COUNT(*) FROM chat_messages WHERE conversation_id = ?1",
                params![conversation_id],
                |row| row.get::<_, usize>(0),
            )
            .map_err(|error| error.to_string())?;

        tx.execute(
            r#"
            UPDATE chat_conversations
            SET
                preview_text = ?1,
                message_count = ?2,
                updated_at = ?3,
                last_message_at = ?3
            WHERE id = ?4
            "#,
            params![
                preview_text.as_deref(),
                message_count,
                timestamp,
                conversation_id
            ],
        )
        .map_err(|error| error.to_string())?;

        Ok(())
    }

    fn latest_message_meta(
        &self,
        tx: &Transaction<'_>,
        conversation_id: &str,
    ) -> Result<Option<MessageMeta>, String> {
        tx.query_row(
            r#"
            SELECT id, ordinal, role
            FROM chat_messages
            WHERE conversation_id = ?1
            ORDER BY ordinal DESC
            LIMIT 1
            "#,
            params![conversation_id],
            |row| {
                Ok(MessageMeta {
                    id: row.get(0)?,
                    ordinal: row.get(1)?,
                    role: HomeChatMessageRole::from_storage_label(
                        row.get::<_, String>(2)?.as_str(),
                    ),
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
    }

    fn latest_user_message_meta(
        &self,
        tx: &Transaction<'_>,
        conversation_id: &str,
    ) -> Result<Option<MessageMeta>, String> {
        tx.query_row(
            r#"
            SELECT id, ordinal, role
            FROM chat_messages
            WHERE conversation_id = ?1 AND role = 'user'
            ORDER BY ordinal DESC
            LIMIT 1
            "#,
            params![conversation_id],
            |row| {
                Ok(MessageMeta {
                    id: row.get(0)?,
                    ordinal: row.get(1)?,
                    role: HomeChatMessageRole::from_storage_label(
                        row.get::<_, String>(2)?.as_str(),
                    ),
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())
    }

    fn get_conversation_with_connection(
        &self,
        connection: &Connection,
        conversation_id: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let conversation = self
            .get_conversation_summary_with_connection(connection, conversation_id)?
            .ok_or_else(|| "Conversation not found.".to_string())?;
        let mut statement = connection
            .prepare(
                r#"
                SELECT
                    id,
                    conversation_id,
                    ordinal,
                    role,
                    content,
                    reasoning_text,
                    status,
                    error_message,
                    provider_label,
                    response_model,
                    created_at,
                    updated_at
                FROM chat_messages
                WHERE conversation_id = ?1
                ORDER BY ordinal ASC
                "#,
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![conversation_id], map_message_row)
            .map_err(|error| error.to_string())?;
        let messages = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        Ok(HomeChatConversationDetail {
            conversation,
            messages,
        })
    }

    fn get_conversation_summary_with_connection(
        &self,
        connection: &Connection,
        conversation_id: &str,
    ) -> Result<Option<HomeChatConversationSummary>, String> {
        connection
            .query_row(
                r#"
                SELECT
                    id,
                    title,
                    title_status,
                    title_source,
                    preview_text,
                    message_count,
                    created_at,
                    updated_at,
                    last_message_at
                FROM chat_conversations
                WHERE id = ?1
                "#,
                params![conversation_id],
                map_conversation_summary_row,
            )
            .optional()
            .map_err(|error| error.to_string())
    }
}

#[derive(Debug, Clone)]
struct MessageMeta {
    id: String,
    ordinal: usize,
    role: HomeChatMessageRole,
}

fn map_conversation_summary_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<HomeChatConversationSummary> {
    Ok(HomeChatConversationSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        title_status: HomeChatConversationTitleStatus::from_storage_label(
            row.get::<_, String>(2)?.as_str(),
        ),
        title_source: row
            .get::<_, Option<String>>(3)?
            .as_deref()
            .and_then(HomeChatConversationTitleSource::from_storage_label),
        preview_text: row.get(4)?,
        message_count: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        last_message_at: row.get(8)?,
    })
}

fn map_message_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HomeChatMessage> {
    Ok(HomeChatMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        ordinal: row.get(2)?,
        role: HomeChatMessageRole::from_storage_label(row.get::<_, String>(3)?.as_str()),
        content: row.get(4)?,
        reasoning_text: row.get(5)?,
        status: HomeChatMessageStatus::from_storage_label(row.get::<_, String>(6)?.as_str()),
        error_message: row.get(7)?,
        provider_label: row.get(8)?,
        response_model: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn now_rfc3339() -> String {
    chrono::Local::now().to_rfc3339()
}
