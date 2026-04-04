import { create } from "zustand";

import type { ClipboardFilter } from "@/features/clipboard/lib/clipboard-board";

type ClipboardBoardState = {
  searchValue: string;
  filter: ClipboardFilter;
  setSearchValue: (value: string) => void;
  setFilter: (value: ClipboardFilter) => void;
  toggleSummaryFilter: (value: ClipboardFilter) => void;
};

export const useClipboardBoardStore = create<ClipboardBoardState>((set) => ({
  searchValue: "",
  filter: "all",
  setSearchValue: (value) => set({ searchValue: value }),
  setFilter: (value) => set({ filter: value }),
  toggleSummaryFilter: (value) =>
    set((state) => ({
      filter: value !== "all" && state.filter === value ? "all" : value,
    })),
}));
