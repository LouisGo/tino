import { convertFileSrc } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";

import { commands as tauriCommands, events as tauriEvents } from "@/bindings/tauri";
import {
  defaultAppLocalePreference,
  LOCALE_PREFERENCE_CHANGED_EVENT,
  normalizeAppLocalePreference,
  syncLocalePreference,
} from "@/i18n";
import { DEFAULT_CLIPBOARD_HISTORY_DAYS } from "@/lib/app-defaults";
import { appEnv, dataChannel, isProductionDataChannel } from "@/lib/runtime-profile";
import { isTauriRuntime, unwrapTauriResult } from "@/lib/tauri-core";
import type {
  AiSystemUpdated as RustAiSystemUpdated,
  AppSettingsChanged as RustAppSettingsChanged,
  AppSettings as RustAppSettings,
  CapturePreview as RustCapturePreview,
  ClipboardBoardBootstrap as RustClipboardBoardBootstrap,
  ClipboardCapturesUpdated as RustClipboardCapturesUpdated,
  ClipboardPage as RustClipboardPage,
  ClipboardSourceAppIconResult as RustClipboardSourceAppIconResult,
  ClipboardSourceAppOption as RustClipboardSourceAppOption,
  ClipboardSourceAppRule as RustClipboardSourceAppRule,
  DashboardSnapshot as RustDashboardSnapshot,
  HomeChatConversationDetail as RustHomeChatConversationDetail,
  HomeChatConversationSummary as RustHomeChatConversationSummary,
  HomeChatConversationsUpdated as RustHomeChatConversationsUpdated,
  HomeChatMessage as RustHomeChatMessage,
  PinnedClipboardCapture as RustPinnedClipboardCapture,
  RuntimeProviderProfile as RustRuntimeProviderProfile,
} from "@/bindings/tauri";
import { minutesAgoIsoString, nowIsoString } from "@/lib/time";
import type {
  AiSystemUpdatedPayload,
  AiSystemSnapshot,
  AppSettingsChangedPayload,
  ClipboardBoardBootstrap,
  ClipboardCapture,
  ClipboardCapturesUpdatedPayload,
  ClipboardPageRequest,
  ClipboardSourceAppIconResult,
  ClipboardSourceAppOption,
  ClipboardSourceAppRule,
  DeleteClipboardCaptureResult,
  ClipboardPageResult,
  DashboardSnapshot,
  HomeChatConversationDetail,
  HomeChatConversationSummary,
  HomeChatConversationsUpdatedPayload,
  HomeChatMessage,
  HomeChatConversationTitleSource,
  HomeChatConversationTitleStatus,
  HomeChatMessageStatus,
  PinnedClipboardCapture,
  RuntimeProviderProfile,
  SettingsDraft,
  UpdateClipboardPinResult,
} from "@/types/shell";

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
  revision: 0,
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
  backgroundCompileWriteMode: "sandbox_only",
  localePreference: defaultAppLocalePreference(),
  clipboardHistoryDays: DEFAULT_CLIPBOARD_HISTORY_DAYS,
  clipboardCaptureEnabled: true,
  clipboardExcludedSourceApps: [],
  clipboardExcludedKeywords: [],
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
    ? "~/Library/Application Support/Tino/production"
    : "~/Library/Application Support/Tino/shared",
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
      thumbnailPath: mockImageAsset,
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

