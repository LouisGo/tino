import type { CommandDefinition } from "@/core/commands";
import { contextMenuCommands } from "@/core/context-menu";
import { systemCommands } from "@/app/commands/system-commands";
import { clipboardCommands } from "@/features/clipboard/clipboard-commands";
import { homeChatCommands } from "@/features/chat/home-chat-commands";

export const appCommands = [
  ...contextMenuCommands,
  ...systemCommands,
  ...clipboardCommands,
  ...homeChatCommands,
] satisfies CommandDefinition<unknown, unknown>[];
