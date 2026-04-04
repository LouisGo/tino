import { useDeferredValue, useState } from "react";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CaptureImageLightbox } from "@/features/clipboard/components/capture-preview";
import {
  ClipboardCaptureList,
} from "@/features/clipboard/components/clipboard-capture-list";
import { ClipboardCaptureDetail } from "@/features/clipboard/components/clipboard-capture-detail";
import {
  clipboardFilterOptions,
  groupCapturesByDay,
  matchesFilter,
  matchesSearch,
  type ClipboardFilter,
} from "@/features/clipboard/lib/clipboard-board";
import type { ClipboardCapture } from "@/types/shell";

export function ClipboardBoardPanel({
  captures,
}: {
  captures: ClipboardCapture[];
}) {
  const [searchValue, setSearchValue] = useState("");
  const [filter, setFilter] = useState<ClipboardFilter>("all");
  const [selectedCaptureId, setSelectedCaptureId] = useState<string | null>(null);
  const [previewingImageId, setPreviewingImageId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(searchValue);
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

  return (
    <>
      <section className="app-board-surface overflow-hidden">
        <ClipboardBoardToolbar
          searchValue={searchValue}
          filter={filter}
          onSearchChange={setSearchValue}
          onFilterChange={setFilter}
        />

        <div className="overflow-hidden">
          <div className="grid h-[clamp(34rem,68vh,46rem)] grid-cols-[minmax(240px,28%)_minmax(0,1fr)] items-stretch gap-0 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] xl:h-[calc(100vh-18rem)] xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
            <ClipboardCaptureList
              groups={captureGroups}
              selectedCaptureId={selectedCapture?.id ?? null}
              onSelectCapture={setSelectedCaptureId}
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

function ClipboardBoardToolbar({
  searchValue,
  filter,
  onSearchChange,
  onFilterChange,
}: {
  searchValue: string;
  filter: ClipboardFilter;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: ClipboardFilter) => void;
}) {
  return (
    <div className="app-board-toolbar border-b border-border/70 px-3 py-3 sm:px-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 sm:gap-3">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Type to filter entries..."
            className="h-11 rounded-[20px] border-border/70 bg-card/90 pl-10 text-sm shadow-none"
          />
        </div>

        <div className="flex items-center justify-end">
          <label className="relative">
            <span className="sr-only">Filter capture types</span>
            <select
              value={filter}
              onChange={(event) => onFilterChange(event.target.value as ClipboardFilter)}
              className="h-11 w-[132px] appearance-none rounded-[20px] border border-border/70 bg-card/90 px-4 pr-9 text-sm font-medium shadow-none outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/30 sm:w-[148px] sm:pr-10"
            >
              {clipboardFilterOptions.map((option) => (
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
  );
}
