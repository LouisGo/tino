import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/app/query-keys";
import { useSettingsDraftStore } from "@/features/settings/stores/settings-draft-store";
import { defaultAppLocalePreference } from "@/i18n";
import { applyIncomingAppSettingsChange } from "@/lib/app-settings-sync";
import type { SettingsDraft } from "@/types/shell";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createSettingsDraft(overrides: Partial<SettingsDraft> = {}): SettingsDraft {
  return {
    revision: 1,
    knowledgeRoot: "/tmp/tino-a",
    runtimeProviderProfiles: [],
    activeRuntimeProviderId: "",
    localePreference: defaultAppLocalePreference(),
    clipboardHistoryDays: 7,
    clipboardCaptureEnabled: true,
    clipboardExcludedSourceApps: [],
    clipboardExcludedKeywords: [],
    shortcutOverrides: {},
    ...overrides,
  };
}

describe("applyIncomingAppSettingsChange", () => {
  beforeEach(() => {
    useSettingsDraftStore.setState({
      settingsDraft: createSettingsDraft(),
    });
  });

  it("invalidates clipboard history, summary, and pinned queries when knowledge root changes", () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const previous = createSettingsDraft({
      revision: 4,
      knowledgeRoot: "/tmp/tino-old",
    });
    const saved = createSettingsDraft({
      revision: 5,
      knowledgeRoot: "/tmp/tino-new",
    });

    useSettingsDraftStore.setState({
      settingsDraft: previous,
    });

    applyIncomingAppSettingsChange(queryClient, {
      previous,
      saved,
    });

    expect(queryClient.getQueryData(queryKeys.appSettings())).toEqual(saved);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.dashboardSnapshot(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPageBase(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPageSummary(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPinnedCaptures(),
      exact: true,
    });
  });

  it("invalidates clipboard history queries without touching pinned queries when only history days change", () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const previous = createSettingsDraft({
      revision: 8,
      clipboardHistoryDays: 7,
    });
    const saved = createSettingsDraft({
      revision: 9,
      clipboardHistoryDays: 90,
    });

    applyIncomingAppSettingsChange(queryClient, {
      previous,
      saved,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.dashboardSnapshot(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPageBase(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPageSummary(),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPinnedCaptures(),
      exact: true,
    });
  });
});
