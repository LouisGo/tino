import { create } from "zustand";

import { defaultAppLocalePreference } from "@/i18n";
import { DEFAULT_CLIPBOARD_HISTORY_DAYS } from "@/lib/app-defaults";
import type { SettingsDraft } from "@/types/shell";

type SettingsDraftState = {
  settingsDraft: SettingsDraft;
  setSettingsDraft: (value: SettingsDraft) => void;
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
};

const initialSettingsDraft: SettingsDraft = {
  revision: 0,
  knowledgeRoot: "",
  runtimeProviderProfiles: [],
  activeRuntimeProviderId: "",
  backgroundCompileWriteMode: "sandbox_only",
  localePreference: defaultAppLocalePreference(),
  clipboardHistoryDays: DEFAULT_CLIPBOARD_HISTORY_DAYS,
  clipboardCaptureEnabled: true,
  clipboardExcludedSourceApps: [],
  clipboardExcludedKeywords: [],
  shortcutOverrides: {},
};

export const useSettingsDraftStore = create<SettingsDraftState>((set) => ({
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
