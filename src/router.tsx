import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { queryClient } from "@/app/query-client";
import { ClipboardPage } from "@/features/clipboard/clipboard-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { SettingsForm } from "@/features/settings/settings-form";
import { RootShell } from "@/routes/root-shell";

type RouterContext = {
  queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootShell,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsForm,
});

const clipboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clipboard",
  component: ClipboardPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  clipboardRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