const mockAiSystemSnapshot: AiSystemSnapshot = {
  phase: "background_compiler",
  capability: {
    interactiveConfigured: true,
    backgroundCompileConfigured: true,
    backgroundSourceKind: "provider_profile",
    backgroundSourceLabel: "DeepSeek Preview",
    backgroundSourceReason:
      "Background compile uses a DeepSeek-compatible profile and writes through the Rust runtime.",
    activeProviderId: "provider_mock_primary",
    activeProviderName: "DeepSeek Preview",
    activeVendor: "deepseek",
  },
  backgroundCompileWriteMode: "sandbox_only",
  runtime: {
    status: "idle",
    observedPendingCaptureCount: 12,
    observedBatchBacklogCount: 2,
    activeJob: null,
    lastTransitionAt: minutesAgoIsoString(6),
    lastError: null,
  },
  feedbackEventCount: 4,
  latestQualitySnapshot: {
    id: "quality_mock_001",
    generatedAt: minutesAgoIsoString(14),
    totalFeedbackEvents: 4,
    classificationFeedbackCount: 3,
    correctionEventCount: 1,
    correctionRate: 0.25,
    topicConfirmedCount: 2,
    topicReassignedCount: 1,
    inboxRerouteCount: 1,
    restoredToTopicCount: 0,
    discardedCount: 0,
    retainedCount: 0,
    deletedCount: 0,
    viewedCount: 2,
    lastFeedbackAt: minutesAgoIsoString(18),
  },
  recentJobs: [
    {
      id: "job_mock_002",
      status: "running",
      queuedAt: minutesAgoIsoString(4),
      startedAt: minutesAgoIsoString(3),
      finishedAt: null,
      attempt: 1,
      input: {
        batchId: "batch_mock_002",
        trigger: "capture_count",
        captureCount: 20,
        sourceCaptureIds: ["cap_020", "cap_021", "cap_022"],
        firstCapturedAt: minutesAgoIsoString(18),
        lastCapturedAt: minutesAgoIsoString(4),
      },
      decisions: [],
      persistedWrites: [],
      failureReason: null,
    },
    {
      id: "job_mock_001",
      status: "persisted",
      queuedAt: minutesAgoIsoString(36),
      startedAt: minutesAgoIsoString(35),
      finishedAt: minutesAgoIsoString(31),
      attempt: 1,
      input: {
        batchId: "batch_mock_001",
        trigger: "max_wait",
        captureCount: 9,
        sourceCaptureIds: ["cap_011", "cap_012"],
        firstCapturedAt: minutesAgoIsoString(52),
        lastCapturedAt: minutesAgoIsoString(34),
      },
      decisions: [
        {
          decisionId: "decision_mock_001",
          disposition: "write_topic",
          sourceCaptureIds: ["cap_011", "cap_012"],
          topicSlug: "rust-ai-runtime",
          topicName: "Rust AI Runtime",
          title: "Rust AI runtime notes",
          summary: "Background compiler runtime notes were persisted into the knowledge layer.",
          keyPoints: ["Rust owns trusted persistence."],
          tags: ["rust", "runtime"],
          confidence: 0.86,
          rationale: "Strong overlap with durable runtime knowledge.",
        },
      ],
      persistedWrites: [
        {
          writeId: "write_mock_001",
          jobId: "job_mock_001",
          decisionId: "decision_mock_001",
          destination: "topic",
          knowledgePath: "topics/rust-ai-runtime.md",
          topicSlug: "rust-ai-runtime",
          topicName: "Rust AI Runtime",
          title: "Rust AI runtime notes",
          sourceCaptureIds: ["cap_011", "cap_012"],
          persistedAt: minutesAgoIsoString(31),
        },
      ],
      failureReason: null,
    },
  ],
  recentWrites: [
    {
      writeId: "write_mock_002",
      jobId: "job_mock_002",
      decisionId: "decision_mock_002",
      destination: "inbox",
      knowledgePath: "_inbox/2026-04-21.md",
      topicSlug: null,
      topicName: null,
      title: "Loose provider relay notes",
      sourceCaptureIds: ["cap_020"],
      persistedAt: minutesAgoIsoString(9),
    },
    {
      writeId: "write_mock_001",
      jobId: "job_mock_001",
      decisionId: "decision_mock_001",
      destination: "topic",
      knowledgePath: "topics/rust-ai-runtime.md",
      topicSlug: "rust-ai-runtime",
      topicName: "Rust AI Runtime",
      title: "Rust AI runtime notes",
      sourceCaptureIds: ["cap_011", "cap_012"],
      persistedAt: minutesAgoIsoString(31),
    },
  ],
};

let mockRecentCaptures = [...mockSnapshot.recentCaptures];
let mockPinnedCaptures: PinnedClipboardCapture[] = [];
let mockHomeChatIdCounter = 0;
const mockHomeChatConversations: HomeChatConversationDetail[] = [];
const mockClipboardSourceApps: ClipboardSourceAppOption[] = [
  {
    bundleId: "com.apple.Safari",
    appName: "Safari",
    appPath: "/Applications/Safari.app",
    iconPath: mockImageAsset,
  },
  {
    bundleId: "com.apple.finder",
    appName: "Finder",
    appPath: "/System/Library/CoreServices/Finder.app",
    iconPath: mockImageAsset,
  },
  {
    bundleId: "abnerworks.Typora",
    appName: "Typora",
    appPath: "/Applications/Typora.app",
    iconPath: mockImageAsset,
  },
  {
    bundleId: "com.bjango.cleanshotx",
    appName: "CleanShot X",
    appPath: "/Applications/CleanShot X.app",
    iconPath: mockImageAsset,
  },
];

