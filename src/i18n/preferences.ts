import type {
  AppLocale,
  AppLocaleMode,
  AppLocalePreference,
} from "@/types/shell";
import {
  fallbackAppLocale,
  localeLabels,
  supportedAppLocales,
} from "@/i18n/resources";

export const LOCALE_PREFERENCE_MODE_STORAGE_KEY = "tino.locale.mode";
export const LOCALE_PREFERENCE_VALUE_STORAGE_KEY = "tino.locale.value";
export const LOCALE_PREFERENCE_CHANGED_EVENT = "locale-preference-changed";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return typeof value === "string" && value in localeLabels;
}

export function isAppLocaleMode(value: string | null | undefined): value is AppLocaleMode {
  return value === "manual" || value === "system";
}

export function coerceAppLocale(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();

  if (normalized.startsWith("zh")) {
    return "zh-CN" as const;
  }

  if (normalized.startsWith("en")) {
    return "en-US" as const;
  }

  return null;
}

export function defaultAppLocalePreference(): AppLocalePreference {
  return {
    mode: "manual",
    locale: fallbackAppLocale,
  };
}

export function normalizeAppLocalePreference(
  value: AppLocalePreference | null | undefined,
): AppLocalePreference {
  const mode = isAppLocaleMode(value?.mode) ? value.mode : "manual";
  const locale = value?.locale && isAppLocale(value.locale) ? value.locale : fallbackAppLocale;

  if (mode === "manual" && locale) {
    return {
      mode,
      locale,
    };
  }

  return {
    mode: "manual",
    locale,
  };
}

export function resolveAppLocale(
  preference: AppLocalePreference | null | undefined,
): AppLocale {
  const normalized = normalizeAppLocalePreference(preference);
  return normalized.locale ?? fallbackAppLocale;
}

function readStoredLocaleMode() {
  if (typeof window === "undefined") {
    return "manual" as AppLocaleMode;
  }

  const stored = window.localStorage.getItem(LOCALE_PREFERENCE_MODE_STORAGE_KEY);
  return isAppLocaleMode(stored) ? stored : "manual";
}

function readStoredLocaleValue() {
  if (typeof window === "undefined") {
    return null;
  }

  return coerceAppLocale(window.localStorage.getItem(LOCALE_PREFERENCE_VALUE_STORAGE_KEY));
}

export function getInitialLocalePreference() {
  return normalizeAppLocalePreference({
    mode: readStoredLocaleMode(),
    locale: readStoredLocaleValue(),
  });
}

export function persistAppLocalePreference(
  preference: AppLocalePreference | null | undefined,
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeAppLocalePreference(preference);
  window.localStorage.setItem(LOCALE_PREFERENCE_MODE_STORAGE_KEY, "manual");
  window.localStorage.setItem(
    LOCALE_PREFERENCE_VALUE_STORAGE_KEY,
    normalized.locale ?? fallbackAppLocale,
  );
}

export function areLocalePreferencesEqual(
  left: AppLocalePreference | null | undefined,
  right: AppLocalePreference | null | undefined,
) {
  const normalizedLeft = normalizeAppLocalePreference(left);
  const normalizedRight = normalizeAppLocalePreference(right);

  return normalizedLeft.mode === normalizedRight.mode
    && normalizedLeft.locale === normalizedRight.locale;
}

export function getSupportedAppLocales() {
  return supportedAppLocales;
}
