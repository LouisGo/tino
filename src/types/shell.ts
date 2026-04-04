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

export interface SettingsDraft {
  knowledgeRoot: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}
