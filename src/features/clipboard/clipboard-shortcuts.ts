import { defineShortcut, type ShortcutDefinition } from "@/core/shortcuts";

export const clipboardShortcuts = [
  defineShortcut<{ direction: "previous" }, void>({
    id: "clipboard.cyclePreviewModeBackward",
    kind: "local",
    label: "Cycle Preview Mode Backward",
    description: "Switch the selected text capture preview to the previous available mode.",
    defaults: "Shift+Tab",
    scopes: ["clipboard.previewModes"],
    allowInEditable: true,
    command: {
      id: "clipboard.cyclePreviewMode",
      payload: () => ({
        direction: "previous",
      }),
    },
  }),
  defineShortcut<{ direction: "next" }, void>({
    id: "clipboard.cyclePreviewModeForward",
    kind: "local",
    label: "Cycle Preview Mode Forward",
    description: "Switch the selected text capture preview to the next available mode.",
    defaults: "Tab",
    scopes: ["clipboard.previewModes"],
    allowInEditable: true,
    command: {
      id: "clipboard.cyclePreviewMode",
      payload: () => ({
        direction: "next",
      }),
    },
  }),
  defineShortcut<{ direction: "previous" }, void>({
    id: "clipboard.selectPreviousCapture",
    kind: "local",
    label: "Select Previous Capture",
    description: "Move the detail panel selection to the previous clipboard item.",
    defaults: "ArrowUp",
    scopes: ["clipboard.panel"],
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
    scopes: ["clipboard.panel"],
    allowInEditable: true,
    allowRepeat: true,
    command: {
      id: "clipboard.selectAdjacentCapture",
      payload: () => ({
        direction: "next",
      }),
    },
  }),
  defineShortcut<{ boundary: "first" }, void>({
    id: "clipboard.selectFirstCapture",
    kind: "local",
    label: "Select First Capture",
    description: "Jump to the first clipboard item in the current result set.",
    defaults: "Home",
    scopes: ["clipboard.panel"],
    allowInEditable: true,
    command: {
      id: "clipboard.selectBoundaryCapture",
      payload: () => ({
        boundary: "first",
      }),
    },
  }),
  defineShortcut<{ boundary: "last" }, void>({
    id: "clipboard.selectLastCapture",
    kind: "local",
    label: "Select Last Capture",
    description: "Jump to the last clipboard item in the current result set.",
    defaults: "End",
    scopes: ["clipboard.panel"],
    allowInEditable: true,
    command: {
      id: "clipboard.selectBoundaryCapture",
      payload: () => ({
        boundary: "last",
      }),
    },
  }),
  defineShortcut<{ boundary: "first" }, void>({
    id: "clipboard.selectFirstCaptureByCommandArrow",
    kind: "local",
    label: "Select First Capture by Command Arrow",
    description: "Jump to the first clipboard item with Command+ArrowUp on macOS.",
    defaults: {
      macos: "Command+ArrowUp",
    },
    scopes: ["clipboard.panel"],
    allowInEditable: true,
    command: {
      id: "clipboard.selectBoundaryCapture",
      payload: () => ({
        boundary: "first",
      }),
    },
  }),
  defineShortcut<{ boundary: "last" }, void>({
    id: "clipboard.selectLastCaptureByCommandArrow",
    kind: "local",
    label: "Select Last Capture by Command Arrow",
    description: "Jump to the last clipboard item with Command+ArrowDown on macOS.",
    defaults: {
      macos: "Command+ArrowDown",
    },
    scopes: ["clipboard.panel"],
    allowInEditable: true,
    command: {
      id: "clipboard.selectBoundaryCapture",
      payload: () => ({
        boundary: "last",
      }),
    },
  }),
  defineShortcut<void, void>({
    id: "clipboard.openSelectedCapture",
    kind: "local",
    label: "Open Selected Capture",
    description: "Open the selected clipboard item in its native app.",
    defaults: {
      default: "CommandOrControl+O",
    },
    scopes: ["clipboard.panel"],
    allowInEditable: true,
    command: {
      id: "clipboard.openCaptureExternally",
    },
  }),
  defineShortcut<void, void>({
    id: "clipboard.focusSearch",
    kind: "local",
    label: "Focus Clipboard Search",
    description: "Focus and select the clipboard search input.",
    defaults: {
      default: "CommandOrControl+F",
    },
    scopes: ["clipboard.previewModes"],
    allowInEditable: true,
    command: {
      id: "clipboard.focusSearch",
    },
  }),
  defineShortcut<void, void>({
    id: "clipboard.openFilter",
    kind: "local",
    label: "Open Clipboard Filter",
    description: "Open the clipboard type filter selector.",
    defaults: {
      default: "CommandOrControl+Shift+F",
    },
    scopes: ["clipboard.previewModes"],
    allowInEditable: true,
    command: {
      id: "clipboard.openFilter",
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
