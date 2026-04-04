import { useEffect, useEffectEvent, useRef, useState } from "react";

import { FileText, ImageIcon, Link2 } from "lucide-react";

import {
  captureListSummary,
  type ClipboardCaptureGroup,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { cn } from "@/lib/utils";
import type { ClipboardCapture, ContentKind } from "@/types/shell";

import { ClipboardEmptyState } from "./clipboard-empty-state";

export function ClipboardCaptureList({
  groups,
  selectedCaptureId,
  onSelectCapture,
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  emptyStateTitle,
  emptyStateDescription,
  onRetry,
}: {
  groups: ClipboardCaptureGroup[];
  selectedCaptureId: string | null;
  onSelectCapture: (captureId: string) => void;
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onRetry?: () => void;
}) {
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const [loadTrigger, setLoadTrigger] = useState<HTMLDivElement | null>(null);
  const isAutoLoadingRef = useRef(false);
  const isLoadTriggerVisibleRef = useRef(false);
  const hasCaptures = groups.length > 0;
  const tryLoadMore = useEffectEvent(() => {
    if (
      !isLoadTriggerVisibleRef.current ||
      !hasNextPage ||
      isRefreshingList ||
      isFetchingNextPage ||
      isAutoLoadingRef.current
    ) {
      return;
    }

    isAutoLoadingRef.current = true;
    onLoadMore();
  });
  const handleLoadMoreIntersect = useEffectEvent(
    ([entry]: IntersectionObserverEntry[]) => {
      isLoadTriggerVisibleRef.current = Boolean(entry?.isIntersecting);
      tryLoadMore();
    },
  );

  useEffect(() => {
    if (!isFetchingNextPage) {
      isAutoLoadingRef.current = false;
    }
  }, [isFetchingNextPage]);

  useEffect(() => {
    if (!isRefreshingList) {
      tryLoadMore();
    }
  }, [isRefreshingList, hasNextPage]);

  useEffect(() => {
    if (!scrollViewport || !loadTrigger || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(handleLoadMoreIntersect, {
      root: scrollViewport,
      rootMargin: "0px 0px 240px 0px",
      threshold: 0,
    });

    observer.observe(loadTrigger);
    return () => {
      isLoadTriggerVisibleRef.current = false;
      observer.disconnect();
    };
  }, [hasNextPage, loadTrigger, scrollViewport]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/70 bg-card/78">
      <div ref={setScrollViewport} className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="space-y-3">
          {hasCaptures ? (
            groups.map((group) => (
              <section key={group.key} className="space-y-1.5">
                <p className="px-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.captures.map((capture) => (
                    <button
                      key={capture.id}
                      type="button"
                      onClick={() => onSelectCapture(capture.id)}
                      className={cn(
                        "flex h-[50px] w-full items-center gap-3 rounded-[16px] border px-3 text-left transition",
                        selectedCaptureId === capture.id
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
            <ClipboardEmptyState
              title={emptyStateTitle ?? "No matching captures"}
              description={
                emptyStateDescription ??
                "Try clearing the search term or switching the type filter back to all entries."
              }
              onRetry={onRetry}
            />
          )}

          {hasNextPage ? <div ref={setLoadTrigger} aria-hidden className="h-px w-full" /> : null}

          {isFetchingNextPage ? (
            <div className="flex items-center justify-center px-2 pb-1 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              Loading older captures...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CaptureThumb({ capture }: { capture: ClipboardCapture }) {
  const thumbnailSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.thumbnailPath : null,
  );

  if (capture.contentKind === "image" && thumbnailSrc) {
    return (
      <div className="size-8 shrink-0 overflow-hidden rounded-[12px] bg-secondary/80 ring-1 ring-border/40">
        <img
          src={thumbnailSrc}
          alt={capture.preview || "Clipboard image thumbnail"}
          loading="lazy"
          decoding="async"
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
