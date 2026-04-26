import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

export const homeChatShortcuts = [
  defineShortcut<void, void>({
    id: "homeChat.startNewConversation",
    kind: "local",
    label: "Start New Home Chat Conversation",
    description: "Create a new conversation in the AI chat workspace.",
    defaults: "CommandOrControl+N",
    scopes: ["homeChat.workspace"],
    allowInEditable: true,
    command: {
      id: "homeChat.startNewConversation",
    },
  }),
  defineShortcut<void, void>({
    id: "homeChat.openSearch",
    kind: "local",
    label: "Open Home Chat Search",
    description: "Open the AI chat conversation search dialog.",
    defaults: "CommandOrControl+F",
    scopes: ["homeChat.workspace"],
    allowInEditable: true,
    command: {
      id: "homeChat.openSearch",
    },
  }),
] satisfies ShortcutDefinition<unknown, unknown>[];
