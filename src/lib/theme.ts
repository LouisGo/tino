export const THEME_MODE_STORAGE_KEY = "tino.theme.mode";
export const THEME_NAME_STORAGE_KEY = "tino.theme.name";

export const themeModes = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const themeNames = ["tino", "ocean"] as const;
export type ThemeName = (typeof themeNames)[number];

export function isThemeMode(value: string | null): value is ThemeMode {
  return !!value && themeModes.includes(value as ThemeMode);
}

export function isThemeName(value: string | null): value is ThemeName {
  return !!value && themeNames.includes(value as ThemeName);
}

function prefersDarkMode() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveThemeMode(mode: ThemeMode) {
  if (mode === "system") {
    return prefersDarkMode() ? "dark" : "light";
  }

  return mode;
}

export function applyTheme({
  mode,
  themeName,
}: {
  mode: ThemeMode;
  themeName: ThemeName;
}) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const resolvedMode = resolveThemeMode(mode);

  root.dataset.theme = themeName;
  root.classList.toggle("dark", resolvedMode === "dark");
  root.style.colorScheme = resolvedMode;
}

function readStoredThemeMode() {
  if (typeof window === "undefined") {
    return "system" as ThemeMode;
  }

  const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

function readStoredThemeName() {
  if (typeof window === "undefined") {
    return "tino" as ThemeName;
  }

  const stored = window.localStorage.getItem(THEME_NAME_STORAGE_KEY);
  return isThemeName(stored) ? stored : "tino";
}

export function getInitialThemePreference() {
  return {
    mode: readStoredThemeMode(),
    themeName: readStoredThemeName(),
  };
}

export function bootstrapTheme() {
  applyTheme(getInitialThemePreference());
}

