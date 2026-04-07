import type { CommandDefinition } from "@/core/commands";
import { contextMenuCommands } from "@/core/context-menu";
import { systemCommands } from "@/app/commands/system-commands";
import { clipboardCommands } from "@/features/clipboard/clipboard-commands";

export const appCommands = [
  ...contextMenuCommands,
  ...systemCommands,
  ...clipboardCommands,
] satisfies CommandDefinition<unknown, unknown>[];
