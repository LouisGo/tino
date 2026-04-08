import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { ChevronRight } from "lucide-react";

import { CONTEXT_MENU_HOST_SCOPE } from "@/core/context-menu/constants";
import { ContextMenuSurfaceContext } from "@/core/context-menu/context";
import { useContextMenuStore } from "@/core/context-menu/store";
import { useShortcutScope } from "@/core/shortcuts";
import { cn } from "@/lib/utils";

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const { closeMenu, isOpen, items, openMenu, sessionId, x, y } = useContextMenuStore();
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  useShortcutScope(CONTEXT_MENU_HOST_SCOPE);
  const handleOpenMenu = useCallback<typeof openMenu>((nextMenu) => {
    openMenu(nextMenu);
  }, [openMenu]);

  useEffect(() => {
    if (!isOpen || items.length === 0 || typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const trigger = triggerRef.current;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
      clientX: x,
      clientY: y,
    });

    trigger.dispatchEvent(event);
  }, [isOpen, items, x, y]);

  return (
    <ContextMenuSurfaceContext.Provider
      value={{
        openMenu: handleOpenMenu,
        closeMenu,
      }}
    >
      {children}
      <RadixContextMenu.Root
        key={sessionId}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeMenu();
          }
        }}
        modal={false}
      >
        <RadixContextMenu.Trigger asChild>
          <span
            ref={triggerRef}
            aria-hidden="true"
            className="fixed size-px pointer-events-none opacity-0"
            style={{
              left: x,
              top: y,
            }}
          />
        </RadixContextMenu.Trigger>
        <RadixContextMenu.Portal>
          {isOpen && items.length > 0 ? (
            <>
              <div
                data-slot="context-menu-mask"
                aria-hidden="true"
                className="fixed inset-0 z-[139] bg-transparent"
                onPointerDown={(event) => {
                  event.preventDefault();
                  closeMenu();
                }}
              />
              <RadixContextMenu.Content
                data-slot="context-menu-content"
                loop
                collisionPadding={12}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                }}
                className="z-[140] min-w-[220px] rounded-[20px] border border-border/80 bg-card/96 p-1.5 shadow-[var(--shadow-overlay-elevated)] backdrop-blur-xl"
              >
                <div className="space-y-1">
                  {items.map((item) =>
                    item.type === "separator" ? (
                      <RadixContextMenu.Separator
                        key={item.key}
                        className="my-1 h-px bg-border/70"
                      />
                    ) : (
                      <RadixContextMenu.Item
                        key={item.key}
                        disabled={item.disabled}
                        onSelect={() => {
                          void Promise.resolve(item.onSelect?.()).catch((error) => {
                            console.error("[context-menu] action failed", error);
                          });
                        }}
                        className={cn(
                          "flex h-10 cursor-default select-none items-center gap-3 rounded-[14px] px-3 text-left text-sm outline-none transition data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground/70",
                          item.danger
                            ? "text-destructive data-[highlighted]:bg-destructive/10"
                            : "text-foreground data-[highlighted]:bg-secondary/70",
                        )}
                      >
                        <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                          {item.icon ?? <ChevronRight className="size-3.5 opacity-0" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </RadixContextMenu.Item>
                    ),
                  )}
                </div>
              </RadixContextMenu.Content>
            </>
          ) : null}
        </RadixContextMenu.Portal>
      </RadixContextMenu.Root>
    </ContextMenuSurfaceContext.Provider>
  );
}
