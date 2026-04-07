import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ChevronRight } from "lucide-react";

import { ContextMenuSurfaceContext } from "@/core/context-menu/context";
import type { ContextMenuResolvedItem } from "@/core/context-menu/types";
import { resolvePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

type ContextMenuState = {
  isOpen: boolean;
  x: number;
  y: number;
  items: ContextMenuResolvedItem[];
};

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    items: [],
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const portalContainer = resolvePortalContainer();

  const closeMenu = () => {
    setMenu((current) => (current.isOpen ? { ...current, isOpen: false, items: [] } : current));
  };

  const openMenu = ({ x, y, items }: Omit<ContextMenuState, "isOpen">) => {
    setPosition({
      left: x,
      top: y,
    });
    setMenu({
      isOpen: items.length > 0,
      x,
      y,
      items,
    });
  };

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
    if (!menu.isOpen || typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    };

    const handleViewportChange = () => {
      closeMenu();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("blur", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("blur", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [menu.isOpen]);

  useLayoutEffect(() => {
    if (!menu.isOpen || !menuRef.current || typeof window === "undefined") {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    setPosition({
      left: Math.max(margin, Math.min(menu.x, viewportWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(menu.y, viewportHeight - rect.height - margin)),
    });
  }, [menu.isOpen, menu.items, menu.x, menu.y]);

  return (
    <ContextMenuSurfaceContext.Provider
      value={{
        openMenu,
        closeMenu,
      }}
    >
      {children}
      {menu.isOpen && portalContainer
        ? createPortal(
            <div
              ref={menuRef}
              data-slot="context-menu-content"
              className="fixed z-[140] min-w-[220px] rounded-[20px] border border-border/80 bg-card/96 p-1.5 shadow-[var(--shadow-overlay-elevated)] backdrop-blur-xl"
              style={{
                left: position.left,
                top: position.top,
              }}
            >
              <div className="space-y-1">
                {menu.items.map((item) =>
                  item.type === "separator" ? (
                    <div key={item.key} className="my-1 h-px bg-border/70" />
                  ) : (
                    <button
                      key={item.key}
                      type="button"
                      disabled={item.disabled}
                      className={cn(
                        "flex h-10 w-full items-center gap-3 rounded-[14px] px-3 text-left text-sm transition",
                        item.disabled
                          ? "cursor-not-allowed text-muted-foreground/70"
                          : item.danger
                            ? "text-destructive hover:bg-destructive/10"
                            : "text-foreground hover:bg-secondary/70",
                      )}
                      onClick={() => {
                        if (!item.onSelect) {
                          closeMenu();
                          return;
                        }

                        void Promise.resolve(item.onSelect())
                          .catch((error) => {
                            console.error("[context-menu] action failed", error);
                          })
                          .finally(() => {
                            closeMenu();
                          });
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
