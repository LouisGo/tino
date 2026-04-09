import { lazy, Suspense } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { Outlet, useRouterState } from "@tanstack/react-router";

import { AppFrame } from "@/components/shell/app-frame";
import { useShortcutScope } from "@/core/shortcuts";
import { useWindowCloseGuard } from "@/hooks/use-window-close-guard";
import { isTauriRuntime } from "@/lib/tauri";

const ClipboardWindowPage = lazy(async () => {
  const module = await import("@/features/clipboard/clipboard-window-page");
  return {
    default: module.ClipboardWindowPage,
  };
});

function ClipboardWindowFallback() {
  return (
    <div
      className="app-panel-window-root h-full"
      style={{
        backgroundColor: "color-mix(in oklch, var(--card) 92%, var(--background) 8%)",
        backgroundImage:
          "linear-gradient(180deg, color-mix(in oklch, white 10%, transparent), transparent 48%)",
      }}
    />
  );
}

export function RootShell() {
  useWindowCloseGuard();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isClipboardWindow =
    isTauriRuntime() && getCurrentWindow().label === "clipboard";
  useShortcutScope("shell.main", { active: !isClipboardWindow });

  if (isClipboardWindow) {
    return (
      <Suspense fallback={<ClipboardWindowFallback />}>
        <ClipboardWindowPage />
        {/* {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null} */}
      </Suspense>
    );
  }

  return (
    <AppFrame>
      <div key={pathname} className="app-route-transition min-h-0 flex-1">
        <Outlet />
      </div>
      {/* {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null} */}
    </AppFrame>
  );
}
