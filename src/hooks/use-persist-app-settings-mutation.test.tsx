import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/app/query-keys";
import { defaultAppLocalePreference } from "@/i18n";
import { usePersistAppSettingsMutation } from "@/hooks/use-persist-app-settings-mutation";
import type { SettingsDraft } from "@/types/shell";

const mockGetAppSettings = vi.fn();
const mockSaveAppSettings = vi.fn();
const mockResetClipboardCapturePauseGuideDismissed = vi.fn();

vi.mock("@/lib/tauri", () => ({
  getAppSettings: () => mockGetAppSettings(),
  saveAppSettings: (settings: SettingsDraft) => mockSaveAppSettings(settings),
}));

vi.mock("@/features/clipboard/lib/clipboard-capture-pause-guide", () => ({
  resetClipboardCapturePauseGuideDismissed: () =>
    mockResetClipboardCapturePauseGuideDismissed(),
  shouldResetClipboardCapturePauseGuideDismissed: (
    previous: SettingsDraft | null,
    saved: SettingsDraft,
  ) => previous?.clipboardCaptureEnabled === false && saved.clipboardCaptureEnabled,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
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

describe("usePersistAppSettingsMutation", () => {
  beforeEach(() => {
    mockGetAppSettings.mockReset();
    mockSaveAppSettings.mockReset();
    mockResetClipboardCapturePauseGuideDismissed.mockReset();
  });

  it("does not reset the pause guide dismissal for unrelated saves when capture was already enabled", async () => {
    const previous = createSettingsDraft({
      revision: 3,
      clipboardCaptureEnabled: true,
      knowledgeRoot: "/tmp/tino-old",
    });
    const saved = createSettingsDraft({
      revision: 4,
      clipboardCaptureEnabled: true,
      knowledgeRoot: "/tmp/tino-new",
    });
    const queryClient = createQueryClient();

    queryClient.setQueryData(queryKeys.appSettings(), previous);
    mockSaveAppSettings.mockResolvedValue(saved);

    const { result } = renderHook(() => usePersistAppSettingsMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(saved);
    });

    expect(mockResetClipboardCapturePauseGuideDismissed).not.toHaveBeenCalled();
  });

  it("resets the pause guide dismissal when capture resumes from paused to enabled", async () => {
    const previous = createSettingsDraft({
      revision: 7,
      clipboardCaptureEnabled: false,
    });
    const saved = createSettingsDraft({
      revision: 8,
      clipboardCaptureEnabled: true,
    });
    const queryClient = createQueryClient();

    queryClient.setQueryData(queryKeys.appSettings(), previous);
    mockSaveAppSettings.mockResolvedValue(saved);

    const { result } = renderHook(() => usePersistAppSettingsMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(saved);
    });

    expect(mockResetClipboardCapturePauseGuideDismissed).toHaveBeenCalledTimes(1);
  });
});
