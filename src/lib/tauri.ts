import { convertFileSrc } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { commands as tauriCommands } from "@/bindings/tauri";
import {
  defaultAppLocalePreference,
  LOCALE_PREFERENCE_CHANGED_EVENT,
  normalizeAppLocalePreference,
  syncLocalePreference,
} from "@/i18n";
import { appEnv, dataChannel, isProductionDataChannel } from "@/lib/runtime-profile";
import { isTauriRuntime, unwrapTauriResult } from "@/lib/tauri-core";
import type {
  AppSettings as RustAppSettings,
  CapturePreview as RustCapturePreview,
  ClipboardPage as RustClipboardPage,
  DashboardSnapshot as RustDashboardSnapshot,
  PinnedClipboardCapture as RustPinnedClipboardCapture,
  RuntimeProviderProfile as RustRuntimeProviderProfile,
} from "@/bindings/tauri";
import { minutesAgoIsoString, nowIsoString } from "@/lib/time";
import type {
  ClipboardCapture,
  ClipboardPageRequest,
  DeleteClipboardCaptureResult,
  ClipboardPageResult,
  DashboardSnapshot,
  PinnedClipboardCapture,
  RuntimeProviderProfile,
  SettingsDraft,
  UpdateClipboardPinResult,
} from "@/types/shell";

export const clipboardCapturesUpdatedEvent = "clipboard-captures-updated";

export { isMacOsTauriRuntime, isTauriRuntime } from "@/lib/tauri-core";

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
  knowledgeRoot: isProductionDataChannel ? "~/tino-inbox-production" : "~/tino-inbox-preview",
  runtimeProviderProfiles: [
    {
      id: "provider_mock_primary",
      name: "Provider 1",
      vendor: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "",
    },
  ],
  activeRuntimeProviderId: "provider_mock_primary",
  localePreference: defaultAppLocalePreference(),
  clipboardHistoryDays: 3,
  shortcutOverrides: {},
};

const mockSnapshot: DashboardSnapshot = {
  appName: isProductionDataChannel ? "Tino" : "Tino Preview",
  appVersion: "0.1.0",
  buildChannel: `${appEnv} (${dataChannel})`,
  appEnv,
  dataChannel,
  os: "browser",
  defaultKnowledgeRoot: mockSettings.knowledgeRoot,
  appDataDir: isProductionDataChannel
    ? "~/Library/Application Support/com.louistation.tino.production"
    : "~/Library/Application Support/com.louistation.tino.preview",
  appLogDir: isProductionDataChannel
    ? "~/Library/Logs/com.louistation.tino.production"
    : "~/Library/Logs/com.louistation.tino.preview",
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
      ocrText: "Quarterly roadmap launch checklist",
      assetPath: mockImageAsset,
      thumbnailPath: mockImageAsset,
      imageWidth: 1280,
      imageHeight: 800,
      byteSize: 70000,
    },
    {
      id: "cap_004",
      source: "clipboard",
      sourceAppName: "Longshot",
      sourceAppBundleId: "com.chitaner.Longshot",
      sourceAppIconPath: mockImageAsset,
      contentKind: "video",
      preview: "Longshot20260407223007.mov",
      secondaryPreview: "~/Library/Containers/com.chitaner.Longshot/Data/tmp · 2.6 MB",
      capturedAt: minutesAgoIsoString(21),
      status: "archived",
      rawText: "/Users/louistation/Library/Containers/com.chitaner.Longshot/Data/tmp/Longshot20260407223007.mov",
      fileMissing: false,
      byteSize: 2726297,
    },
    {
      id: "cap_005",
      source: "clipboard",
      sourceAppName: "Finder",
      sourceAppBundleId: "com.apple.finder",
      sourceAppIconPath: mockImageAsset,
      contentKind: "file",
      preview: "insomnium-3.6.0-mac-arm64.dmg",
      secondaryPreview: "~/MySpace/Notes/temp · 197.2 MB",
      capturedAt: minutesAgoIsoString(33),
      status: "queued",
      rawText: "/Users/louistation/MySpace/Notes/temp/insomnium-3.6.0-mac-arm64.dmg",
      fileMissing: false,
      byteSize: 206779187,
    },
  ],
};

