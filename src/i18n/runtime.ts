import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import {
  defaultNamespace,
  fallbackAppLocale,
  i18nNamespaces,
  localeResources,
  supportedAppLocales,
} from "@/i18n/resources";
import {
  areLocalePreferencesEqual,
  normalizeAppLocalePreference,
  persistAppLocalePreference,
  resolveAppLocale,
} from "@/i18n/preferences";
import { useLocaleStore } from "@/stores/locale-store";
import type { AppLocale, AppLocalePreference } from "@/types/shell";

export const appI18n = i18next.createInstance();

let bootstrapped = false;

function getI18nResources() {
  return Object.fromEntries(
    supportedAppLocales.map((locale) => [locale, localeResources[locale]]),
  );
}

function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
}

export function bootstrapI18n() {
  if (bootstrapped) {
    return;
  }

  const preference = useLocaleStore.getState().preference;
  const locale = resolveAppLocale(preference);

  appI18n
    .use(initReactI18next)
    .init({
      defaultNS: defaultNamespace,
      fallbackLng: fallbackAppLocale,
      initAsync: false,
      interpolation: {
        escapeValue: false,
      },
      lng: locale,
      ns: i18nNamespaces,
      react: {
        useSuspense: false,
      },
      resources: getI18nResources(),
      returnNull: false,
      supportedLngs: supportedAppLocales,
    });

  applyDocumentLocale(locale);
  bootstrapped = true;
}

export function getCurrentAppLocale(): AppLocale {
  const currentLanguage = appI18n.resolvedLanguage ?? appI18n.language;
  if (currentLanguage && supportedAppLocales.includes(currentLanguage as AppLocale)) {
    return currentLanguage as AppLocale;
  }

  return resolveAppLocale(useLocaleStore.getState().preference);
}

export async function syncLocalePreference(
  preference: AppLocalePreference | null | undefined,
  options?: {
    persist?: boolean;
  },
) {
  bootstrapI18n();

  const normalized = normalizeAppLocalePreference(preference);
  const currentPreference = useLocaleStore.getState().preference;
  if (!areLocalePreferencesEqual(currentPreference, normalized)) {
    useLocaleStore.getState().setPreference(normalized);
  }

  if (options?.persist ?? true) {
    persistAppLocalePreference(normalized);
  }

  const resolvedLocale = resolveAppLocale(normalized);
  if (appI18n.resolvedLanguage !== resolvedLocale && appI18n.language !== resolvedLocale) {
    await appI18n.changeLanguage(resolvedLocale);
  }

  applyDocumentLocale(resolvedLocale);
  return resolvedLocale;
}
