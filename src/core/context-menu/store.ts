import { create } from "zustand";

import type { ContextMenuResolvedItem } from "@/core/context-menu/types";

export type ContextMenuOpenRequest = {
  x: number;
  y: number;
  items: ContextMenuResolvedItem[];
};

export type ContextMenuSelectionDirection = "next" | "previous";
export type ContextMenuSelectionBoundary = "first" | "last";
export type ContextMenuInteractionMode = "keyboard" | "pointer";

const CONTEXT_MENU_POINTER_INTENT_DISTANCE_PX = 1;

type ContextMenuStore = {
  activeIndex: number;
  interactionMode: ContextMenuInteractionMode;
  instanceId: number;
  isOpen: boolean;
  items: ContextMenuResolvedItem[];
  pointerOriginX: number;
  pointerOriginY: number;
  x: number;
  y: number;
  closeMenu: () => void;
  moveActiveIndex: (direction: ContextMenuSelectionDirection) => boolean;
  moveToBoundary: (boundary: ContextMenuSelectionBoundary) => boolean;
  openMenu: (request: ContextMenuOpenRequest) => void;
  selectActiveItem: () => Promise<boolean>;
  selectItemAt: (index: number) => Promise<boolean>;
  setActiveIndexFromPointer: (
    index: number,
    point: {
      x: number;
      y: number;
    },
  ) => void;
};

const initialContextMenuState = {
  activeIndex: -1,
  interactionMode: "keyboard" as ContextMenuInteractionMode,
  instanceId: 0,
  isOpen: false,
  items: [] as ContextMenuResolvedItem[],
  pointerOriginX: 0,
  pointerOriginY: 0,
  x: 0,
  y: 0,
};

function isSelectableItem(item: ContextMenuResolvedItem | undefined) {
  return item?.type === "item" && !item.disabled;
}

function findBoundaryIndex(
  items: ContextMenuResolvedItem[],
  boundary: ContextMenuSelectionBoundary,
) {
  if (boundary === "first") {
    return items.findIndex((item) => isSelectableItem(item));
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (isSelectableItem(items[index])) {
      return index;
    }
  }

  return -1;
}

function findAdjacentIndex(
  items: ContextMenuResolvedItem[],
  activeIndex: number,
  direction: ContextMenuSelectionDirection,
) {
  const step = direction === "next" ? 1 : -1;
  if (!isSelectableItem(items[activeIndex])) {
    return findBoundaryIndex(items, direction === "next" ? "first" : "last");
  }

  for (
    let index = activeIndex + step;
    index >= 0 && index < items.length;
    index += step
  ) {
    if (isSelectableItem(items[index])) {
      return index;
    }
  }

  return activeIndex;
}

export function hasSelectableContextMenuItems(items: ContextMenuResolvedItem[]) {
  return items.some((item) => isSelectableItem(item));
}

function hasPointerIntent(
  state: Pick<ContextMenuStore, "interactionMode" | "pointerOriginX" | "pointerOriginY">,
  point: { x: number; y: number },
) {
  if (state.interactionMode === "pointer") {
    return true;
  }

  return (
    Math.abs(point.x - state.pointerOriginX) >= CONTEXT_MENU_POINTER_INTENT_DISTANCE_PX
    || Math.abs(point.y - state.pointerOriginY) >= CONTEXT_MENU_POINTER_INTENT_DISTANCE_PX
  );
}

export const useContextMenuStore = create<ContextMenuStore>((set, get) => ({
  ...initialContextMenuState,
  closeMenu: () =>
    set((state) =>
      state.isOpen
        ? {
            activeIndex: -1,
            interactionMode: "keyboard",
            isOpen: false,
            items: [],
          }
        : state),
  moveActiveIndex: (direction) => {
    const state = get();
    if (!state.isOpen) {
      return false;
    }

    const nextIndex = findAdjacentIndex(state.items, state.activeIndex, direction);
    if (nextIndex < 0) {
      return false;
    }

    if (nextIndex !== state.activeIndex) {
      set({
        activeIndex: nextIndex,
        interactionMode: "keyboard",
      });
      return true;
    }

    if (state.interactionMode !== "keyboard") {
      set({ interactionMode: "keyboard" });
    }

    return true;
  },
  moveToBoundary: (boundary) => {
    const state = get();
    if (!state.isOpen) {
      return false;
    }

    const nextIndex = findBoundaryIndex(state.items, boundary);
    if (nextIndex < 0) {
      return false;
    }

    if (nextIndex !== state.activeIndex) {
      set({
        activeIndex: nextIndex,
        interactionMode: "keyboard",
      });
      return true;
    }

    if (state.interactionMode !== "keyboard") {
      set({ interactionMode: "keyboard" });
    }

    return true;
  },
  openMenu: ({ x, y, items }) =>
    set((state) => ({
      activeIndex: findBoundaryIndex(items, "first"),
      interactionMode: "keyboard",
      instanceId: state.instanceId + 1,
      isOpen: items.length > 0,
      items,
      pointerOriginX: x,
      pointerOriginY: y,
      x,
      y,
    })),
  selectActiveItem: () => get().selectItemAt(get().activeIndex),
  selectItemAt: async (index) => {
    const item = get().items[index];
    if (!isSelectableItem(item)) {
      return false;
    }

    get().closeMenu();

    try {
      await Promise.resolve(item.onSelect?.());
      return true;
    } catch (error) {
      console.error("[context-menu] action failed", error);
      return false;
    }
  },
  setActiveIndexFromPointer: (index, point) =>
    set((state) => {
      if (!state.isOpen || !isSelectableItem(state.items[index])) {
        return state;
      }

      if (!hasPointerIntent(state, point)) {
        return state;
      }

      if (index === state.activeIndex && state.interactionMode === "pointer") {
        return state;
      }

      return {
        activeIndex: index,
        interactionMode: "pointer",
      };
    }),
}));
