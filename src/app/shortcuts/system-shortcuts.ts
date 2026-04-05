import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

export const systemShortcuts = [
  defineShortcut<void, boolean>({
    id: "shell.toggleMainWindow",
    kind: "global",
    label: "Toggle Main Window",
    description: "Show or hide the main Tino window from anywhere.",
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
    label: "Toggle Clipboard Window",
    description: "Quick open or hide the clipboard window from anywhere.",
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
    label: "Open Home",
    description: "Navigate to the dashboard inside the main shell.",
    defaults: "CommandOrControl+1",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.navigateHome",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.openClipboard",
    kind: "local",
    label: "Open Clipboard Page",
    description: "Navigate to the clipboard route inside the main shell.",
    defaults: "CommandOrControl+2",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.navigateClipboard",
    },
  }),
  defineShortcut<void, void>({
    id: "shell.openSettings",
    kind: "local",
    label: "Open Settings",
    description: "Navigate to the settings route inside the main shell.",
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
    label: "Toggle Theme Mode",
    description: "Toggle between the current light and dark theme modes.",
    defaults: "CommandOrControl+Shift+L",
    scopes: ["shell.main"],
    allowInEditable: true,
    command: {
      id: "system.toggleThemeMode",
    },
  }),
] satisfies ShortcutDefinition<unknown, unknown>[];
