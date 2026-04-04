import {
  Activity,
  ClipboardList,
  FolderOpen,
  LayoutPanelTop,
  Moon,
  Palette,
  Settings2,
  Sun,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { themeModes, themeNames } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAppShellStore } from "@/stores/app-shell-store";
import { useThemeStore } from "@/stores/theme-store";

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
  {
    to: "/clipboard",
    label: "Clipboard",
    icon: ClipboardList,
  },
];

export function AppFrame({ children }: AppFrameProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const captureEnabled = useAppShellStore((state) => state.captureEnabled);
  const setCaptureEnabled = useAppShellStore((state) => state.setCaptureEnabled);
  const mode = useThemeStore((state) => state.mode);
  const themeName = useThemeStore((state) => state.themeName);
  const setMode = useThemeStore((state) => state.setMode);
  const setThemeName = useThemeStore((state) => state.setThemeName);
  const toggleDarkLight = useThemeStore((state) => state.toggleDarkLight);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="app-shell-surface flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
                Tino
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Personal Flow OS
              </h1>
            </div>
            <div className="app-icon-chip p-3">
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

          <div className="mt-auto space-y-4 rounded-[28px] border border-sidebar-border bg-surface-elevated p-4">
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
              <span className="rounded-full bg-surface-action-chip px-2 py-0.5 text-[11px] text-secondary-foreground">
                {captureEnabled ? "active" : "paused"}
              </span>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to="/settings">
                Open Setup
                <FolderOpen className="size-4" />
              </Link>
            </Button>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Theme
              </p>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={toggleDarkLight}
              >
                Toggle Dark / Light
                {mode === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </Button>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Mode
                </span>
                <select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as (typeof themeModes)[number])
                  }
                  className="h-10 w-full rounded-2xl border border-sidebar-border bg-surface-soft px-3 text-sm outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                >
                  {themeModes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                  Palette
                </span>
                <select
                  value={themeName}
                  onChange={(event) =>
                    setThemeName(event.target.value as (typeof themeNames)[number])
                  }
                  className="h-10 w-full rounded-2xl border border-sidebar-border bg-surface-soft px-3 text-sm outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                >
                  {themeNames.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Palette className="size-3.5" />
                Token-driven theme variables
              </p>
            </div>
          </div>
        </aside>

        <main className="app-main-surface">
          {children}
        </main>
      </div>
    </div>
  );
}
