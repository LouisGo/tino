export type ContentKind = "plain_text" | "rich_text" | "image" | "video" | "file";
export type CaptureStatus = "queued" | "archived" | "filtered";

export interface CapturePreview {
  id: string;
  source: string;
  contentKind: ContentKind;
  preview: string;
  capturedAt: string;
  status: CaptureStatus;
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
  recentCaptures: CapturePreview[];
}

export interface SettingsDraft {
  knowledgeRoot: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}
