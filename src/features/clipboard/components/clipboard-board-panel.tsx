import { useState } from "react";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { CaptureImageLightbox } from "@/features/clipboard/components/capture-preview";
import {
  ClipboardCaptureList,
} from "@/features/clipboard/components/clipboard-capture-list";
import { ClipboardCaptureDetail } from "@/features/clipboard/components/clipboard-capture-detail";
import { clipboardFilterOptions, getClipboardFilterOption, groupCapturesByDay } from "@/features/clipboard/lib/clipboard-board";
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
          <div className="relative">
            <span className="sr-only">Filter capture types</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger
                aria-label="Filter capture types"
                className={cn(
                  "w-[132px] border-border/70 bg-card/90 px-4 shadow-none sm:w-[148px]",
                  filter === "all" ? "pr-9 sm:pr-10" : "pl-4 pr-9 sm:pr-10",
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
                <span className="inline-flex min-w-0 items-center gap-3">
                  {filter !== "all" ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: activeFilter.accentColor }}
                    />
                  ) : null}
                  <span className="truncate">{activeFilter.label}</span>
                </span>
              </SelectTrigger>
              <SelectContent align="end">
                {clipboardFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="inline-flex items-center gap-3">
                      {option.value !== "all" ? (
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: option.accentColor }}
                        />
                      ) : null}
                      <span>{option.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
