import { useCallback, type MouseEvent } from "react";

import type { ContextMenuRegistry } from "@/core/context-menu/registry";
import { useContextMenuRuntime, useContextMenuSurface } from "@/core/context-menu/hooks";

export function useContextMenu<Context>(
  registry: ContextMenuRegistry<Context>,
  options?: {
    onOpen?: (context: Context) => void;
  },
) {
  const surface = useContextMenuSurface();
  const runtime = useContextMenuRuntime();

  const onContextMenu = useCallback(
    (event: MouseEvent, context: Context) => {
      event.preventDefault();
      event.stopPropagation();
      options?.onOpen?.(context);

      const items = registry.resolve(context, runtime);
      surface.openMenu({
        x: event.clientX,
        y: event.clientY,
        items,
      });
    },
    [options, registry, runtime, surface],
  );

  return {
    onContextMenu,
  };
}
