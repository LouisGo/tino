import { create } from "zustand";

import { getInitialLocalePreference } from "@/i18n/preferences";
import type { AppLocalePreference } from "@/types/shell";

type LocaleState = {
  preference: AppLocalePreference;
  setPreference: (value: AppLocalePreference) => void;
};

export const useLocaleStore = create<LocaleState>((set) => ({
  preference: getInitialLocalePreference(),
  setPreference: (value) => set({ preference: value }),
}));
