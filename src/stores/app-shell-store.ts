import { create } from "zustand";

import type { SettingsDraft } from "@/types/shell";

type AppShellState = {
  captureEnabled: boolean;
  settingsDraft: SettingsDraft;
  setCaptureEnabled: (value: boolean) => void;
  setSettingsDraft: (value: SettingsDraft) => void;
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
};

const initialSettingsDraft: SettingsDraft = {
  knowledgeRoot: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  clipboardHistoryDays: 3,
  shortcutOverrides: {},
};

export const useAppShellStore = create<AppShellState>((set) => ({
  captureEnabled: true,
  settingsDraft: initialSettingsDraft,
  setCaptureEnabled: (value) => set({ captureEnabled: value }),
  setSettingsDraft: (value) => set({ settingsDraft: value }),
  patchSettingsDraft: (value) =>
    set((state) => ({
      settingsDraft: {
        ...state.settingsDraft,
        ...value,
      },
    })),
}));
