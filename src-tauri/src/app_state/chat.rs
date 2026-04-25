use crate::home_chat::{
    DeleteHomeChatConversationResult, HomeChatConversationDetail, HomeChatConversationSummary,
    HomeChatConversationTitleSource, HomeChatConversationTitleStatus,
};
use crate::ipc_events::HomeChatConversationsUpdated;
use crate::storage::interactive_chat_store::{AssistantMessageUpdate, InteractiveChatStore};
use tauri_specta::Event as _;

use super::AppState;

impl AppState {
    pub fn list_home_chat_conversations(&self) -> Result<Vec<HomeChatConversationSummary>, String> {
        self.chat_store()?.list_conversations()
    }

    pub fn get_home_chat_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        self.chat_store()?.get_conversation(conversation_id)
    }

    pub fn create_home_chat_conversation(
        &self,
        initial_user_message: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let detail = self
            .chat_store()?
            .create_conversation(initial_user_message)?;
        self.emit_home_chat_updated(HomeChatConversationsUpdated::conversation_created(
            detail.conversation.id.clone(),
        ));
        Ok(detail)
    }

    pub fn append_home_chat_user_message(
        &self,
        conversation_id: &str,
        user_message: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let detail = self
            .chat_store()?
            .append_user_message(conversation_id, user_message)?;
        self.emit_home_chat_updated(HomeChatConversationsUpdated::messages_changed(
            conversation_id.to_string(),
        ));
        Ok(detail)
    }

    pub fn replace_latest_home_chat_assistant_message(
        &self,
        conversation_id: &str,
        assistant: AssistantMessageUpdate<'_>,
    ) -> Result<HomeChatConversationDetail, String> {
        let detail = self
            .chat_store()?
            .replace_latest_assistant_message(conversation_id, &assistant)?;
        self.emit_home_chat_updated(HomeChatConversationsUpdated::messages_changed(
            conversation_id.to_string(),
        ));
        Ok(detail)
    }

    pub fn rewrite_latest_home_chat_user_message(
        &self,
        conversation_id: &str,
        user_message: &str,
    ) -> Result<HomeChatConversationDetail, String> {
        let detail = self
            .chat_store()?
            .rewrite_latest_user_message(conversation_id, user_message)?;
        self.emit_home_chat_updated(HomeChatConversationsUpdated::messages_changed(
            conversation_id.to_string(),
        ));
        Ok(detail)
    }

    pub fn update_home_chat_conversation_title(
        &self,
        conversation_id: &str,
        title: &str,
        title_status: HomeChatConversationTitleStatus,
        title_source: HomeChatConversationTitleSource,
    ) -> Result<HomeChatConversationSummary, String> {
        let summary = self.chat_store()?.update_conversation_title(
            conversation_id,
            title,
            title_status,
            title_source,
        )?;
        self.emit_home_chat_updated(HomeChatConversationsUpdated::title_changed(
            conversation_id.to_string(),
        ));
        Ok(summary)
    }

    pub fn set_home_chat_conversation_pinned(
        &self,
        conversation_id: &str,
        pinned: bool,
    ) -> Result<HomeChatConversationSummary, String> {
        let summary = self
            .chat_store()?
            .set_conversation_pinned(conversation_id, pinned)?;
        self.emit_home_chat_updated(HomeChatConversationsUpdated::pinned_changed(
            conversation_id.to_string(),
        ));
        Ok(summary)
    }

    pub fn delete_home_chat_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<DeleteHomeChatConversationResult, String> {
        let result = self.chat_store()?.delete_conversation(conversation_id)?;
        if result.deleted {
            self.emit_home_chat_updated(HomeChatConversationsUpdated::conversation_deleted(
                conversation_id.to_string(),
            ));
        }
        Ok(result)
    }

    fn chat_store(&self) -> Result<InteractiveChatStore, String> {
        InteractiveChatStore::new(&self.shared.app_data_dir)
    }

    fn emit_home_chat_updated(&self, update: HomeChatConversationsUpdated) {
        if let Err(error) = update.emit(&self.shared.app_handle) {
            log::warn!("failed to emit home chat updated event: {error}");
        }
    }
}
