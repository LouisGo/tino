export const queryKeys = {
  dashboardSnapshot: () => ["dashboard-snapshot"] as const,
  appSettings: () => ["app-settings"] as const,
  autostartEnabled: () => ["autostart-enabled"] as const,
  clipboardPageBase: () => ["clipboard-page"] as const,
  clipboardPage: (filter: string, search: string) =>
    [...queryKeys.clipboardPageBase(), filter, search] as const,
  clipboardPageSummary: () => ["clipboard-page-summary"] as const,
};
