import { useCallback, useEffect, useMemo, useRef } from "react";

import PQueue from "p-queue";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { filterConfigurableShortcutOverrides } from "@/app/shortcuts";
import {
  getAppSettings,
  saveAppSettings,
} from "@/lib/tauri";
import { createRendererLogger } from "@/lib/logger";
import { useAutostartSetting } from "@/features/settings/hooks/use-autostart-setting";
import { useAppShellStore } from "@/stores/app-shell-store";
import { useThemeStore } from "@/stores/theme-store";
import type { SettingsDraft, ShortcutOverrideRecord } from "@/types/shell";

const logger = createRendererLogger("settings.controller");

type SaveSettingsMutationResult = {
  requestedDraft: SettingsDraft;
  saved: SettingsDraft;
};

function sanitizeShortcutOverrides(overrides: ShortcutOverrideRecord) {
  return filterConfigurableShortcutOverrides(overrides);
}

function sanitizeSettingsDraft(settings: SettingsDraft): SettingsDraft {
  return {
    ...settings,
    shortcutOverrides: sanitizeShortcutOverrides(settings.shortcutOverrides),
  };
}

function serializeSettingsDraft(settings: SettingsDraft) {
  const normalizedOverrides = Object.fromEntries(
    Object.entries(sanitizeShortcutOverrides(settings.shortcutOverrides)).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );

  return JSON.stringify({
    ...settings,
    shortcutOverrides: normalizedOverrides,
  });
}

export function useSettingsController() {
  const queryClient = useQueryClient();
  const captureEnabled = useAppShellStore((state) => state.captureEnabled);
  const patchSettingsDraft = useAppShellStore((state) => state.patchSettingsDraft);
  const setCaptureEnabled = useAppShellStore((state) => state.setCaptureEnabled);
  const setSettingsDraft = useAppShellStore((state) => state.setSettingsDraft);
  const settingsDraft = useAppShellStore((state) => state.settingsDraft);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const setThemeName = useThemeStore((state) => state.setThemeName);
  const themeName = useThemeStore((state) => state.themeName);
  const toggleDarkLight = useThemeStore((state) => state.toggleDarkLight);
  const { autostartEnabled, toggleAutostartMutation } = useAutostartSetting();
  const hydrated = useRef(false);
  const settingsDraftRef = useRef(settingsDraft);
  const latestRequestedDraftKeyRef = useRef<string | null>(null);
  const lastSettledSettingsRef = useRef<SettingsDraft | null>(null);
  const settingsSaveQueueRef = useRef<PQueue | null>(null);

  if (settingsSaveQueueRef.current === null) {
    settingsSaveQueueRef.current = new PQueue({
      concurrency: 1,
    });
  }

  useEffect(() => {
    settingsDraftRef.current = settingsDraft;
  }, [settingsDraft]);

  const { data: settings } = useQuery({
    queryKey: queryKeys.appSettings(),
    queryFn: getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

  const persistedSettings = useMemo(
    () => (settings ? sanitizeSettingsDraft(settings) : null),
    [settings],
  );
  const isSavingSettings = useIsMutating({
    mutationKey: queryKeys.appSettingsSave(),
  }) > 0;

  useEffect(() => {
    if (!persistedSettings || hydrated.current) {
      return;
    }

    hydrated.current = true;
    setSettingsDraft(persistedSettings);
  }, [persistedSettings, setSettingsDraft]);

  useEffect(() => {
    if (!persistedSettings) {
      return;
    }

    lastSettledSettingsRef.current = persistedSettings;
  }, [persistedSettings]);

  const persistSavedSettings = useCallback(
    async (saved: SettingsDraft, expectedDraft: SettingsDraft) => {
      const sanitizedSaved = sanitizeSettingsDraft(saved);
      const expectedSerialized = serializeSettingsDraft(expectedDraft);

      lastSettledSettingsRef.current = sanitizedSaved;

      if (latestRequestedDraftKeyRef.current === expectedSerialized) {
        queryClient.setQueryData(queryKeys.appSettings(), sanitizedSaved);
      }

      if (
        serializeSettingsDraft(settingsDraftRef.current) === expectedSerialized
      ) {
        setSettingsDraft(sanitizedSaved);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageBase() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageSummary() }),
      ]);
    },
    [queryClient, setSettingsDraft],
  );

  const saveSettingsMutation = useMutation({
    mutationKey: queryKeys.appSettingsSave(),
    mutationFn: async (draft: SettingsDraft): Promise<SaveSettingsMutationResult> =>
      settingsSaveQueueRef.current!.add(async () => {
        const sanitizedDraft = sanitizeSettingsDraft(draft);
        const saved = await saveAppSettings(sanitizedDraft);

        return {
          requestedDraft: sanitizedDraft,
          saved,
        };
      }),
    onMutate: async (draft) => {
      const sanitizedDraft = sanitizeSettingsDraft(draft);
      const serializedDraft = serializeSettingsDraft(sanitizedDraft);

      latestRequestedDraftKeyRef.current = serializedDraft;
      await queryClient.cancelQueries({ queryKey: queryKeys.appSettings() });
      queryClient.setQueryData(queryKeys.appSettings(), sanitizedDraft);

      return {
        serializedDraft,
      };
    },
    onError: (error, draft, context) => {
      logger.error("Failed to persist settings", error);

      const serializedDraft = context?.serializedDraft
        ?? serializeSettingsDraft(sanitizeSettingsDraft(draft));

      if (latestRequestedDraftKeyRef.current !== serializedDraft) {
        return;
      }

      const fallbackSettings = lastSettledSettingsRef.current;
      if (fallbackSettings) {
        queryClient.setQueryData(queryKeys.appSettings(), fallbackSettings);

        if (
          serializeSettingsDraft(settingsDraftRef.current) === serializedDraft
        ) {
          setSettingsDraft(fallbackSettings);
        }
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.appSettings() });
    },
    onSuccess: async ({ requestedDraft, saved }) => {
      await persistSavedSettings(saved, requestedDraft);
    },
  });

  const saveSettingsDraft = useCallback(
    async (draft: SettingsDraft) => {
      await saveSettingsMutation.mutateAsync(sanitizeSettingsDraft(draft));
    },
    [saveSettingsMutation],
  );

  const hasPendingChanges = useMemo(() => {
    if (!persistedSettings) {
      return false;
    }

    return serializeSettingsDraft(settingsDraft) !== serializeSettingsDraft(persistedSettings);
  }, [persistedSettings, settingsDraft]);

  return {
    autostartEnabled,
    captureEnabled,
    hasPendingChanges,
    isSavingSettings,
    mode,
    patchSettingsDraft,
    persistedSettings,
    saveSettingsDraft,
    setCaptureEnabled,
    setMode,
    setThemeName,
    settingsDraft,
    settingsDraftRef,
    themeName,
    toggleAutostartMutation,
    toggleDarkLight,
  };
}
