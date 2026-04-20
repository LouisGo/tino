import type {
  AiBatchCapture as RustAiBatchCapture,
  AiBatchPayload as RustAiBatchPayload,
  AiBatchRuntimeState as RustAiBatchRuntimeState,
  AiBatchSummary as RustAiBatchSummary,
  AiDecision as RustAiDecision,
  ApplyBatchDecisionRequest as RustApplyBatchDecisionRequest,
  ApplyBatchDecisionResult as RustApplyBatchDecisionResult,
  AppLocale as RustAppLocale,
  AppLocaleMode as RustAppLocaleMode,
  AppLocalePreference as RustAppLocalePreference,
  AppSettingsChanged as RustAppSettingsChanged,
  AppSettings as RustAppSettings,
  AppShortcutOverride as RustAppShortcutOverride,
  BatchDecisionCluster as RustBatchDecisionCluster,
  BatchDecisionReview as RustBatchDecisionReview,
  CapturePreview as RustCapturePreview,
  ClipboardBoardBootstrap as RustClipboardBoardBootstrap,
  ClipboardCapturesUpdated as RustClipboardCapturesUpdated,
  ClipboardCapturesUpdatedReason as RustClipboardCapturesUpdatedReason,
  ClipboardPage as RustClipboardPage,
  ClipboardPageRequest as RustClipboardPageRequest,
  ClipboardSourceAppIconResult as RustClipboardSourceAppIconResult,
  ClipboardSourceAppOption as RustClipboardSourceAppOption,
  ClipboardSourceAppRule as RustClipboardSourceAppRule,
  DashboardSnapshot as RustDashboardSnapshot,
  DeleteClipboardCaptureResult as RustDeleteClipboardCaptureResult,
  HomeChatConversationDetail as RustHomeChatConversationDetail,
  HomeChatConversationSummary as RustHomeChatConversationSummary,
  HomeChatConversationTitleSource as RustHomeChatConversationTitleSource,
  HomeChatConversationTitleStatus as RustHomeChatConversationTitleStatus,
  HomeChatConversationsUpdated as RustHomeChatConversationsUpdated,
  HomeChatConversationsUpdatedReason as RustHomeChatConversationsUpdatedReason,
  HomeChatMessage as RustHomeChatMessage,
  HomeChatMessageRole as RustHomeChatMessageRole,
  HomeChatMessageStatus as RustHomeChatMessageStatus,
  PinnedClipboardCapture as RustPinnedClipboardCapture,
  ReviewAction as RustReviewAction,
  ReviewFeedbackRecord as RustReviewFeedbackRecord,
  RuntimeProviderProfile as RustRuntimeProviderProfile,
  RuntimeProviderVendor as RustRuntimeProviderVendor,
  TopicIndexEntry as RustTopicIndexEntry,
  UpdateClipboardPinResult as RustUpdateClipboardPinResult,
} from "@/bindings/tauri";

type RequireKeys<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

export type ContentKind = NonNullable<RustCapturePreview["contentKind"]>;
export type CaptureStatus = NonNullable<RustCapturePreview["status"]>;

export type ClipboardCapture = RequireKeys<
  RustCapturePreview,
  "id" | "source" | "contentKind" | "preview" | "capturedAt" | "status" | "rawText"
>;

export type DashboardSnapshot = Omit<RustDashboardSnapshot, "recentCaptures"> & {
  recentCaptures: ClipboardCapture[];
};

export type ClipboardPageSummary = RustClipboardPage["summary"];

export type ClipboardPageResult = Omit<RustClipboardPage, "captures"> & {
  captures: ClipboardCapture[];
};

export type ClipboardBoardBootstrap = Omit<
  RustClipboardBoardBootstrap,
  "page" | "pinnedCaptures"
> & {
  page: ClipboardPageResult;
  pinnedCaptures: PinnedClipboardCapture[];
};

