import dayjs from "dayjs";

import type { TranslationKey } from "@/i18n";
import {
  getFileReferenceContentTypeLabel,
  getFileReferencePath,
  isFileReferenceContentKind,
  resolveFileReferencePreviewModel,
} from "@/features/clipboard/lib/file-reference-preview";
import { formatRelativeTimestamp } from "@/lib/time";
import type { ClipboardCapture, ContentKind } from "@/types/shell";

export type ClipboardFilter = "all" | "text" | "link" | "image" | "video" | "file";

export type ClipboardCaptureGroup = {
  key: string;
  label: string;
  kind: "pinned" | "day";
  captures: ClipboardCapture[];
};

export type ClipboardFilterOption = {
  value: ClipboardFilter;
  label: string;
  shortLabel: string;
  accentColor: string;
};

export type ClipboardDetailRow = {
  key:
    | "sourceApp"
    | "contentType"
    | "path"
    | "availability"
    | "characters"
    | "words"
    | "dimensions"
    | "imageSize"
    | "url"
    | "host"
    | "captured"
    | "bundleId";
  label: string;
  value: string;
};

type ClipboardTranslate = (
  key: TranslationKey<"clipboard">,
  options?: {
    defaultValue?: string;
    values?: Record<string, boolean | Date | null | number | string | undefined>;
  },
) => string;

type ClipboardSearchQuery = {
  rawTextTerms: string[];
  sourceTerms: string[];
  bundleTerms: string[];
  contentKindFilter: ClipboardFilter | null;
  capturedAfterEpochMs: number | null;
};

type ClipboardFilterOptionSpec = {
  value: ClipboardFilter;
  labelKey: TranslationKey<"clipboard">;
  shortLabelKey: TranslationKey<"clipboard">;
  accentColor: string;
};

const clipboardFilterOptionSpecs: ClipboardFilterOptionSpec[] = [
  {
    value: "all",
    labelKey: "filters.all.label",
    shortLabelKey: "filters.all.shortLabel",
    accentColor: "var(--muted-foreground)",
  },
  {
    value: "text",
    labelKey: "filters.text.label",
    shortLabelKey: "filters.text.shortLabel",
    accentColor: "var(--clipboard-kind-text)",
  },
  {
    value: "image",
    labelKey: "filters.image.label",
    shortLabelKey: "filters.image.shortLabel",
    accentColor: "var(--clipboard-kind-image)",
  },
  {
    value: "video",
    labelKey: "filters.video.label",
    shortLabelKey: "filters.video.shortLabel",
    accentColor: "var(--clipboard-kind-video)",
  },
  {
    value: "link",
    labelKey: "filters.link.label",
    shortLabelKey: "filters.link.shortLabel",
    accentColor: "var(--clipboard-kind-link)",
  },
  {
    value: "file",
    labelKey: "filters.file.label",
    shortLabelKey: "filters.file.shortLabel",
    accentColor: "var(--clipboard-kind-file)",
  },
];

export function getClipboardFilterOptions(t: ClipboardTranslate): ClipboardFilterOption[] {
  return clipboardFilterOptionSpecs.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    shortLabel: t(option.shortLabelKey),
    accentColor: option.accentColor,
  }));
}

export function getClipboardFilterOption(filter: ClipboardFilter, t: ClipboardTranslate) {
  const options = getClipboardFilterOptions(t);
  return options.find((option) => option.value === filter) ?? options[0];
}

export function buildClipboardSummary(captures: ClipboardCapture[]) {
  const total = captures.length;
  const text = captures.filter((capture) => isTextKind(capture.contentKind)).length;
  const links = captures.filter((capture) => capture.contentKind === "link").length;
  const images = captures.filter((capture) => capture.contentKind === "image").length;
  const videos = captures.filter((capture) => capture.contentKind === "video").length;
  const files = captures.filter((capture) => capture.contentKind === "file").length;

  return {
    total,
    text,
    links,
    images,
    videos,
    files,
  };
}

