import { create } from "zustand";

import { defaultAppLocalePreference } from "@/i18n";
import { DEFAULT_CLIPBOARD_HISTORY_DAYS } from "@/lib/app-defaults";
import type { SettingsDraft } from "@/types/shell";

type AppShellState = {
  settingsDraft: SettingsDraft;
  setSettingsDraft: (value: SettingsDraft) => void;
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
};

const initialSettingsDraft: SettingsDraft = {
  knowledgeRoot: "",
  runtimeProviderProfiles: [],
  activeRuntimeProviderId: "",
  localePreference: defaultAppLocalePreference(),
  clipboardHistoryDays: DEFAULT_CLIPBOARD_HISTORY_DAYS,
  clipboardCaptureEnabled: true,
  clipboardExcludedSourceApps: [],
  clipboardExcludedKeywords: [],
  shortcutOverrides: {},
};

export const useAppShellStore = create<AppShellState>((set) => ({
  settingsDraft: initialSettingsDraft,
  setSettingsDraft: (value) => set({ settingsDraft: value }),
  patchSettingsDraft: (value) =>
    set((state) => ({
      settingsDraft: {
        ...state.settingsDraft,
        ...value,
      },
    })),
}));
