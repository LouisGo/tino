import { useCallback, type MouseEvent } from "react";

import type { ContextMenuRegistry } from "@/core/context-menu/registry";
import { useContextMenuRuntime, useContextMenuSurface } from "@/core/context-menu/hooks";

function resolveContextMenuAnchor(element: Element | null) {
  if (!element) {
    if (typeof window === "undefined") {
      return null;
    }

    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }

  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function useContextMenu<Context>(
  registry: ContextMenuRegistry<Context>,
  options?: {
    onOpen?: (context: Context) => void;
  },
) {
  const surface = useContextMenuSurface();
  const runtime = useContextMenuRuntime();

  const openAtPoint = useCallback(
    (point: { x: number; y: number }, context: Context) => {
      options?.onOpen?.(context);

      const items = registry.resolve(context, runtime);
      if (items.length === 0) {
        return false;
      }

      surface.openMenu({
        x: point.x,
        y: point.y,
        items,
      });

      return true;
    },
    [options, registry, runtime, surface],
  );

  const openAtElement = useCallback(
    (element: Element | null, context: Context) => {
      const anchor = resolveContextMenuAnchor(element);
      if (!anchor) {
        return false;
      }

      return openAtPoint(anchor, context);
    },
    [openAtPoint],
  );

  const onContextMenu = useCallback(
    (event: MouseEvent, context: Context) => {
      event.preventDefault();
      event.stopPropagation();
      openAtPoint(
        {
          x: event.clientX,
          y: event.clientY,
        },
        context,
      );
    },
    [openAtPoint],
  );

  return {
    onContextMenu,
    openAtElement,
    openAtPoint,
  };
}
