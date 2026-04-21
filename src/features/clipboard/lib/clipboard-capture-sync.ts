import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import type { ClipboardCapturesUpdatedPayload } from "@/types/shell";

export const clipboardPinsChangedUpdate = {
  reason: "pinsChanged",
  refreshHistory: true,
  refreshPinned: true,
  refreshDashboard: false,
} satisfies ClipboardCapturesUpdatedPayload;

export const clipboardCaptureDeletedUpdate = {
  reason: "captureDeleted",
  refreshHistory: true,
  refreshPinned: true,
  refreshDashboard: true,
} satisfies ClipboardCapturesUpdatedPayload;

export function invalidateClipboardQueriesForUpdate(
  queryClient: QueryClient,
  payload: ClipboardCapturesUpdatedPayload,
) {
  const invalidations: Array<Promise<void>> = [];

  if (payload.refreshHistory) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageBase() }));
    invalidations.push(queryClient.invalidateQueries({
      queryKey: queryKeys.clipboardPageSummary(),
      exact: true,
    }));
  }

  if (payload.refreshPinned) {
    invalidations.push(queryClient.invalidateQueries({
      queryKey: queryKeys.clipboardPinnedCaptures(),
      exact: true,
    }));
  }

  if (payload.refreshDashboard) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.aiSystemSnapshot() }));
  }

  return Promise.all(invalidations).then(() => undefined);
}
