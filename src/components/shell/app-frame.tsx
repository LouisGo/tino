import {
  Activity,
  Bot,
  ClipboardList,
  Moon,
  Settings2,
  SunMedium,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Link, useRouterState } from "@tanstack/react-router";

import { Separator } from "@/components/ui/separator";
import { Tooltip } from "@/components/ui/tooltip";
import { ShortcutKbd } from "@/core/shortcuts";
import { useScopedT } from "@/i18n";
import { resolveThemeMode } from "@/lib/theme";
import { isMacOsTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";

type AppFrameProps = {
  children: React.ReactNode;
};

export function AppFrame({ children }: AppFrameProps) {
  const tCommon = useScopedT("common");
  const tShell = useScopedT("shell");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const homeActive = pathname === "/";
  const hasOverlayTitleBar = isMacOsTauriRuntime();
  const appWindow = hasOverlayTitleBar ? getCurrentWindow() : null;
  const mode = useThemeStore((state) => state.mode);
  const toggleDarkLight = useThemeStore((state) => state.toggleDarkLight);
  const [resolvedMode, setResolvedMode] = useState(() => resolveThemeMode(mode));

  useEffect(() => {
    const updateResolvedMode = () => {
      setResolvedMode(resolveThemeMode(mode));
    };

    updateResolvedMode();

    if (typeof window === "undefined" || mode !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", updateResolvedMode);

    return () => {
      media.removeEventListener("change", updateResolvedMode);
    };
  }, [mode]);

  const isDarkMode = resolvedMode === "dark";
  const themeTooltip = isDarkMode
    ? tCommon("actions.switchToLight")
    : tCommon("actions.switchToDark");
  const navItems: Array<{
    icon: typeof ClipboardList;
    label: string;
    shortcutId?: string;
    to: string;
  }> = [
    {
      to: "/ai",
      label: tCommon("navigation.ai"),
      icon: Bot,
      shortcutId: "shell.openAi",
    },
    {
      to: "/clipboard",
      label: tCommon("navigation.clipboard"),
      icon: ClipboardList,
      shortcutId: "shell.openClipboard",
    },
  ];

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
        "relative h-screen min-w-0 overflow-hidden px-[var(--app-shell-gutter)] pb-[var(--app-shell-gutter)]",
        hasOverlayTitleBar
          ? "pt-[var(--app-shell-titlebar-height)]"
          : "pt-[var(--app-shell-gutter)]",
      )}
    >
      {hasOverlayTitleBar ? (
        <div
          aria-hidden="true"
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
          className={cn(
            "fixed top-0 left-[calc(var(--app-shell-gutter)+var(--app-shell-sidebar-width)+var(--app-shell-sidebar-gap))] right-[var(--app-shell-gutter)] z-30 h-[var(--app-shell-titlebar-height)] bg-transparent",
          )}
        />
      ) : null}

      <aside
        className={cn(
          "app-shell-surface fixed left-[var(--app-shell-gutter)] z-20 flex w-[var(--app-shell-sidebar-width)] flex-col items-center px-1.5 py-2",
          hasOverlayTitleBar
            ? "top-[var(--app-shell-titlebar-height)] h-[calc(100vh-var(--app-shell-titlebar-height)-var(--app-shell-gutter))]"
            : "top-[var(--app-shell-gutter)] h-[calc(100vh-var(--app-shell-gutter)-var(--app-shell-gutter))]",
        )}
      >
        <Tooltip
          content={(
            <span className="flex items-center gap-2">
              <span>{tCommon("navigation.home")}</span>
              <ShortcutKbd shortcutId="shell.openHome" />
            </span>
          )}
          placement="right"
        >
          <Link
            to="/"
            className={cn(
              "app-shell-logo flex size-8.5 items-center justify-center rounded-[14px] p-0 transition-colors",
              homeActive
                ? "app-shell-logo-active text-sidebar-primary-foreground"
                : "app-shell-logo-idle text-sidebar-primary-foreground/92 hover:text-sidebar-primary-foreground",
            )}
            aria-label={tShell("aria.home")}
          >
            <Activity
              className={cn(
                "size-3.5 transition-[transform,filter] duration-200",
                homeActive
                  ? "scale-[1.04] drop-shadow-[0_0_6px_rgba(255,255,255,0.18)]"
                  : "scale-100",
              )}
            />
          </Link>
        </Tooltip>

        <Separator className="my-2.5 w-[calc(100%-6px)] opacity-55" />

        <nav className="flex flex-col items-center gap-1.5">
          {navItems.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;

            return (
              <Tooltip
                key={item.to}
                content={(
                  <span className="flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.shortcutId ? <ShortcutKbd shortcutId={item.shortcutId} /> : null}
                  </span>
                )}
                placement="right"
              >
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

        <div className="mt-auto flex flex-col items-center gap-1.5">
          <Tooltip
            content={(
              <span className="flex items-center gap-2">
                <span>{themeTooltip}</span>
                <ShortcutKbd shortcutId="shell.toggleThemeMode" />
              </span>
            )}
            placement="right"
          >
            <button
              type="button"
              aria-label={themeTooltip}
              onClick={toggleDarkLight}
              className="app-sidebar-icon flex size-8 items-center justify-center rounded-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {isDarkMode ? (
                <Moon className="size-3.5" />
              ) : (
                <SunMedium className="size-3.5" />
              )}
            </button>
          </Tooltip>
          <Tooltip
            content={(
              <span className="flex items-center gap-2">
                <span>{tCommon("navigation.settings")}</span>
                <ShortcutKbd shortcutId="shell.openSettings" />
              </span>
            )}
            placement="right"
          >
            <Link
              to="/settings"
              aria-label={tCommon("navigation.settings")}
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

      <div className="flex h-full w-full min-h-0 pl-[calc(var(--app-shell-sidebar-width)+var(--app-shell-sidebar-gap))]">
        <main className="app-main-surface relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
