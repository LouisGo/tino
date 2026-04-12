export const THEME_MODE_STORAGE_KEY = "tino.theme.mode";
export const THEME_NAME_STORAGE_KEY = "tino.theme.name";
export const THEME_PREFERENCE_CHANGED_EVENT = "theme-preference-changed";

export const themeModes = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof themeModes)[number];

export const themeNames = ["tino", "ocean"] as const;
export type ThemeName = (typeof themeNames)[number];
export const windowSurfaceModes = ["opaque", "transparent"] as const;
export type WindowSurfaceMode = (typeof windowSurfaceModes)[number];

declare global {
  interface Window {
    __TINO_WINDOW_SURFACE__?: WindowSurfaceMode;
  }
}

export type ThemePreference = {
  mode: ThemeMode;
  themeName: ThemeName;
};

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

export function resolveWindowSurfaceMode(): WindowSurfaceMode {
  if (typeof window === "undefined") {
    return "opaque";
  }

  return window.__TINO_WINDOW_SURFACE__ === "transparent"
    ? "transparent"
    : "opaque";
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
  const windowSurfaceMode = resolveWindowSurfaceMode();
  const backgroundColor = windowSurfaceMode === "transparent"
    ? "transparent"
    : "var(--background)";

  root.dataset.theme = themeName;
  root.dataset.windowSurface = windowSurfaceMode;
  root.classList.toggle("dark", resolvedMode === "dark");
  root.style.colorScheme = resolvedMode;
  root.style.backgroundColor = backgroundColor;

  if (document.body) {
    document.body.style.backgroundColor = backgroundColor;
    document.body.style.backgroundImage = windowSurfaceMode === "transparent"
      ? "none"
      : "";
  }
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
  } satisfies ThemePreference;
}

export function bootstrapTheme() {
  applyTheme(getInitialThemePreference());
}
