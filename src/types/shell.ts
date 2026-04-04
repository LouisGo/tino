import type {
  AppSettings as RustAppSettings,
  CapturePreview as RustCapturePreview,
  ClipboardPage as RustClipboardPage,
  ClipboardPageRequest as RustClipboardPageRequest,
  DashboardSnapshot as RustDashboardSnapshot,
  DeleteClipboardCaptureResult as RustDeleteClipboardCaptureResult,
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

export type SettingsDraft = RequireKeys<
  RustAppSettings,
  "knowledgeRoot" | "baseUrl" | "apiKey" | "model" | "clipboardHistoryDays"
>;

export type ClipboardHistoryFilter = "all" | "text" | "link" | "image";

export type ClipboardPageRequest = Omit<RustClipboardPageRequest, "search" | "filter"> & {
  search?: string | null;
  filter?: ClipboardHistoryFilter | null;
};