export type DeleteClipboardCaptureResult = RustDeleteClipboardCaptureResult;
export type PinnedClipboardCapture = Omit<RustPinnedClipboardCapture, "capture"> & {
  capture: ClipboardCapture;
};
export type UpdateClipboardPinResult = RustUpdateClipboardPinResult;
export type AppLocale = RustAppLocale;
export type AppLocaleMode = RustAppLocaleMode;
export type AppLocalePreference = RustAppLocalePreference;
export type AppShortcutOverride = RustAppShortcutOverride;
export type RuntimeProviderVendor = RustRuntimeProviderVendor;
export type RuntimeProviderProfile = RequireKeys<
  RustRuntimeProviderProfile,
  "id" | "name" | "vendor" | "baseUrl" | "apiKey" | "model"
>;
export type ClipboardSourceAppRule = RequireKeys<
  RustClipboardSourceAppRule,
  "bundleId" | "appName"
>;
export type ClipboardSourceAppOption = RequireKeys<
  RustClipboardSourceAppOption,
  "bundleId" | "appName"
> & {
  appPath: string | null;
  iconPath: string | null;
};
export type ClipboardSourceAppIconResult = RequireKeys<
  RustClipboardSourceAppIconResult,
  "appPath"
> & {
  iconPath: string | null;
};
export type ShortcutOverrideRecord = NonNullable<RustAppSettings["shortcutOverrides"]>;

export type SettingsDraft = Omit<
  RustAppSettings,
  | "knowledgeRoot"
  | "runtimeProviderProfiles"
  | "activeRuntimeProviderId"
  | "localePreference"
  | "clipboardHistoryDays"
  | "clipboardExcludedSourceApps"
  | "clipboardExcludedKeywords"
  | "shortcutOverrides"
> & {
  knowledgeRoot: string;
  runtimeProviderProfiles: RuntimeProviderProfile[];
  activeRuntimeProviderId: string;
  localePreference: AppLocalePreference;
  clipboardHistoryDays: number;
  clipboardExcludedSourceApps: ClipboardSourceAppRule[];
  clipboardExcludedKeywords: string[];
  shortcutOverrides: ShortcutOverrideRecord;
};

export type AppSettingsChangedPayload = Omit<
  RustAppSettingsChanged,
  "previous" | "saved"
> & {
  previous: SettingsDraft | null;
  saved: SettingsDraft;
};

export type ClipboardCapturesUpdatedReason = RustClipboardCapturesUpdatedReason;
export type ClipboardCapturesUpdatedPayload = RustClipboardCapturesUpdated;

export type ClipboardHistoryFilter = "all" | "text" | "link" | "image" | "video" | "file";

export type ClipboardPageRequest = Omit<RustClipboardPageRequest, "search" | "filter"> & {
  search?: string | null;
  filter?: ClipboardHistoryFilter | null;
};

export type HomeChatMessageRole = RustHomeChatMessageRole;
export type HomeChatMessageStatus = RustHomeChatMessageStatus;
export type HomeChatConversationTitleStatus = RustHomeChatConversationTitleStatus;
export type HomeChatConversationTitleSource = RustHomeChatConversationTitleSource;
export type HomeChatMessage = RustHomeChatMessage;
export type HomeChatConversationSummary = RustHomeChatConversationSummary;
export type HomeChatConversationDetail = RustHomeChatConversationDetail;
export type HomeChatConversationsUpdatedReason = RustHomeChatConversationsUpdatedReason;
export type HomeChatConversationsUpdatedPayload = RustHomeChatConversationsUpdated;

export type AiBatchRuntimeState = RustAiBatchRuntimeState;
export type AiDecision = RustAiDecision;
export type ReviewAction = RustReviewAction;
export type AiBatchSummary = RustAiBatchSummary;
export type AiBatchCapture = RustAiBatchCapture;
export type TopicIndexEntry = RustTopicIndexEntry;
export type BatchDecisionCluster = RustBatchDecisionCluster;
export type BatchDecisionReview = RustBatchDecisionReview;
export type ReviewFeedbackRecord = RustReviewFeedbackRecord;
export type ApplyBatchDecisionRequest = RustApplyBatchDecisionRequest;
export type ApplyBatchDecisionResult = RustApplyBatchDecisionResult;
export type AiBatchPayload = RustAiBatchPayload;
