import { useEffect, useRef } from "react";

import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { resetClipboardCapturePauseGuideDismissed } from "@/features/clipboard/lib/clipboard-capture-pause-guide";
import { useClipboardAccessibilityPermissionFlow } from "@/features/clipboard/hooks/use-clipboard-accessibility-permission-flow";
import {
  preloadClipboardSourceAppIcons,
  preloadClipboardSourceApps,
} from "@/features/settings/lib/clipboard-source-app-query";
import {
  applyIncomingAppSettingsChange,
  isAppSettingsChangeFromCurrentWindow,
} from "@/lib/app-settings-sync";
import {
  applyTheme,
  getInitialThemePreference,
  THEME_MODE_STORAGE_KEY,
  THEME_NAME_STORAGE_KEY,
  THEME_PREFERENCE_CHANGED_EVENT,
  type ThemePreference,
} from "@/lib/theme";
import {
  appSettingsChangedEvent,
  isTauriRuntime,
  reportAppActivity,
} from "@/lib/tauri";
import { preloadNonCriticalRouteChunks } from "@/router";
import { usePersistedAppSettings } from "@/hooks/use-persisted-app-settings";
import { useThemeStore } from "@/stores/theme-store";
import type { AppLocalePreference } from "@/types/shell";

type AppProvidersProps = {
  router: AnyRouter;
};

const APP_ACTIVITY_REPORT_THROTTLE_MS = 750;

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
  useClipboardAccessibilityPermissionFlow();
  const mode = useThemeStore((state) => state.mode);
  const themeName = useThemeStore((state) => state.themeName);
  const suppressThemeBroadcastRef = useRef(false);
  const hydratedLocaleRef = useRef(false);
  const { data: settings } = usePersistedAppSettings();
  const sanitizedShortcutOverrides = filterConfigurableShortcutOverrides(settings?.shortcutOverrides);

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

    if (isTauriRuntime() && getCurrentWindow().label !== "main") {
      return;
    }

    const preload = () => {
      preloadNonCriticalRouteChunks();
      void import("@/features/clipboard/components/capture-preview");
      void preloadClipboardSourceApps(queryClient)
        .then(() => preloadClipboardSourceAppIcons(queryClient))
        .catch(() => {});
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
    if (typeof window === "undefined" || !isTauriRuntime()) {
      return;
    }

    let lastReportedAt = 0;

    const reportActivity = () => {
      const now = Date.now();
      if (now - lastReportedAt < APP_ACTIVITY_REPORT_THROTTLE_MS) {
        return;
      }

      lastReportedAt = now;
      void reportAppActivity().catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reportActivity();
      }
    };

    reportActivity();

    window.addEventListener("focus", reportActivity);
    window.addEventListener("pointerdown", reportActivity, { passive: true });
    window.addEventListener("keydown", reportActivity);
    window.addEventListener("paste", reportActivity);
    window.addEventListener("wheel", reportActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", reportActivity);
      window.removeEventListener("pointerdown", reportActivity);
      window.removeEventListener("keydown", reportActivity);
      window.removeEventListener("paste", reportActivity);
      window.removeEventListener("wheel", reportActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let unlistenAppSettingsSync: null | (() => void) = null;

    void appSettingsChangedEvent.listen(({ payload }) => {
      if (isAppSettingsChangeFromCurrentWindow(payload)) {
        return;
      }

      if (payload.saved.clipboardCaptureEnabled) {
        resetClipboardCapturePauseGuideDismissed();
      }

      applyIncomingAppSettingsChange(queryClient, payload);
    }).then((dispose) => {
      unlistenAppSettingsSync = dispose;
    });

    return () => {
      unlistenAppSettingsSync?.();
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
