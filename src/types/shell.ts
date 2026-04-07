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
  AppSettings as RustAppSettings,
  AppShortcutOverride as RustAppShortcutOverride,
  BatchDecisionCluster as RustBatchDecisionCluster,
  BatchDecisionReview as RustBatchDecisionReview,
  CapturePreview as RustCapturePreview,
  ClipboardPage as RustClipboardPage,
  ClipboardPageRequest as RustClipboardPageRequest,
  DashboardSnapshot as RustDashboardSnapshot,
  DeleteClipboardCaptureResult as RustDeleteClipboardCaptureResult,
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
export type ShortcutOverrideRecord = NonNullable<RustAppSettings["shortcutOverrides"]>;

export type SettingsDraft = Omit<
  RustAppSettings,
  | "knowledgeRoot"
  | "runtimeProviderProfiles"
  | "activeRuntimeProviderId"
  | "localePreference"
  | "clipboardHistoryDays"
  | "shortcutOverrides"
> & {
  knowledgeRoot: string;
  runtimeProviderProfiles: RuntimeProviderProfile[];
  activeRuntimeProviderId: string;
  localePreference: AppLocalePreference;
  clipboardHistoryDays: number;
  shortcutOverrides: ShortcutOverrideRecord;
};

export type ClipboardHistoryFilter = "all" | "text" | "link" | "image";

export type ClipboardPageRequest = Omit<RustClipboardPageRequest, "search" | "filter"> & {
  search?: string | null;
  filter?: ClipboardHistoryFilter | null;
};

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
