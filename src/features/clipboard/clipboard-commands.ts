import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";

import { queryKeys } from "@/app/query-keys";
import { defineCommand, type CommandDefinition, type CommandServices } from "@/core/commands";
import {
  promptForAccessibilityRestart,
  showAccessibilityPermissionDialog,
} from "@/features/clipboard/lib/accessibility-permission-flow";
import { getDefaultVisibleClipboardSelection } from "@/features/clipboard/lib/clipboard-board";
import { hideClipboardWindowForNextOpen } from "@/features/clipboard/lib/clipboard-window-session";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { useClipboardAccessibilityStore } from "@/features/clipboard/stores/clipboard-accessibility-store";
import {
  copyCaptureToClipboard,
  deleteClipboardCapture,
  isTauriRuntime,
  revealPath,
  setClipboardCapturePinned,
  returnCaptureToPreviousApp,
} from "@/lib/tauri";
import type {
  ClipboardCapture,
  DeleteClipboardCaptureResult,
  UpdateClipboardPinResult,
} from "@/types/shell";

type ClipboardCapturePayload = {
  capture: ClipboardCapture;
};

type ClipboardPinCapturePayload = ClipboardCapturePayload & {
  replaceOldest?: boolean;
};

type ClipboardCaptureIdPayload = {
  captureId: string;
};

type ClipboardCaptureAssetPayload = {
  capture: ClipboardCapture;
  path: string;
};

type ClipboardSelectionDirectionPayload = {
  direction: "next" | "previous";
};

type ClipboardSelectionBoundaryPayload = {
  boundary: "first" | "last";
};

type ClipboardConfirmSelectionPayload = {
  captureId?: string;
};

function hasOpenClipboardTransientLayer() {
  return (
    Boolean(document.querySelector("[data-slot='context-menu-content']"))
    || Boolean(document.querySelector("[data-slot='alert-dialog-content']"))
    || Boolean(document.querySelector("[role='listbox']"))
  );
}

function hasActiveClipboardPreview() {
  const { previewingImageId, previewingOcrCaptureId } = useClipboardBoardStore.getState();
  return Boolean(previewingImageId || previewingOcrCaptureId);
}

function isClipboardWindow() {
  return isTauriRuntime() && getCurrentWindow().label === "clipboard";
}

async function closeClipboardWindowForConfirmation() {
  if (!isClipboardWindow()) {
    return;
  }

  const currentWindow = getCurrentWindow();
  await hideClipboardWindowForNextOpen(currentWindow);
}

function getSelectedVisibleCapture() {
  const { pinnedCaptures, selectedCaptureId, visibleCaptures } = useClipboardBoardStore.getState();
  if (visibleCaptures.length === 0) {
    return null;
  }

  return (
    visibleCaptures.find((capture) => capture.id === selectedCaptureId)
    ?? getDefaultVisibleClipboardSelection(
      visibleCaptures,
      pinnedCaptures.map((entry) => entry.capture.id),
    )
  );
}

function getCaptureForConfirmation(
  payload?: ClipboardConfirmSelectionPayload,
) {
  const captureId = payload?.captureId?.trim();
  if (!captureId) {
    return getSelectedVisibleCapture();
  }

  const { visibleCaptures } = useClipboardBoardStore.getState();
  return visibleCaptures.find((capture) => capture.id === captureId) ?? null;
}

async function invalidateClipboardBoardQueries(queryClient: CommandServices["queryClient"]) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.clipboardPageBase(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.clipboardPageSummary(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.clipboardPinnedCaptures(),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboardSnapshot(),
    }),
  ]);
}

async function executePinCapture(
  capture: ClipboardCapture,
  queryClient: CommandServices["queryClient"],
  replaceOldest = false,
) {
  const result = await setClipboardCapturePinned(capture, true, replaceOldest);
  if (!result.changed) {
    return result;
  }

  const store = useClipboardBoardStore.getState();
  store.setPendingPinCapture(null);
  store.setPreferredSelectedCaptureId(capture.id);
  store.setSelectedCaptureId(capture.id);
  store.requestListScrollToTop();
  await invalidateClipboardBoardQueries(queryClient);
  return result;
}