export function summarizeRatio(value: number, total: number, t: ClipboardTranslate) {
  if (total <= 0) {
    return t("board.summary.noCapturesYet");
  }

  return t("board.summary.percentOfRecent", {
    values: {
      percent: Math.round((value / total) * 100),
    },
  });
}

export function matchesFilter(contentKind: ContentKind, filter: ClipboardFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "text") {
    return isTextKind(contentKind);
  }

  return contentKind === filter;
}

export function matchesSearch(
  capture: ClipboardCapture,
  searchValue: string,
  t: ClipboardTranslate,
) {
  const query = parseClipboardSearchQuery(searchValue);

  if (query.contentKindFilter && !matchesFilter(capture.contentKind, query.contentKindFilter)) {
    return false;
  }

  if (query.capturedAfterEpochMs !== null) {
    const capturedAtEpochMs = dayjs(capture.capturedAt).valueOf();
    if (!Number.isFinite(capturedAtEpochMs) || capturedAtEpochMs < query.capturedAfterEpochMs) {
      return false;
    }
  }

  const haystack = [
    capture.source,
    captureSourceLabel(capture, t),
    capture.sourceAppBundleId ?? "",
    captureTitle(capture, t),
    captureSubtitle(capture, t),
    capture.rawText,
    capture.ocrText ?? "",
    capture.linkUrl ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const sourceHaystack = [
    capture.source,
    captureSourceLabel(capture, t),
    capture.sourceAppBundleId ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const bundleHaystack = (capture.sourceAppBundleId ?? "").toLowerCase();

  return query.rawTextTerms.every((term) => haystack.includes(term))
    && query.sourceTerms.every((term) => sourceHaystack.includes(term))
    && query.bundleTerms.every((term) => bundleHaystack.includes(term));
}

export function isTextKind(contentKind: ContentKind) {
  return contentKind === "plain_text" || contentKind === "rich_text";
}

function parseClipboardSearchQuery(searchValue: string): ClipboardSearchQuery {
  const query: ClipboardSearchQuery = {
    rawTextTerms: [],
    sourceTerms: [],
    bundleTerms: [],
    contentKindFilter: null,
    capturedAfterEpochMs: null,
  };

  for (const token of tokenizeClipboardSearch(searchValue)) {
    const normalizedToken = normalizeClipboardSearchValue(token);
    if (!normalizedToken) {
      continue;
    }

    const delimiterIndex = token.indexOf(":");
    if (delimiterIndex > 0) {
      const key = normalizeClipboardSearchValue(token.slice(0, delimiterIndex));
      const rawValue = token.slice(delimiterIndex + 1);
      const normalizedValue = normalizeClipboardSearchValue(rawValue);

      if (!normalizedValue) {
        continue;
      }

      switch (key) {
        case "app":
        case "source":
        case "src":
        case "来源":
        case "应用":
          query.sourceTerms.push(normalizedValue);
          continue;
        case "bundle":
        case "bundleid":
        case "bid":
        case "包名":
          query.bundleTerms.push(normalizedValue);
          continue;
        case "type":
        case "kind":
        case "类型": {
          const filter = normalizeClipboardSearchFilter(normalizedValue);
          if (filter) {
            query.contentKindFilter = filter;
            continue;
          }
          break;
        }
        case "date":
        case "day":
        case "日期": {
          const cutoff = normalizeClipboardSearchDate(normalizedValue);
          if (cutoff !== null) {
            query.capturedAfterEpochMs = cutoff;
            continue;
          }
          break;
        }
        default:
          break;
      }
    }

    query.rawTextTerms.push(normalizedToken);
  }

  return query;
}

function tokenizeClipboardSearch(searchValue: string) {
  const tokens: string[] = [];
  let current = "";
  let quoteDelimiter: '"' | "'" | null = null;

  for (const char of searchValue) {
    if (quoteDelimiter) {
      if (char === quoteDelimiter) {
        quoteDelimiter = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quoteDelimiter = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

function normalizeClipboardSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeClipboardSearchFilter(value: string): ClipboardFilter | null {
  switch (value) {
    case "all":
    case "全部":
      return "all";
    case "text":
    case "texts":
    case "plain_text":
    case "rich_text":
    case "文本":
    case "富文本":
      return "text";
    case "link":
    case "links":
    case "url":
    case "urls":
    case "链接":
      return "link";
    case "image":
    case "images":
    case "img":
    case "图片":
      return "image";
    case "video":
    case "videos":
    case "视频":
      return "video";
    case "file":
    case "files":
    case "文件":
      return "file";
    default:
      return null;
  }
}

function normalizeClipboardSearchDate(value: string) {
  switch (value) {
    case "today":
    case "今日":
    case "今天":
      return dayjs().startOf("day").valueOf();
    case "7d":
    case "7day":
    case "7days":
    case "7天":
      return dayjs().subtract(7, "day").valueOf();
    case "30d":
    case "30day":
    case "30days":
    case "30天":
      return dayjs().subtract(30, "day").valueOf();
    case "90d":
    case "90day":
    case "90days":
    case "90天":
      return dayjs().subtract(90, "day").valueOf();
    default:
      return null;
  }
}

export function isFileReferenceKind(contentKind: ContentKind) {
  return isFileReferenceContentKind(contentKind);
}

export function captureReferencePath(capture: ClipboardCapture) {
  return getFileReferencePath(capture);
}

export function captureTitle(capture: ClipboardCapture, t: ClipboardTranslate) {
  if (capture.contentKind === "image") {
    return capture.imageWidth && capture.imageHeight
      ? t("preview.titles.imageWithDimensions", {
          values: {
            height: capture.imageHeight,
            width: capture.imageWidth,
          },
        })
      : capture.preview || t("preview.titles.imageFallback");
  }

  if (capture.contentKind === "link") {
    return capture.preview || capture.linkUrl || t("preview.titles.linkFallback");
  }

  if (isFileReferenceKind(capture.contentKind)) {
    const model = resolveFileReferencePreviewModel(capture);
    return capture.preview || model.fileName || getFileReferenceContentTypeLabel(model, t);
  }

  const normalized = (capture.preview || capture.rawText).trim();
  if (normalized) {
    return normalized;
  }

  return capture.contentKind === "rich_text"
    ? t("preview.titles.formattedTextFallback")
    : t("preview.titles.textFallback");
}

export function captureSubtitle(capture: ClipboardCapture, t: ClipboardTranslate) {
  if (capture.contentKind === "link") {
    return extractHostname(capture.linkUrl ?? capture.rawText) ?? t("preview.titles.linkFallback");
  }

  if (capture.contentKind === "image") {
    return [
      capture.imageWidth && capture.imageHeight
        ? `${capture.imageWidth}×${capture.imageHeight}`
        : null,
      capture.byteSize ? formatBytes(capture.byteSize) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (isFileReferenceKind(capture.contentKind)) {
    return buildFileReferenceSubtitle(capture, t);
  }

  if (capture.secondaryPreview?.trim()) {
    return capture.secondaryPreview;
  }

  const lineCount = capture.rawText
    ? capture.rawText.split("\n").filter((line) => line.trim().length > 0).length
    : 0;

  return t("capture.detail.linesAndChars", {
    values: {
      chars: capture.rawText.length,
      lines: Math.max(lineCount, 1),
    },
  });
}

export function captureListSummary(capture: ClipboardCapture, t: ClipboardTranslate) {
  return captureTitle(capture, t);
}

export function captureSourceLabel(capture: ClipboardCapture, t: ClipboardTranslate) {
  return capture.sourceAppName?.trim() || capture.sourceAppBundleId?.trim() || t("capture.sourceUnknown");
}

export function groupCapturesByDay(captures: ClipboardCapture[], t: ClipboardTranslate) {
  const groups = new Map<string, ClipboardCaptureGroup>();

  for (const capture of captures) {
    const key = dayjs(capture.capturedAt).format("YYYY-MM-DD");
    const existing = groups.get(key);

    if (existing) {
      existing.captures.push(capture);
      continue;
    }

    groups.set(key, {
      key,
      label: formatCaptureGroupLabel(capture.capturedAt, t),
      kind: "day",
      captures: [capture],
    });
  }

  return Array.from(groups.values());
}

export function buildClipboardCaptureGroups({
  captures,
  pinnedCaptures,
  t,
}: {
  captures: ClipboardCapture[];
  pinnedCaptures: ClipboardCapture[];
  t: ClipboardTranslate;
}) {
  const groups = groupCapturesByDay(captures, t);

  if (pinnedCaptures.length === 0) {
    return groups;
  }

  return [
    {
      key: "pinned",
      label: t("groups.pinned"),
      kind: "pinned" as const,
      captures: pinnedCaptures,
    },
    ...groups,
  ];
}

export function getDefaultClipboardSelection(
  captures: ClipboardCapture[],
  pinnedCaptures: ClipboardCapture[],
) {
  return captures[0] ?? pinnedCaptures[0] ?? null;
}

export function getDefaultVisibleClipboardSelection(
  visibleCaptures: ClipboardCapture[],
  pinnedCaptureIds: Iterable<string>,
) {
  const pinnedIdSet = new Set(pinnedCaptureIds);

  return (
    visibleCaptures.find((capture) => !pinnedIdSet.has(capture.id))
    ?? visibleCaptures[0]
    ?? null
  );
}

export function formatKindLabel(contentKind: ContentKind, t: ClipboardTranslate) {
  switch (contentKind) {
    case "plain_text":
      return t("capture.kinds.text");
    case "rich_text":
      return t("capture.kinds.richText");
    case "link":
      return t("capture.kinds.link");
    case "image":
      return t("capture.kinds.image");
    case "video":
      return t("capture.kinds.video");
    case "file":
      return t("capture.kinds.file");
    default:
      return contentKind;
  }
}

export function formatCaptureStatus(
  status: ClipboardCapture["status"],
  t: ClipboardTranslate,
) {
  switch (status) {
    case "archived":
      return t("capture.status.archived");
    case "filtered":
      return t("capture.status.filtered");
    default:
      return status;
  }
}

export function kindBadgeClass(contentKind: ContentKind) {
  if (isTextKind(contentKind)) {
    return "app-kind-badge-text";
  }

  if (contentKind === "link") {
    return "app-kind-badge-link";
  }

  if (contentKind === "image") {
    return "app-kind-badge-image";
  }

  if (contentKind === "video") {
    return "app-kind-badge-video";
  }

  if (contentKind === "file") {
    return "app-kind-badge-file";
  }

  return "";
}

export function statusVariant(status: ClipboardCapture["status"]) {
  switch (status) {
    case "archived":
      return "success" as const;
    case "filtered":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function detailRows(capture: ClipboardCapture, t: ClipboardTranslate): ClipboardDetailRow[] {
  const rows: ClipboardDetailRow[] = [
    { key: "sourceApp", label: t("capture.detail.sourceApp"), value: captureSourceLabel(capture, t) },
    { key: "contentType", label: t("capture.detail.contentType"), value: detailContentType(capture, t) },
  ];

  if (isFileReferenceKind(capture.contentKind)) {
    const path = captureReferencePath(capture);
    if (path) {
      rows.push({ key: "path", label: t("capture.detail.path"), value: path });
    }

    if (capture.fileMissing) {
      rows.push({
        key: "availability",
        label: t("capture.detail.availability"),
        value: t("capture.detail.unavailableValue"),
      });
    }
  }

  if (isTextKind(capture.contentKind)) {
    rows.push(
      { key: "characters", label: t("capture.detail.characters"), value: `${capture.rawText.length}` },
      { key: "words", label: t("capture.detail.words"), value: `${countWords(capture.rawText)}` },
    );
  }

  if (capture.contentKind === "image") {
    if (capture.imageWidth && capture.imageHeight) {
      rows.push({
        key: "dimensions",
        label: t("capture.detail.dimensions"),
        value: `${capture.imageWidth}×${capture.imageHeight}`,
      });
    }

    if (capture.byteSize) {
      rows.push({
        key: "imageSize",
        label: t("capture.detail.imageSize"),
        value: formatBytes(capture.byteSize),
      });
    }
  }

  if (capture.contentKind === "link") {
    rows.push({
      key: "url",
      label: t("capture.detail.url"),
      value: capture.linkUrl ?? capture.rawText,
    });

    const hostname = extractHostname(capture.linkUrl ?? capture.rawText);
    if (hostname) {
      rows.push({
        key: "host",
        label: t("capture.detail.host"),
        value: hostname,
      });
    }
  }

  rows.push({
    key: "captured",
    label: t("capture.detail.captured"),
    value: formatRelativeTimestamp(capture.capturedAt),
  });

  if (capture.sourceAppBundleId && !isFileReferenceKind(capture.contentKind)) {
    rows.push({
      key: "bundleId",
      label: t("capture.detail.bundleId"),
      value: capture.sourceAppBundleId,
    });
  }

  return rows;
}

export function capturePreviewSurfaceClassName(contentKind: ClipboardCapture["contentKind"]) {
  if (contentKind === "image") {
    return "app-preview-image";
  }

  if (contentKind === "link") {
    return "app-preview-link";
  }

  if (isFileReferenceKind(contentKind)) {
    return "app-preview-file";
  }

  return "app-preview-text";
}

export function captureSurfaceClassName(capture: ClipboardCapture) {
  if (!isFileReferenceKind(capture.contentKind)) {
    return capturePreviewSurfaceClassName(capture.contentKind);
  }

  const model = resolveFileReferencePreviewModel(capture);
  return model.surfaceVariant === "image" ? "app-preview-image" : "app-preview-file";
}

export function formatBytes(byteSize: number) {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  const kib = byteSize / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }

  return `${(kib / 1024).toFixed(1)} MB`;
}

export function extractHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function formatCaptureGroupLabel(input: string, t: ClipboardTranslate) {
  const value = dayjs(input);
  const today = dayjs();

  if (value.isSame(today, "day")) {
    return t("groups.today");
  }

  if (value.isSame(today.subtract(1, "day"), "day")) {
    return t("groups.yesterday");
  }

  return value.format("YYYY-MM-DD");
}

function detailContentType(capture: ClipboardCapture, t: ClipboardTranslate) {
  if (isFileReferenceKind(capture.contentKind)) {
    return getFileReferenceContentTypeLabel(resolveFileReferencePreviewModel(capture), t);
  }

  switch (capture.contentKind) {
    case "rich_text":
      return t("capture.detail.richTextValue");
    case "plain_text":
      return t("capture.kinds.text");
    case "link":
      return t("capture.kinds.link");
    case "image":
      return t("capture.kinds.image");
    case "video":
      return t("capture.kinds.video");
    case "file":
      return t("capture.kinds.file");
    default:
      return formatKindLabel(capture.contentKind, t);
  }
}

function countWords(input: string) {
  const normalized = input.trim();

  if (!normalized) {
    return 0;
  }

  const matches = normalized.match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu);

  return matches?.length ?? 0;
}

function buildFileReferenceSubtitle(capture: ClipboardCapture, t: ClipboardTranslate) {
  const model = resolveFileReferencePreviewModel(capture);
  const parts: string[] = [];

  if (capture.secondaryPreview?.trim()) {
    parts.push(capture.secondaryPreview.trim());
  } else {
    const parentPath = parentDirectory(model.path);
    if (parentPath) {
      parts.push(parentPath);
    }

    if (capture.byteSize) {
      parts.push(formatBytes(capture.byteSize));
    }
  }

  if (capture.fileMissing) {
    parts.push(t("capture.detail.unavailableShort"));
  }

  return parts.join(" · ");
}

function parentDirectory(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized.split("/");
  if (parts.length <= 1) {
    return null;
  }

  const parent = parts.slice(0, -1).join("/") || "/";
  return compactHomePath(parent);
}

function compactHomePath(path: string) {
  const homeRootMatch = path.match(/^\/Users\/[^/]+/);
  if (!homeRootMatch) {
    return path;
  }

  const homeRoot = homeRootMatch[0];
  return path === homeRoot
    ? "~"
    : `~${path.slice(homeRoot.length)}`;
}
