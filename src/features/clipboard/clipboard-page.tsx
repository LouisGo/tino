import { useDeferredValue, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Expand, ExternalLink, FileText, ImageIcon, Link2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CaptureDetailPreview,
  CaptureImageLightbox,
} from "@/features/clipboard/components/capture-preview";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import {
  getDashboardSnapshot,
  isTauriRuntime,
  openImageInPreview,
  openExternalTarget,
} from "@/lib/tauri";
import { formatRelativeTimestamp } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ClipboardCapture, ContentKind } from "@/types/shell";

type ClipboardFilter = "all" | "text" | "link" | "image";

const filterOptions: Array<{ value: ClipboardFilter; label: string }> = [
  { value: "all", label: "All Types" },
  { value: "text", label: "Text Only" },
  { value: "image", label: "Images Only" },
  { value: "link", label: "Links Only" },
];

export function ClipboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard-snapshot"],
    queryFn: getDashboardSnapshot,
    refetchInterval: isTauriRuntime() ? 3_000 : false,
  });
  const [searchValue, setSearchValue] = useState("");
  const [filter, setFilter] = useState<ClipboardFilter>("all");
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [previewingImageId, setPreviewingImageId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(searchValue);
  const captures = data?.recentCaptures ?? [];
  const filteredCaptures = captures.filter((capture) => {
    if (!matchesFilter(capture.contentKind, filter)) {
      return false;
    }

    return matchesSearch(capture, deferredSearch);
  });
  const captureGroups = groupCapturesByDay(filteredCaptures);
  const selectedCapture =
    filteredCaptures.find((capture) => capture.id === selectedCaptureId) ??
    filteredCaptures[0] ??
    null;
  const previewingImage =
    filteredCaptures.find((capture) => capture.id === previewingImageId) ??
    captures.find((capture) => capture.id === previewingImageId) ??
    null;
  const summary = {
    total: captures.length,
    text: captures.filter((capture) => isTextKind(capture.contentKind)).length,
    links: captures.filter((capture) => capture.contentKind === "link").length,
    images: captures.filter((capture) => capture.contentKind === "image").length,
  };
  const summaryTiles = [
    {
      label: "Recent",
      value: summary.total,
      hint: "Total entries in recent board",
      toneClass: "app-summary-tone-recent",
    },
    {
      label: "Text",
      value: summary.text,
      hint: summarizeRatio(summary.text, summary.total),
      toneClass: "app-summary-tone-text",
    },
    {
      label: "Links",
      value: summary.links,
      hint: summarizeRatio(summary.links, summary.total),
      toneClass: "app-summary-tone-links",
    },
    {
      label: "Images",
      value: summary.images,
      hint: summarizeRatio(summary.images, summary.total),
      toneClass: "app-summary-tone-images",
    },
  ] as const;

  return (
    <>
      <div className="space-y-3">
        <div className="app-hero-surface">
          <div className="app-hero-clipboard px-3 py-3 sm:px-4 sm:py-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase sm:text-xs">
                Clipboard Board
              </p>
              <p className="rounded-full border border-border/80 bg-surface-elevated px-2.5 py-0.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                {summary.total} Captures
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {summaryTiles.map((tile) => (
                <SummaryTile
                  key={tile.label}
                  label={tile.label}
                  value={tile.value}
                  hint={tile.hint}
                  toneClass={tile.toneClass}
                />
              ))}
            </div>
          </div>
        </div>

        <section className="app-board-surface overflow-hidden">
          <div className="app-board-toolbar border-b border-border/70 px-3 py-3 sm:px-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-3">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Type to filter entries..."
                  className="h-11 rounded-[20px] border-border/70 bg-card/90 pl-10 text-sm shadow-none"
                />
              </div>

              <div className="flex items-center justify-end">
                <label className="relative">
                  <span className="sr-only">Filter capture types</span>
                  <select
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as ClipboardFilter)}
                    className="h-11 w-[132px] appearance-none rounded-[20px] border border-border/70 bg-card/90 px-4 pr-9 text-sm font-medium shadow-none outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30 sm:w-[148px] sm:pr-10"
                  >
                    {filterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">
                    ▾
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <div className="grid h-[clamp(34rem,68vh,46rem)] grid-cols-[minmax(240px,28%)_minmax(0,1fr)] items-stretch gap-0 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] xl:h-[calc(100vh-18rem)] xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="flex h-full min-h-0 flex-col border-r border-border/70 bg-card/78">
                <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                  <div className="space-y-3">
                    {filteredCaptures.length ? (
                      captureGroups.map((group) => (
                        <section key={group.key} className="space-y-1.5">
                          <p className="px-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                            {group.label}
                          </p>
                          <div className="space-y-1">
                            {group.captures.map((capture) => (
                              <button
                                key={capture.id}
                                type="button"
                                onClick={() => setSelectedCaptureId(capture.id)}
                                className={cn(
                                  "flex h-[50px] w-full items-center gap-3 rounded-[16px] border px-3 text-left transition",
                                  selectedCapture?.id === capture.id
                                    ? "border-primary/25 bg-primary/10 shadow-sm"
                                    : "border-transparent bg-background/55 hover:border-border/80 hover:bg-secondary/50",
                                )}
                              >
                                <CaptureThumb capture={capture} />

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {captureListSummary(capture)}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <EmptyState
                        title="No matching captures"
                        description="Try clearing the search term or switching the type filter back to all entries."
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex h-full min-h-0 min-w-0 flex-col self-stretch bg-card/92">
                {selectedCapture ? (
                  <>
                    <div className="app-card-header-elevated flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={kindBadgeClass(selectedCapture.contentKind)}>
                          {formatKindLabel(selectedCapture.contentKind)}
                        </Badge>
                        <Badge variant={statusVariant(selectedCapture.status)}>
                          {selectedCapture.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeTimestamp(selectedCapture.capturedAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {selectedCapture.contentKind === "link" && selectedCapture.linkUrl ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-[16px] border-border/70 bg-card/75 px-2.5 shadow-none [&_svg]:size-3.5"
                            onClick={() =>
                              void openExternalTarget(selectedCapture.linkUrl ?? "")
                            }
                          >
                            <ExternalLink />
                            Open in Browser
                          </Button>
                        ) : null}
                        {selectedCapture.contentKind === "image" &&
                        selectedCapture.assetPath ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-[16px] border-border/70 bg-card/75 px-2.5 shadow-none [&_svg]:size-3.5"
                            onClick={() => setPreviewingImageId(selectedCapture.id)}
                          >
                            <Expand />
                            Enlarge
                          </Button>
                        ) : null}
                        {selectedCapture.contentKind === "image" &&
                        selectedCapture.assetPath ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-[16px] border-border/70 bg-card/75 px-2.5 shadow-none [&_svg]:size-3.5"
                            onClick={() => void openImageInPreview(selectedCapture.assetPath ?? "")}
                          >
                            <ImageIcon />
                            Open in Preview
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
                      <div className="min-h-0">
                        <CaptureDetailPreview
                          capture={selectedCapture}
                          onOpenImage={() => setPreviewingImageId(selectedCapture.id)}
                        />
                      </div>

                      <div className="border-t border-border/70">
                        <DetailInformation capture={selectedCapture} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4">
                    <EmptyState
                      title="Clipboard board is empty"
                      description="Copy text, links, or images on macOS and the recent capture board will populate here."
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <CaptureImageLightbox
        capture={previewingImage}
        onClose={() => setPreviewingImageId(null)}
      />
    </>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  toneClass,
}: {
  label: string;
  value: number;
  hint: string;
  toneClass: string;
}) {
  return (
    <div
      className={cn(
        "app-summary-tile",
        toneClass,
      )}
    >
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-[1.4rem] font-semibold leading-none tracking-tight sm:text-[1.55rem]">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

function CaptureThumb({ capture }: { capture: ClipboardCapture }) {
  const assetSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.assetPath : null,
  );

  if (assetSrc) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-border/60 bg-secondary/70">
        <img
          src={assetSrc}
          alt={captureTitle(capture)}
          className="size-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-[12px] bg-secondary/80 text-muted-foreground">
      {renderKindIcon(capture.contentKind, "size-4")}
    </div>
  );
}

function DetailInformation({ capture }: { capture: ClipboardCapture }) {
  const rows = detailRows(capture);

  return (
    <section className="flex h-full min-h-0 flex-col px-4 py-4">
      <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Information
      </p>
      <div className="mt-3 min-h-0 overflow-hidden rounded-[20px] border border-border/70 bg-background/70">
        <div className="h-full overflow-auto">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className={cn(
                "grid grid-cols-[124px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm",
                index > 0 ? "border-t border-border/70" : "",
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
              <span className="app-selectable break-all text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-background/60 px-5 py-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function matchesFilter(contentKind: ContentKind, filter: ClipboardFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "text") {
    return isTextKind(contentKind);
  }

  return contentKind === filter;
}

function matchesSearch(capture: ClipboardCapture, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    captureTitle(capture),
    captureSubtitle(capture),
    capture.rawText,
    capture.linkUrl ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedSearch);
}

function isTextKind(contentKind: ContentKind) {
  return contentKind === "plain_text" || contentKind === "rich_text";
}

function captureTitle(capture: ClipboardCapture) {
  if (capture.contentKind === "image") {
    return capture.imageWidth && capture.imageHeight
      ? `Image (${capture.imageWidth}×${capture.imageHeight})`
      : capture.preview || "Image capture";
  }

  if (capture.contentKind === "link") {
    return capture.preview || capture.linkUrl || "Link capture";
  }

  const normalized = (capture.preview || capture.rawText).trim();
  if (normalized) {
    return normalized;
  }

  return capture.contentKind === "rich_text"
    ? "Formatted text capture"
    : "Text capture";
}

function captureSubtitle(capture: ClipboardCapture) {
  if (capture.secondaryPreview?.trim()) {
    return capture.secondaryPreview;
  }

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

  const lineCount = capture.rawText
    ? capture.rawText.split("\n").filter((line) => line.trim().length > 0).length
    : 0;

  return `${Math.max(lineCount, 1)} line${lineCount === 1 ? "" : "s"} · ${capture.rawText.length} chars`;
}

function captureListSummary(capture: ClipboardCapture) {
  return captureTitle(capture);
}

function groupCapturesByDay(captures: ClipboardCapture[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      captures: ClipboardCapture[];
    }
  >();

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
      captures: [capture],
    });
  }

  return Array.from(groups.values());
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

function formatKindLabel(contentKind: ContentKind) {
  switch (contentKind) {
    case "plain_text":
      return "Text";
    case "rich_text":
      return "Rich Text";
    case "link":
      return "Link";
    case "image":
      return "Image";
    default:
      return contentKind;
  }
}

function kindBadgeClass(contentKind: ContentKind) {
  if (isTextKind(contentKind)) {
    return "app-kind-badge-text";
  }

  if (contentKind === "link") {
    return "app-kind-badge-link";
  }

  if (contentKind === "image") {
    return "app-kind-badge-image";
  }

  return "";
}

function renderKindIcon(contentKind: ContentKind, className = "size-5") {
  switch (contentKind) {
    case "link":
      return <Link2 className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    default:
      return <FileText className={className} />;
  }
}

function statusVariant(status: ClipboardCapture["status"]) {
  switch (status) {
    case "archived":
      return "success" as const;
    case "filtered":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function detailRows(capture: ClipboardCapture) {
  const rows = [
    { label: "Source", value: capture.source },
    { label: "Content type", value: detailContentType(capture) },
  ];

  if (isTextKind(capture.contentKind)) {
    rows.push(
      { label: "Characters", value: `${capture.rawText.length}` },
      {
        label: "Words",
        value: `${countWords(capture.rawText)}`,
      },
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

  return rows;
}

function detailContentType(capture: ClipboardCapture) {
  switch (capture.contentKind) {
    case "rich_text":
      return "Text (Formatted)";
    case "plain_text":
      return "Text";
    case "link":
      return "Link";
    case "image":
      return "Image";
    default:
      return formatKindLabel(capture.contentKind);
  }
}

function summarizeRatio(value: number, total: number) {
  if (total <= 0) {
    return "No captures yet";
  }

  return `${Math.round((value / total) * 100)}% of recent`;
}

function countWords(input: string) {
  const normalized = input.trim();

  if (!normalized) {
    return 0;
  }

  const matches = normalized.match(/[\p{Script=Han}]|[\p{L}\p{N}]+/gu);

  return matches?.length ?? 0;
}

function formatBytes(byteSize: number) {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }

  const kib = byteSize / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }

  return `${(kib / 1024).toFixed(1)} MB`;
}

function extractHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
