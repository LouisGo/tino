import { useDeferredValue, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  Expand,
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getDashboardSnapshot,
  getImageAssetDataUrl,
  isTauriRuntime,
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
  const { data, isFetching, refetch } = useQuery({
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
      <div className="space-y-6">
        <div className="app-hero-surface">
          <div className="app-hero-clipboard px-4 py-5 sm:px-6 sm:py-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                Clipboard Board
              </p>
              <p className="rounded-full border border-border/80 bg-surface-elevated px-3 py-1 text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
                {summary.total} Captures
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xl">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Type to filter entries..."
              className="h-[52px] rounded-[26px] border-border/80 bg-card pl-11 text-base shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative">
              <span className="sr-only">Filter capture types</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as ClipboardFilter)}
                className="h-[52px] min-w-44 appearance-none rounded-[24px] border border-border/80 bg-card px-5 pr-10 text-sm font-medium shadow-sm outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30"
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

            <Button
              variant="outline"
              className="h-[52px] rounded-[24px]"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCcw className={isFetching ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-border/80 bg-card/95">
            <CardHeader className="border-b border-border/70 pb-4">
              <CardTitle>Recent Entries</CardTitle>
              <CardDescription>
                Search and filter recent captures before drilling into details.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              <div className="max-h-[calc(100vh-23rem)] space-y-2 overflow-y-auto pr-1">
                {filteredCaptures.length ? (
                  filteredCaptures.map((capture) => (
                    <button
                      key={capture.id}
                      type="button"
                      onClick={() => setSelectedCaptureId(capture.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-[24px] border px-3 py-3 text-left transition",
                        selectedCapture?.id === capture.id
                          ? "border-primary/30 bg-primary/10 shadow-sm"
                          : "border-transparent bg-background/70 hover:border-border hover:bg-secondary/60",
                      )}
                    >
                      <CaptureThumb capture={capture} />

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {formatKindLabel(capture.contentKind)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTimestamp(capture.capturedAt)}
                          </span>
                        </div>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {captureTitle(capture)}
                        </p>
                        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {captureSubtitle(capture)}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <EmptyState
                    title="No matching captures"
                    description="Try clearing the search term or switching the type filter back to all entries."
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/80 bg-card/95">
                {selectedCapture ? (
              <>
                <div className="app-card-header-elevated flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{formatKindLabel(selectedCapture.contentKind)}</Badge>
                    <Badge variant={statusVariant(selectedCapture.status)}>
                      {selectedCapture.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTimestamp(selectedCapture.capturedAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedCapture.contentKind === "link" && selectedCapture.linkUrl ? (
                      <Button
                        variant="outline"
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
                        onClick={() =>
                          void openExternalTarget(selectedCapture.assetPath ?? "")
                        }
                      >
                        <ImageIcon />
                        Open in Preview
                      </Button>
                    ) : null}
                  </div>
                </div>

                <CardContent className="p-0">
                  <DetailContent
                    capture={selectedCapture}
                    onOpenImage={() => setPreviewingImageId(selectedCapture.id)}
                  />

                  <DetailInformation capture={selectedCapture} />

                  {selectedCapture.rawRich ? (
                    <section className="border-t border-border/70 px-5 py-5">
                      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                        Raw Rich Representation
                      </p>
                      <pre className="mt-4 max-h-72 overflow-auto rounded-[20px] border border-border/70 bg-background/75 px-4 py-4 font-mono text-xs leading-6 whitespace-pre-wrap text-foreground">
                        {selectedCapture.rawRich}
                      </pre>
                    </section>
                  ) : null}
                </CardContent>
              </>
            ) : (
              <CardContent className="p-4">
                <EmptyState
                  title="Clipboard board is empty"
                  description="Copy text, links, or images on macOS and the recent capture board will populate here."
                />
              </CardContent>
            )}
          </Card>
        </section>
      </div>

      <ImageLightbox
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
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold leading-none tracking-tight sm:text-[2rem]">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

function CaptureThumb({ capture }: { capture: ClipboardCapture }) {
  const assetSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.assetPath : null,
  );

  if (assetSrc) {
    return (
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-border/70 bg-secondary/70">
        <img
          src={assetSrc}
          alt={captureTitle(capture)}
          className="size-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] border border-border/70 bg-secondary/70 text-muted-foreground">
      {renderKindIcon(capture.contentKind)}
    </div>
  );
}

function DetailContent({
  capture,
  onOpenImage,
}: {
  capture: ClipboardCapture;
  onOpenImage: () => void;
}) {
  const assetSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.assetPath : null,
  );

  if (capture.contentKind === "image") {
    return (
      <section className="app-preview-image border-b border-border/70 px-5 py-5">
        <button
          type="button"
          onClick={onOpenImage}
          className="group flex min-h-[360px] w-full items-center justify-center overflow-hidden rounded-[24px] border border-border/70 bg-surface-panel px-5 py-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
          {assetSrc ? (
            <div className="relative w-full">
              <img
                src={assetSrc}
                alt={captureTitle(capture)}
                className="max-h-[460px] w-full rounded-[20px] object-contain"
              />
              <div className="app-overlay-chip pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium opacity-0 transition group-hover:opacity-100">
                <Expand className="size-3.5" />
                Click to enlarge
              </div>
            </div>
          ) : (
            <EmptyState
              title="Image preview unavailable"
              description="The capture exists, but the local preview asset could not be loaded into the board."
            />
          )}
        </button>
      </section>
    );
  }

  if (capture.contentKind === "link") {
    const target = capture.linkUrl ?? capture.rawText;
    const hostname = target ? extractHostname(target) : null;

    return (
      <section className="app-preview-link border-b border-border/70 px-5 py-5">
        <button
          type="button"
          onClick={() => void openExternalTarget(target)}
          className="flex min-h-[320px] w-full flex-col items-start justify-between rounded-[24px] border border-border/70 bg-surface-panel px-6 py-6 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Link2 className="size-3.5" />
              Open in system browser
            </div>
            <div className="space-y-3">
              <p className="text-xl font-semibold leading-8 text-foreground">
                {hostname ?? "Link capture"}
              </p>
              <p className="break-all font-mono text-sm leading-7 text-muted-foreground">
                {target}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            Preview in browser
            <ExternalLink className="size-4" />
          </div>
        </button>
      </section>
    );
  }

  return (
    <section className="app-preview-text border-b border-border/70 px-6 py-6 sm:px-7 sm:py-7">
      <div className="min-h-[320px]">
        <div className="text-[15px] leading-8 whitespace-pre-wrap text-foreground">
          {capture.rawText || captureTitle(capture)}
        </div>
      </div>
    </section>
  );
}

function DetailInformation({ capture }: { capture: ClipboardCapture }) {
  const rows = detailRows(capture);

  return (
    <section className="px-5 py-5">
      <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Information
      </p>
      <div className="mt-4 overflow-hidden rounded-[22px] border border-border/70 bg-background/70">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className={cn(
              "grid grid-cols-[140px_minmax(0,1fr)] gap-3 px-4 py-3 text-sm",
              index > 0 ? "border-t border-border/70" : "",
            )}
          >
            <span className="font-medium text-muted-foreground">{row.label}</span>
            <span className="break-all text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ImageLightbox({
  capture,
  onClose,
}: {
  capture: ClipboardCapture | null;
  onClose: () => void;
}) {
  const assetSrc = useClipboardAssetSrc(capture?.assetPath);

  if (!capture || capture.contentKind !== "image") {
    return null;
  }

  return (
    <div
      className="app-overlay-backdrop fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="app-lightbox-surface relative w-full max-w-6xl overflow-hidden rounded-[28px] border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-lightbox-header flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-sm font-medium">{captureTitle(capture)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {capture.imageWidth && capture.imageHeight
                ? `${capture.imageWidth} × ${capture.imageHeight}`
                : "Image capture"}
            </p>
          </div>
          <Button
            variant="ghost"
            className="text-foreground hover:bg-surface-soft hover:text-foreground"
            onClick={onClose}
          >
            <X />
            Close
          </Button>
        </div>

        <div className="flex min-h-[70vh] items-center justify-center p-6">
          {assetSrc ? (
            <img
              src={assetSrc}
              alt={captureTitle(capture)}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            <EmptyState
              title="Image preview unavailable"
              description="The image asset could not be loaded for enlarged preview."
            />
          )}
        </div>
      </div>
    </div>
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
    <div className="flex min-h-56 flex-col items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-background/60 px-6 py-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function useClipboardAssetSrc(assetPath?: string | null) {
  const { data } = useQuery({
    queryKey: ["clipboard-asset-src", assetPath],
    enabled: Boolean(assetPath),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (!assetPath) {
        return null;
      }

      try {
        return await getImageAssetDataUrl(assetPath);
      } catch {
        return null;
      }
    },
  });

  return data ?? null;
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

function renderKindIcon(contentKind: ContentKind) {
  switch (contentKind) {
    case "link":
      return <Link2 className="size-5" />;
    case "image":
      return <ImageIcon className="size-5" />;
    default:
      return <FileText className="size-5" />;
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
