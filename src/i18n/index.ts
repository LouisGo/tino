export {
  appI18n,
  bootstrapI18n,
  getCurrentAppLocale,
  syncLocalePreference,
} from "@/i18n/runtime";
export {
  areLocalePreferencesEqual,
  coerceAppLocale,
  defaultAppLocalePreference,
  getInitialLocalePreference,
  getSupportedAppLocales,
  isAppLocale,
  LOCALE_PREFERENCE_CHANGED_EVENT,
  LOCALE_PREFERENCE_MODE_STORAGE_KEY,
  LOCALE_PREFERENCE_VALUE_STORAGE_KEY,
  normalizeAppLocalePreference,
  persistAppLocalePreference,
  resolveAppLocale,
} from "@/i18n/preferences";
export {
  localeLabels,
  type I18nNamespace,
  type TranslationKey,
} from "@/i18n/resources";
export {
  formatAppDateTime,
  formatAppList,
  formatAppNumber,
  formatAppRelativeTime,
} from "@/i18n/formatters";
export {
  tx,
  resolveText,
  resolveTextNode,
  type LocalizableNode,
  type LocalizedText,
  type LocalizedTextDescriptor,
  type TranslationValues,
} from "@/i18n/text";
export {
  useI18nLanguage,
  useLocale,
  useScopedT,
  useText,
  useTextNode,
} from "@/i18n/hooks";
