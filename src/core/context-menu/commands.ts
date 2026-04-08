import { defineCommand, type CommandDefinition } from "@/core/commands";
import { useContextMenuTargetStore } from "@/core/context-menu/target-store";
import { useContextMenuStore } from "@/core/context-menu/store";

export const contextMenuCommands = [
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