function getMockSnapshot(): DashboardSnapshot {
  return {
    ...mockSnapshot,
    recentCaptures: mockRecentCaptures,
  };
}

function createMockHomeChatId(prefix: string) {
  mockHomeChatIdCounter += 1;
  return `${prefix}_${mockHomeChatIdCounter}`;
}

function buildMockHomeChatPreview(text: string) {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return null;
  }

  return collapsed.length > 120 ? `${collapsed.slice(0, 119)}…` : collapsed;
}

function getMockHomeChatConversationDetail(
  conversationId: string,
): HomeChatConversationDetail {
  const detail = mockHomeChatConversations.find(
    (item) => item.conversation.id === conversationId,
  );
  if (!detail) {
    throw new Error("Conversation not found.");
  }

  return structuredClone(detail);
}

function upsertMockHomeChatConversation(detail: HomeChatConversationDetail) {
  const existingIndex = mockHomeChatConversations.findIndex(
    (item) => item.conversation.id === detail.conversation.id,
  );

  if (existingIndex >= 0) {
    mockHomeChatConversations[existingIndex] = structuredClone(detail);
    return;
  }

  mockHomeChatConversations.unshift(structuredClone(detail));
}

function sortMockHomeChatConversations() {
  mockHomeChatConversations.sort((left, right) =>
    right.conversation.lastMessageAt.localeCompare(left.conversation.lastMessageAt));
}

function createMockConversation(
  initialUserMessage: string,
): HomeChatConversationDetail {
  const now = nowIsoString();
  const conversationId = createMockHomeChatId("conv");
  const message: HomeChatMessage = {
    id: createMockHomeChatId("msg"),
    conversationId,
    ordinal: 1,
    role: "user",
    content: initialUserMessage.trim(),
    reasoningText: null,
    status: "completed",
    errorMessage: null,
    providerLabel: null,
    responseModel: null,
    createdAt: now,
    updatedAt: now,
  };
  const detail: HomeChatConversationDetail = {
    conversation: {
      id: conversationId,
      title: null,
      titleStatus: "pending",
      titleSource: null,
      previewText: buildMockHomeChatPreview(message.content),
      messageCount: 1,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    },
    messages: [message],
  };
  upsertMockHomeChatConversation(detail);
  sortMockHomeChatConversations();
  return structuredClone(detail);
}

function appendMockConversationUserMessage(
  conversationId: string,
  userMessage: string,
): HomeChatConversationDetail {
  const detail = getMockHomeChatConversationDetail(conversationId);
  const now = nowIsoString();
  detail.messages.push({
    id: createMockHomeChatId("msg"),
    conversationId,
    ordinal: detail.messages.length + 1,
    role: "user",
    content: userMessage.trim(),
    reasoningText: null,
    status: "completed",
    errorMessage: null,
    providerLabel: null,
    responseModel: null,
    createdAt: now,
    updatedAt: now,
  });
  detail.conversation.previewText = buildMockHomeChatPreview(userMessage);
  detail.conversation.messageCount = detail.messages.length;
  detail.conversation.updatedAt = now;
  detail.conversation.lastMessageAt = now;
  upsertMockHomeChatConversation(detail);
  sortMockHomeChatConversations();
  return structuredClone(detail);
}

function replaceMockLatestAssistantMessage(options: {
  conversationId: string;
  content: string;
  reasoningText?: string | null;
  status: HomeChatMessageStatus;
  errorMessage?: string | null;
  providerLabel?: string | null;
  responseModel?: string | null;
}): HomeChatConversationDetail {
  const detail = getMockHomeChatConversationDetail(options.conversationId);
  const now = nowIsoString();
  const latestMessage = detail.messages.at(-1);
  const nextMessage: HomeChatMessage = {
    id:
      latestMessage?.role === "assistant"
        ? latestMessage.id
        : createMockHomeChatId("msg"),
    conversationId: options.conversationId,
    ordinal:
      latestMessage?.role === "assistant"
        ? latestMessage.ordinal
        : detail.messages.length + 1,
    role: "assistant",
    content: options.content,
    reasoningText: options.reasoningText ?? null,
    status: options.status,
    errorMessage: options.errorMessage ?? null,
    providerLabel: options.providerLabel ?? null,
    responseModel: options.responseModel ?? null,
    createdAt:
      latestMessage?.role === "assistant"
        ? latestMessage.createdAt
        : now,
    updatedAt: now,
  };

  if (latestMessage?.role === "assistant") {
    detail.messages[detail.messages.length - 1] = nextMessage;
  } else {
    detail.messages.push(nextMessage);
  }

  detail.conversation.previewText =
    buildMockHomeChatPreview(options.content)
    ?? buildMockHomeChatPreview(options.errorMessage ?? "");
  detail.conversation.messageCount = detail.messages.length;
  detail.conversation.updatedAt = now;
  detail.conversation.lastMessageAt = now;
  upsertMockHomeChatConversation(detail);
  sortMockHomeChatConversations();
  return structuredClone(detail);
}

