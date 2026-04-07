import { useEffect, useRef } from "react";

import { useContextMenuTargetStore } from "@/core/context-menu/target-store";

export function useActiveContextMenuTarget({
  active = true,
  isEnabled,
  openMenu,
}: {
  active?: boolean;
  isEnabled?: boolean | (() => boolean);
  openMenu: () => boolean | Promise<boolean>;
}) {
  const openMenuRef = useRef(openMenu);
  const isEnabledRef = useRef(isEnabled);

  useEffect(() => {
    openMenuRef.current = openMenu;
    isEnabledRef.current = isEnabled;
  }, [isEnabled, openMenu]);

  useEffect(() => {
    if (!active) {
      return;
    }

    return useContextMenuTargetStore.getState().activateTarget({
      isEnabled: () => {
        const value = isEnabledRef.current;
        return typeof value === "function" ? value() : value ?? true;
      },
      openMenu: () => openMenuRef.current(),
    });
  }, [active]);
}
