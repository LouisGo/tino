import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ChevronRight } from "lucide-react";

import {
  CONTEXT_MENU_HOST_SCOPE,
  CONTEXT_MENU_SHORTCUT_SCOPE,
} from "@/core/context-menu/constants";
import { ContextMenuSurfaceContext } from "@/core/context-menu/context";
import { useContextMenuStore } from "@/core/context-menu/store";
import { useShortcutScope } from "@/core/shortcuts";
import { resolvePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const {
    activeIndex,
    closeMenu,
    interactionMode,
    instanceId,
    isOpen,
    items,
    openMenu,
    selectItemAt,
    setActiveIndexFromPointer,
    x,
    y,
  } = useContextMenuStore();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const portalContainer = resolvePortalContainer();
  useShortcutScope(CONTEXT_MENU_HOST_SCOPE);
  useShortcutScope(CONTEXT_MENU_SHORTCUT_SCOPE, { active: isOpen });
  const handleOpenMenu = useCallback<typeof openMenu>((nextMenu) => {
    setPosition({
      left: nextMenu.x,
      top: nextMenu.y,
    });
    openMenu(nextMenu);
  }, [openMenu]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const suppressContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener("contextmenu", suppressContextMenu, true);
    return () => {
      window.removeEventListener("contextmenu", suppressContextMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };

    const handleViewportChange = () => {
      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("blur", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("blur", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [closeMenu, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current || typeof window === "undefined") {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    setPosition({
      left: Math.max(margin, Math.min(x, viewportWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, viewportHeight - rect.height - margin)),
    });
  }, [isOpen, items, x, y]);

  return (
    <ContextMenuSurfaceContext.Provider
      value={{
        openMenu: handleOpenMenu,
        closeMenu,
      }}
    >
      {children}
      {isOpen && portalContainer
        ? createPortal(
            <div
              ref={menuRef}
              data-slot="context-menu-content"
              role="menu"
              aria-orientation="vertical"
              aria-activedescendant={
                activeIndex >= 0 ? `context-menu-item-${instanceId}-${activeIndex}` : undefined
              }
              className="fixed z-[140] min-w-[220px] cursor-default rounded-[20px] border border-border/80 bg-card/96 p-1.5 shadow-[var(--shadow-overlay-elevated)] backdrop-blur-xl"
              style={{
                left: position.left,
                top: position.top,
              }}
            >
              <div className="space-y-1">
                {items.map((item, index) =>
                  item.type === "separator" ? (
                    <div key={item.key} className="my-1 h-px bg-border/70" />
                  ) : (
                    <button
                      id={`context-menu-item-${instanceId}-${index}`}
                      key={item.key}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      data-active={activeIndex === index ? "true" : undefined}
                      className={cn(
                        "flex h-10 w-full items-center gap-3 rounded-[14px] px-3 text-left text-sm transition",
                        item.disabled
                          ? "cursor-not-allowed text-muted-foreground/70"
                          : activeIndex === index
                            ? item.danger
                              ? "cursor-pointer bg-destructive/10 text-destructive"
                              : "cursor-pointer bg-secondary/70 text-foreground"
                          : interactionMode === "pointer"
                            ? item.danger
                              ? "cursor-pointer text-destructive hover:bg-destructive/10"
                              : "cursor-pointer text-foreground hover:bg-secondary/70"
                            : item.danger
                              ? "cursor-pointer text-destructive"
                              : "cursor-pointer text-foreground",
                      )}
                      onPointerMove={(event) => {
                        setActiveIndexFromPointer(index, {
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      onClick={() => {
                        void selectItemAt(index);
                      }}
                    >
                      <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                        {item.icon ?? <ChevronRight className="size-3.5 opacity-0" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </button>
                  ),
                )}
              </div>
            </div>,
            portalContainer,
          )
        : null}
    </ContextMenuSurfaceContext.Provider>
  );
}
