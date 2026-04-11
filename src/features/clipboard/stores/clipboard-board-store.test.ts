import { describe, expect, it } from "vitest";

import {
  selectClipboardSearchFocusBlockingLayer,
  useClipboardBoardStore,
} from "@/features/clipboard/stores/clipboard-board-store";
import { createClipboardCapture, createPinnedClipboardCapture } from "@/test/factories/clipboard";

describe("clipboard board store", () => {
  it("toggles a summary filter off when the same non-all filter is selected twice", () => {
    const store = useClipboardBoardStore.getState();

    store.toggleSummaryFilter("image");
    expect(useClipboardBoardStore.getState().filter).toBe("image");

    useClipboardBoardStore.getState().toggleSummaryFilter("image");
    expect(useClipboardBoardStore.getState().filter).toBe("all");
  });

  it("removes a capture from all selection, preview, pending, and list state", () => {
    const capture = createClipboardCapture({ id: "cap_remove" });
    const sibling = createClipboardCapture({ id: "cap_keep" });

    useClipboardBoardStore.setState({
      selectedCaptureId: capture.id,
      preferredSelectedCaptureId: capture.id,
      previewingImageId: capture.id,
      previewingOcrCaptureId: capture.id,
      pendingDeleteCapture: capture,
      pendingPinCapture: capture,
      pinnedCaptures: [
        createPinnedClipboardCapture({
          capture,
        }),
      ],
      visibleCaptures: [capture, sibling],
    });

    useClipboardBoardStore.getState().removeCapture(capture.id);
    const nextState = useClipboardBoardStore.getState();

    expect(nextState.selectedCaptureId).toBeNull();
    expect(nextState.preferredSelectedCaptureId).toBeNull();
    expect(nextState.previewingImageId).toBeNull();
    expect(nextState.previewingOcrCaptureId).toBeNull();
    expect(nextState.pendingDeleteCapture).toBeNull();
    expect(nextState.pendingPinCapture).toBeNull();
    expect(nextState.pinnedCaptures).toHaveLength(0);
    expect(nextState.visibleCaptures.map((entry) => entry.id)).toEqual([sibling.id]);
  });

  it("resets the window session while preserving a list scroll bump", () => {
    useClipboardBoardStore.setState({
      searchValue: "roadmap",
      filter: "link",
      selectedCaptureId: "cap_selected",
      preferredSelectedCaptureId: "cap_preferred",
      isFilterSelectOpen: true,
      isShortcutHelpOpen: true,
      previewingImageId: "cap_image",
      pendingDeleteCapture: createClipboardCapture({ id: "cap_delete" }),
      listScrollRequest: 8,
    });

    useClipboardBoardStore.getState().resetWindowSession();
    const nextState = useClipboardBoardStore.getState();

    expect(nextState.searchValue).toBe("");
    expect(nextState.filter).toBe("all");
    expect(nextState.selectedCaptureId).toBeNull();
    expect(nextState.preferredSelectedCaptureId).toBeNull();
    expect(nextState.isFilterSelectOpen).toBe(false);
    expect(nextState.isShortcutHelpOpen).toBe(false);
    expect(nextState.previewingImageId).toBeNull();
    expect(nextState.pendingDeleteCapture).toBeNull();
    expect(nextState.listScrollRequest).toBe(9);
  });

  it("treats the pin dialog as a search focus blocking layer", () => {
    expect(
      selectClipboardSearchFocusBlockingLayer({
        isFilterSelectOpen: false,
        isShortcutHelpOpen: false,
        previewingImageId: null,
        previewingOcrCaptureId: null,
        pendingDeleteCapture: null,
        pendingPinCapture: createClipboardCapture({ id: "cap_pin" }),
      }),
    ).toBe(true);
  });
});
