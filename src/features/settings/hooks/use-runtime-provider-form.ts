import { useCallback, useEffect, useMemo, useState } from "react";

import { useForm } from "@tanstack/react-form";

import {
  buildDefaultRuntimeProviderName,
  createRuntimeProviderProfileDraft,
  getDefaultRuntimeProviderBaseUrlForVendor,
  getRuntimeProviderFormValues,
  isRuntimeProviderModelAvailableForVendor,
  normalizeRuntimeProviderApiKey,
  normalizeRuntimeProviderBaseUrl,
  normalizeRuntimeProviderModel,
  normalizeRuntimeProviderName,
  normalizeRuntimeProviderVendor,
  replaceRuntimeProviderProfile,
  resolveActiveRuntimeProvider,
  validateRuntimeProviderApiKey,
  validateRuntimeProviderBaseUrl,
} from "@/features/settings/lib/runtime-provider";
import type {
  RuntimeProviderProfile,
  RuntimeProviderVendor,
  SettingsDraft,
} from "@/types/shell";

export function useRuntimeProviderForm({
  patchSettingsDraft,
  settingsDraft,
}: {
  patchSettingsDraft: (value: Partial<SettingsDraft>) => void;
  settingsDraft: SettingsDraft;
}) {
  const providerProfiles = settingsDraft.runtimeProviderProfiles;
  const activeProvider = useMemo(
    () => resolveActiveRuntimeProvider(settingsDraft),
    [settingsDraft],
  );
  const [selectedProviderIdOverride, setSelectedProviderIdOverride] =
    useState<string | null>(null);
  const selectedProviderId = useMemo(() => {
    if (!providerProfiles.length) {
      return null;
    }

    if (
      selectedProviderIdOverride
      && providerProfiles.some((profile) => profile.id === selectedProviderIdOverride)
    ) {
      return selectedProviderIdOverride;
    }

    return settingsDraft.activeRuntimeProviderId || providerProfiles[0].id;
  }, [
    providerProfiles,
    selectedProviderIdOverride,
    settingsDraft.activeRuntimeProviderId,
  ]);

  const selectedProvider = useMemo(() => {
    if (!providerProfiles.length) {
      return null;
    }

    return providerProfiles.find((profile) => profile.id === selectedProviderId)
      ?? providerProfiles[0];
  }, [providerProfiles, selectedProviderId]);

  const selectedProviderIndex = useMemo(() => {
    if (!selectedProvider) {
      return -1;
    }

    const index = providerProfiles.findIndex((profile) => profile.id === selectedProvider.id);
    return index >= 0 ? index : 0;
  }, [providerProfiles, selectedProvider]);

  const defaultValues = useMemo(
    () => getRuntimeProviderFormValues(selectedProvider),
    [selectedProvider],
  );

  const form = useForm({
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const updateProviderProfile = useCallback(
    (nextProfile: RuntimeProviderProfile) => {
      patchSettingsDraft({
        runtimeProviderProfiles: replaceRuntimeProviderProfile(providerProfiles, nextProfile),
      });
      return nextProfile;
    },
    [patchSettingsDraft, providerProfiles],
  );

  const commitSelectedProvider = useCallback(() => {
    if (!selectedProvider) {
      return null;
    }

    const fallbackName = buildDefaultRuntimeProviderName(selectedProviderIndex + 1);
    const nextVendor = normalizeRuntimeProviderVendor(form.state.values.vendor);
    const currentBaseUrl = form.state.values.baseUrl.trim();
    const previousDefaultBaseUrl = getDefaultRuntimeProviderBaseUrlForVendor(selectedProvider.vendor);
    const nextDefaultBaseUrl = getDefaultRuntimeProviderBaseUrlForVendor(nextVendor);
    const shouldReplaceBaseUrl =
      currentBaseUrl.length === 0
      || currentBaseUrl === previousDefaultBaseUrl;
    const nextBaseUrlInput = shouldReplaceBaseUrl ? nextDefaultBaseUrl : currentBaseUrl;
    const nextBaseUrl = validateRuntimeProviderBaseUrl(nextBaseUrlInput)
      ? selectedProvider.baseUrl
      : normalizeRuntimeProviderBaseUrl(nextBaseUrlInput, nextVendor);
    const nextApiKey = validateRuntimeProviderApiKey(form.state.values.apiKey)
      ? selectedProvider.apiKey
      : normalizeRuntimeProviderApiKey(form.state.values.apiKey);
    const nextProfile = updateProviderProfile({
      ...selectedProvider,
      name: normalizeRuntimeProviderName(form.state.values.name, fallbackName),
      vendor: nextVendor,
      baseUrl: nextBaseUrl,
      apiKey: nextApiKey,
      model: normalizeRuntimeProviderModel(form.state.values.model),
    });

    form.reset(getRuntimeProviderFormValues(nextProfile));
    return nextProfile;
  }, [form, selectedProvider, selectedProviderIndex, updateProviderProfile]);

  const commitName = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        return false;
      }

      const normalizedValue = normalizeRuntimeProviderName(
        value,
        buildDefaultRuntimeProviderName(selectedProviderIndex + 1),
      );
      updateProviderProfile({
        ...selectedProvider,
        name: normalizedValue,
      });

      if (form.state.values.name !== normalizedValue) {
        form.setFieldValue("name", normalizedValue);
      }

      return true;
    },
    [form, selectedProvider, selectedProviderIndex, updateProviderProfile],
  );

  const commitVendor = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        return normalizeRuntimeProviderVendor(value);
      }

      const normalizedVendor = normalizeRuntimeProviderVendor(value);
      const currentBaseUrl = form.state.values.baseUrl.trim();
      const previousDefaultBaseUrl = getDefaultRuntimeProviderBaseUrlForVendor(
        selectedProvider.vendor,
      );
      const nextDefaultBaseUrl = getDefaultRuntimeProviderBaseUrlForVendor(normalizedVendor);
      const shouldReplaceBaseUrl =
        currentBaseUrl.length === 0
        || currentBaseUrl === previousDefaultBaseUrl;
      const nextBaseUrl = shouldReplaceBaseUrl ? nextDefaultBaseUrl : currentBaseUrl;
      const currentModel = form.state.values.model.trim();
      const nextModel =
        currentModel.length > 0
        && isRuntimeProviderModelAvailableForVendor(normalizedVendor, currentModel)
          ? currentModel
          : "";

      updateProviderProfile({
        ...selectedProvider,
        vendor: normalizedVendor,
        baseUrl: nextBaseUrl,
        model: nextModel,
      });

      if (form.state.values.baseUrl !== nextBaseUrl) {
        form.setFieldValue("baseUrl", nextBaseUrl);
      }

      if (form.state.values.model !== nextModel) {
        form.setFieldValue("model", nextModel);
      }

      return normalizedVendor;
    },
    [form, selectedProvider, updateProviderProfile],
  );

  const commitBaseUrl = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        return false;
      }

      const error = validateRuntimeProviderBaseUrl(value);
      if (error) {
        return false;
      }

      const normalizedValue = normalizeRuntimeProviderBaseUrl(
        value,
        form.state.values.vendor as RuntimeProviderVendor,
      );
      updateProviderProfile({
        ...selectedProvider,
        baseUrl: normalizedValue,
      });

      if (form.state.values.baseUrl !== normalizedValue) {
        form.setFieldValue("baseUrl", normalizedValue);
      }

      return true;
    },
    [form, selectedProvider, updateProviderProfile],
  );

  const commitModel = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        return "";
      }

      const normalizedValue = normalizeRuntimeProviderModel(value);
      updateProviderProfile({
        ...selectedProvider,
        model: normalizedValue,
      });

      if (form.state.values.model !== normalizedValue) {
        form.setFieldValue("model", normalizedValue);
      }

      return normalizedValue;
    },
    [form, selectedProvider, updateProviderProfile],
  );

  const commitApiKey = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        return false;
      }

      const error = validateRuntimeProviderApiKey(value);
      if (error) {
        return false;
      }

      const normalizedValue = normalizeRuntimeProviderApiKey(value);
      updateProviderProfile({
        ...selectedProvider,
        apiKey: normalizedValue,
      });

      if (form.state.values.apiKey !== normalizedValue) {
        form.setFieldValue("apiKey", normalizedValue);
      }

      return true;
    },
    [form, selectedProvider, updateProviderProfile],
  );

  const selectProvider = useCallback(
    (providerId: string) => {
      if (providerId === selectedProviderId) {
        return;
      }

      commitSelectedProvider();
      setSelectedProviderIdOverride(providerId);
    },
    [commitSelectedProvider, selectedProviderId],
  );

  const addProvider = useCallback(() => {
    commitSelectedProvider();

    const nextProfile = createRuntimeProviderProfileDraft(providerProfiles.length + 1);
    patchSettingsDraft({
      runtimeProviderProfiles: [...providerProfiles, nextProfile],
      activeRuntimeProviderId:
        settingsDraft.activeRuntimeProviderId || nextProfile.id,
    });
    setSelectedProviderIdOverride(nextProfile.id);
    return nextProfile.id;
  }, [
    commitSelectedProvider,
    patchSettingsDraft,
    providerProfiles,
    settingsDraft.activeRuntimeProviderId,
  ]);

  const deleteProvider = useCallback(
    (providerId: string) => {
      if (providerProfiles.length <= 1) {
        return false;
      }

      if (selectedProvider?.id !== providerId) {
        commitSelectedProvider();
      }

      const remainingProfiles = providerProfiles.filter((profile) => profile.id !== providerId);
      if (remainingProfiles.length === providerProfiles.length) {
        return false;
      }

      const nextActiveProviderId =
        settingsDraft.activeRuntimeProviderId === providerId
          ? remainingProfiles[0]?.id ?? ""
          : settingsDraft.activeRuntimeProviderId;

      patchSettingsDraft({
        runtimeProviderProfiles: remainingProfiles,
        activeRuntimeProviderId: nextActiveProviderId,
      });

      if (selectedProviderId === providerId) {
        setSelectedProviderIdOverride(remainingProfiles[0]?.id ?? null);
      }

      return true;
    },
    [
      commitSelectedProvider,
      patchSettingsDraft,
      providerProfiles,
      selectedProvider,
      selectedProviderId,
      settingsDraft.activeRuntimeProviderId,
    ],
  );

  const setActiveProvider = useCallback(
    (providerId: string) => {
      if (!providerProfiles.some((profile) => profile.id === providerId)) {
        return false;
      }

      patchSettingsDraft({
        activeRuntimeProviderId: providerId,
      });
      setSelectedProviderIdOverride(providerId);
      return true;
    },
    [patchSettingsDraft, providerProfiles],
  );

  return {
    activeProvider,
    addProvider,
    canDeleteProvider: providerProfiles.length > 1,
    commitApiKey,
    commitBaseUrl,
    commitModel,
    commitName,
    commitSelectedProvider,
    commitVendor,
    deleteProvider,
    form,
    providerProfiles,
    selectProvider,
    selectedProvider,
    selectedProviderId,
    setActiveProvider,
  };
}

export type RuntimeProviderFormController = ReturnType<typeof useRuntimeProviderForm>;
