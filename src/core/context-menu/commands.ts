import { defineCommand, type CommandDefinition } from "@/core/commands";
import { useContextMenuTargetStore } from "@/core/context-menu/target-store";
import {
  useContextMenuStore,
  type ContextMenuSelectionBoundary,
  type ContextMenuSelectionDirection,
} from "@/core/context-menu/store";

type ContextMenuDirectionPayload = {
  direction: ContextMenuSelectionDirection;
};

type ContextMenuBoundaryPayload = {
  boundary: ContextMenuSelectionBoundary;
};

export const contextMenuCommands = [
  defineCommand<ContextMenuDirectionPayload, boolean>({
    id: "contextMenu.selectAdjacentItem",
    label: "Select Adjacent Context Menu Item",
    isEnabled: ({ direction }) =>
      (direction === "next" || direction === "previous")
      && useContextMenuStore.getState().isOpen,
    run: ({ direction }) => useContextMenuStore.getState().moveActiveIndex(direction),
  }),
  defineCommand<ContextMenuBoundaryPayload, boolean>({
    id: "contextMenu.selectBoundaryItem",
    label: "Select Boundary Context Menu Item",
    isEnabled: ({ boundary }) =>
      (boundary === "first" || boundary === "last")
      && useContextMenuStore.getState().isOpen,
    run: ({ boundary }) => useContextMenuStore.getState().moveToBoundary(boundary),
  }),
  defineCommand<void, boolean>({
    id: "contextMenu.confirmSelection",
    label: "Confirm Context Menu Selection",
    isEnabled: () => useContextMenuStore.getState().isOpen,
    run: () => useContextMenuStore.getState().selectActiveItem(),
  }),
  defineCommand<void, void>({
    id: "contextMenu.close",
    label: "Close Context Menu",
    isEnabled: () => useContextMenuStore.getState().isOpen,
    run: () => {
      useContextMenuStore.getState().closeMenu();
    },
  }),
  defineCommand<void, boolean>({
    id: "contextMenu.openActiveTarget",
    label: "Open Active Context Menu Target",
    isEnabled: () =>
      useContextMenuStore.getState().isOpen
      || useContextMenuTargetStore.getState().hasActiveTarget(),
    run: () => {
      if (useContextMenuStore.getState().isOpen) {
        useContextMenuStore.getState().closeMenu();
        return true;
      }

      return useContextMenuTargetStore.getState().openActiveTarget();
    },
  }),
] satisfies CommandDefinition<unknown, unknown>[];
