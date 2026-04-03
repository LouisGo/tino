import { Activity, FolderOpen, LayoutPanelTop, Settings2 } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAppShellStore } from "@/stores/app-shell-store";

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
    to: "/settings",
    label: "Setup",
    icon: Settings2,
  },
];

export function AppFrame({ children }: AppFrameProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const captureEnabled = useAppShellStore((state) => state.captureEnabled);
  const setCaptureEnabled = useAppShellStore((state) => state.setCaptureEnabled);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-[32px] border border-sidebar-border bg-sidebar/85 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
                Tino
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Personal Flow OS
              </h1>
            </div>
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Activity className="size-5" />
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Tauri desktop shell for capture, orchestration, Markdown storage, and
            AI-assisted structuring.
          </p>

          <Separator className="my-5" />

          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-4 rounded-[28px] border border-sidebar-border bg-background/80 p-4">
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Capture Pipeline
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Clipboard watch stays alive. This switch only pauses content
                entering the main pipeline.
              </p>
            </div>
            <Button
              className="w-full justify-between"
              variant={captureEnabled ? "default" : "secondary"}
              onClick={() => setCaptureEnabled(!captureEnabled)}
            >
              {captureEnabled ? "Pause Capture" : "Resume Capture"}
              <span className="rounded-full bg-background/20 px-2 py-0.5 text-[11px]">
                {captureEnabled ? "active" : "paused"}
              </span>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/settings">
                Open Setup
                <FolderOpen className="size-4" />
              </Link>
            </Button>
          </div>
        </aside>

        <main className="rounded-[32px] border border-border/80 bg-background/80 p-4 shadow-sm backdrop-blur md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
