import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import type { DashboardSnapshot, SettingsDraft } from "@/types/shell";

const mockSettings: SettingsDraft = {
  knowledgeRoot: "~/tino-inbox",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.4-mini",
};

const mockSnapshot: DashboardSnapshot = {
  appName: "Tino",
  appVersion: "0.1.0",
  buildChannel: "debug",
  os: "browser",
  defaultKnowledgeRoot: mockSettings.knowledgeRoot,
  appDataDir: "~/Library/Application Support/com.louistation.tino",
  queuePolicy: "20 captures or 10 minutes",
  captureMode: "Rust clipboard poller active",
  recentCaptures: [
    {
      id: "cap_001",
      source: "clipboard",
      contentKind: "plain_text",
      preview: "Clipboard capture pipeline writes into daily Markdown files.",
      capturedAt: new Date().toISOString(),
      status: "archived",
    },
  ],
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getDashboardSnapshot() {
  if (!isTauriRuntime()) {
    return mockSnapshot;
  }

  return invoke<DashboardSnapshot>("get_dashboard_snapshot");
}

export async function getAppSettings() {
  if (!isTauriRuntime()) {
    return mockSettings;
  }

  return invoke<SettingsDraft>("get_app_settings");
}

export async function saveAppSettings(settings: SettingsDraft) {
  if (!isTauriRuntime()) {
    return settings;
  }

  return invoke<SettingsDraft>("save_app_settings", { settings });
}

export async function pickDirectory(defaultPath?: string) {
  if (!isTauriRuntime()) {
    return defaultPath ?? mockSnapshot.defaultKnowledgeRoot;
  }

  const result = await openDialog({
    directory: true,
    multiple: false,
    defaultPath,
  });

  return typeof result === "string" ? result : null;
}

export async function revealPath(path: string) {
  if (!path || !isTauriRuntime()) {
    return;
  }

  await openPath(path);
}

export async function getAutostartEnabled() {
  if (!isTauriRuntime()) {
    return false;
  }

  return isEnabled();
}

export async function setAutostartEnabled(enabled: boolean) {
  if (!isTauriRuntime()) {
    return;
  }

  if (enabled) {
    await enable();
    return;
  }

  await disable();
}
