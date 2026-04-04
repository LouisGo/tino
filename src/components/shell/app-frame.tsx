import {
  Activity,
  ClipboardList,
  Settings2,
} from "lucide-react";
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

  return (
    <div
      className={cn(
        "relative h-screen min-w-[700px] overflow-hidden px-3 pb-3 md:px-4 md:pb-4",
        hasOverlayTitleBar ? "pt-10 md:pt-11" : "pt-3 md:pt-4",
      )}
    >
      {hasOverlayTitleBar ? (
        <div
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 z-30 h-10 md:h-11"
        />
      ) : null}
      <div className="mx-auto grid h-full max-w-[1600px] grid-cols-[58px_minmax(0,1fr)] gap-2 md:gap-2.5">
        <aside className="app-shell-surface relative z-20 flex h-full flex-col items-center px-1.5 py-2 md:px-2 md:py-2.5">
          <Tooltip content="Home" placement="bottom">
            <Link
              to="/"
              className={cn(
                "app-shell-logo flex size-8.5 items-center justify-center rounded-[14px] p-0 text-sidebar-primary-foreground transition-transform hover:-translate-y-px md:size-9",
                homeActive
                  ? "shadow-sm ring-1 ring-white/20"
                  : "opacity-92",
              )}
              aria-label="Tino home"
            >
              <Activity className="size-3.5 md:size-4" />
            </Link>
          </Tooltip>

          <Separator className="my-2.5 w-[calc(100%-6px)] opacity-55 md:my-3" />

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
                      "app-sidebar-icon flex size-8 items-center justify-center rounded-[13px] transition-colors md:size-8.5",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-3.5 md:size-4" />
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
                  "app-sidebar-icon flex size-8 items-center justify-center rounded-[13px] transition-colors md:size-8.5",
                  pathname === "/settings"
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Settings2 className="size-3.5 md:size-4" />
              </Link>
            </Tooltip>
          </div>
        </aside>

        <main className="app-main-surface relative z-0 h-full min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
