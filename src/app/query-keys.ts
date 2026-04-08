export const queryKeys = {
  dashboardSnapshot: () => ["dashboard-snapshot"] as const,
  appSettings: () => ["app-settings"] as const,
  autostartEnabled: () => ["autostart-enabled"] as const,
  aiBatchSummaries: () => ["ai-batch-summaries"] as const,
  aiBatchPayload: (batchId: string) => ["ai-batch-payload", batchId] as const,
  topicIndexEntries: () => ["topic-index-entries"] as const,
  clipboardPageBase: () => ["clipboard-page"] as const,
  clipboardPage: (filter: string, search: string) =>
    [...queryKeys.clipboardPageBase(), filter, search] as const,
  clipboardPageSummary: () => ["clipboard-page-summary"] as const,
  clipboardPinnedCaptures: () => ["clipboard-pinned-captures"] as const,
  clipboardSourceApps: () => ["clipboard-source-apps"] as const,
};
