import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { filterConfigurableShortcutOverrides } from "@/app/shortcuts";
import {
  getAppSettings,
  getAutostartEnabled,
  saveAppSettings,
  setAutostartEnabled,
} from "@/lib/tauri";
import { useAppShellStore } from "@/stores/app-shell-store";
import { useThemeStore } from "@/stores/theme-store";
import type { SettingsDraft, ShortcutOverrideRecord } from "@/types/shell";

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
  const hydrated = useRef(false);
  const settingsDraftRef = useRef(settingsDraft);
  const queuedSettingsSaveRef = useRef<SettingsDraft | null>(null);
  const settingsSaveLoopRef = useRef<Promise<void> | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    settingsDraftRef.current = settingsDraft;
  }, [settingsDraft]);

  const { data: settings } = useQuery({
    queryKey: queryKeys.appSettings(),
    queryFn: getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

  const { data: autostartEnabled } = useQuery({
    queryKey: queryKeys.autostartEnabled(),
    queryFn: getAutostartEnabled,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

  const persistedSettings = useMemo(
    () => (settings ? sanitizeSettingsDraft(settings) : null),
    [settings],
  );

  useEffect(() => {
    if (!persistedSettings || hydrated.current) {
      return;
    }

    hydrated.current = true;
    setSettingsDraft(persistedSettings);
  }, [persistedSettings, setSettingsDraft]);

  const persistSavedSettings = useCallback(
    async (saved: SettingsDraft, expectedDraft: SettingsDraft) => {
      const sanitizedSaved = sanitizeSettingsDraft(saved);
      const expectedSerialized = serializeSettingsDraft(expectedDraft);

      queryClient.setQueryData(queryKeys.appSettings(), sanitizedSaved);

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

  const saveSettingsDraft = useCallback(
    async (draft: SettingsDraft) => {
      queuedSettingsSaveRef.current = sanitizeSettingsDraft(draft);

      if (settingsSaveLoopRef.current) {
        await settingsSaveLoopRef.current;
        return;
      }

      const runSaveLoop = (async () => {
        setIsSavingSettings(true);

        try {
          while (queuedSettingsSaveRef.current) {
            const nextDraft = queuedSettingsSaveRef.current;
            queuedSettingsSaveRef.current = null;

            const saved = await saveAppSettings(nextDraft);
            await persistSavedSettings(saved, nextDraft);
          }
        } finally {
          setIsSavingSettings(false);
          settingsSaveLoopRef.current = null;
        }
      })();

      settingsSaveLoopRef.current = runSaveLoop;
      await runSaveLoop;
    },
    [persistSavedSettings],
  );

  const toggleAutostartMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await setAutostartEnabled(enabled);
      return enabled;
    },
    onMutate: async (nextEnabled) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.autostartEnabled() });
      const previousEnabled = queryClient.getQueryData<boolean>(
        queryKeys.autostartEnabled(),
      );

      queryClient.setQueryData(queryKeys.autostartEnabled(), nextEnabled);
      return { previousEnabled };
    },
    onError: (_error, _nextEnabled, context) => {
      queryClient.setQueryData(
        queryKeys.autostartEnabled(),
        context?.previousEnabled,
      );
    },
    onSuccess: (enabled) => {
      queryClient.setQueryData(queryKeys.autostartEnabled(), enabled);
    },
  });

  const hasPendingChanges = useMemo(() => {
    if (!persistedSettings) {
      return false;
    }

    return serializeSettingsDraft(settingsDraft) !== serializeSettingsDraft(persistedSettings);
  }, [persistedSettings, settingsDraft]);

  return {
    autostartEnabled: autostartEnabled ?? false,
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
