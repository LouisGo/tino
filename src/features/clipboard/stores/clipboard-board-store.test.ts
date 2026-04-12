import { beforeEach, describe, expect, it } from "vitest";

import {
  selectClipboardSearchFocusBlockingLayer,
  useClipboardBoardStore,
} from "@/features/clipboard/stores/clipboard-board-store";
import { createClipboardCapture, createPinnedClipboardCapture } from "@/test/factories/clipboard";

describe("clipboard board store", () => {
  beforeEach(() => {
    useClipboardBoardStore.getState().resetState();
  });

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
      followsDefaultSelection: false,
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
    expect(nextState.followsDefaultSelection).toBe(true);
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
      followsDefaultSelection: false,
      preferredSelectedCaptureId: "cap_preferred",
      previewModeCaptureId: "cap_selected",
      selectedPreviewMode: "raw_text",
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
    expect(nextState.followsDefaultSelection).toBe(true);
    expect(nextState.preferredSelectedCaptureId).toBeNull();
    expect(nextState.previewModeCaptureId).toBeNull();
    expect(nextState.selectedPreviewMode).toBeNull();
    expect(nextState.isFilterSelectOpen).toBe(false);
    expect(nextState.isShortcutHelpOpen).toBe(false);
    expect(nextState.previewingImageId).toBeNull();
    expect(nextState.pendingDeleteCapture).toBeNull();
    expect(nextState.listScrollRequest).toBe(9);
  });

  it("closes transient layers without resetting the rest of the board session", () => {
    useClipboardBoardStore.setState({
      searchValue: "roadmap",
      filter: "link",
      selectedCaptureId: "cap_selected",
      followsDefaultSelection: false,
      isFilterSelectOpen: true,
      isShortcutHelpOpen: true,
      previewingImageId: "cap_image",
      previewingOcrCaptureId: "cap_ocr",
      pendingDeleteCapture: createClipboardCapture({ id: "cap_delete" }),
      pendingPinCapture: createClipboardCapture({ id: "cap_pin" }),
      listScrollRequest: 8,
    });

    useClipboardBoardStore.getState().closeTransientLayers();
    const nextState = useClipboardBoardStore.getState();

    expect(nextState.searchValue).toBe("roadmap");
    expect(nextState.filter).toBe("link");
    expect(nextState.selectedCaptureId).toBe("cap_selected");
    expect(nextState.followsDefaultSelection).toBe(false);
    expect(nextState.isFilterSelectOpen).toBe(false);
    expect(nextState.isShortcutHelpOpen).toBe(false);
    expect(nextState.previewingImageId).toBeNull();
    expect(nextState.previewingOcrCaptureId).toBeNull();
    expect(nextState.pendingDeleteCapture).toBeNull();
    expect(nextState.pendingPinCapture).toBeNull();
    expect(nextState.listScrollRequest).toBe(8);
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

  it("marks manual and derived selection updates differently", () => {
    const store = useClipboardBoardStore.getState();

    store.setSelectedCaptureId("cap_manual");
    expect(useClipboardBoardStore.getState()).toMatchObject({
      selectedCaptureId: "cap_manual",
      followsDefaultSelection: false,
    });

    useClipboardBoardStore.getState().setDerivedSelectedCaptureId("cap_default");
    expect(useClipboardBoardStore.getState()).toMatchObject({
      selectedCaptureId: "cap_default",
      followsDefaultSelection: true,
    });
  });

  it("drops the preview mode for a removed capture", () => {
    const capture = createClipboardCapture({ id: "cap_remove" });

    useClipboardBoardStore.setState({
      previewModeCaptureId: capture.id,
      selectedPreviewMode: "raw_rich",
      visibleCaptures: [capture],
    });

    useClipboardBoardStore.getState().removeCapture(capture.id);

    expect(useClipboardBoardStore.getState()).toMatchObject({
      previewModeCaptureId: null,
      selectedPreviewMode: null,
    });
  });

  it("increments the search focus request when the search command asks for focus", () => {
    const store = useClipboardBoardStore.getState();

    store.requestSearchInputFocus();
    store.requestSearchInputFocus();

    expect(useClipboardBoardStore.getState().searchInputFocusRequest).toBe(2);
  });
});
