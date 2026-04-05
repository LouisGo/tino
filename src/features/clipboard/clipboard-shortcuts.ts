import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

export const clipboardShortcuts = [
  defineShortcut<{ direction: "previous" }, void>({
    id: "clipboard.selectPreviousCapture",
    kind: "local",
    label: "Select Previous Capture",
    description: "Move the detail panel selection to the previous clipboard item.",
    defaults: "ArrowUp",
    scopes: ["clipboard.window"],
    allowInEditable: true,
    allowRepeat: true,
    command: {
      id: "clipboard.selectAdjacentCapture",
      payload: () => ({
        direction: "previous",
      }),
    },
  }),
  defineShortcut<{ direction: "next" }, void>({
    id: "clipboard.selectNextCapture",
    kind: "local",
    label: "Select Next Capture",
    description: "Move the detail panel selection to the next clipboard item.",
    defaults: "ArrowDown",
    scopes: ["clipboard.window"],
    allowInEditable: true,
    allowRepeat: true,
    command: {
      id: "clipboard.selectAdjacentCapture",
      payload: () => ({
        direction: "next",
      }),
    },
  }),
  defineShortcut<void, void>({
    id: "clipboard.confirmWindowSelection",
    kind: "local",
    label: "Confirm Clipboard Selection",
    description: "Return the selected capture to the previously focused app.",
    defaults: "Enter",
    scopes: ["clipboard.window"],
    allowInEditable: true,
    command: {
      id: "clipboard.confirmWindowSelection",
    },
  }),
  defineShortcut<void, void>({
    id: "clipboard.dismissWindow",
    kind: "local",
    label: "Dismiss Clipboard Window",
    description: "Close the floating clipboard window or clear the search field first.",
    defaults: "Escape",
    scopes: ["clipboard.window"],
    allowInEditable: true,
    command: {
      id: "clipboard.dismissWindowSession",
    },
  }),
  defineShortcut<void, void>({
    id: "clipboard.closeImagePreview",
    kind: "local",
    label: "Close Image Preview",
    description: "Close the image lightbox before falling back to broader clipboard shortcuts.",
    defaults: "Escape",
    scopes: ["clipboard.imagePreview"],
    allowInEditable: true,
    command: {
      id: "clipboard.closeImagePreview",
    },
  }),
] satisfies ShortcutDefinition<unknown, unknown>[];
