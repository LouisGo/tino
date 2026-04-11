import dayjs from "dayjs";

import type {
  ClipboardBoardBootstrap,
  ClipboardCapture,
  ClipboardPageResult,
  PinnedClipboardCapture,
} from "@/types/shell";

export function createClipboardCapture(
  overrides: Partial<ClipboardCapture> = {},
): ClipboardCapture {
  return {
    id: "cap_default",
    source: "clipboard",
    sourceAppName: "Safari",
    sourceAppBundleId: "com.apple.Safari",
    sourceAppIconPath: null,
    contentKind: "plain_text",
    preview: "Default clipboard capture",
    secondaryPreview: null,
    capturedAt: dayjs().toISOString(),
    status: "archived",
    rawText: "Default clipboard capture",
    ocrText: null,
    fileMissing: false,
    rawRich: null,
    rawRichFormat: null,
    linkUrl: null,
    assetPath: null,
    thumbnailPath: null,
    imageWidth: null,
    imageHeight: null,
    byteSize: null,
    ...overrides,
  };
}

export function createPinnedClipboardCapture(
  overrides: Partial<PinnedClipboardCapture> = {},
): PinnedClipboardCapture {
  return {
    capture: createClipboardCapture({
      id: "cap_pinned",
      preview: "Pinned capture",
      rawText: "Pinned capture",
    }),
    pinnedAt: dayjs().toISOString(),
    ...overrides,
  };
}

export function createClipboardPageResult(
  overrides: Partial<ClipboardPageResult> = {},
): ClipboardPageResult {
  return {
    captures: [],
    page: 0,
    pageSize: 40,
    total: 0,
    hasMore: false,
    historyDays: 7,
    summary: {
      total: 0,
      text: 0,
      links: 0,
      images: 0,
      videos: 0,
      files: 0,
    },
    ...overrides,
  };
}

export function createClipboardBoardBootstrap(
  overrides: Partial<ClipboardBoardBootstrap> = {},
): ClipboardBoardBootstrap {
  return {
    page: createClipboardPageResult(),
    pinnedCaptures: [],
    ...overrides,
  };
}