function rewriteMockLatestUserMessage(
  conversationId: string,
  userMessage: string,
): HomeChatConversationDetail {
  const detail = getMockHomeChatConversationDetail(conversationId);
  const latestUserIndex = [...detail.messages]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find((entry) => entry.message.role === "user")?.index;

  if (latestUserIndex === undefined) {
    throw new Error("No user message found for the conversation.");
  }

  const now = nowIsoString();
  detail.messages = detail.messages.slice(0, latestUserIndex + 1);
  detail.messages[latestUserIndex] = {
    ...detail.messages[latestUserIndex],
    content: userMessage.trim(),
    status: "completed",
    errorMessage: null,
    updatedAt: now,
  };
  detail.conversation.previewText = buildMockHomeChatPreview(userMessage);
  detail.conversation.messageCount = detail.messages.length;
  detail.conversation.updatedAt = now;
  detail.conversation.lastMessageAt = now;
  upsertMockHomeChatConversation(detail);
  sortMockHomeChatConversations();
  return structuredClone(detail);
}

function updateMockConversationTitle(options: {
  conversationId: string;
  title: string;
  titleStatus: HomeChatConversationTitleStatus;
  titleSource: HomeChatConversationTitleSource;
}): HomeChatConversationSummary {
  const detail = getMockHomeChatConversationDetail(options.conversationId);
  const now = nowIsoString();
  detail.conversation.title = options.title.trim();
  detail.conversation.titleStatus = options.titleStatus;
  detail.conversation.titleSource = options.titleSource;
  detail.conversation.updatedAt = now;
  upsertMockHomeChatConversation(detail);
  sortMockHomeChatConversations();
  return structuredClone(detail.conversation);
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
    linkMetadata: capture.linkMetadata
      ? {
          title: capture.linkMetadata.title ?? null,
          description: capture.linkMetadata.description ?? null,
          iconPath: capture.linkMetadata.iconPath ?? null,
          fetchedAt: capture.linkMetadata.fetchedAt ?? "",
          fetchStatus: capture.linkMetadata.fetchStatus ?? "pending",
        }
      : null,
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

function normalizeClipboardSourceAppRule(
  rule: RustClipboardSourceAppRule,
): ClipboardSourceAppRule {
  return {
    bundleId: rule.bundleId,
    appName: rule.appName,
  };
}

function normalizeClipboardSourceAppOption(
  option: RustClipboardSourceAppOption,
): ClipboardSourceAppOption {
  return {
    bundleId: option.bundleId,
    appName: option.appName,
    appPath: option.appPath ?? null,
    iconPath: option.iconPath ?? null,
  };
}

function normalizeClipboardSourceAppIconResult(
  result: RustClipboardSourceAppIconResult,
): ClipboardSourceAppIconResult {
  return {
    appPath: result.appPath,
    iconPath: result.iconPath ?? null,
  };
}

function normalizeSettingsDraft(settings: RustAppSettings): SettingsDraft {
  return {
    revision: settings.revision ?? 0,
    knowledgeRoot: settings.knowledgeRoot,
    runtimeProviderProfiles:
      settings.runtimeProviderProfiles.map(normalizeRuntimeProviderProfile),
    activeRuntimeProviderId: settings.activeRuntimeProviderId,
    backgroundCompileWriteMode: settings.backgroundCompileWriteMode ?? "sandbox_only",
    localePreference: normalizeAppLocalePreference(settings.localePreference),
    clipboardHistoryDays: settings.clipboardHistoryDays ?? DEFAULT_CLIPBOARD_HISTORY_DAYS,
    clipboardCaptureEnabled: settings.clipboardCaptureEnabled ?? true,
    clipboardExcludedSourceApps:
      (settings.clipboardExcludedSourceApps ?? []).map(normalizeClipboardSourceAppRule),
    clipboardExcludedKeywords: settings.clipboardExcludedKeywords ?? [],
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

function normalizeHomeChatMessage(message: RustHomeChatMessage): HomeChatMessage {
  return message;
}

function normalizeHomeChatConversationSummary(
  summary: RustHomeChatConversationSummary,
): HomeChatConversationSummary {
  return summary;
}

function normalizeHomeChatConversationDetail(
  detail: RustHomeChatConversationDetail,
): HomeChatConversationDetail {
  return {
    conversation: normalizeHomeChatConversationSummary(detail.conversation),
    messages: detail.messages.map(normalizeHomeChatMessage),
  };
}

function normalizeClipboardBoardBootstrap(
  bootstrap: RustClipboardBoardBootstrap,
): ClipboardBoardBootstrap {
  return {
    page: normalizeClipboardPageResult(bootstrap.page),
    pinnedCaptures: bootstrap.pinnedCaptures.map(normalizePinnedClipboardCapture),
  };
}

function normalizeAppSettingsChangedPayload(
  payload: RustAppSettingsChanged,
): AppSettingsChangedPayload {
  return {
    previous: payload.previous ? normalizeSettingsDraft(payload.previous) : null,
    saved: normalizeSettingsDraft(payload.saved),
    sourceWindowLabel: payload.sourceWindowLabel ?? null,
  };
}

function normalizeAiSystemUpdatedPayload(
  payload: RustAiSystemUpdated,
): AiSystemUpdatedPayload {
  return {
    reason: payload.reason,
    refreshSnapshot: payload.refreshSnapshot ?? true,
  };
}

function normalizeClipboardCapturesUpdatedPayload(
  payload: RustClipboardCapturesUpdated,
): ClipboardCapturesUpdatedPayload {
  return {
    reason: payload.reason,
    refreshHistory: payload.refreshHistory,
    refreshPinned: payload.refreshPinned,
    refreshDashboard: payload.refreshDashboard,
  };
}

function normalizeHomeChatConversationsUpdatedPayload(
  payload: RustHomeChatConversationsUpdated,
): HomeChatConversationsUpdatedPayload {
  return payload;
}

export const appSettingsChangedEvent = {
  listen: (
    callback: (event: { payload: AppSettingsChangedPayload }) => void | Promise<void>,
  ) =>
    tauriEvents.appSettingsChanged.listen((event) =>
      callback({
        ...event,
        payload: normalizeAppSettingsChangedPayload(event.payload),
      })),
};

export const aiSystemUpdatedEvent = {
  listen: (
    callback: (event: { payload: AiSystemUpdatedPayload }) => void | Promise<void>,
  ) =>
    tauriEvents.aiSystemUpdated.listen((event) =>
      callback({
        ...event,
        payload: normalizeAiSystemUpdatedPayload(event.payload),
      })),
  emit: (payload: AiSystemUpdatedPayload) =>
    tauriEvents.aiSystemUpdated.emit(payload),
};

export const clipboardCapturesUpdatedEvent = {
  listen: (
    callback: (event: { payload: ClipboardCapturesUpdatedPayload }) => void | Promise<void>,
  ) =>
    tauriEvents.clipboardCapturesUpdated.listen((event) =>
      callback({
        ...event,
        payload: normalizeClipboardCapturesUpdatedPayload(event.payload),
      })),
  emit: (payload: ClipboardCapturesUpdatedPayload) =>
    tauriEvents.clipboardCapturesUpdated.emit(payload),
};

export const homeChatConversationsUpdatedEvent = {
  listen: (
    callback: (event: { payload: HomeChatConversationsUpdatedPayload }) => void | Promise<void>,
  ) =>
    tauriEvents.homeChatConversationsUpdated.listen((event) =>
      callback({
        ...event,
        payload: normalizeHomeChatConversationsUpdatedPayload(event.payload),
      })),
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!isTauriRuntime()) {
    return getMockSnapshot();
  }

  return normalizeDashboardSnapshot(
    await unwrapTauriResult(tauriCommands.getDashboardSnapshot()),
  );
}

export async function getAiSystemSnapshot(): Promise<AiSystemSnapshot> {
  if (!isTauriRuntime()) {
    return mockAiSystemSnapshot;
  }

  return await unwrapTauriResult(tauriCommands.getAiSystemSnapshot());
}

export async function listHomeChatConversations(): Promise<HomeChatConversationSummary[]> {
  if (!isTauriRuntime()) {
    sortMockHomeChatConversations();
    return mockHomeChatConversations.map((item) => structuredClone(item.conversation));
  }

  const conversations = await unwrapTauriResult(tauriCommands.listHomeChatConversations());
  return conversations.map(normalizeHomeChatConversationSummary);
}

export async function getHomeChatConversation(
  conversationId: string,
): Promise<HomeChatConversationDetail> {
  if (!isTauriRuntime()) {
    return getMockHomeChatConversationDetail(conversationId);
  }

  return normalizeHomeChatConversationDetail(
    await unwrapTauriResult(tauriCommands.getHomeChatConversation(conversationId)),
  );
}

export async function createHomeChatConversation(
  initialUserMessage: string,
): Promise<HomeChatConversationDetail> {
  if (!isTauriRuntime()) {
    return createMockConversation(initialUserMessage);
  }

  return normalizeHomeChatConversationDetail(
    await unwrapTauriResult(tauriCommands.createHomeChatConversation({
      initialUserMessage,
    })),
  );
}

export async function appendHomeChatUserMessage(
  conversationId: string,
  userMessage: string,
): Promise<HomeChatConversationDetail> {
  if (!isTauriRuntime()) {
    return appendMockConversationUserMessage(conversationId, userMessage);
  }

  return normalizeHomeChatConversationDetail(
    await unwrapTauriResult(tauriCommands.appendHomeChatUserMessage({
      conversationId,
      userMessage,
    })),
  );
}

export async function replaceLatestHomeChatAssistantMessage(options: {
  conversationId: string;
  content: string;
  reasoningText?: string | null;
  status: HomeChatMessageStatus;
  errorMessage?: string | null;
  providerLabel?: string | null;
  responseModel?: string | null;
}): Promise<HomeChatConversationDetail> {
  if (!isTauriRuntime()) {
    return replaceMockLatestAssistantMessage(options);
  }

  return normalizeHomeChatConversationDetail(
    await unwrapTauriResult(tauriCommands.replaceLatestHomeChatAssistantMessage({
      conversationId: options.conversationId,
      content: options.content,
      reasoningText: options.reasoningText ?? null,
      status: options.status,
      errorMessage: options.errorMessage ?? null,
      providerLabel: options.providerLabel ?? null,
      responseModel: options.responseModel ?? null,
    })),
  );
}

export async function rewriteLatestHomeChatUserMessage(
  conversationId: string,
  userMessage: string,
): Promise<HomeChatConversationDetail> {
  if (!isTauriRuntime()) {
    return rewriteMockLatestUserMessage(conversationId, userMessage);
  }

  return normalizeHomeChatConversationDetail(
    await unwrapTauriResult(tauriCommands.rewriteLatestHomeChatUserMessage({
      conversationId,
      userMessage,
    })),
  );
}

export async function updateHomeChatConversationTitle(options: {
  conversationId: string;
  title: string;
  titleStatus: HomeChatConversationTitleStatus;
  titleSource: HomeChatConversationTitleSource;
}): Promise<HomeChatConversationSummary> {
  if (!isTauriRuntime()) {
    return updateMockConversationTitle(options);
  }

  return normalizeHomeChatConversationSummary(
    await unwrapTauriResult(tauriCommands.updateHomeChatConversationTitle({
      conversationId: options.conversationId,
      title: options.title,
      titleStatus: options.titleStatus,
      titleSource: options.titleSource,
    })),
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

export async function getClipboardBoardBootstrap(): Promise<ClipboardBoardBootstrap> {
  if (!isTauriRuntime()) {
    return {
      page: await getClipboardPage({
        page: 0,
        pageSize: 40,
        filter: "all",
      }),
      pinnedCaptures: await getPinnedClipboardCaptures(),
    };
  }

  return normalizeClipboardBoardBootstrap(
    await unwrapTauriResult(tauriCommands.getClipboardBoardBootstrap()),
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

export async function listClipboardSourceApps(): Promise<ClipboardSourceAppOption[]> {
  if (!isTauriRuntime()) {
    return mockClipboardSourceApps;
  }

  const options = await unwrapTauriResult(tauriCommands.listClipboardSourceApps());
  return options.map(normalizeClipboardSourceAppOption);
}

export async function getClipboardSourceAppIcons(
  appPaths: string[],
): Promise<ClipboardSourceAppIconResult[]> {
  if (!isTauriRuntime()) {
    return appPaths.map((appPath) => ({
      appPath,
      iconPath:
        mockClipboardSourceApps.find((option) => option.appPath === appPath)?.iconPath ?? null,
    }));
  }

  const icons = await unwrapTauriResult(tauriCommands.getClipboardSourceAppIcons(appPaths));
  return icons.map(normalizeClipboardSourceAppIconResult);
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
