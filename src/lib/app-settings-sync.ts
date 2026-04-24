import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { useSettingsDraftStore } from "@/features/settings/stores/settings-draft-store";
import { isTauriRuntime } from "@/lib/tauri-core";
import type { AppSettingsChangedPayload, SettingsDraft } from "@/types/shell";

export function isAppSettingsChangeFromCurrentWindow(payload: AppSettingsChangedPayload) {
  if (!isTauriRuntime()) {
    return false;
  }

  return payload.sourceWindowLabel === getCurrentWindow().label;
}

export function applyIncomingAppSettingsChange(
  queryClient: QueryClient,
  payload: Pick<AppSettingsChangedPayload, "previous" | "saved">,
) {
  const currentDraft = useSettingsDraftStore.getState().settingsDraft;
  const mergedDraft = mergeIncomingAppSettingsDraft(currentDraft, payload.previous, payload.saved);
  const shouldRefreshDashboard = shouldInvalidateDashboardSnapshot(
    payload.previous,
    payload.saved,
  );
  const shouldRefreshAiSystem = shouldInvalidateAiSystemSnapshot(
    payload.previous,
    payload.saved,
  );
  const shouldRefreshClipboardHistory = shouldInvalidateClipboardHistoryQueries(
    payload.previous,
    payload.saved,
  );
  const shouldRefreshPinnedClipboardData = shouldInvalidatePinnedClipboardQueries(
    payload.previous,
    payload.saved,
  );

  useSettingsDraftStore.getState().setSettingsDraft(mergedDraft);
  queryClient.setQueryData(queryKeys.appSettings(), payload.saved);

  if (
    !shouldRefreshDashboard
    && !shouldRefreshAiSystem
    && !shouldRefreshClipboardHistory
    && !shouldRefreshPinnedClipboardData
  ) {
    return;
  }

  const invalidations: Array<Promise<void>> = [];

  if (shouldRefreshDashboard) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() }));
  }

  if (shouldRefreshAiSystem) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.aiSystemSnapshot() }));
  }

  if (shouldRefreshClipboardHistory) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageBase() }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageSummary() }));
  }

  if (shouldRefreshPinnedClipboardData) {
    invalidations.push(queryClient.invalidateQueries({
      queryKey: queryKeys.clipboardPinnedCaptures(),
      exact: true,
    }));
  }

  void Promise.all(invalidations);
}

function mergeIncomingAppSettingsDraft(
  localDraft: SettingsDraft,
  previousPersisted: SettingsDraft | null,
  savedSettings: SettingsDraft,
): SettingsDraft {
  if (!previousPersisted) {
    return savedSettings;
  }

  const mergedDraft = { ...localDraft };

  for (const key of Object.keys(savedSettings) as Array<keyof SettingsDraft>) {
    if (stableSerialize(localDraft[key]) !== stableSerialize(previousPersisted[key])) {
      continue;
    }

    assignMergedDraftValue(mergedDraft, key, savedSettings[key]);
  }

  return mergedDraft;
}

function assignMergedDraftValue<K extends keyof SettingsDraft>(
  draft: SettingsDraft,
  key: K,
  value: SettingsDraft[K],
) {
  draft[key] = value;
}

function shouldInvalidateDashboardSnapshot(
  previousPersisted: SettingsDraft | null,
  savedSettings: SettingsDraft,
) {
  if (!previousPersisted) {
    return true;
  }

  return (
    previousPersisted.knowledgeRoot !== savedSettings.knowledgeRoot
    || previousPersisted.clipboardHistoryDays !== savedSettings.clipboardHistoryDays
    || previousPersisted.clipboardCaptureEnabled !== savedSettings.clipboardCaptureEnabled
  );
}

function shouldInvalidateAiSystemSnapshot(
  previousPersisted: SettingsDraft | null,
  savedSettings: SettingsDraft,
) {
  if (!previousPersisted) {
    return true;
  }

  return (
    previousPersisted.knowledgeRoot !== savedSettings.knowledgeRoot
    || previousPersisted.backgroundCompileWriteMode !== savedSettings.backgroundCompileWriteMode
    || previousPersisted.activeRuntimeProviderId !== savedSettings.activeRuntimeProviderId
    || stableSerialize(resolveActiveRuntimeProviderProfile(previousPersisted))
      !== stableSerialize(resolveActiveRuntimeProviderProfile(savedSettings))
  );
}

function shouldInvalidateClipboardHistoryQueries(
  previousPersisted: SettingsDraft | null,
  savedSettings: SettingsDraft,
) {
  if (!previousPersisted) {
    return true;
  }

  return previousPersisted.knowledgeRoot !== savedSettings.knowledgeRoot
    || previousPersisted.clipboardHistoryDays !== savedSettings.clipboardHistoryDays;
}

function shouldInvalidatePinnedClipboardQueries(
  previousPersisted: SettingsDraft | null,
  savedSettings: SettingsDraft,
) {
  if (!previousPersisted) {
    return true;
  }

  return previousPersisted.knowledgeRoot !== savedSettings.knowledgeRoot;
}

function resolveActiveRuntimeProviderProfile(settings: SettingsDraft) {
  const activeProviderId = settings.activeRuntimeProviderId.trim();
  if (!activeProviderId) {
    return null;
  }

  return settings.runtimeProviderProfiles.find((profile) => profile.id === activeProviderId) ?? null;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);

  return `{${entries.join(",")}}`;
}