let mockRecentCaptures = [...mockSnapshot.recentCaptures];
let mockPinnedCaptures: PinnedClipboardCapture[] = [];

function getMockSnapshot(): DashboardSnapshot {
  return {
    ...mockSnapshot,
    recentCaptures: mockRecentCaptures,
  };
}

function normalizeClipboardCapture(capture: RustCapturePreview): ClipboardCapture {
  return {
    id: capture.id ?? "",
    source: capture.source ?? "",
    sourceAppName: capture.sourceAppName ?? null,
    sourceAppBundleId: capture.sourceAppBundleId ?? null,
    sourceAppIconPath: capture.sourceAppIconPath ?? null,
    contentKind: capture.contentKind ?? "plain_text",
    preview: capture.preview ?? "",
    secondaryPreview: capture.secondaryPreview ?? null,
    capturedAt: capture.capturedAt ?? "",
    status: capture.status ?? "archived",
    rawText: capture.rawText ?? "",
    ocrText: capture.ocrText ?? null,
    fileMissing: capture.fileMissing ?? false,
    rawRich: capture.rawRich ?? null,
    rawRichFormat: capture.rawRichFormat ?? null,
    linkUrl: capture.linkUrl ?? null,
    assetPath: capture.assetPath ?? null,
    thumbnailPath: capture.thumbnailPath ?? null,
    imageWidth: capture.imageWidth ?? null,
    imageHeight: capture.imageHeight ?? null,
    byteSize: capture.byteSize ?? null,
  };
}

function normalizeRuntimeProviderProfile(
  profile: RustRuntimeProviderProfile,
): RuntimeProviderProfile {
  return {
    id: profile.id,
    name: profile.name,
    vendor: profile.vendor,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model ?? "",
  };
}

function normalizeSettingsDraft(settings: RustAppSettings): SettingsDraft {
  return {
    knowledgeRoot: settings.knowledgeRoot,
    runtimeProviderProfiles:
      settings.runtimeProviderProfiles.map(normalizeRuntimeProviderProfile),
    activeRuntimeProviderId: settings.activeRuntimeProviderId,
    localePreference: normalizeAppLocalePreference(settings.localePreference),
    clipboardHistoryDays: settings.clipboardHistoryDays ?? 3,
    shortcutOverrides: settings.shortcutOverrides ?? {},
  };
}

function normalizeClipboardPageResult(page: RustClipboardPage): ClipboardPageResult {
  return {
    captures: page.captures.map(normalizeClipboardCapture),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    hasMore: page.hasMore,
    historyDays: page.historyDays,
    summary: page.summary,
  };
}

function normalizePinnedClipboardCapture(
  pinnedCapture: RustPinnedClipboardCapture,
): PinnedClipboardCapture {
  return {
    capture: normalizeClipboardCapture(
      (pinnedCapture.capture ?? {}) as RustCapturePreview,
    ),
    pinnedAt: pinnedCapture.pinnedAt ?? "",
  };
}

function normalizeDashboardSnapshot(snapshot: RustDashboardSnapshot): DashboardSnapshot {
  return {
    ...snapshot,
    recentCaptures: snapshot.recentCaptures.map(normalizeClipboardCapture),
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!isTauriRuntime()) {
    return getMockSnapshot();
  }

  return normalizeDashboardSnapshot(
    await unwrapTauriResult(tauriCommands.getDashboardSnapshot()),
  );
}

