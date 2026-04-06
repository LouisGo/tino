import { useEffect, useRef } from "react";

import { emit, listen } from "@tauri-apps/api/event";
import { useQuery } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, type AnyRouter } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";

import { appCommands } from "@/app/commands";
import { appShortcuts, filterConfigurableShortcutOverrides } from "@/app/shortcuts";
import { AppCommandProvider } from "@/core/commands";
import { ContextMenuProvider } from "@/core/context-menu";
import { AppShortcutProvider } from "@/core/shortcuts";
import {
  appI18n,
  areLocalePreferencesEqual,
  getInitialLocalePreference,
  LOCALE_PREFERENCE_CHANGED_EVENT,
  LOCALE_PREFERENCE_MODE_STORAGE_KEY,
  LOCALE_PREFERENCE_VALUE_STORAGE_KEY,
  syncLocalePreference,
} from "@/i18n";
import { queryClient } from "@/app/query-client";
import {
  applyTheme,
  getInitialThemePreference,
  THEME_MODE_STORAGE_KEY,
  THEME_NAME_STORAGE_KEY,
  THEME_PREFERENCE_CHANGED_EVENT,
  type ThemePreference,
} from "@/lib/theme";
import { getAppSettings, isTauriRuntime } from "@/lib/tauri";
import { preloadNonCriticalRouteChunks } from "@/router";
import { useAppShellStore } from "@/stores/app-shell-store";
import { useThemeStore } from "@/stores/theme-store";
import type { AppLocalePreference } from "@/types/shell";

type AppProvidersProps = {
  router: AnyRouter;
};

export function AppProviders({ router }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={appI18n}>
        <AppShellRuntime router={router} />
      </I18nextProvider>
      {/* {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null} */}
    </QueryClientProvider>
  );
}

function AppShellRuntime({ router }: AppProvidersProps) {
  const mode = useThemeStore((state) => state.mode);
  const themeName = useThemeStore((state) => state.themeName);
  const setSettingsDraft = useAppShellStore((state) => state.setSettingsDraft);
  const shortcutOverrides = useAppShellStore((state) => state.settingsDraft.shortcutOverrides);
  const sanitizedShortcutOverrides = filterConfigurableShortcutOverrides(shortcutOverrides);
  const suppressThemeBroadcastRef = useRef(false);
  const hydratedSettingsRef = useRef(false);
  const hydratedLocaleRef = useRef(false);
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

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

    const preload = () => {
      preloadNonCriticalRouteChunks();
      void import("@/features/clipboard/components/capture-preview");
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(preload, { timeout: 1_500 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(preload, 400);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

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

  useEffect(() => {
    if (!settings || hydratedSettingsRef.current) {
      return;
    }

    hydratedSettingsRef.current = true;
    setSettingsDraft(settings);
  }, [setSettingsDraft, settings]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    if (
      hydratedLocaleRef.current
      && areLocalePreferencesEqual(getInitialLocalePreference(), settings.localePreference)
    ) {
      return;
    }

    hydratedLocaleRef.current = true;
    void syncLocalePreference(settings.localePreference);
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== LOCALE_PREFERENCE_MODE_STORAGE_KEY
        && event.key !== LOCALE_PREFERENCE_VALUE_STORAGE_KEY
      ) {
        return;
      }

      void syncLocalePreference(getInitialLocalePreference(), {
        persist: false,
      });
    };

    window.addEventListener("storage", handleStorage);

    let unlistenLocaleSync: null | (() => void) = null;
    if (isTauriRuntime()) {
      void listen<AppLocalePreference>(LOCALE_PREFERENCE_CHANGED_EVENT, ({ payload }) => {
        void syncLocalePreference(payload, {
          persist: true,
        });
      }).then((dispose) => {
        unlistenLocaleSync = dispose;
      });
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      unlistenLocaleSync?.();
    };
  }, []);

  return (
    <AppCommandProvider commands={appCommands} router={router}>
      <AppShortcutProvider
        shortcuts={appShortcuts}
        overrides={sanitizedShortcutOverrides}
      >
        <ContextMenuProvider>
          <RouterProvider router={router} context={{ queryClient }} />
        </ContextMenuProvider>
      </AppShortcutProvider>
    </AppCommandProvider>
  );
}
