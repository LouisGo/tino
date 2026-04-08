import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { EllipsisVertical, FileText, ImageIcon, Link2, Pin, Play } from "lucide-react";

import { useCommand } from "@/core/commands";
import { useActiveContextMenuTarget, useContextMenu } from "@/core/context-menu";
import { clipboardCaptureContextMenu } from "@/features/clipboard/clipboard-capture-context-menu";
import { FileReferenceTypeIcon } from "@/features/clipboard/components/file-reference-type-icon";
import {
  captureListSummary,
  type ClipboardCaptureGroup,
} from "@/features/clipboard/lib/clipboard-board";
import { resolveFileReferencePreviewModel } from "@/features/clipboard/lib/file-reference-preview";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { cn } from "@/lib/utils";
import type { ClipboardCapture, ContentKind } from "@/types/shell";

export function ClipboardCaptureList({
  groups,
  selectedCaptureId,
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  scrollToTopRequest,
}: {
  groups: ClipboardCaptureGroup[];
  selectedCaptureId: string | null;
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
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
  const { onContextMenu, openAtElement } = useContextMenu(clipboardCaptureContextMenu, {
    onOpen: (capture) => {
      void selectCapture.execute({ captureId: capture.id });
    },
  });
  const selectedCapture = useMemo(
    () =>
      selectedCaptureId
        ? groups
            .flatMap((group) => group.captures)
            .find((capture) => capture.id === selectedCaptureId) ?? null
        : null,
    [groups, selectedCaptureId],
  );
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
    const firstCaptureElement = scrollViewport.querySelector<HTMLElement>("[data-capture-id]");
    const shouldRevealGroupHeader =
      selectedElement?.dataset.groupFirst === "true"
      && selectedElement?.dataset.groupKind === "pinned";

    if (selectedElement && firstCaptureElement === selectedElement) {
      scrollViewport.scrollTo({
        top: 0,
        behavior: "auto",
      });
      return;
    }

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

  useActiveContextMenuTarget({
    active: selectedCapture !== null,
    isEnabled: () => selectedCapture !== null,
    openMenu: () => {
      if (!selectedCapture) {
        return false;
      }

      const captureId =
        typeof CSS === "undefined" ? selectedCapture.id : CSS.escape(selectedCapture.id);
      const selectedElement = scrollViewport?.querySelector<HTMLElement>(
        `[data-capture-id="${captureId}"]`,
      ) ?? null;

      return openAtElement(selectedElement, selectedCapture);
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/55 bg-card/72">
      <div
        ref={setScrollViewport}
        className="app-scroll-area min-h-0 flex-1 overflow-y-auto p-2"
      >
        <div className="space-y-2.5">
          {groups.map((group) => (
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
                {group.captures.map((capture) => {
                  const isSelected = selectedCaptureId === capture.id;

                  return (
                    <div
                      key={capture.id}
                      data-capture-id={capture.id}
                      data-group-first={group.captures[0]?.id === capture.id ? "true" : "false"}
                      data-group-kind={group.kind}
                      onContextMenu={(event) => onContextMenu(event, capture)}
                      className={cn(
                        "group flex h-[44px] w-full scroll-mt-7 items-center gap-0.5 rounded-[14px] border pl-2.5 pr-1 transition",
                        isSelected
                          ? "border-primary/18 bg-primary/[0.08] shadow-none"
                          : "border-transparent bg-transparent hover:border-border/55 hover:bg-secondary/34",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void selectCapture.execute({ captureId: capture.id })}
                        onDoubleClick={() =>
                          void confirmCapture.execute({ captureId: capture.id })}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <CaptureThumb capture={capture} />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground/92">
                            {captureListSummary(capture)}
                          </p>
                        </div>
                      </button>

                      {isSelected ? (
                        <button
                          type="button"
                          aria-label="More actions"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            openAtElement(event.currentTarget, capture);
                          }}
                          className="inline-flex h-7 w-4 shrink-0 items-center justify-center text-muted-foreground/72 transition-colors group-hover:text-foreground/70 hover:text-foreground/82 dark:text-muted-foreground/62 dark:group-hover:text-foreground/84 dark:hover:text-foreground/92"
                        >
                          <EllipsisVertical className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

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
    capture.contentKind === "image" || capture.contentKind === "video"
      ? capture.thumbnailPath
      : null,
  );

  if ((capture.contentKind === "image" || capture.contentKind === "video") && thumbnailSrc) {
    return (
      <div className="relative size-[30px] shrink-0 overflow-hidden rounded-[10px] bg-secondary/70 ring-1 ring-border/30">
        <img
          src={thumbnailSrc}
          alt={capture.preview || (capture.contentKind === "video"
            ? "Clipboard video thumbnail"
            : "Clipboard image thumbnail")}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
        {capture.contentKind === "video" ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-black/78 text-white shadow-[0_4px_12px_rgba(0,0,0,0.28)]">
              <Play className="ml-[1px] size-2.5 fill-current" />
            </span>
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] bg-secondary/70 text-muted-foreground/84">
      {renderKindIcon(capture, "size-[15px]")}
    </div>
  );
}

function renderKindIcon(capture: ClipboardCapture | ContentKind, className = "size-5") {
  if (typeof capture !== "string" && (capture.contentKind === "file" || capture.contentKind === "video")) {
    const model = resolveFileReferencePreviewModel(capture);
    return <FileReferenceTypeIcon kind={model.iconKind} className={className} />;
  }

  const contentKind = typeof capture === "string" ? capture : capture.contentKind;

  switch (contentKind) {
    case "link":
      return <Link2 className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    default:
      return <FileText className={className} />;
  }
}
