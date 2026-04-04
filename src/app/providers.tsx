import { useEffect, useRef } from "react";

import { emit, listen } from "@tauri-apps/api/event";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type AnyRouter } from "@tanstack/react-router";

import { appCommands } from "@/app/commands";
import { AppCommandProvider } from "@/core/commands";
import { ContextMenuProvider } from "@/core/context-menu";
import { queryClient } from "@/app/query-client";
import {
  applyTheme,
  getInitialThemePreference,
  THEME_MODE_STORAGE_KEY,
  THEME_NAME_STORAGE_KEY,
  THEME_PREFERENCE_CHANGED_EVENT,
  type ThemePreference,
} from "@/lib/theme";
import { isTauriRuntime } from "@/lib/tauri";
import { useThemeStore } from "@/stores/theme-store";

type AppProvidersProps = {
  router: AnyRouter;
};

export function AppProviders({ router }: AppProvidersProps) {
  const mode = useThemeStore((state) => state.mode);
  const themeName = useThemeStore((state) => state.themeName);
  const suppressThemeBroadcastRef = useRef(false);

  useEffect(() => {
    applyTheme({ mode, themeName });
    if (suppressThemeBroadcastRef.current) {
      suppressThemeBroadcastRef.current = false;
      return;
    }

    if (!isTauriRuntime()) {
      return;
    }

    void emit<ThemePreference>(THEME_PREFERENCE_CHANGED_EVENT, {
      mode,
      themeName,
    });
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const applyIncomingThemePreference = (preference: ThemePreference) => {
      const current = useThemeStore.getState();
      if (
        current.mode === preference.mode
        && current.themeName === preference.themeName
      ) {
        return;
      }

      suppressThemeBroadcastRef.current = true;
      current.setPreference(preference);
    };

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== THEME_MODE_STORAGE_KEY
        && event.key !== THEME_NAME_STORAGE_KEY
      ) {
        return;
      }

      applyIncomingThemePreference(getInitialThemePreference());
    };

    window.addEventListener("storage", handleStorage);

    let unlistenThemeSync: null | (() => void) = null;
    if (isTauriRuntime()) {
      void listen<ThemePreference>(THEME_PREFERENCE_CHANGED_EVENT, ({ payload }) => {
        applyIncomingThemePreference(payload);
      }).then((dispose) => {
        unlistenThemeSync = dispose;
      });
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      unlistenThemeSync?.();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppCommandProvider commands={appCommands}>
        <ContextMenuProvider>
          <RouterProvider router={router} context={{ queryClient }} />
        </ContextMenuProvider>
      </AppCommandProvider>
      {/* {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null} */}
    </QueryClientProvider>
  );
}
