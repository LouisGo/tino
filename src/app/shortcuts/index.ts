import type { ShortcutBindingOverride, ShortcutDefinition } from "@/core/shortcuts";
import { systemShortcuts } from "@/app/shortcuts/system-shortcuts";
import { clipboardShortcuts } from "@/features/clipboard/clipboard-shortcuts";

export const appShortcuts = [
  ...systemShortcuts,
  ...clipboardShortcuts,
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
