import { useCallback, useEffect, useMemo, useRef } from "react";

import { useIsMutating } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { filterConfigurableShortcutOverrides } from "@/app/shortcuts";
import { createRendererLogger } from "@/lib/logger";
import { useAutostartSetting } from "@/features/settings/hooks/use-autostart-setting";
import { usePersistAppSettingsMutation } from "@/hooks/use-persist-app-settings-mutation";
import { usePersistedAppSettings } from "@/hooks/use-persisted-app-settings";
import { useSettingsDraftStore } from "@/features/settings/stores/settings-draft-store";
import { useThemeStore } from "@/stores/theme-store";
import type { SettingsDraft, ShortcutOverrideRecord } from "@/types/shell";

const logger = createRendererLogger("settings.controller");

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
  const comparableSettings = { ...settings };
  delete comparableSettings.revision;
  const normalizedOverrides = Object.fromEntries(
    Object.entries(sanitizeShortcutOverrides(settings.shortcutOverrides)).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  );

  return JSON.stringify({
    ...comparableSettings,
    shortcutOverrides: normalizedOverrides,
  });
}

export function useSettingsController() {
  const patchSettingsDraft = useSettingsDraftStore((state) => state.patchSettingsDraft);
  const setSettingsDraft = useSettingsDraftStore((state) => state.setSettingsDraft);
  const settingsDraft = useSettingsDraftStore((state) => state.settingsDraft);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const setThemeName = useThemeStore((state) => state.setThemeName);
  const themeName = useThemeStore((state) => state.themeName);
  const toggleDarkLight = useThemeStore((state) => state.toggleDarkLight);
  const { autostartEnabled, toggleAutostartMutation } = useAutostartSetting();
  const hydrated = useRef(false);
  const settingsDraftRef = useRef(settingsDraft);
  const saveSettingsMutation = usePersistAppSettingsMutation({
    onError: (error) => {
      logger.error("Failed to persist settings", error);
    },
  });

  useEffect(() => {
    settingsDraftRef.current = settingsDraft;
  }, [settingsDraft]);

  const { data: settings } = usePersistedAppSettings();

  const persistedSettings = useMemo(
    () => (settings ? sanitizeSettingsDraft(settings) : null),
    [settings],
  );
  const hasPendingChanges = useMemo(() => {
    if (!persistedSettings) {
      return false;
    }

    return serializeSettingsDraft(settingsDraft) !== serializeSettingsDraft(persistedSettings);
  }, [persistedSettings, settingsDraft]);
  const isSavingSettings = useIsMutating({
    mutationKey: queryKeys.appSettingsSave(),
  }) > 0;

  useEffect(() => {
    if (!persistedSettings) {
      return;
    }

    if (!hydrated.current) {
      hydrated.current = true;
      setSettingsDraft(persistedSettings);
      return;
    }

    if (!hasPendingChanges) {
      setSettingsDraft(persistedSettings);
    }
  }, [hasPendingChanges, persistedSettings, setSettingsDraft]);

  const saveSettingsDraft = useCallback(
    async (draft: SettingsDraft) => {
      await saveSettingsMutation.mutateAsync(sanitizeSettingsDraft(draft));
    },
    [saveSettingsMutation],
  );

  return {
    autostartEnabled,
    hasPendingChanges,
    isSavingSettings,
    mode,
    patchSettingsDraft,
    persistedSettings,
    saveSettingsDraft,
    setMode,
    setThemeName,
    settingsDraft,
    settingsDraftRef,
    themeName,
    toggleAutostartMutation,
    toggleDarkLight,
  };
}
