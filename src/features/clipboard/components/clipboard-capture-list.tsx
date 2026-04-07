import { useEffect, useEffectEvent, useRef, useState } from "react";

import { FileText, ImageIcon, Link2, Pin } from "lucide-react";

import { useCommand } from "@/core/commands";
import { useContextMenu } from "@/core/context-menu";
import { clipboardCaptureContextMenu } from "@/features/clipboard/clipboard-capture-context-menu";
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
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  emptyStateTitle,
  emptyStateDescription,
  onRetry,
  scrollToTopRequest,
}: {
  groups: ClipboardCaptureGroup[];
  selectedCaptureId: string | null;
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onRetry?: () => void;
  scrollToTopRequest: number;
}) {
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const [loadTrigger, setLoadTrigger] = useState<HTMLDivElement | null>(null);
  const isAutoLoadingRef = useRef(false);
  const isLoadTriggerVisibleRef = useRef(false);
  const selectCapture = useCommand<{ captureId: string }>("clipboard.selectCapture");
  const confirmCapture = useCommand<{ captureId?: string } | undefined>(
    "clipboard.confirmWindowSelection",
  );
  const { onContextMenu } = useContextMenu(clipboardCaptureContextMenu, {
    onOpen: (capture) => {
      void selectCapture.execute({ captureId: capture.id });
    },
  });
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

  useEffect(() => {
    if (!scrollViewport || !selectedCaptureId) {
      return;
    }

    const captureId =
      typeof CSS === "undefined" ? selectedCaptureId : CSS.escape(selectedCaptureId);
    const selectedElement = scrollViewport.querySelector<HTMLElement>(
      `[data-capture-id="${captureId}"]`,
    );
    const shouldRevealGroupHeader =
      selectedElement?.dataset.groupFirst === "true"
      && selectedElement?.dataset.groupKind === "pinned";

    selectedElement?.scrollIntoView({
      block: shouldRevealGroupHeader ? "start" : "nearest",
      inline: "nearest",
    });
  }, [scrollViewport, selectedCaptureId]);

  useEffect(() => {
    if (!scrollViewport || scrollToTopRequest === 0) {
      return;
    }

    scrollViewport.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [scrollToTopRequest, scrollViewport]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/55 bg-card/72">
      <div
        ref={setScrollViewport}
        className="app-scroll-area min-h-0 flex-1 overflow-y-auto p-2"
      >
        <div className="space-y-2.5">
          {hasCaptures ? (
            groups.map((group) => (
              <section key={group.key} className="space-y-1.5">
                <p
                  className={cn(
                    "px-1 text-[9px] font-semibold tracking-[0.18em] uppercase",
                    group.kind === "pinned"
                      ? "inline-flex items-center gap-1.5 text-foreground/72"
                      : "text-muted-foreground/78",
                  )}
                >
                  {group.kind === "pinned" ? <Pin className="size-3" /> : null}
                  <span>{group.label}</span>
                </p>
                <div className="space-y-0.5">
                  {group.captures.map((capture) => (
                    <button
                      key={capture.id}
                      type="button"
                      data-capture-id={capture.id}
                      data-group-first={group.captures[0]?.id === capture.id ? "true" : "false"}
                      data-group-kind={group.kind}
                      onClick={() => void selectCapture.execute({ captureId: capture.id })}
                      onDoubleClick={() =>
                        void confirmCapture.execute({ captureId: capture.id })}
                      onContextMenu={(event) => onContextMenu(event, capture)}
                      className={cn(
                        "flex h-[44px] w-full scroll-mt-7 items-center gap-2.5 rounded-[14px] border px-2.5 text-left transition",
                        selectedCaptureId === capture.id
                          ? "border-primary/18 bg-primary/[0.08] shadow-none"
                          : "border-transparent bg-transparent hover:border-border/55 hover:bg-secondary/34",
                      )}
                    >
                      <CaptureThumb capture={capture} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground/92">
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
      <div className="size-[30px] shrink-0 overflow-hidden rounded-[10px] bg-secondary/70 ring-1 ring-border/30">
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
    <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] bg-secondary/70 text-muted-foreground/84">
      {renderKindIcon(capture.contentKind, "size-[15px]")}
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
