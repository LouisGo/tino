import {
  Activity,
  ClipboardList,
  LayoutPanelTop,
  Settings2,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type AppFrameProps = {
  children: React.ReactNode;
};

const navItems = [
  {
    to: "/",
    label: "Control Tower",
    icon: LayoutPanelTop,
  },
  {
    to: "/clipboard",
    label: "Clipboard",
    icon: ClipboardList,
  },
];

export function AppFrame({ children }: AppFrameProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="h-screen min-w-[700px] overflow-hidden p-3 md:p-4">
      <div className="mx-auto grid h-full max-w-[1600px] grid-cols-[84px_minmax(0,1fr)] gap-3">
        <aside className="app-shell-surface relative z-20 flex h-full flex-col items-center px-3 py-4">
          <Link
            to="/"
            className="app-icon-chip group flex size-12 items-center justify-center rounded-[18px] p-0"
            aria-label="Tino home"
          >
            <Activity className="size-5" />
          </Link>

          <Separator className="my-4 w-full" />

          <nav className="flex flex-col items-center gap-2">
            {navItems.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;

              return (
                <Link
                  aria-label={item.label}
                  key={item.to}
                  to={item.to}
                  data-label={item.label}
                  className={cn(
                    "app-sidebar-icon group relative flex size-12 items-center justify-center rounded-[18px] transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4.5" />
                  <span className="app-sidebar-tooltip" role="tooltip">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto">
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                "app-sidebar-icon group relative flex size-12 items-center justify-center rounded-[18px] transition-colors",
                pathname === "/settings"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Settings2 className="size-4.5" />
              <span className="app-sidebar-tooltip" role="tooltip">
                Settings
              </span>
            </Link>
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
