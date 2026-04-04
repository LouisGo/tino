import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { minutesAgoIsoString, nowIsoString } from "@/lib/time";
import type {
  ClipboardCapture,
  DeleteClipboardCaptureResult,
  ClipboardPageResult,
  DashboardSnapshot,
  SettingsDraft,
} from "@/types/shell";

export const clipboardCapturesUpdatedEvent = "clipboard-captures-updated";

const mockImageAsset = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#eef7d0" />
        <stop offset="100%" stop-color="#b8f06a" />
      </linearGradient>
    </defs>
    <rect width="1280" height="800" rx="56" fill="url(#bg)" />
    <rect x="96" y="92" width="1088" height="616" rx="36" fill="#ffffff" fill-opacity="0.78" />
    <rect x="156" y="166" width="448" height="48" rx="24" fill="#d7efaa" />
    <rect x="156" y="252" width="968" height="34" rx="17" fill="#f0f2e8" />
    <rect x="156" y="318" width="904" height="34" rx="17" fill="#f0f2e8" />
    <rect x="156" y="384" width="972" height="34" rx="17" fill="#f0f2e8" />
    <rect x="156" y="470" width="268" height="144" rx="28" fill="#aef262" />
    <rect x="464" y="470" width="664" height="144" rx="28" fill="#eff4df" />
  </svg>`,
)}`;

const mockSettings: SettingsDraft = {
  knowledgeRoot: "~/tino-inbox",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.4-mini",
  clipboardHistoryDays: 3,
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
      sourceAppName: "Typora",
      sourceAppBundleId: "abnerworks.Typora",
      sourceAppIconPath: mockImageAsset,
      contentKind: "rich_text",
      preview: "Rust capture pipeline now writes into daily Markdown files.",
      secondaryPreview: "2 lines · 85 chars",
      capturedAt: nowIsoString(),
      status: "archived",
      rawText:
        "Rust capture pipeline now writes into daily Markdown files.\nNext step is polishing the clipboard board.",
      rawRich:
        "<p>Rust capture pipeline now writes into <code>daily/*.md</code>.</p><p>Next step is polishing the clipboard board.</p>",
      rawRichFormat: "html",
    },
    {
      id: "cap_002",
      source: "clipboard",
      sourceAppName: "Safari",
      sourceAppBundleId: "com.apple.Safari",
      sourceAppIconPath: mockImageAsset,
      contentKind: "link",
      preview: "openai.com/docs/guides/text",
      secondaryPreview: "openai.com",
      capturedAt: minutesAgoIsoString(7),
      status: "queued",
      rawText: "https://openai.com/docs/guides/text",
      linkUrl: "https://openai.com/docs/guides/text",
    },
    {
      id: "cap_003",
      source: "clipboard",
      sourceAppName: "CleanShot X",
      sourceAppBundleId: "com.bjango.cleanshotx",
      sourceAppIconPath: mockImageAsset,
      contentKind: "image",
      preview: "Clipboard image",
      secondaryPreview: "1280x800 · 68.4 KB",
      capturedAt: minutesAgoIsoString(15),
      status: "archived",
      rawText: "Clipboard image · 1280x800",
      assetPath: mockImageAsset,
      thumbnailPath: mockImageAsset,
      imageWidth: 1280,
      imageHeight: 800,
      byteSize: 70000,
    },
  ],
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isMacOsTauriRuntime() {
  return (
    isTauriRuntime() &&
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.userAgent)
  );
}

export async function getDashboardSnapshot() {
  if (!isTauriRuntime()) {
    return mockSnapshot;
  }

  return invoke<DashboardSnapshot>("get_dashboard_snapshot");
}

export async function getClipboardPage(request: {
  page: number;
  pageSize: number;
  search?: string;
  filter?: "all" | "text" | "link" | "image";
}) {
  if (!isTauriRuntime()) {
    const normalizedSearch = request.search?.trim().toLowerCase() ?? "";
    const normalizedFilter = request.filter ?? "all";
    const searchMatched = mockSnapshot.recentCaptures.filter((capture) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        capture.preview,
        capture.secondaryPreview ?? "",
        capture.rawText,
        capture.linkUrl ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
    const filtered = searchMatched.filter((capture) =>
      normalizedFilter === "all"
        ? true
        : normalizedFilter === "text"
          ? capture.contentKind === "plain_text" || capture.contentKind === "rich_text"
          : capture.contentKind === normalizedFilter);
    const total = filtered.length;
    const start = request.page * request.pageSize;
    const end = Math.min(start + request.pageSize, total);
    const captures = start >= total ? [] : filtered.slice(start, end);

    return {
      captures,
      page: request.page,
      pageSize: request.pageSize,
      total,
      hasMore: end < total,
      historyDays: mockSettings.clipboardHistoryDays,
      summary: {
        total: searchMatched.length,
        text: searchMatched.filter((capture) =>
          capture.contentKind === "plain_text" || capture.contentKind === "rich_text").length,
        links: searchMatched.filter((capture) => capture.contentKind === "link").length,
        images: searchMatched.filter((capture) => capture.contentKind === "image").length,
      },
    } satisfies ClipboardPageResult;
  }

  return invoke<ClipboardPageResult>("get_clipboard_page", { request });
}

export async function deleteClipboardCapture(id: string) {
  if (!isTauriRuntime()) {
    return {
      id,
      removedFromHistory: true,
      removedFromStore: true,
      deleted: true,
    } satisfies DeleteClipboardCaptureResult;
  }

  return invoke<DeleteClipboardCaptureResult>("delete_clipboard_capture", {
    request: { id },
  });
}

export async function getAppSettings() {
  if (!isTauriRuntime()) {
    return mockSettings;
  }

  return invoke<SettingsDraft>("get_app_settings");
}

export async function getLogDirectory() {
  if (!isTauriRuntime()) {
    return "~/Library/Logs/com.louistation.tino";
  }

  return invoke<string>("get_log_directory");
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

  try {
    await invoke("reveal_in_file_manager", { path });
  } catch {
    await openPath(path);
  }
}

export async function openExternalTarget(target: string) {
  if (!target) {
    return;
  }

  if (!isTauriRuntime()) {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }

  if (target.startsWith("http://") || target.startsWith("https://")) {
    await openUrl(target);
    return;
  }

  await openPath(target);
}

export async function openImageInPreview(path: string) {
  if (!path) {
    return;
  }

  if (!isTauriRuntime()) {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    await invoke("open_in_preview", { path });
  } catch {
    await openExternalTarget(path);
  }
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

export async function copyCaptureToClipboard(capture: ClipboardCapture) {
  if (!isTauriRuntime()) {
    await navigator.clipboard.writeText(capture.linkUrl ?? capture.rawText);
    return;
  }

  await invoke("copy_capture_to_clipboard", {
    capture: {
      contentKind: capture.contentKind,
      rawText: capture.rawText,
      rawRich: capture.rawRich,
      rawRichFormat: capture.rawRichFormat,
      linkUrl: capture.linkUrl,
      assetPath: capture.assetPath,
    },
  });
}

export function resolveAssetUrl(assetPath?: string | null) {
  if (!assetPath) {
    return null;
  }

  if (assetPath.startsWith("data:") || assetPath.startsWith("blob:")) {
    return assetPath;
  }

  if (!isTauriRuntime()) {
    return assetPath;
  }

  return convertFileSrc(assetPath);
}
