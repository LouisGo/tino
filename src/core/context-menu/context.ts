import { createContext } from "react";

import type { ContextMenuResolvedItem } from "@/core/context-menu/types";

type ContextMenuState = {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuResolvedItem[];
};

export type ContextMenuSurface = {
  openMenu: (nextState: Omit<ContextMenuState, "isOpen">) => void;
  closeMenu: () => void;
};

export const ContextMenuSurfaceContext = createContext<ContextMenuSurface | null>(null);

