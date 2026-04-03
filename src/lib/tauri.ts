import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import type { DashboardSnapshot } from "@/types/shell";

const mockSnapshot: DashboardSnapshot = {
  appName: "Tino",
  appVersion: "0.1.0",
  buildChannel: "debug",
  os: "browser",
  defaultKnowledgeRoot: "~/tino-inbox",
  appDataDir: "~/Library/Application Support/com.louistation.tino",
  queuePolicy: "20 captures or 10 minutes",
  captureMode: "silent capture",
  recentCaptures: [
    {
      id: "cap_001",
      source: "clipboard",
      contentKind: "plain_text",
      preview: "Tauri menubar and tray bootstrap notes",
      capturedAt: new Date().toISOString(),
      status: "queued",
    },
    {
      id: "cap_002",
      source: "clipboard",
      contentKind: "rich_text",
      preview: "AI provider settings draft with baseURL + model",
      capturedAt: new Date(Date.now() - 1_200_000).toISOString(),
      status: "archived",
    }
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
