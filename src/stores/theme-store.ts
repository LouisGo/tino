import { create } from "zustand";

import {
  THEME_MODE_STORAGE_KEY,
  THEME_NAME_STORAGE_KEY,
  getInitialThemePreference,
  type ThemeMode,
  type ThemeName,
} from "@/lib/theme";

type ThemeState = {
  mode: ThemeMode;
  themeName: ThemeName;
  setMode: (value: ThemeMode) => void;
  setThemeName: (value: ThemeName) => void;
  toggleDarkLight: () => void;
};

function persistThemePreference(mode: ThemeMode, themeName: ThemeName) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  window.localStorage.setItem(THEME_NAME_STORAGE_KEY, themeName);
}

const initialTheme = getInitialThemePreference();

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialTheme.mode,
  themeName: initialTheme.themeName,
  setMode: (value) =>
    set((state) => {
      persistThemePreference(value, state.themeName);
      return { mode: value };
    }),
  setThemeName: (value) =>
    set((state) => {
      persistThemePreference(state.mode, value);
      return { themeName: value };
    }),
  toggleDarkLight: () =>
    set((state) => {
      const nextMode = state.mode === "dark" ? "light" : "dark";
      persistThemePreference(nextMode, state.themeName);
      return { mode: nextMode };
    }),
}));
