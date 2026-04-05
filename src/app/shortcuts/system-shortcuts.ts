import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";
import { tx } from "@/i18n";

export const systemShortcuts = [
  defineShortcut<void, boolean>({
    id: "shell.toggleMainWindow",
    kind: "global",
    label: tx("shortcuts", "shell.toggleMainWindow.label"),
    description: tx("shortcuts", "shell.toggleMainWindow.description"),
    defaults: {
      default: "CommandOrControl+Shift+Alt+T",
    },
    command: {
      id: "system.toggleMainWindowVisibility",
    },
  }),
  defineShortcut<void, boolean>({
    id: "shell.toggleClipboardWindow",
    kind: "global",
    label: tx("shortcuts", "shell.toggleClipboardWindow.label"),
    description: tx("shortcuts", "shell.toggleClipboardWindow.description"),
    defaults: {
      default: "CommandOrControl+Shift+Alt+V",
    },
    command: {
      id: "system.toggleClipboardWindowVisibility",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.openHome",
    kind: "local",
    label: tx("shortcuts", "shell.openHome.label"),
    description: tx("shortcuts", "shell.openHome.description"),
    defaults: "CommandOrControl+1",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.navigateHome",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.openAi",
    kind: "local",
    label: tx("shortcuts", "shell.openAi.label"),
    description: tx("shortcuts", "shell.openAi.description"),
    defaults: "CommandOrControl+2",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.navigateAi",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.openClipboard",
    kind: "local",
    label: tx("shortcuts", "shell.openClipboard.label"),
    description: tx("shortcuts", "shell.openClipboard.description"),
    defaults: "CommandOrControl+3",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.navigateClipboard",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.openSettings",
    kind: "local",
    label: tx("shortcuts", "shell.openSettings.label"),
    description: tx("shortcuts", "shell.openSettings.description"),
    defaults: "CommandOrControl+Comma",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.navigateSettings",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.toggleThemeMode",
    kind: "local",
    label: tx("shortcuts", "shell.toggleThemeMode.label"),
    description: tx("shortcuts", "shell.toggleThemeMode.description"),
    defaults: "CommandOrControl+Shift+L",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.toggleThemeMode",
    },
  }),
] satisfies ShortcutDefinition<unknown, unknown>[];
