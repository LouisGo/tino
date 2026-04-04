import { useContext } from "react";

import { useCommandExecutor } from "@/core/commands";
import { ContextMenuSurfaceContext } from "@/core/context-menu/context";

export function useContextMenuSurface() {
  const surface = useContext(ContextMenuSurfaceContext);
  if (!surface) {
    throw new Error("useContextMenuSurface must be used inside ContextMenuProvider.");
  }

  return surface;
}

export function useContextMenuRuntime() {
  const commands = useCommandExecutor();
  const surface = useContextMenuSurface();

  return {
    commands,
    closeMenu: surface.closeMenu,
  };
}

