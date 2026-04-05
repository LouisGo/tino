import { isValidElement, type ReactNode } from "react";

import type { I18nNamespace, TranslationKey } from "@/i18n/resources";
import { appI18n } from "@/i18n/runtime";

export type TranslationValues = Record<
  string,
  boolean | Date | null | number | string | undefined
>;

export type LocalizedTextDescriptor = {
  defaultValue?: string;
  key: string;
  ns: I18nNamespace;
  values?: TranslationValues;
};

export type LocalizedText = LocalizedTextDescriptor | string;
export type LocalizableNode = LocalizedText | ReactNode;

export function tx<Namespace extends I18nNamespace>(
  ns: Namespace,
  key: TranslationKey<Namespace>,
  options?: {
    defaultValue?: string;
    values?: TranslationValues;
  },
): LocalizedTextDescriptor {
  return {
    defaultValue: options?.defaultValue,
    key: key as string,
    ns,
    values: options?.values,
  };
}

export function isLocalizedTextDescriptor(value: unknown): value is LocalizedTextDescriptor {
  return (
    typeof value === "object"
    && value !== null
    && "key" in value
    && "ns" in value
  );
}

export function resolveText(value: LocalizedText | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return appI18n.t(value.key as string, {
    defaultValue: value.defaultValue,
    ns: value.ns,
    ...value.values,
  });
}

export function resolveTextNode(value: LocalizableNode | null | undefined): ReactNode {
  if (isLocalizedTextDescriptor(value)) {
    return resolveText(value);
  }

  if (typeof value === "string" || typeof value === "number" || isValidElement(value)) {
    return value;
  }

  return value ?? null;
}
