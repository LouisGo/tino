import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/app/query-keys";
import { useSettingsDraftStore } from "@/features/settings/stores/settings-draft-store";
import { defaultAppLocalePreference } from "@/i18n";
import { applyIncomingAppSettingsChange } from "@/lib/app-settings-sync";
import type { RuntimeProviderProfile, SettingsDraft } from "@/types/shell";

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
    backgroundCompileWriteMode: "sandbox_only",
    localePreference: defaultAppLocalePreference(),
    clipboardHistoryDays: 7,
    clipboardCaptureEnabled: true,
    clipboardExcludedSourceApps: [],
    clipboardExcludedKeywords: [],
    shortcutOverrides: {},
    ...overrides,
  };
}

function createProviderProfile(
  overrides: Partial<RuntimeProviderProfile> = {},
): RuntimeProviderProfile {
  return {
    id: "provider_primary",
    name: "Primary",
    vendor: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    model: "gpt-5.1",
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
      queryKey: queryKeys.aiSystemSnapshot(),
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
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.aiSystemSnapshot(),
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

  it("invalidates only the AI system snapshot when the active provider changes", () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const previous = createSettingsDraft({
      revision: 2,
      runtimeProviderProfiles: [
        createProviderProfile({
          id: "provider_primary",
          name: "Primary",
          model: "gpt-5.1",
        }),
      ],
      activeRuntimeProviderId: "provider_primary",
    });
    const saved = createSettingsDraft({
      revision: 3,
      runtimeProviderProfiles: [
        createProviderProfile({
          id: "provider_primary",
          name: "Primary",
          model: "gpt-5.4",
        }),
      ],
      activeRuntimeProviderId: "provider_primary",
    });

    applyIncomingAppSettingsChange(queryClient, {
      previous,
      saved,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.aiSystemSnapshot(),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.dashboardSnapshot(),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPageBase(),
    });
  });

  it("does not invalidate the AI system snapshot when only an inactive provider changes", () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const previous = createSettingsDraft({
      revision: 5,
      runtimeProviderProfiles: [
        createProviderProfile({
          id: "provider_primary",
          name: "Primary",
          model: "gpt-5.1",
        }),
        createProviderProfile({
          id: "provider_secondary",
          name: "Secondary",
          model: "gpt-4.1-mini",
        }),
      ],
      activeRuntimeProviderId: "provider_primary",
    });
    const saved = createSettingsDraft({
      revision: 6,
      runtimeProviderProfiles: [
        createProviderProfile({
          id: "provider_primary",
          name: "Primary",
          model: "gpt-5.1",
        }),
        createProviderProfile({
          id: "provider_secondary",
          name: "Secondary",
          model: "gpt-5.4-mini",
        }),
      ],
      activeRuntimeProviderId: "provider_primary",
    });

    applyIncomingAppSettingsChange(queryClient, {
      previous,
      saved,
    });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("invalidates only the AI system snapshot when background compile write mode changes", () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const previous = createSettingsDraft({
      revision: 10,
      backgroundCompileWriteMode: "sandbox_only",
    });
    const saved = createSettingsDraft({
      revision: 11,
      backgroundCompileWriteMode: "legacy_live",
    });

    applyIncomingAppSettingsChange(queryClient, {
      previous,
      saved,
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.aiSystemSnapshot(),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.dashboardSnapshot(),
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.clipboardPageBase(),
    });
  });
});
