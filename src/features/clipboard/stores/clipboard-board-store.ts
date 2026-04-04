import { create } from "zustand";

import type { ClipboardFilter } from "@/features/clipboard/lib/clipboard-board";
import type { ClipboardCapture } from "@/types/shell";

const initialClipboardBoardState = {
  searchValue: "",
  filter: "all" as ClipboardFilter,
  selectedCaptureId: null,
  previewingImageId: null,
  pendingDeleteCapture: null,
};

type ClipboardBoardState = {
  searchValue: string;
  filter: ClipboardFilter;
  selectedCaptureId: string | null;
  previewingImageId: string | null;
  pendingDeleteCapture: ClipboardCapture | null;
  resetState: () => void;
  setSearchValue: (value: string) => void;
  setFilter: (value: ClipboardFilter) => void;
  toggleSummaryFilter: (value: ClipboardFilter) => void;
  setSelectedCaptureId: (value: string | null) => void;
  setPreviewingImageId: (value: string | null) => void;
  setPendingDeleteCapture: (capture: ClipboardCapture | null) => void;
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
  setPreviewingImageId: (value) => set({ previewingImageId: value }),
  setPendingDeleteCapture: (capture) => set({ pendingDeleteCapture: capture }),
  removeCapture: (captureId) =>
    set((state) => ({
      selectedCaptureId:
        state.selectedCaptureId === captureId ? null : state.selectedCaptureId,
      previewingImageId:
        state.previewingImageId === captureId ? null : state.previewingImageId,
      pendingDeleteCapture:
        state.pendingDeleteCapture?.id === captureId ? null : state.pendingDeleteCapture,
    })),
}));
