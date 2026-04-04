import { queryKeys } from "@/app/query-keys";
import { defineCommand, type CommandDefinition } from "@/core/commands";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import {
  copyCaptureToClipboard,
  deleteClipboardCapture,
  revealPath,
} from "@/lib/tauri";
import type { ClipboardCapture, DeleteClipboardCaptureResult } from "@/types/shell";

type ClipboardCapturePayload = {
  capture: ClipboardCapture;
};

type ClipboardCaptureIdPayload = {
  captureId: string;
};

type ClipboardCaptureAssetPayload = {
  capture: ClipboardCapture;
  path: string;
};

export const clipboardCommands = [
  defineCommand<ClipboardCaptureIdPayload, void>({
    id: "clipboard.selectCapture",
    label: "Select Capture",
    isEnabled: ({ captureId }) => Boolean(captureId.trim()),
    run: ({ captureId }: ClipboardCaptureIdPayload) => {
      useClipboardBoardStore.getState().setSelectedCaptureId(captureId);
    },
  }),
  defineCommand<ClipboardCaptureIdPayload, void>({
    id: "clipboard.showImageLightbox",
    label: "Open Image Viewer",
    isEnabled: ({ captureId }) => Boolean(captureId.trim()),
    run: ({ captureId }: ClipboardCaptureIdPayload) => {
      useClipboardBoardStore.getState().setPreviewingImageId(captureId);
    },
  }),
  defineCommand<ClipboardCapturePayload, void>({
    id: "clipboard.copyCapture",
    label: "Copy Again",
    run: async ({ capture }: ClipboardCapturePayload) => {
      await copyCaptureToClipboard(capture);
    },
  }),
  defineCommand<ClipboardCaptureAssetPayload, void>({
    id: "clipboard.revealCaptureAsset",
    label: "Reveal Asset",
    isEnabled: ({ path }) => Boolean(path.trim()),
    run: async ({ path }: ClipboardCaptureAssetPayload) => {
      await revealPath(path);
    },
  }),
  defineCommand<ClipboardCapturePayload, DeleteClipboardCaptureResult | null>({
    id: "clipboard.requestDeleteCapture",
    label: "Request Delete Capture",
    isEnabled: ({ capture }) => Boolean(capture.id.trim()),
    run: ({ capture }: ClipboardCapturePayload) => {
      useClipboardBoardStore.getState().setPendingDeleteCapture(capture);
      return null;
    },
  }),
  defineCommand<ClipboardCapturePayload, DeleteClipboardCaptureResult | null>({
    id: "clipboard.deleteCapture",
    label: "Delete Capture",
    isEnabled: ({ capture }) => Boolean(capture.id.trim()),
    run: async (
      { capture }: ClipboardCapturePayload,
      { queryClient },
    ): Promise<DeleteClipboardCaptureResult | null> => {
      const result = await deleteClipboardCapture(capture.id);
      if (!result.deleted) {
        return result;
      }

      useClipboardBoardStore.getState().removeCapture(capture.id);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.clipboardPageBase(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.clipboardPageSummary(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.dashboardSnapshot(),
        }),
      ]);

      return result;
    },
  }),
] satisfies CommandDefinition<unknown, unknown>[];
