import { useCallback } from "react";

import { useTranslation } from "react-i18next";

import type { I18nNamespace, TranslationKey } from "@/i18n/resources";
import { appI18n, syncLocalePreference } from "@/i18n/runtime";
import {
  resolveText,
  resolveTextNode,
  type LocalizableNode,
  type LocalizedText,
  type TranslationValues,
} from "@/i18n/text";
import { useLocaleStore } from "@/stores/locale-store";
import type { AppLocale, AppLocalePreference } from "@/types/shell";

type ScopedTranslateOptions = {
  defaultValue?: string;
  values?: TranslationValues;
};

export function useI18nLanguage() {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language;
}

export function useLocale() {
  const language = useI18nLanguage();
  const preference = useLocaleStore((state) => state.preference);

  return {
    locale: language as AppLocale,
    preference,
    setManualLocale: useCallback(
      async (locale: AppLocale) =>
        syncLocalePreference({
          locale,
          mode: "manual",
        }),
      [],
    ),
    setPreference: useCallback(
      async (nextPreference: AppLocalePreference) => syncLocalePreference(nextPreference),
      [],
    ),
  };
}

export function useScopedT<Namespace extends I18nNamespace>(ns: Namespace) {
  useI18nLanguage();

  return (key: TranslationKey<Namespace>, options?: ScopedTranslateOptions) =>
    appI18n.t(key as string, {
      defaultValue: options?.defaultValue,
      ns,
      ...options?.values,
    });
}

export function useText(value: LocalizedText | null | undefined) {
  useI18nLanguage();
  return resolveText(value);
}

export function useTextNode(value: LocalizableNode | null | undefined) {
  useI18nLanguage();
  return resolveTextNode(value);
}
