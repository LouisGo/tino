import { Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

import { AppFrame } from "@/components/shell/app-frame";
import { useWindowCloseGuard } from "@/hooks/use-window-close-guard";

export function RootShell() {
  useWindowCloseGuard();

  return (
    <AppFrame>
      <Outlet />
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </AppFrame>
  );
}
