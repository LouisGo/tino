import type { CommandDefinition } from "@/core/commands";
import { systemCommands } from "@/app/commands/system-commands";
import { clipboardCommands } from "@/features/clipboard/clipboard-commands";

export const appCommands = [
  ...systemCommands,
  ...clipboardCommands,
] satisfies CommandDefinition<unknown, unknown>[];

