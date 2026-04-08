import { create } from "zustand";

import type { ContextMenuResolvedItem } from "@/core/context-menu/types";

export type ContextMenuOpenRequest = {
  x: number;
  y: number;
  items: ContextMenuResolvedItem[];
};

type ContextMenuStore = {
  isOpen: boolean;
  items: ContextMenuResolvedItem[];
  sessionId: number;
  x: number;
  y: number;
  closeMenu: () => void;
  openMenu: (request: ContextMenuOpenRequest) => void;
};

const initialContextMenuState = {
  isOpen: false,
  items: [] as ContextMenuResolvedItem[],
  sessionId: 0,
  x: 0,
  y: 0,
};

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  ...initialContextMenuState,
  closeMenu: () =>
    set((state) =>
      state.isOpen
        ? {
            isOpen: false,
            items: [],
            sessionId: state.sessionId + 1,
          }
        : state),
  openMenu: ({ x, y, items }) =>
    set((state) => ({
      isOpen: items.length > 0,
      items,
      sessionId: state.sessionId + 1,
      x,
      y,
    })),
}));
