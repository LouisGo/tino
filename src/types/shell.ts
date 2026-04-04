export type ContentKind =
  | "plain_text"
  | "rich_text"
  | "link"
  | "image"
  | "video"
  | "file";
export type CaptureStatus = "queued" | "archived" | "filtered" | "deduplicated";

export interface ClipboardCapture {
  id: string;
  source: string;
  sourceAppName?: string | null;
  sourceAppBundleId?: string | null;
  sourceAppIconPath?: string | null;
  contentKind: ContentKind;
  preview: string;
  secondaryPreview?: string | null;
  capturedAt: string;
  status: CaptureStatus;
  rawText: string;
  rawRich?: string | null;
  rawRichFormat?: string | null;
  linkUrl?: string | null;
  assetPath?: string | null;
  thumbnailPath?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  byteSize?: number | null;
}

export interface DashboardSnapshot {
  appName: string;
  appVersion: string;
  buildChannel: "debug" | "release";
  os: string;
  defaultKnowledgeRoot: string;
  appDataDir: string;
  queuePolicy: string;
  captureMode: string;
  recentCaptures: ClipboardCapture[];
}

export interface ClipboardPageSummary {
  total: number;
  text: number;
  links: number;
  images: number;
}

export interface ClipboardPageResult {
  captures: ClipboardCapture[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  historyDays: number;
  summary: ClipboardPageSummary;
}

export interface DeleteClipboardCaptureResult {
  id: string;
  removedFromHistory: boolean;
  removedFromStore: boolean;
  deleted: boolean;
}

export interface SettingsDraft {
  knowledgeRoot: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  clipboardHistoryDays: number;
}
