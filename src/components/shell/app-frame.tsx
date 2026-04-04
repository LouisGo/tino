import {
  Activity,
  ClipboardList,
  Settings2,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Link, useRouterState } from "@tanstack/react-router";

import { Separator } from "@/components/ui/separator";
import { Tooltip } from "@/components/ui/tooltip";
import { isMacOsTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type AppFrameProps = {
  children: React.ReactNode;
};

const navItems = [
  {
    to: "/clipboard",
    label: "Clipboard",
    icon: ClipboardList,
  },
];

export function AppFrame({ children }: AppFrameProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const homeActive = pathname === "/";
  const hasOverlayTitleBar = isMacOsTauriRuntime();
  const appWindow = hasOverlayTitleBar ? getCurrentWindow() : null;

  function handleTitleBarMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (!appWindow || event.button !== 0 || event.detail > 1) {
      return;
    }

    void appWindow.startDragging();
  }

  function handleTitleBarDoubleClick() {
    if (!appWindow) {
      return;
    }

    void appWindow.toggleMaximize();
  }

  return (
    <div
      className={cn(
        "relative min-h-screen min-w-[700px] px-3 pb-3 md:px-4 md:pb-4",
        hasOverlayTitleBar ? "pt-10 md:pt-11" : "pt-3 md:pt-4",
      )}
    >
      {hasOverlayTitleBar ? (
        <div
          aria-hidden="true"
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
          className={cn(
            "fixed right-3 z-30 bg-transparent",
            "top-1 h-8 md:top-1.5 md:h-8.5",
            "left-[92px] md:left-[100px]",
          )}
        />
      ) : null}

      <aside
        className={cn(
          "app-shell-surface fixed z-20 flex w-[58px] flex-col items-center px-1.5 py-2",
          "left-[max(0.75rem,calc((100vw-1600px)/2+0.75rem))] md:left-[max(1rem,calc((100vw-1600px)/2+1rem))]",
          hasOverlayTitleBar
            ? "top-10 h-[calc(100vh-3.25rem)] md:top-11 md:h-[calc(100vh-3.75rem)]"
            : "top-3 h-[calc(100vh-1.5rem)] md:top-4 md:h-[calc(100vh-2rem)]",
        )}
      >
        <Tooltip content="Home" placement="bottom">
          <Link
            to="/"
            className={cn(
              "app-shell-logo flex size-8.5 items-center justify-center rounded-[14px] p-0 text-sidebar-primary-foreground transition-transform hover:-translate-y-px",
              homeActive
                ? "shadow-sm ring-1 ring-white/20"
                : "opacity-92",
            )}
            aria-label="Tino home"
          >
            <Activity className="size-3.5" />
          </Link>
        </Tooltip>

        <Separator className="my-2.5 w-[calc(100%-6px)] opacity-55" />

        <nav className="flex flex-col items-center gap-1.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;

            return (
              <Tooltip key={item.to} content={item.label} placement="bottom">
                <Link
                  aria-label={item.label}
                  to={item.to}
                  data-label={item.label}
                  className={cn(
                    "app-sidebar-icon flex size-8 items-center justify-center rounded-[13px] transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </Link>
              </Tooltip>
            );
          })}
        </nav>

        <div className="mt-auto">
          <Tooltip content="Settings" placement="bottom">
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                "app-sidebar-icon flex size-8 items-center justify-center rounded-[13px] transition-colors",
                pathname === "/settings"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Settings2 className="size-3.5" />
            </Link>
          </Tooltip>
        </div>
      </aside>

      <div className="mx-auto max-w-[1600px] pl-[68px]">
        <main className="app-main-surface relative z-0 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
