import { defineCommand, type CommandDefinition } from "@/core/commands";
import {
  dispatchHomeChatShortcutEvent,
  HOME_CHAT_OPEN_SEARCH_EVENT,
  HOME_CHAT_START_NEW_CONVERSATION_EVENT,
} from "@/features/chat/home-chat-shortcut-events";

export const homeChatCommands = [
  defineCommand<void, void>({
    id: "homeChat.startNewConversation",
    label: "Start Home Chat Conversation",
    description: "Create a new home chat conversation from the current AI workspace.",
    run: () => {
      dispatchHomeChatShortcutEvent(HOME_CHAT_START_NEW_CONVERSATION_EVENT);
    },
  }),
  defineCommand<void, void>({
    id: "homeChat.openSearch",
    label: "Open Home Chat Search",
    description: "Open the home chat conversation search dialog.",
    run: () => {
      dispatchHomeChatShortcutEvent(HOME_CHAT_OPEN_SEARCH_EVENT);
    },
  }),
] satisfies CommandDefinition<unknown, unknown>[];
