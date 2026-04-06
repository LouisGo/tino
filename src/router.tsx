import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { queryClient } from "@/app/query-client";
import { ClipboardPage } from "@/features/clipboard/clipboard-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { RootShell } from "@/routes/root-shell";

type RouterContext = {
  queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootShell,
});

const SettingsPage = lazyRouteComponent(
  () => import("@/features/settings/settings-page"),
  "SettingsPage",
);

const AiReviewPage = lazyRouteComponent(
  () => import("@/features/ai/ai-review-page"),
  "AiReviewPage",
);

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
  wrapInSuspense: true,
});

const aiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ai",
  component: AiReviewPage,
  wrapInSuspense: true,
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

export function preloadNonCriticalRouteChunks() {
  void SettingsPage.preload?.();
  void AiReviewPage.preload?.();
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