export const clipboardCommands = [
  defineCommand<void, void>({
    id: "clipboard.dismissWindowSession",
    label: "Dismiss Clipboard Window Session",
    run: async () => {
      if (hasOpenClipboardTransientLayer() || hasActiveClipboardPreview()) {
        return;
      }

      const activeElement = document.activeElement;
      const store = useClipboardBoardStore.getState();
      if (
        activeElement instanceof HTMLInputElement
        && activeElement.dataset.clipboardSearchInput === "true"
        && store.searchValue.trim().length > 0
      ) {
        store.setSearchValue("");
        return;
      }

      if (!isTauriRuntime()) {
        return;
      }

      const currentWindow = getCurrentWindow();
      if (currentWindow.label === "clipboard") {
        await hideClipboardWindowForNextOpen(currentWindow);
      }
    },
  }),
  defineCommand<ClipboardSelectionDirectionPayload, void>({
    id: "clipboard.selectAdjacentCapture",
    label: "Select Adjacent Capture",
    isEnabled: ({ direction }) => {
      const { visibleCaptures } = useClipboardBoardStore.getState();
      return (
        (direction === "next" || direction === "previous")
        && !hasActiveClipboardPreview()
        && !hasOpenClipboardTransientLayer()
        && visibleCaptures.length > 0
      );
    },
    run: ({ direction }: ClipboardSelectionDirectionPayload) => {
      const store = useClipboardBoardStore.getState();
      const captures = store.visibleCaptures;
      if (captures.length === 0) {
        return;
      }

      const currentIndex = captures.findIndex(
        (capture) => capture.id === store.selectedCaptureId,
      );
      const fallbackIndex = direction === "previous" ? captures.length - 1 : 0;
      const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
      const offset = direction === "previous" ? -1 : 1;
      const nextIndex = Math.min(
        captures.length - 1,
        Math.max(0, baseIndex + offset),
      );

      store.setSelectedCaptureId(captures[nextIndex]?.id ?? captures[0].id);
    },
  }),
  defineCommand<ClipboardSelectionBoundaryPayload, void>({
    id: "clipboard.selectBoundaryCapture",
    label: "Select Boundary Capture",
    isEnabled: ({ boundary }) => {
      const { visibleCaptures } = useClipboardBoardStore.getState();
      return (
        (boundary === "first" || boundary === "last")
        && !hasActiveClipboardPreview()
        && !hasOpenClipboardTransientLayer()
        && visibleCaptures.length > 0
      );
    },
    run: ({ boundary }: ClipboardSelectionBoundaryPayload) => {
      const captures = useClipboardBoardStore.getState().visibleCaptures;
      if (captures.length === 0) {
        return;
      }

      const targetCapture =
        boundary === "last" ? captures[captures.length - 1] : captures[0];
      if (!targetCapture) {
        return;
      }

      useClipboardBoardStore.getState().setSelectedCaptureId(targetCapture.id);
    },
  }),
  defineCommand<void, void>({
    id: "clipboard.closeImagePreview",
    label: "Close Preview Overlay",
    isEnabled: () => hasActiveClipboardPreview(),
    run: () => {
      const store = useClipboardBoardStore.getState();
      store.setPreviewingImageId(null);
      store.setPreviewingOcrCaptureId(null);
    },
  }),
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
      const store = useClipboardBoardStore.getState();
      store.setPreviewingOcrCaptureId(null);
      store.setPreviewingImageId(captureId);
    },
  }),
  defineCommand<ClipboardConfirmSelectionPayload | undefined, void>({
    id: "clipboard.confirmWindowSelection",
    label: "Confirm Clipboard Window Selection",
    isEnabled: (payload) =>
      isClipboardWindow()
      && !hasActiveClipboardPreview()
      && !hasOpenClipboardTransientLayer()
      && Boolean(getCaptureForConfirmation(payload)),
    run: async (payload) => {
      const capture = getCaptureForConfirmation(payload);
      if (!capture) {
        return;
      }

      if (useClipboardAccessibilityStore.getState().phase === "restartRequired") {
        await promptForAccessibilityRestart();
        return;
      }

      await closeClipboardWindowForConfirmation();

      try {
        const pasted = await returnCaptureToPreviousApp(capture);
        if (!pasted) {
          await copyCaptureToClipboard(capture);
        }
      } catch (error) {
        const description =
          error instanceof Error
            ? error.message
            : "Clipboard content could not be returned to the previous app.";
        const requiresAccessibilityPermission = description.includes(
          "Accessibility permission",
        );
        const requiresPackagedPreviewApp = description.includes(
          "packaged Preview app",
        );
        const requiresLocalSigning =
          description.includes("ad-hoc macOS signing")
          || description.includes("macos:setup-local-signing")
          || description.includes("ad-hoc signed apps");
        const requiresPreviewReinstall =
          description.includes("wrong macOS signing identifier")
          || description.includes("invalid macOS bundle signature")
          || description.includes("missing its macOS signature files")
          || description.includes("Reinstall the latest Preview app");
        if (requiresAccessibilityPermission) {
          useClipboardAccessibilityStore
            .getState()
            .beginPermissionGrantFlow(description);
          await showAccessibilityPermissionDialog();
          return;
        }

        await message(description, {
          title: requiresPackagedPreviewApp
            ? "Packaged Preview App Required"
            : requiresLocalSigning
              ? "Local Signing Required"
              : requiresPreviewReinstall
                ? "Reinstall Preview App"
              : "Clipboard Return Failed",
          kind:
            requiresPackagedPreviewApp
            || requiresLocalSigning
            || requiresPreviewReinstall
              ? "warning"
              : "error",
        });
      }
    },
  }),
  defineCommand<ClipboardCapturePayload, void>({
    id: "clipboard.copyCapture",
    label: "Copy Again",
    run: async ({ capture }: ClipboardCapturePayload) => {
      await copyCaptureToClipboard(capture);
    },
  }),
  defineCommand<ClipboardPinCapturePayload, UpdateClipboardPinResult | null>({
    id: "clipboard.pinCapture",
    label: "Pin Capture",
    isEnabled: ({ capture }) => Boolean(capture.id.trim()),
    run: async (
      { capture, replaceOldest = false }: ClipboardPinCapturePayload,
      { queryClient },
    ) => {
      const store = useClipboardBoardStore.getState();
      const pinnedCaptures = store.pinnedCaptures;
      const isAlreadyPinned = pinnedCaptures.some((entry) => entry.capture.id === capture.id);
      const reachedPinnedLimit =
        !isAlreadyPinned && pinnedCaptures.length >= 5 && !replaceOldest;

      if (reachedPinnedLimit) {
        store.setPendingPinCapture(capture);
        return null;
      }

      return executePinCapture(capture, queryClient, replaceOldest);
    },
  }),
  defineCommand<ClipboardCapturePayload, UpdateClipboardPinResult | null>({
    id: "clipboard.unpinCapture",
    label: "Unpin Capture",
    isEnabled: ({ capture }) => Boolean(capture.id.trim()),
    run: async ({ capture }: ClipboardCapturePayload, { queryClient }) => {
      const store = useClipboardBoardStore.getState();
      const result = await setClipboardCapturePinned(capture, false);
      if (!result.changed) {
        return result;
      }

      store.setPreferredSelectedCaptureId(capture.id);
      store.setSelectedCaptureId(capture.id);
      await invalidateClipboardBoardQueries(queryClient);
      return result;
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
      await invalidateClipboardBoardQueries(queryClient);

      return result;
    },
  }),
] satisfies CommandDefinition<unknown, unknown>[];
