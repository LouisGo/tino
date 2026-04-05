import { getCurrentWindow } from "@tauri-apps/api/window";
import { Outlet, useRouterState } from "@tanstack/react-router";

import { AppFrame } from "@/components/shell/app-frame";
import { useShortcutScope } from "@/core/shortcuts";
import { ClipboardWindowPage } from "@/features/clipboard/clipboard-window-page";
import { useWindowCloseGuard } from "@/hooks/use-window-close-guard";
import { isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";

export function RootShell() {
  useWindowCloseGuard();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isClipboardWindow =
    isTauriRuntime() && getCurrentWindow().label === "clipboard";
  useShortcutScope("shell.main", { active: !isClipboardWindow });

  if (isClipboardWindow) {
    return (
      <>
        <ClipboardWindowPage />
        {/* {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null} */}
      </>
    );
  }

  return (
    <AppFrame>
      <div
        key={pathname}
        className={cn(
          "min-h-0 flex-1",
          pathname !== "/settings" && "app-route-transition",
        )}
      >
        <Outlet />
      </div>
      {/* {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null} */}
    </AppFrame>
  );
}
