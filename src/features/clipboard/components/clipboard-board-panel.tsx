import { useState } from "react";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CaptureImageLightbox } from "@/features/clipboard/components/capture-preview";
import {
  ClipboardCaptureList,
} from "@/features/clipboard/components/clipboard-capture-list";
import { ClipboardCaptureDetail } from "@/features/clipboard/components/clipboard-capture-detail";
import { clipboardFilterOptions, getClipboardFilterOption, groupCapturesByDay, type ClipboardFilter } from "@/features/clipboard/lib/clipboard-board";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { cn } from "@/lib/utils";
import type { ClipboardCapture } from "@/types/shell";

export function ClipboardBoardPanel({
  captures,
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  emptyStateTitle,
  emptyStateDescription,
  onRetry,
}: {
  captures: ClipboardCapture[];
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onRetry?: () => void;
}) {
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [previewingImageId, setPreviewingImageId] = useState<string | null>(null);
  const captureGroups = groupCapturesByDay(captures);
  const selectedCapture =
    captures.find((capture) => capture.id === selectedCaptureId) ??
    captures[0] ??
    null;
  const previewingImage =
    captures.find((capture) => capture.id === previewingImageId) ?? null;

  return (
    <>
      <section className="app-board-surface overflow-hidden">
        <ClipboardBoardToolbar />

        <div className="overflow-hidden">
          <div className="grid h-[clamp(34rem,68vh,46rem)] grid-cols-[minmax(240px,28%)_minmax(0,1fr)] items-stretch gap-0 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] xl:h-[calc(100vh-18rem)] xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
            <ClipboardCaptureList
              groups={captureGroups}
              selectedCaptureId={selectedCapture?.id ?? null}
              onSelectCapture={setSelectedCaptureId}
              hasNextPage={hasNextPage}
              isRefreshingList={isRefreshingList}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={onLoadMore}
              emptyStateTitle={emptyStateTitle}
              emptyStateDescription={emptyStateDescription}
              onRetry={onRetry}
            />

            <div className="flex h-full min-h-0 min-w-0 flex-col self-stretch bg-card/92">
              <ClipboardCaptureDetail
                capture={selectedCapture}
                onOpenImage={() => {
                  if (selectedCapture) {
                    setPreviewingImageId(selectedCapture.id);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <CaptureImageLightbox
        capture={previewingImage}
        onClose={() => setPreviewingImageId(null)}
      />
    </>
  );
}

function ClipboardBoardToolbar() {
  const searchValue = useClipboardBoardStore((state) => state.searchValue);
  const filter = useClipboardBoardStore((state) => state.filter);
  const setSearchValue = useClipboardBoardStore((state) => state.setSearchValue);
  const setFilter = useClipboardBoardStore((state) => state.setFilter);
  const activeFilter = getClipboardFilterOption(filter);
  const hasSearchValue = searchValue.trim().length > 0;

  return (
    <div className="app-board-toolbar border-b border-border/70 px-3 py-3 sm:px-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-3">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Type to filter entries..."
            className={cn(
              "h-11 rounded-[20px] border-border/70 bg-card/90 pl-10 text-sm shadow-none",
              hasSearchValue ? "pr-11" : "",
            )}
          />
          {hasSearchValue ? (
            <button
              type="button"
              onClick={() => setSearchValue("")}
              className="absolute top-1/2 right-3 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary/80 hover:text-foreground"
              aria-label="Clear search keyword"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-end">
          <label className="relative">
            <span className="sr-only">Filter capture types</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as ClipboardFilter)}
              className={cn(
                "h-11 w-[132px] appearance-none rounded-[20px] border border-border/70 bg-card/90 px-4 text-sm font-medium shadow-none outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30 sm:w-[148px]",
                filter === "all" ? "pr-9 sm:pr-10" : "pl-8 pr-9 sm:pr-10",
              )}
              style={
                filter !== "all"
                  ? {
                      borderColor: `color-mix(in oklch, ${activeFilter.accentColor} 28%, var(--border))`,
                      backgroundColor: `color-mix(in oklch, ${activeFilter.accentColor} 8%, var(--card))`,
                    }
                  : undefined
              }
            >
              {clipboardFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {filter !== "all" ? (
              <span
                className="pointer-events-none absolute top-1/2 left-4 size-2 rounded-full -translate-y-1/2"
                style={{ backgroundColor: activeFilter.accentColor }}
              />
            ) : null}
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">
              ▾
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