export async function getClipboardPage(
  request: ClipboardPageRequest,
): Promise<ClipboardPageResult> {
  if (!isTauriRuntime()) {
    const snapshot = getMockSnapshot();
    const pinnedCaptureIds = new Set(mockPinnedCaptures.map((entry) => entry.capture.id));
    const normalizedSearch = request.search?.trim().toLowerCase() ?? "";
    const normalizedFilter = request.filter ?? "all";
    const searchMatched = snapshot.recentCaptures.filter((capture) => {
      if (pinnedCaptureIds.has(capture.id)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        capture.preview,
        capture.secondaryPreview ?? "",
        capture.rawText,
        capture.ocrText ?? "",
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
        videos: searchMatched.filter((capture) => capture.contentKind === "video").length,
        files: searchMatched.filter((capture) => capture.contentKind === "file").length,
      },
    } satisfies ClipboardPageResult;
  }

  return normalizeClipboardPageResult(
    await unwrapTauriResult(
      tauriCommands.getClipboardPage({
        page: request.page,
        pageSize: request.pageSize,
        search: request.search ?? null,
        filter: request.filter ?? null,
      }),
    ),
  );
}

export async function getPinnedClipboardCaptures(): Promise<PinnedClipboardCapture[]> {
  if (!isTauriRuntime()) {
    return mockPinnedCaptures;
  }

  const captures = await unwrapTauriResult(tauriCommands.getPinnedClipboardCaptures());
  return captures.map(normalizePinnedClipboardCapture);
}

export async function setClipboardCapturePinned(
  capture: ClipboardCapture,
  pinned: boolean,
  replaceOldest = false,
): Promise<UpdateClipboardPinResult> {
  if (!isTauriRuntime()) {
    const existingIndex = mockPinnedCaptures.findIndex((entry) => entry.capture.id === capture.id);

    if (pinned) {
      let replacedCaptureId: string | null = null;

      if (existingIndex >= 0) {
        mockPinnedCaptures[existingIndex] = {
          ...mockPinnedCaptures[existingIndex],
          capture,
        };
      } else {
        if (mockPinnedCaptures.length >= 5) {
          if (!replaceOldest) {
            throw new Error("Pinned captures are limited to 5 items.");
          }

          replacedCaptureId = mockPinnedCaptures[0]?.capture.id ?? null;
          mockPinnedCaptures = mockPinnedCaptures.slice(1);
        }

        mockPinnedCaptures = [
          ...mockPinnedCaptures,
          {
            capture,
            pinnedAt: nowIsoString(),
          },
        ];
      }

      return {
        captureId: capture.id,
        pinned: true,
        changed: true,
        replacedCaptureId,
        pinnedCount: mockPinnedCaptures.length,
      } satisfies UpdateClipboardPinResult;
    }

    if (existingIndex < 0) {
      return {
        captureId: capture.id,
        pinned: false,
        changed: false,
        replacedCaptureId: null,
        pinnedCount: mockPinnedCaptures.length,
      } satisfies UpdateClipboardPinResult;
    }

    mockPinnedCaptures = mockPinnedCaptures.filter((entry) => entry.capture.id !== capture.id);
    return {
      captureId: capture.id,
      pinned: false,
      changed: true,
      replacedCaptureId: null,
      pinnedCount: mockPinnedCaptures.length,
    } satisfies UpdateClipboardPinResult;
  }

  return unwrapTauriResult(
    tauriCommands.setClipboardCapturePinned({
      capture,
      pinned,
      replaceOldest,
    }),
  );
}

export async function deleteClipboardCapture(
  id: string,
): Promise<DeleteClipboardCaptureResult> {
  if (!isTauriRuntime()) {
    const removedFromPinned = mockPinnedCaptures.some((entry) => entry.capture.id === id);
    mockPinnedCaptures = mockPinnedCaptures.filter((entry) => entry.capture.id !== id);
    mockRecentCaptures = mockRecentCaptures.filter((capture) => capture.id !== id);
    return {
      id,
      removedFromHistory: true,
      removedFromStore: true,
      removedFromPinned,
      deleted: true,
    } satisfies DeleteClipboardCaptureResult;
  }

  return unwrapTauriResult(tauriCommands.deleteClipboardCapture({ id }));
}

export async function getAppSettings(): Promise<SettingsDraft> {
  if (!isTauriRuntime()) {
    return mockSettings;
  }

  return normalizeSettingsDraft(await unwrapTauriResult(tauriCommands.getAppSettings()));
}

export async function reportAppActivity() {
  if (!isTauriRuntime()) {
    return;
  }

  await unwrapTauriResult(tauriCommands.reportAppActivity());
}

export async function getLogDirectory() {
  if (!isTauriRuntime()) {
    return "~/Library/Logs/com.louistation.tino";
  }

  return unwrapTauriResult(tauriCommands.getLogDirectory());
}

export async function toggleMainWindowVisibility() {
  if (!isTauriRuntime()) {
    return true;
  }

  return unwrapTauriResult(tauriCommands.toggleMainWindowVisibility());
}

export async function toggleClipboardWindowVisibility() {
  if (!isTauriRuntime()) {
    return true;
  }

  return unwrapTauriResult(tauriCommands.toggleClipboardWindowVisibility());
}

export async function saveAppSettings(settings: SettingsDraft): Promise<SettingsDraft> {
  if (!isTauriRuntime()) {
    await syncLocalePreference(settings.localePreference);
    return settings;
  }

  const saved = normalizeSettingsDraft(
    await unwrapTauriResult(tauriCommands.saveAppSettings(settings)),
  );

  await syncLocalePreference(saved.localePreference);
  void emit(LOCALE_PREFERENCE_CHANGED_EVENT, saved.localePreference);
  return saved;
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
    await unwrapTauriResult(tauriCommands.revealInFileManager(path));
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

  try {
    const parsedTarget = new URL(target);
    if (parsedTarget.protocol !== "file:") {
      await openUrl(target);
      return;
    }
  } catch {
    // Fall through to local path handling for plain filesystem paths.
  }

  if (target.startsWith("http://") || target.startsWith("https://")) {
    await openUrl(target);
    return;
  }

  await openPath(target);
}

export async function openPathInDefaultApp(path: string) {
  if (!path || !isTauriRuntime()) {
    return;
  }

  await openPath(path);
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
    await unwrapTauriResult(tauriCommands.openInPreview(path));
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

  await unwrapTauriResult(
    tauriCommands.copyCaptureToClipboard({
      captureId: capture.id,
      contentKind: capture.contentKind,
      rawText: capture.rawText,
      rawRich: capture.rawRich ?? null,
      rawRichFormat: capture.rawRichFormat ?? null,
      linkUrl: capture.linkUrl ?? null,
      assetPath: capture.assetPath ?? null,
    }),
  );
}

export async function returnCaptureToPreviousApp(capture: ClipboardCapture) {
  if (!isTauriRuntime()) {
    await copyCaptureToClipboard(capture);
    return true;
  }

  const result = await unwrapTauriResult(
    tauriCommands.returnCaptureToPreviousApp({
      captureId: capture.id,
      contentKind: capture.contentKind,
      rawText: capture.rawText,
      rawRich: capture.rawRich ?? null,
      rawRichFormat: capture.rawRichFormat ?? null,
      linkUrl: capture.linkUrl ?? null,
      assetPath: capture.assetPath ?? null,
    }),
  );

  return result.pasted;
}

export async function getClipboardWindowTargetAppName(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  return unwrapTauriResult(tauriCommands.getClipboardWindowTargetAppName());
}

export async function getAccessibilityPermissionStatus() {
  if (!isTauriRuntime()) {
    return false;
  }

  return tauriCommands.getAccessibilityPermissionStatus();
}

export async function openAccessibilitySettings() {
  if (!isTauriRuntime()) {
    return;
  }

  await unwrapTauriResult(tauriCommands.openAccessibilitySettings());
}

export async function requestAppRestart() {
  if (!isTauriRuntime()) {
    return;
  }

  await unwrapTauriResult(tauriCommands.requestAppRestart());
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
