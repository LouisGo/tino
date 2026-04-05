import { useCallback, useEffect, useMemo } from "react";

import { useForm } from "@tanstack/react-form";

import {
  getRuntimeProviderFormValues,
  normalizeRuntimeProviderApiKey,
  normalizeRuntimeProviderBaseUrl,
  normalizeRuntimeProviderModel,
  type RuntimeProviderModelId,
  validateRuntimeProviderApiKey,
  validateRuntimeProviderBaseUrl,
} from "@/features/settings/lib/runtime-provider";
import type { SettingsDraft } from "@/types/shell";

export function useRuntimeProviderForm({
  patchSettingsDraft,
  settingsDraft,
}: {
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
  settingsDraft: SettingsDraft;
}) {
  const defaultValues = useMemo(
    () => getRuntimeProviderFormValues(settingsDraft),
    [settingsDraft],
  );

  const form = useForm({
    defaultValues,
  });

  useEffect(() => {
    const currentValues = form.state.values;

    if (
      currentValues.baseUrl === defaultValues.baseUrl
      && currentValues.model === defaultValues.model
      && currentValues.apiKey === defaultValues.apiKey
    ) {
      return;
    }

    form.reset(defaultValues);
  }, [defaultValues, form]);

  const commitBaseUrl = useCallback(
    (value: string) => {
      const error = validateRuntimeProviderBaseUrl(value);
      if (error) {
        return false;
      }

      const normalizedValue = normalizeRuntimeProviderBaseUrl(value);
      patchSettingsDraft({ baseUrl: normalizedValue });

      if (form.state.values.baseUrl !== normalizedValue) {
        form.setFieldValue("baseUrl", normalizedValue);
      }

      return true;
    },
    [form, patchSettingsDraft],
  );

  const commitModel = useCallback(
    (value: string) => {
      const normalizedValue = normalizeRuntimeProviderModel(value);
      patchSettingsDraft({ model: normalizedValue });

      return normalizedValue;
    },
    [patchSettingsDraft],
  );

  const commitApiKey = useCallback(
    (value: string) => {
      const error = validateRuntimeProviderApiKey(value);
      if (error) {
        return false;
      }

      const normalizedValue = normalizeRuntimeProviderApiKey(value);
      patchSettingsDraft({ apiKey: normalizedValue });

      if (form.state.values.apiKey !== normalizedValue) {
        form.setFieldValue("apiKey", normalizedValue);
      }

      return true;
    },
    [form, patchSettingsDraft],
  );

  return {
    commitApiKey,
    commitBaseUrl,
    commitModel: commitModel as (value: string) => RuntimeProviderModelId,
    form,
  };
}

export type RuntimeProviderFormController = ReturnType<typeof useRuntimeProviderForm>;
