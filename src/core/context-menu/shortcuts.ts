import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

import { CONTEXT_MENU_HOST_SCOPE } from "@/core/context-menu/constants";

export const contextMenuShortcuts = [
  defineShortcut<void, boolean>({
    id: "contextMenu.openActiveTarget",
    kind: "local",
    label: "Open Active Context Menu",
    description: "Open the context menu for the currently active item target.",
    defaults: {
      default: "CommandOrControl+K",
    },
    scopes: [CONTEXT_MENU_HOST_SCOPE],
    allowInEditable: true,
    command: {
      id: "contextMenu.openActiveTarget",
    },
  }),
] satisfies ShortcutDefinition<unknown, unknown>[];
