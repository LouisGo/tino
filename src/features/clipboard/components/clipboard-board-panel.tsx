import {
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle, RotateCcw, Search, ShieldAlert, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useCommand } from "@/core/commands";
import { ShortcutKbd } from "@/core/shortcuts";
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
import { useClipboardAccessibilityStore } from "@/features/clipboard/stores/clipboard-accessibility-store";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import {
  getClipboardWindowTargetAppName,
  openAccessibilitySettings,
  requestAppRestart,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useScopedT } from "@/i18n";
import type { ClipboardCapture } from "@/types/shell";

const WINDOW_SELECTION_TIP_IDLE_MS = 2000;

export function ClipboardBoardPanel({
  captures,
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  emptyStateTitle,
  emptyStateDescription,
  onRetry,
  fillHeight = false,
  windowMode = false,
  autoFocusSearch = false,
}: {
  captures: ClipboardCapture[];
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onRetry?: () => void;
  fillHeight?: boolean;
  windowMode?: boolean;
  autoFocusSearch?: boolean;
}) {
  const selectedCaptureId = useClipboardBoardStore((state) => state.selectedCaptureId);
  const previewingImageId = useClipboardBoardStore((state) => state.previewingImageId);
  const pendingDeleteCapture = useClipboardBoardStore((state) => state.pendingDeleteCapture);
  const setPreviewingImageId = useClipboardBoardStore((state) => state.setPreviewingImageId);
  const setPendingDeleteCapture = useClipboardBoardStore((state) => state.setPendingDeleteCapture);
  const openImageLightbox = useCommand<{ captureId: string }>("clipboard.showImageLightbox");
  const confirmDeleteCapture = useCommand<{ capture: ClipboardCapture }>("clipboard.deleteCapture");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWindowSelectionTip, setShowWindowSelectionTip] = useState(false);
  const [windowTargetAppName, setWindowTargetAppName] = useState<string | null>(null);
  const hideWindowSelectionTipTimeoutRef = useRef<number | null>(null);
  const lastActiveTipCaptureIdRef = useRef<string | null>(null);
  const captureGroups = groupCapturesByDay(captures);
  const selectedCapture =
    captures.find((capture) => capture.id === selectedCaptureId) ??
    captures[0] ??
    null;
  const previewingImage =
    captures.find((capture) => capture.id === previewingImageId) ?? null;
  const canShowWindowSelectionTip =
    windowMode &&
    Boolean(selectedCapture) &&
    !previewingImageId &&
    !pendingDeleteCapture;

  function clearWindowSelectionTipTimeout() {
    if (hideWindowSelectionTipTimeoutRef.current !== null) {
      window.clearTimeout(hideWindowSelectionTipTimeoutRef.current);
      hideWindowSelectionTipTimeoutRef.current = null;
    }
  }

  function resolveActiveCaptureId(
    state = useClipboardBoardStore.getState(),
  ) {
    return (
      state.visibleCaptures.find((capture) => capture.id === state.selectedCaptureId)?.id ??
      state.visibleCaptures[0]?.id ??
      null
    );
  }

  useEffect(() => {
    if (!windowMode) {
      return;
    }

    let cancelled = false;

    void getClipboardWindowTargetAppName()
      .then((appName) => {
        if (cancelled) {
          return;
        }

        const normalizedAppName = appName?.trim();
        setWindowTargetAppName(
          normalizedAppName && normalizedAppName.length > 0 ? normalizedAppName : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setWindowTargetAppName(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [windowMode]);

  useEffect(() => {
    if (!windowMode) {
      return;
    }

    const syncWindowSelectionTip = (state = useClipboardBoardStore.getState()) => {
      const activeCaptureId = resolveActiveCaptureId(state);
      const canShowTip =
        Boolean(activeCaptureId) &&
        !state.previewingImageId &&
        !state.pendingDeleteCapture;
      const previousActiveCaptureId = lastActiveTipCaptureIdRef.current;

      lastActiveTipCaptureIdRef.current = activeCaptureId;

      if (!canShowTip) {
        setShowWindowSelectionTip(false);
        clearWindowSelectionTipTimeout();
        return;
      }

      if (activeCaptureId !== previousActiveCaptureId) {
        setShowWindowSelectionTip(true);
        clearWindowSelectionTipTimeout();
        hideWindowSelectionTipTimeoutRef.current = window.setTimeout(() => {
          hideWindowSelectionTipTimeoutRef.current = null;
          setShowWindowSelectionTip(false);
        }, WINDOW_SELECTION_TIP_IDLE_MS);
      }
    };

    const initialSyncTimeout = window.setTimeout(() => {
      syncWindowSelectionTip();
    }, 0);

    const unsubscribe = useClipboardBoardStore.subscribe((state, previousState) => {
      const activeCaptureId = resolveActiveCaptureId(state);
      const previousActiveCaptureId = resolveActiveCaptureId(previousState);
      const previewingImageChanged =
        state.previewingImageId !== previousState.previewingImageId;
      const pendingDeleteCaptureChanged =
        state.pendingDeleteCapture?.id !== previousState.pendingDeleteCapture?.id;

      if (
        activeCaptureId === previousActiveCaptureId &&
        !previewingImageChanged &&
        !pendingDeleteCaptureChanged
      ) {
        return;
      }

      syncWindowSelectionTip(state);
    });

    return () => {
      window.clearTimeout(initialSyncTimeout);
      unsubscribe();
      lastActiveTipCaptureIdRef.current = null;
      if (hideWindowSelectionTipTimeoutRef.current !== null) {
        window.clearTimeout(hideWindowSelectionTipTimeoutRef.current);
        hideWindowSelectionTipTimeoutRef.current = null;
      }
    };
  }, [windowMode]);

  function closeDeleteDialog() {
    setPendingDeleteCapture(null);
  }

  function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "then" in value
    );
  }

  function handleConfirmDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!pendingDeleteCapture || isDeleting) {
      return;
    }

    try {
      const result = confirmDeleteCapture.execute({ capture: pendingDeleteCapture });
      if (!isPromiseLike(result)) {
        closeDeleteDialog();
        return;
      }

      setIsDeleting(true);
      void Promise.resolve(result)
        .then(() => {
          closeDeleteDialog();
        })
        .catch((error) => {
          console.error("[clipboard] failed to delete capture", error);
        })
        .finally(() => {
          setIsDeleting(false);
        });
    } catch (error) {
      console.error("[clipboard] failed to delete capture", error);
    }
  }

  return (
    <>
      <section
        className={cn(
          "app-board-surface relative overflow-hidden",
          windowMode && "flex h-screen flex-col",
        )}
      >
        <ClipboardBoardToolbar autoFocusSearch={autoFocusSearch} />
        <ClipboardAccessibilityBanner />

        <div className={cn("overflow-hidden", windowMode && "min-h-0 flex-1")}>
          <div
            className={cn(
              "grid min-h-0 grid-cols-[clamp(14rem,24vw,24rem)_minmax(0,1fr)] items-stretch gap-0",
              windowMode
                ? "h-full"
                : fillHeight
                  ? "h-[calc(100vh-3.75rem)]"
                  : "h-[clamp(34rem,68vh,46rem)] xl:h-[calc(100vh-18rem)]",
            )}
          >
            <ClipboardCaptureList
              groups={captureGroups}
              selectedCaptureId={selectedCapture?.id ?? null}
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
                    void openImageLightbox.execute({ captureId: selectedCapture.id });
                  }
                }}
              />
            </div>
          </div>
        </div>

        {windowMode ? (
          <ClipboardWindowSelectionTip
            targetLabel={windowTargetAppName}
            visible={showWindowSelectionTip && canShowWindowSelectionTip}
          />
        ) : null}
      </section>

      <CaptureImageLightbox
        capture={previewingImage}
        onClose={() => setPreviewingImageId(null)}
      />

      <AlertDialog
        open={Boolean(pendingDeleteCapture)}
        onOpenChange={(open: boolean) => {
          if (!open && !isDeleting) {
            closeDeleteDialog();
          }
        }}
      >
        <AlertDialogContent className="max-w-[min(25rem,calc(100vw-2rem))]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete This Clipboard Capture?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the item from clipboard history and the local board cache.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting || !pendingDeleteCapture}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Capture"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ClipboardAccessibilityBanner() {
  const tCommon = useScopedT("common");
  const phase = useClipboardAccessibilityStore((state) => state.phase);

  if (phase === "idle") {
    return null;
  }

  const restartRequired = phase === "restartRequired";

  return (
    <div
      className={cn(
        "border-b px-3 py-3 sm:px-4",
        restartRequired
          ? "app-tone-success app-tone-panel"
          : "app-tone-warning app-tone-panel",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
            {restartRequired ? (
              <RotateCcw className="size-4 text-success-foreground" />
            ) : (
              <ShieldAlert className="size-4 text-warning-foreground" />
            )}
            <span>
              {restartRequired
                ? tCommon("clipboardPermission.bannerRestartTitle")
                : tCommon("clipboardPermission.bannerEnableTitle")}
            </span>
          </div>
          <p className="max-w-3xl text-[13px] leading-5 text-muted-foreground">
            {restartRequired
              ? tCommon("clipboardPermission.bannerRestartDescription")
              : tCommon("clipboardPermission.bannerEnableDescription")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {restartRequired ? (
            <Button
              size="sm"
              onClick={() => {
                void requestAppRestart();
              }}
            >
              {tCommon("clipboardPermission.bannerRestartAction")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void openAccessibilitySettings();
              }}
            >
              {tCommon("clipboardPermission.bannerOpenSettingsAction")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClipboardWindowSelectionTip({
  targetLabel,
  visible,
}: {
  targetLabel: string | null;
  visible: boolean;
}) {
  const title = targetLabel ? `Paste to ${targetLabel}` : "Paste to previous app";

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 transition-all duration-200 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <div
        className="app-clipboard-window-tip inline-flex items-center gap-3 rounded-[18px] px-3.5 py-2"
        role="status"
        aria-live="polite"
      >
        <span className="text-[11px] font-medium text-foreground/72">{title}</span>
        <ShortcutKbd
          shortcutId="clipboard.confirmWindowSelection"
          className="shrink-0 [&_kbd]:min-h-5 [&_kbd]:min-w-5 [&_kbd]:rounded-[7px] [&_kbd]:px-1.5 [&_kbd]:text-[9px]"
        />
      </div>
    </div>
  );
}

function ClipboardBoardToolbar({
  autoFocusSearch = false,
}: {
  autoFocusSearch?: boolean;
}) {
  const searchValue = useClipboardBoardStore((state) => state.searchValue);
  const filter = useClipboardBoardStore((state) => state.filter);
  const setSearchValue = useClipboardBoardStore((state) => state.setSearchValue);
  const setFilter = useClipboardBoardStore((state) => state.setFilter);
  const activeFilter = getClipboardFilterOption(filter);
  const hasSearchValue = searchValue.trim().length > 0;

  return (
    <div className="app-board-toolbar border-b border-border/55 px-2.5 py-2.5 sm:px-3 sm:py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-2.5">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Type to filter entries..."
            data-clipboard-search-input="true"
            autoFocus={autoFocusSearch}
            className={cn(
              "h-10 rounded-[18px] border-border/55 bg-background/70 pl-9 text-[13px] shadow-none placeholder:text-muted-foreground/78 focus-visible:border-border/70 focus-visible:bg-card/88 focus-visible:ring-[2px] focus-visible:ring-ring/18",
              hasSearchValue ? "pr-10" : "",
            )}
          />
          {hasSearchValue ? (
            <button
              type="button"
              onClick={() => setSearchValue("")}
              className="absolute top-1/2 right-2.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/80 transition hover:bg-secondary/70 hover:text-foreground"
              aria-label="Clear search keyword"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-end">
          <div className="relative">
            <span className="sr-only">Filter capture types</span>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger
                aria-label="Filter capture types"
                className="h-10 w-[124px] rounded-[18px] border-border/55 bg-background/70 pl-3.5 text-[13px] shadow-none focus:border-border/70 focus:ring-[2px] focus:ring-ring/18 sm:w-[140px]"
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
