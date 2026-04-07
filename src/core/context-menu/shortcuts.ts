import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

import {
  CONTEXT_MENU_HOST_SCOPE,
  CONTEXT_MENU_SHORTCUT_SCOPE,
} from "@/core/context-menu/constants";

export const contextMenuShortcuts = [
  defineShortcut<{ direction: "previous" }, boolean>({
    id: "contextMenu.selectPreviousItem",
    kind: "local",
    label: "Select Previous Context Menu Item",
    description: "Move the active context menu selection to the previous enabled item.",
    defaults: "ArrowUp",
    scopes: [CONTEXT_MENU_SHORTCUT_SCOPE],
    allowInEditable: true,
    allowRepeat: true,
    command: {
      id: "contextMenu.selectAdjacentItem",
      payload: () => ({
        direction: "previous",
      }),
    },
  }),
  defineShortcut<{ direction: "next" }, boolean>({
    id: "contextMenu.selectNextItem",
    kind: "local",
    label: "Select Next Context Menu Item",
    description: "Move the active context menu selection to the next enabled item.",
    defaults: "ArrowDown",
    scopes: [CONTEXT_MENU_SHORTCUT_SCOPE],
    allowInEditable: true,
    allowRepeat: true,
    command: {
      id: "contextMenu.selectAdjacentItem",
      payload: () => ({
        direction: "next",
      }),
    },
  }),
  defineShortcut<{ boundary: "first" }, boolean>({
    id: "contextMenu.selectFirstItem",
    kind: "local",
    label: "Select First Context Menu Item",
    description: "Jump to the first enabled item in the active context menu.",
    defaults: "Home",
    scopes: [CONTEXT_MENU_SHORTCUT_SCOPE],
    allowInEditable: true,
    command: {
      id: "contextMenu.selectBoundaryItem",
      payload: () => ({
        boundary: "first",
      }),
    },
  }),
  defineShortcut<{ boundary: "last" }, boolean>({
    id: "contextMenu.selectLastItem",
    kind: "local",
    label: "Select Last Context Menu Item",
    description: "Jump to the last enabled item in the active context menu.",
    defaults: "End",
    scopes: [CONTEXT_MENU_SHORTCUT_SCOPE],
    allowInEditable: true,
    command: {
      id: "contextMenu.selectBoundaryItem",
      payload: () => ({
        boundary: "last",
      }),
    },
  }),
  defineShortcut<void, boolean>({
    id: "contextMenu.confirmSelection",
    kind: "local",
    label: "Confirm Context Menu Selection",
    description: "Run the currently highlighted context menu action.",
    defaults: "Enter",
    scopes: [CONTEXT_MENU_SHORTCUT_SCOPE],
    allowInEditable: true,
    command: {
      id: "contextMenu.confirmSelection",
    },
  }),
  defineShortcut<void, void>({
    id: "contextMenu.close",
    kind: "local",
    label: "Close Context Menu",
    description: "Dismiss the active context menu.",
    defaults: "Escape",
    scopes: [CONTEXT_MENU_SHORTCUT_SCOPE],
    allowInEditable: true,
    command: {
      id: "contextMenu.close",
    },
  }),
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
