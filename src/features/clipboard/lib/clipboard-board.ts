import dayjs from "dayjs";

import {
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

export const clipboardFilterOptions: ClipboardFilterOption[] = [
  {
    value: "all",
    label: "All Types",
    shortLabel: "Recent",
    accentColor: "var(--muted-foreground)",
  },
  {
    value: "text",
    label: "Text",
    shortLabel: "Text",
    accentColor: "var(--clipboard-kind-text)",
  },
  {
    value: "image",
    label: "Images",
    shortLabel: "Images",
    accentColor: "var(--clipboard-kind-image)",
  },
  {
    value: "video",
    label: "Videos",
    shortLabel: "Videos",
    accentColor: "var(--clipboard-kind-video)",
  },
  {
    value: "link",
    label: "Links",
    shortLabel: "Links",
    accentColor: "var(--clipboard-kind-link)",
  },
  {
    value: "file",
    label: "Files",
    shortLabel: "Files",
    accentColor: "var(--clipboard-kind-file)",
  },
];

export function getClipboardFilterOption(filter: ClipboardFilter) {
  return clipboardFilterOptions.find((option) => option.value === filter) ?? clipboardFilterOptions[0];
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

export function summarizeRatio(value: number, total: number) {
  if (total <= 0) {
    return "No captures yet";
  }

  return `${Math.round((value / total) * 100)}% of recent`;
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

export function matchesSearch(capture: ClipboardCapture, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    captureSourceLabel(capture),
    capture.sourceAppBundleId ?? "",
    captureTitle(capture),
    captureSubtitle(capture),
    capture.rawText,
    capture.ocrText ?? "",
    capture.linkUrl ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

export function isTextKind(contentKind: ContentKind) {
  return contentKind === "plain_text" || contentKind === "rich_text";
}

export function isFileReferenceKind(contentKind: ContentKind) {
  return isFileReferenceContentKind(contentKind);
}

export function captureReferencePath(capture: ClipboardCapture) {
  return getFileReferencePath(capture);
}

export function captureTitle(capture: ClipboardCapture) {
  if (capture.contentKind === "image") {
    return capture.imageWidth && capture.imageHeight
      ? `Image (${capture.imageWidth}×${capture.imageHeight})`
      : capture.preview || "Image capture";
  }

  if (capture.contentKind === "link") {
    return capture.preview || capture.linkUrl || "Link capture";
  }

  if (isFileReferenceKind(capture.contentKind)) {
    const model = resolveFileReferencePreviewModel(capture);
    return capture.preview || model.fileName || model.contentTypeLabel;
  }

  const normalized = (capture.preview || capture.rawText).trim();
  if (normalized) {
    return normalized;
  }

  return capture.contentKind === "rich_text"
    ? "Formatted text capture"
    : "Text capture";
}

export function captureSubtitle(capture: ClipboardCapture) {
  if (capture.contentKind === "link") {
    return extractHostname(capture.linkUrl ?? capture.rawText) ?? "Link capture";
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
    return buildFileReferenceSubtitle(capture);
  }

  if (capture.secondaryPreview?.trim()) {
    return capture.secondaryPreview;
  }

  const lineCount = capture.rawText
    ? capture.rawText.split("\n").filter((line) => line.trim().length > 0).length
    : 0;

  return `${Math.max(lineCount, 1)} line${lineCount === 1 ? "" : "s"} · ${capture.rawText.length} chars`;
}

export function captureListSummary(capture: ClipboardCapture) {
  return captureTitle(capture);
}

export function captureSourceLabel(capture: ClipboardCapture) {
  return capture.sourceAppName?.trim() || capture.sourceAppBundleId?.trim() || "Unknown";
}

export function groupCapturesByDay(captures: ClipboardCapture[]) {
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
      label: formatCaptureGroupLabel(capture.capturedAt),
      kind: "day",
      captures: [capture],
    });
  }

  return Array.from(groups.values());
}

export function buildClipboardCaptureGroups({
  captures,
  pinnedCaptures,
}: {
  captures: ClipboardCapture[];
  pinnedCaptures: ClipboardCapture[];
}) {
  const groups = groupCapturesByDay(captures);

  if (pinnedCaptures.length === 0) {
    return groups;
  }

  return [
    {
      key: "pinned",
      label: "Pinned",
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

export function formatKindLabel(contentKind: ContentKind) {
  switch (contentKind) {
    case "plain_text":
      return "Text";
    case "rich_text":
      return "Rich Text";
    case "link":
      return "Link";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "file":
      return "File";
    default:
      return contentKind;
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

export function detailRows(capture: ClipboardCapture) {
  const rows = [
    { label: "Source App", value: captureSourceLabel(capture) },
    { label: "Content type", value: detailContentType(capture) },
  ];

  if (isFileReferenceKind(capture.contentKind)) {
    const path = captureReferencePath(capture);
    if (path) {
      rows.push({ label: "Path", value: path });
    }

    if (capture.fileMissing) {
      rows.push({
        label: "Availability",
        value: "Original file unavailable",
      });
    }
  }

  if (isTextKind(capture.contentKind)) {
    rows.push(
      { label: "Characters", value: `${capture.rawText.length}` },
      { label: "Words", value: `${countWords(capture.rawText)}` },
    );
  }

  if (capture.contentKind === "image") {
    if (capture.imageWidth && capture.imageHeight) {
      rows.push({
        label: "Dimensions",
        value: `${capture.imageWidth}×${capture.imageHeight}`,
      });
    }

    if (capture.byteSize) {
      rows.push({
        label: "Image size",
        value: formatBytes(capture.byteSize),
      });
    }
  }

  if (capture.contentKind === "link") {
    rows.push({
      label: "URL",
      value: capture.linkUrl ?? capture.rawText,
    });

    const hostname = extractHostname(capture.linkUrl ?? capture.rawText);
    if (hostname) {
      rows.push({
        label: "Host",
        value: hostname,
      });
    }
  }

  rows.push({
    label: "Captured",
    value: formatRelativeTimestamp(capture.capturedAt),
  });

  if (capture.sourceAppBundleId && !isFileReferenceKind(capture.contentKind)) {
    rows.push({ label: "Bundle ID", value: capture.sourceAppBundleId });
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

function formatCaptureGroupLabel(input: string) {
  const value = dayjs(input);
  const today = dayjs();

  if (value.isSame(today, "day")) {
    return "Today";
  }

  if (value.isSame(today.subtract(1, "day"), "day")) {
    return "Yesterday";
  }

  return value.format("YYYY-MM-DD");
}

function detailContentType(capture: ClipboardCapture) {
  if (isFileReferenceKind(capture.contentKind)) {
    return resolveFileReferencePreviewModel(capture).contentTypeLabel;
  }

  switch (capture.contentKind) {
    case "rich_text":
      return "Text (Formatted)";
    case "plain_text":
      return "Text";
    case "link":
      return "Link";
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "file":
      return "File";
    default:
      return formatKindLabel(capture.contentKind);
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

function buildFileReferenceSubtitle(capture: ClipboardCapture) {
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
    parts.push("Unavailable");
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
