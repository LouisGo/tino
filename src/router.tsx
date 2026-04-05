import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { queryClient } from "@/app/query-client";
import { AiReviewPage } from "@/features/ai/ai-review-page";
import { ClipboardPage } from "@/features/clipboard/clipboard-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { SettingsPage } from "@/features/settings/settings-page";
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
  component: SettingsPage,
});

const aiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ai",
  component: AiReviewPage,
});

const clipboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clipboard",
  component: ClipboardPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  aiRoute,
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
