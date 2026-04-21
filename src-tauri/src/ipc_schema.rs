use std::{fs, path::PathBuf};

use specta_typescript::Typescript;
use tauri_specta::{collect_commands, collect_events, Builder};

use crate::commands::{ai, ai_ops, chat, shell};
use crate::ipc_events::{
    AiSystemUpdated, AppSettingsChanged, ClipboardCapturesUpdated, HomeChatConversationsUpdated,
};

pub fn builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            ai::list_ready_ai_batches,
            ai::get_ai_batch_payload,
            ai::apply_batch_decision,
            ai_ops::get_topic_index_entries,
            ai_ops::get_ai_system_snapshot,
            ai_ops::record_ai_feedback_event,
            ai_ops::preview_ai_batch_compile,
            chat::list_home_chat_conversations,
            chat::get_home_chat_conversation,
            chat::create_home_chat_conversation,
            chat::append_home_chat_user_message,
            chat::replace_latest_home_chat_assistant_message,
            chat::rewrite_latest_home_chat_user_message,
            chat::update_home_chat_conversation_title,
            shell::get_dashboard_snapshot,
            shell::get_clipboard_page,
            shell::get_clipboard_board_bootstrap,
            shell::get_pinned_clipboard_captures,
            shell::set_clipboard_capture_pinned,
            shell::delete_clipboard_capture,
            shell::get_app_settings,
            shell::list_clipboard_source_apps,
            shell::get_clipboard_source_app_icons,
            shell::report_app_activity,
            shell::save_app_settings,
            shell::toggle_main_window_visibility,
            shell::toggle_clipboard_window_visibility,
            shell::get_clipboard_window_target_app_name,
            shell::get_log_directory,
            shell::open_in_preview,
            shell::copy_capture_to_clipboard,
            shell::return_capture_to_previous_app,
            shell::get_accessibility_permission_status,
            shell::open_accessibility_settings,
            shell::request_app_restart,
            shell::reveal_in_file_manager,
        ])
        .events(collect_events![
            AiSystemUpdated,
            AppSettingsChanged,
            ClipboardCapturesUpdated,
            HomeChatConversationsUpdated,
        ])
}

pub fn bindings_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings/tauri.ts")
}

pub fn export_typescript_bindings() -> Result<(), String> {
    let path = bindings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    builder()
        .export(Typescript::default(), &path)
        .map_err(|error| error.to_string())
}
