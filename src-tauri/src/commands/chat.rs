use crate::app_state::AppState;
use crate::home_chat::{
    AppendHomeChatUserMessageRequest, CreateHomeChatConversationRequest,
    HomeChatConversationDetail, HomeChatConversationSummary,
    ReplaceLatestHomeChatAssistantMessageRequest, RewriteLatestHomeChatUserMessageRequest,
    UpdateHomeChatConversationTitleRequest,
};
use crate::storage::interactive_chat_store::AssistantMessageUpdate;
use tauri::State;

use super::run_blocking_command;

#[tauri::command]
#[specta::specta]
pub async fn list_home_chat_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<HomeChatConversationSummary>, String> {
    let state = state.inner().clone();
    run_blocking_command(move || state.list_home_chat_conversations()).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_home_chat_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<HomeChatConversationDetail, String> {
    let state = state.inner().clone();
    run_blocking_command(move || state.get_home_chat_conversation(&conversation_id)).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_home_chat_conversation(
    state: State<'_, AppState>,
    request: CreateHomeChatConversationRequest,
) -> Result<HomeChatConversationDetail, String> {
    let initial_user_message = request.initial_user_message.trim().to_string();
    if initial_user_message.is_empty() {
        return Err("Initial user message is required.".into());
    }

    let state = state.inner().clone();
    run_blocking_command(move || state.create_home_chat_conversation(&initial_user_message)).await
}

#[tauri::command]
#[specta::specta]
pub async fn append_home_chat_user_message(
    state: State<'_, AppState>,
    request: AppendHomeChatUserMessageRequest,
) -> Result<HomeChatConversationDetail, String> {
    let conversation_id = request.conversation_id.trim().to_string();
    let user_message = request.user_message.trim().to_string();
    if conversation_id.is_empty() {
        return Err("Conversation id is required.".into());
    }
    if user_message.is_empty() {
        return Err("User message is required.".into());
    }

    let state = state.inner().clone();
    run_blocking_command(move || {
        state.append_home_chat_user_message(&conversation_id, &user_message)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn replace_latest_home_chat_assistant_message(
    state: State<'_, AppState>,
    request: ReplaceLatestHomeChatAssistantMessageRequest,
) -> Result<HomeChatConversationDetail, String> {
    let conversation_id = request.conversation_id.trim().to_string();
    if conversation_id.is_empty() {
        return Err("Conversation id is required.".into());
    }

    let content = request.content;
    let reasoning_text = request.reasoning_text;
    let status = request.status;
    let error_message = request.error_message;
    let provider_label = request.provider_label;
    let response_model = request.response_model;
    let state = state.inner().clone();
    run_blocking_command(move || {
        state.replace_latest_home_chat_assistant_message(
            &conversation_id,
            AssistantMessageUpdate {
                content: &content,
                reasoning_text: reasoning_text.as_deref(),
                status,
                error_message: error_message.as_deref(),
                provider_label: provider_label.as_deref(),
                response_model: response_model.as_deref(),
            },
        )
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn rewrite_latest_home_chat_user_message(
    state: State<'_, AppState>,
    request: RewriteLatestHomeChatUserMessageRequest,
) -> Result<HomeChatConversationDetail, String> {
    let conversation_id = request.conversation_id.trim().to_string();
    let user_message = request.user_message.trim().to_string();
    if conversation_id.is_empty() {
        return Err("Conversation id is required.".into());
    }
    if user_message.is_empty() {
        return Err("User message is required.".into());
    }

    let state = state.inner().clone();
    run_blocking_command(move || {
        state.rewrite_latest_home_chat_user_message(&conversation_id, &user_message)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn update_home_chat_conversation_title(
    state: State<'_, AppState>,
    request: UpdateHomeChatConversationTitleRequest,
) -> Result<HomeChatConversationSummary, String> {
    let conversation_id = request.conversation_id.trim().to_string();
    let title = request.title.trim().to_string();
    if conversation_id.is_empty() {
        return Err("Conversation id is required.".into());
    }
    if title.is_empty() {
        return Err("Conversation title is required.".into());
    }

    let state = state.inner().clone();
    run_blocking_command(move || {
        state.update_home_chat_conversation_title(
            &conversation_id,
            &title,
            request.title_status,
            request.title_source,
        )
    })
    .await
}
