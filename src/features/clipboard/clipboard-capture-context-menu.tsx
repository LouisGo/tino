import {
  Copy,
  Eye,
  ExternalLink,
  ImageIcon,
  Trash2,
} from "lucide-react";

import {
  contextMenuItem,
  contextMenuSeparator,
  createContextMenuRegistry,
} from "@/core/context-menu";
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
    key: "reveal-asset",
    label: "Reveal Asset",
    icon: <ExternalLink className="size-4" />,
    hidden: (capture) => capture.contentKind !== "image" || !capture.assetPath,
    command: {
      id: "clipboard.revealCaptureAsset",
      payload: (capture) => ({
        capture,
        path: capture.assetPath ?? "",
      }),
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
