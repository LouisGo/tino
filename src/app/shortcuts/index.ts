import type { ShortcutBindingOverride, ShortcutDefinition } from "@/core/shortcuts";
import { systemShortcuts } from "@/app/shortcuts/system-shortcuts";
import { contextMenuShortcuts } from "@/core/context-menu";
import { clipboardShortcuts } from "@/features/clipboard/clipboard-shortcuts";
import { homeChatShortcuts } from "@/features/chat/home-chat-shortcuts";

export const appShortcuts = [
  ...contextMenuShortcuts,
  ...systemShortcuts,
  ...clipboardShortcuts,
  ...homeChatShortcuts,
] satisfies ShortcutDefinition<unknown, unknown>[];

const configurableShortcutIds = new Set(
  appShortcuts
    .filter((shortcut) => shortcut.kind === "global")
    .map((shortcut) => shortcut.id),
);

export function filterConfigurableShortcutOverrides(
  overrides: Record<string, ShortcutBindingOverride> | null | undefined,
) {
  if (!overrides) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(overrides).filter(([shortcutId]) => configurableShortcutIds.has(shortcutId)),
  );
}
