import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/app/query-keys";
import { invalidateClipboardQueriesForUpdate } from "@/features/clipboard/lib/clipboard-capture-sync";
import type { ClipboardCapturesUpdatedPayload } from "@/types/shell";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createClipboardUpdate(
  overrides: Partial<ClipboardCapturesUpdatedPayload> = {},
): ClipboardCapturesUpdatedPayload {
  return {
    reason: "historyChanged",
    refreshHistory: false,
    refreshPinned: false,
    refreshDashboard: false,
    ...overrides,
  };
}

describe("invalidateClipboardQueriesForUpdate", () => {
  it("invalidates dashboard and AI system snapshot when dashboard refresh is requested", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateClipboardQueriesForUpdate(queryClient, createClipboardUpdate({
      refreshDashboard: true,
    }));

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.dashboardSnapshot(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.aiSystemSnapshot(),
    });
  });

  it("leaves the AI system snapshot untouched when dashboard refresh is not requested", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidateClipboardQueriesForUpdate(queryClient, createClipboardUpdate({
      refreshHistory: true,
      refreshPinned: true,
    }));

    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.aiSystemSnapshot(),
    });
  });
});
