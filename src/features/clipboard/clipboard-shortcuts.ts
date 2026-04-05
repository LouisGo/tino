import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

export const clipboardShortcuts = [
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
