import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ClipboardCapture, ContentKind } from "@/types/shell";

type ClipboardCaptureListRow =
  | {
      key: string;
      type: "group";
      group: ClipboardCaptureGroup;
      isFirstGroup: boolean;
    }
  | {
      key: string;
      type: "capture";
      capture: ClipboardCapture;
      groupKind: ClipboardCaptureGroup["kind"];
      isGroupFirst: boolean;
    }
  | {
      key: "loading";
      type: "loading";
    };

const FIRST_GROUP_ROW_HEIGHT = 20;
const GROUP_ROW_HEIGHT = 30;
const CAPTURE_ROW_HEIGHT = 46;
const LOADING_ROW_HEIGHT = 32;

function estimateClipboardCaptureListRowSize(row: ClipboardCaptureListRow | undefined) {
  switch (row?.type) {
    case "group":
      return row.isFirstGroup ? FIRST_GROUP_ROW_HEIGHT : GROUP_ROW_HEIGHT;
    case "loading":
      return LOADING_ROW_HEIGHT;
    case "capture":
      return CAPTURE_ROW_HEIGHT;
    default:
      return CAPTURE_ROW_HEIGHT;
  }
}

export function ClipboardCaptureList({
  groups,
  selectedCaptureId,
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  scrollToTopRequest,
  viewportResetRequest,
}: {
  groups: ClipboardCaptureGroup[];
  selectedCaptureId: string | null;
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
  scrollToTopRequest: number;
  viewportResetRequest: number;
}) {
  const t = useScopedT("clipboard");
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const isAutoLoadingRef = useRef(false);
  const suppressSelectedCaptureScrollRef = useRef(false);
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
  const rows = useMemo<ClipboardCaptureListRow[]>(() => {
    const nextRows: ClipboardCaptureListRow[] = [];

    groups.forEach((group, groupIndex) => {
      nextRows.push({
        key: `group:${group.key}`,
        type: "group",
        group,
        isFirstGroup: groupIndex === 0,
      });

      group.captures.forEach((capture, captureIndex) => {
        nextRows.push({
          key: `capture:${capture.id}`,
          type: "capture",
          capture,
          groupKind: group.kind,
          isGroupFirst: captureIndex === 0,
        });
      });
    });

    if (isFetchingNextPage) {
      nextRows.push({
        key: "loading",
        type: "loading",
      });
    }

    return nextRows;
  }, [groups, isFetchingNextPage]);
  const captureRowIndexById = useMemo(() => {
    const nextIndexMap = new Map<string, number>();

    rows.forEach((row, rowIndex) => {
      if (row.type === "capture") {
        nextIndexMap.set(row.capture.id, rowIndex);
      }
    });

    return nextIndexMap;
  }, [rows]);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual uses imperative APIs that React Compiler intentionally skips memoizing.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => estimateClipboardCaptureListRowSize(rows[index]),
    getItemKey: (index) => rows[index]?.key ?? index,
    getScrollElement: () => scrollViewport,
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVirtualRowIndex = virtualRows[virtualRows.length - 1]?.index ?? -1;
  const resetScrollViewportToTop = useEffectEvent(() => {
    if (!scrollViewport) {
      return;
    }

    rowVirtualizer.measure();
    rowVirtualizer.scrollToOffset(0, {
      behavior: "auto",
    });
    scrollViewport.scrollTo({
      top: 0,
      behavior: "auto",
    });
  });
  const tryLoadMore = useEffectEvent(() => {
    if (
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
    if (
      !scrollViewport ||
      !hasNextPage ||
      isRefreshingList ||
      isFetchingNextPage ||
      rows.length === 0
    ) {
      return;
    }

    const preloadThresholdIndex = Math.max(rows.length - 6, 0);
    if (lastVirtualRowIndex < preloadThresholdIndex) {
      return;
    }

    tryLoadMore();
  }, [
    hasNextPage,
    isFetchingNextPage,
    isRefreshingList,
    lastVirtualRowIndex,
    rows.length,
    scrollViewport,
  ]);

  useLayoutEffect(() => {
    if (!scrollViewport || viewportResetRequest === 0) {
      return;
    }

    rowVirtualizer.measure();

    let nestedAnimationFrameId = 0;
    const animationFrameId = window.requestAnimationFrame(() => {
      rowVirtualizer.measure();
      nestedAnimationFrameId = window.requestAnimationFrame(() => {
        rowVirtualizer.measure();
      });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(nestedAnimationFrameId);
    };
  }, [rowVirtualizer, scrollViewport, viewportResetRequest]);

  useLayoutEffect(() => {
    if (!scrollViewport || scrollToTopRequest === 0) {
      return;
    }

    suppressSelectedCaptureScrollRef.current = true;
    resetScrollViewportToTop();
  }, [scrollToTopRequest, scrollViewport]);

  useLayoutEffect(() => {
    if (!scrollViewport || !selectedCaptureId) {
      return;
    }

    const selectedRowIndex = captureRowIndexById.get(selectedCaptureId);
    if (selectedRowIndex === undefined) {
      return;
    }

    if (suppressSelectedCaptureScrollRef.current) {
      suppressSelectedCaptureScrollRef.current = false;
      return;
    }

    const selectedRow = rows[selectedRowIndex];
    const firstCaptureRowIndex = rows.findIndex((row) => row.type === "capture");
    const shouldRevealGroupHeader =
      selectedRow?.type === "capture"
      && selectedRow.isGroupFirst
      && selectedRow.groupKind === "pinned";

    if (shouldRevealGroupHeader && selectedRowIndex === firstCaptureRowIndex) {
      scrollViewport.scrollTo({
        top: 0,
        behavior: "auto",
      });
      return;
    }

    rowVirtualizer.scrollToIndex(
      shouldRevealGroupHeader ? Math.max(0, selectedRowIndex - 1) : selectedRowIndex,
      {
        align: shouldRevealGroupHeader ? "start" : "auto",
      },
    );
  }, [captureRowIndexById, rowVirtualizer, rows, scrollViewport, selectedCaptureId]);

  useActiveContextMenuTarget({
    active: selectedCapture !== null,
    isEnabled: () => selectedCapture !== null,
    openMenu: async () => {
      if (!selectedCapture) {
        return false;
      }

      const resolveSelectedElement = () => {
        const captureId =
          typeof CSS === "undefined" ? selectedCapture.id : CSS.escape(selectedCapture.id);
        return scrollViewport?.querySelector<HTMLElement>(
          `[data-capture-id="${captureId}"]`,
        ) ?? null;
      };

      const selectedElement = resolveSelectedElement();
      if (selectedElement) {
        return openAtElement(selectedElement, selectedCapture);
      }

      const selectedRowIndex = captureRowIndexById.get(selectedCapture.id);
      const selectedRow = selectedRowIndex === undefined ? null : rows[selectedRowIndex];
      if (selectedRowIndex === undefined || !selectedRow) {
        return openAtElement(null, selectedCapture);
      }

      const shouldRevealPinnedHeader =
        selectedRow.type === "capture"
        && selectedRow.isGroupFirst
        && selectedRow.groupKind === "pinned";

      rowVirtualizer.scrollToIndex(
        shouldRevealPinnedHeader
          ? Math.max(0, selectedRowIndex - 1)
          : selectedRowIndex,
        {
          align: shouldRevealPinnedHeader ? "start" : "auto",
        },
      );

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      });

      return openAtElement(resolveSelectedElement(), selectedCapture);
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/55 bg-card/72">
      <div
        ref={setScrollViewport}
        data-window-drag-disabled="true"
        className="app-scroll-area min-h-0 flex-1 overflow-y-auto p-2"
        style={{
          overflowAnchor: "none",
        }}
      >
        <div
          className="relative w-full"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];

            if (!row) {
              return null;
            }

            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.type === "group" ? (
                  <div
                    className={cn(
                      "flex items-end px-1 pb-1.5",
                      row.isFirstGroup ? "h-5" : "h-[30px] pt-2.5",
                    )}
                  >
                    <p
                      className={cn(
                        "text-[9px]/[14px] font-semibold tracking-[0.18em] uppercase",
                        row.group.kind === "pinned"
                          ? "inline-flex items-center gap-1.5 text-foreground/72"
                          : "text-muted-foreground/78",
                      )}
                    >
                      {row.group.kind === "pinned" ? <Pin className="size-3" /> : null}
                      <span>{row.group.label}</span>
                    </p>
                  </div>
                ) : null}

                {row.type === "capture" ? (
                  <div className="pb-0.5">
                    <CaptureListRow
                      capture={row.capture}
                      groupKind={row.groupKind}
                      isGroupFirst={row.isGroupFirst}
                      isSelected={selectedCaptureId === row.capture.id}
                      onConfirmCapture={() =>
                        void confirmCapture.execute({ captureId: row.capture.id })}
                      onContextMenu={onContextMenu}
                      onOpenMenu={openAtElement}
                      onSelectCapture={() =>
                        void selectCapture.execute({ captureId: row.capture.id })}
                    />
                  </div>
                ) : null}

                {row.type === "loading" ? (
                  <div className="flex h-8 items-center justify-center px-2 text-[11px]/[14px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                    {t("groups.loadingOlder")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CaptureListRow({
  capture,
  groupKind,
  isGroupFirst,
  isSelected,
  onConfirmCapture,
  onContextMenu,
  onOpenMenu,
  onSelectCapture,
}: {
  capture: ClipboardCapture;
  groupKind: ClipboardCaptureGroup["kind"];
  isGroupFirst: boolean;
  isSelected: boolean;
  onConfirmCapture: () => void;
  onContextMenu: (event: React.MouseEvent, context: ClipboardCapture) => void;
  onOpenMenu: (element: Element | null, context: ClipboardCapture) => boolean;
  onSelectCapture: () => void;
}) {
  const t = useScopedT("clipboard");
  return (
    <div
      data-capture-id={capture.id}
      data-group-first={isGroupFirst ? "true" : "false"}
      data-group-kind={groupKind}
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
        onClick={onSelectCapture}
        onDoubleClick={onConfirmCapture}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <CaptureThumb capture={capture} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground/92">
            {captureListSummary(capture, t)}
          </p>
        </div>
      </button>

      <button
        type="button"
        aria-label={t("capture.moreActions")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(event.currentTarget, capture);
        }}
        className={cn(
          "inline-flex h-7 w-4 shrink-0 items-center justify-center text-muted-foreground/72 transition-[opacity,color] group-hover:text-foreground/70 hover:text-foreground/82 group-focus-within:text-foreground/70 dark:text-muted-foreground/62 dark:group-hover:text-foreground/84 dark:hover:text-foreground/92 dark:group-focus-within:text-foreground/84",
          isSelected
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
      >
        <EllipsisVertical className="size-3.5" />
      </button>
    </div>
  );
}

function CaptureThumb({ capture }: { capture: ClipboardCapture }) {
  const t = useScopedT("clipboard");
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
            ? t("capture.thumbnailAlt.video")
            : t("capture.thumbnailAlt.image"))}
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
