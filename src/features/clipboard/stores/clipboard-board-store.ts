import { create } from "zustand";

import type { ClipboardFilter } from "@/features/clipboard/lib/clipboard-board";
import type { ClipboardCapture, PinnedClipboardCapture } from "@/types/shell";

const initialClipboardBoardState = {
  searchValue: "",
  filter: "all" as ClipboardFilter,
  selectedCaptureId: null,
  preferredSelectedCaptureId: null,
  previewingImageId: null,
  pendingDeleteCapture: null,
  pendingPinCapture: null,
  pinnedCaptures: [] as PinnedClipboardCapture[],
  visibleCaptures: [] as ClipboardCapture[],
  listScrollRequest: 0,
};

type ClipboardBoardState = {
  searchValue: string;
  filter: ClipboardFilter;
  selectedCaptureId: string | null;
  preferredSelectedCaptureId: string | null;
  previewingImageId: string | null;
  pendingDeleteCapture: ClipboardCapture | null;
  pendingPinCapture: ClipboardCapture | null;
  pinnedCaptures: PinnedClipboardCapture[];
  visibleCaptures: ClipboardCapture[];
  listScrollRequest: number;
  resetState: () => void;
  setSearchValue: (value: string) => void;
  setFilter: (value: ClipboardFilter) => void;
  toggleSummaryFilter: (value: ClipboardFilter) => void;
  setSelectedCaptureId: (value: string | null) => void;
  setPreferredSelectedCaptureId: (value: string | null) => void;
  setPreviewingImageId: (value: string | null) => void;
  setPendingDeleteCapture: (capture: ClipboardCapture | null) => void;
  setPendingPinCapture: (capture: ClipboardCapture | null) => void;
  setPinnedCaptures: (captures: PinnedClipboardCapture[]) => void;
  setVisibleCaptures: (captures: ClipboardCapture[]) => void;
  requestListScrollToTop: () => void;
  removeCapture: (captureId: string) => void;
};

export const useClipboardBoardStore = create<ClipboardBoardState>((set) => ({
  ...initialClipboardBoardState,
  resetState: () => set(initialClipboardBoardState),
  setSearchValue: (value) => set({ searchValue: value }),
  setFilter: (value) => set({ filter: value }),
  toggleSummaryFilter: (value) =>
    set((state) => ({
      filter: value !== "all" && state.filter === value ? "all" : value,
    })),
  setSelectedCaptureId: (value) => set({ selectedCaptureId: value }),
  setPreferredSelectedCaptureId: (value) => set({ preferredSelectedCaptureId: value }),
  setPreviewingImageId: (value) => set({ previewingImageId: value }),
  setPendingDeleteCapture: (capture) => set({ pendingDeleteCapture: capture }),
  setPendingPinCapture: (capture) => set({ pendingPinCapture: capture }),
  setPinnedCaptures: (captures) => set({ pinnedCaptures: captures }),
  setVisibleCaptures: (captures) => set({ visibleCaptures: captures }),
  requestListScrollToTop: () =>
    set((state) => ({
      listScrollRequest: state.listScrollRequest + 1,
    })),
  removeCapture: (captureId) =>
    set((state) => ({
      selectedCaptureId:
        state.selectedCaptureId === captureId ? null : state.selectedCaptureId,
      preferredSelectedCaptureId:
        state.preferredSelectedCaptureId === captureId ? null : state.preferredSelectedCaptureId,
      previewingImageId:
        state.previewingImageId === captureId ? null : state.previewingImageId,
      pendingDeleteCapture:
        state.pendingDeleteCapture?.id === captureId ? null : state.pendingDeleteCapture,
      pendingPinCapture:
        state.pendingPinCapture?.id === captureId ? null : state.pendingPinCapture,
      pinnedCaptures: state.pinnedCaptures.filter((entry) => entry.capture.id !== captureId),
      visibleCaptures: state.visibleCaptures.filter((capture) => capture.id !== captureId),
    })),
}));
