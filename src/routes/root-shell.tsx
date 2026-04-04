import { Outlet, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

import { AppFrame } from "@/components/shell/app-frame";
import { useWindowCloseGuard } from "@/hooks/use-window-close-guard";

export function RootShell() {
  useWindowCloseGuard();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <AppFrame>
      <div key={pathname} className="app-route-transition">
        <Outlet />
      </div>
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </AppFrame>
  );
}
