import { create } from "zustand";

import type { ClipboardFilter } from "@/features/clipboard/lib/clipboard-board";
import type { ClipboardCapture, PinnedClipboardCapture } from "@/types/shell";

const initialClipboardBoardState = {
  searchValue: "",
  filter: "all" as ClipboardFilter,
  selectedCaptureId: null,
  followsDefaultSelection: true,
  preferredSelectedCaptureId: null,
  isFilterSelectOpen: false,
  isShortcutHelpOpen: false,
  previewingImageId: null,
  previewingOcrCaptureId: null,
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
  followsDefaultSelection: boolean;
  preferredSelectedCaptureId: string | null;
  isFilterSelectOpen: boolean;
  isShortcutHelpOpen: boolean;
  previewingImageId: string | null;
  previewingOcrCaptureId: string | null;
  pendingDeleteCapture: ClipboardCapture | null;
  pendingPinCapture: ClipboardCapture | null;
  pinnedCaptures: PinnedClipboardCapture[];
  visibleCaptures: ClipboardCapture[];
  listScrollRequest: number;
  resetState: () => void;
  resetWindowSession: () => void;
  setSearchValue: (value: string) => void;
  setFilter: (value: ClipboardFilter) => void;
  toggleSummaryFilter: (value: ClipboardFilter) => void;
  setSelectedCaptureId: (value: string | null) => void;
  setDerivedSelectedCaptureId: (value: string | null) => void;
  setPreferredSelectedCaptureId: (value: string | null) => void;
  setIsFilterSelectOpen: (value: boolean) => void;
  setIsShortcutHelpOpen: (value: boolean) => void;
  setPreviewingImageId: (value: string | null) => void;
  setPreviewingOcrCaptureId: (value: string | null) => void;
  setPendingDeleteCapture: (capture: ClipboardCapture | null) => void;
  setPendingPinCapture: (capture: ClipboardCapture | null) => void;
  setPinnedCaptures: (captures: PinnedClipboardCapture[]) => void;
  setVisibleCaptures: (captures: ClipboardCapture[]) => void;
  requestListScrollToTop: () => void;
  removeCapture: (captureId: string) => void;
};

export function selectClipboardSearchFocusBlockingLayer(
  state: Pick<
    ClipboardBoardState,
    | "isFilterSelectOpen"
    | "isShortcutHelpOpen"
    | "previewingImageId"
    | "previewingOcrCaptureId"
    | "pendingDeleteCapture"
    | "pendingPinCapture"
  >,
) {
  return (
    state.isFilterSelectOpen
    || state.isShortcutHelpOpen
    || Boolean(state.previewingImageId)
    || Boolean(state.previewingOcrCaptureId)
    || Boolean(state.pendingDeleteCapture)
    || Boolean(state.pendingPinCapture)
  );
}

export const useClipboardBoardStore = create<ClipboardBoardState>((set) => ({
  ...initialClipboardBoardState,
  resetState: () => set(initialClipboardBoardState),
  resetWindowSession: () =>
    set((state) => ({
      ...initialClipboardBoardState,
      listScrollRequest: state.listScrollRequest + 1,
    })),
  setSearchValue: (value) => set({ searchValue: value }),
  setFilter: (value) => set({ filter: value }),
  toggleSummaryFilter: (value) =>
    set((state) => ({
      filter: value !== "all" && state.filter === value ? "all" : value,
    })),
  setSelectedCaptureId: (value) =>
    set({
      selectedCaptureId: value,
      followsDefaultSelection: false,
    }),
  setDerivedSelectedCaptureId: (value) =>
    set({
      selectedCaptureId: value,
      followsDefaultSelection: true,
    }),
  setPreferredSelectedCaptureId: (value) => set({ preferredSelectedCaptureId: value }),
  setIsFilterSelectOpen: (value) => set({ isFilterSelectOpen: value }),
  setIsShortcutHelpOpen: (value) => set({ isShortcutHelpOpen: value }),
  setPreviewingImageId: (value) => set({ previewingImageId: value }),
  setPreviewingOcrCaptureId: (value) => set({ previewingOcrCaptureId: value }),
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
      followsDefaultSelection:
        state.selectedCaptureId === captureId ? true : state.followsDefaultSelection,
      preferredSelectedCaptureId:
        state.preferredSelectedCaptureId === captureId ? null : state.preferredSelectedCaptureId,
      previewingImageId:
        state.previewingImageId === captureId ? null : state.previewingImageId,
      previewingOcrCaptureId:
        state.previewingOcrCaptureId === captureId ? null : state.previewingOcrCaptureId,
      pendingDeleteCapture:
        state.pendingDeleteCapture?.id === captureId ? null : state.pendingDeleteCapture,
      pendingPinCapture:
        state.pendingPinCapture?.id === captureId ? null : state.pendingPinCapture,
      pinnedCaptures: state.pinnedCaptures.filter((entry) => entry.capture.id !== captureId),
      visibleCaptures: state.visibleCaptures.filter((capture) => capture.id !== captureId),
    })),
}));
