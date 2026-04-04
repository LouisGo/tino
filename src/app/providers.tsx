import { useEffect } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider, type AnyRouter } from "@tanstack/react-router";

import { queryClient } from "@/app/query-client";
import { applyTheme } from "@/lib/theme";
import { useThemeStore } from "@/stores/theme-store";

type AppProvidersProps = {
  router: AnyRouter;
};

export function AppProviders({ router }: AppProvidersProps) {
  const mode = useThemeStore((state) => state.mode);
  const themeName = useThemeStore((state) => state.themeName);

  useEffect(() => {
    applyTheme({ mode, themeName });
  }, [mode, themeName]);

  useEffect(() => {
    if (typeof window === "undefined" || mode !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      applyTheme({ mode, themeName });
    };

    media.addEventListener("change", handleChange);
    return () => {
      media.removeEventListener("change", handleChange);
    };
  }, [mode, themeName]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
