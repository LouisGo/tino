export { AppShortcutProvider } from "@/core/shortcuts/provider";
export { ShortcutRegistry } from "@/core/shortcuts/registry";
export { ShortcutKbd } from "@/core/shortcuts/shortcut-kbd";
export {
  useAppShortcut,
  useShortcutManager,
  useShortcutScope,
} from "@/core/shortcuts/hooks";
export {
  createShortcutExecution,
  executeShortcutExecution,
  findShortcutConflicts,
  findLocalShortcutExecution,
  resolveShortcutCatalog,
} from "@/core/shortcuts/manager";
export type {
  AppShortcutId,
  ResolvedShortcutDefinition,
  ShortcutBindingOverride,
  ShortcutDefinition,
  ShortcutKind,
  ShortcutManager,
  ShortcutPlatform,
  ShortcutScopeId,
} from "@/core/shortcuts/types";
export { defineShortcut } from "@/core/shortcuts/types";
export {
  formatShortcutAccelerator,
  isModifierOnlyKey,
  keyboardEventToShortcutAccelerator,
  normalizeShortcutAccelerator,
} from "@/core/shortcuts/utils";
