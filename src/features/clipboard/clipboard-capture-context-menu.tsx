import {
  Copy,
  Eye,
  ExternalLink,
  FolderOpen,
  ImageIcon,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";

import {
  contextMenuItem,
  contextMenuSeparator,
  createContextMenuRegistry,
} from "@/core/context-menu";
import {
  captureReferencePath,
  isFileReferenceKind,
} from "@/features/clipboard/lib/clipboard-board";
import { isTauriRuntime } from "@/lib/tauri";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import type { ClipboardCapture } from "@/types/shell";

export const clipboardCaptureContextMenu = createContextMenuRegistry<ClipboardCapture>([
  contextMenuItem({
    key: "copy",
    label: "Copy Again",
    icon: <Copy className="size-4" />,
    command: {
      id: "clipboard.copyCapture",
      payload: (capture) => ({ capture }),
    },
  }),
  contextMenuItem({
    key: "open-link",
    label: "Open Link",
    icon: <ExternalLink className="size-4" />,
    hidden: (capture) => capture.contentKind !== "link",
    command: {
      id: "system.openExternalTarget",
      payload: (capture) => ({
        target: capture.linkUrl ?? capture.rawText,
      }),
    },
  }),
  contextMenuItem({
    key: "open-image",
    label: "Open Image Viewer",
    icon: <Eye className="size-4" />,
    hidden: (capture) => capture.contentKind !== "image",
    command: {
      id: "clipboard.showImageLightbox",
      payload: (capture) => ({ captureId: capture.id }),
    },
  }),
  contextMenuItem({
    key: "open-preview",
    label: "Open In Preview",
    icon: <ImageIcon className="size-4" />,
    hidden: (capture) => capture.contentKind !== "image" || !capture.assetPath,
    command: {
      id: "system.openImageInPreview",
      payload: (capture) => ({ path: capture.assetPath ?? "" }),
    },
  }),
  contextMenuItem({
    key: "open-file-default-app",
    label: "Open",
    icon: <ExternalLink className="size-4" />,
    hidden: (capture) =>
      !isFileReferenceKind(capture.contentKind)
      || Boolean(capture.fileMissing)
      || !captureReferencePath(capture)
      || !isTauriRuntime(),
    command: {
      id: "system.openPathInDefaultApp",
      payload: (capture) => ({ path: captureReferencePath(capture) }),
    },
  }),
  contextMenuItem({
    key: "reveal-asset",
    label: (capture) => (isFileReferenceKind(capture.contentKind) ? "Reveal File" : "Reveal Asset"),
    icon: <FolderOpen className="size-4" />,
    hidden: (capture) =>
      capture.contentKind === "image"
        ? !capture.assetPath
        : !isFileReferenceKind(capture.contentKind) || Boolean(capture.fileMissing),
    command: {
      id: "clipboard.revealCaptureAsset",
      payload: (capture) => ({
        capture,
        path: capture.contentKind === "image"
          ? (capture.assetPath ?? "")
          : captureReferencePath(capture),
      }),
    },
  }),
  contextMenuItem({
    key: "toggle-pin",
    label: (capture) =>
      useClipboardBoardStore
        .getState()
        .pinnedCaptures
        .some((entry) => entry.capture.id === capture.id)
        ? "Unpin"
        : "Pin to Top",
    icon: (capture) =>
      useClipboardBoardStore
        .getState()
        .pinnedCaptures
        .some((entry) => entry.capture.id === capture.id)
        ? <PinOff className="size-4" />
        : <Pin className="size-4" />,
    onSelect: (capture, runtime) => {
      const isPinned = useClipboardBoardStore
        .getState()
        .pinnedCaptures
        .some((entry) => entry.capture.id === capture.id);

      return runtime.commands.execute(
        isPinned ? "clipboard.unpinCapture" : "clipboard.pinCapture",
        { capture },
      );
    },
  }),
  contextMenuSeparator("clipboard-divider-danger"),
  contextMenuItem({
    key: "delete",
    label: "Delete Capture",
    icon: <Trash2 className="size-4" />,
    danger: true,
    command: {
      id: "clipboard.requestDeleteCapture",
      payload: (capture) => ({ capture }),
    },
  }),
]);
