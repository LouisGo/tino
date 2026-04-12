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
import { useContextMenuStore } from "@/core/context-menu";
import { ShortcutKbd } from "@/core/shortcuts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  CaptureImageLightbox,
  CaptureOcrLightbox,
} from "@/features/clipboard/components/capture-preview";
import { ClipboardBoardCornerAction } from "@/features/clipboard/components/clipboard-board-corner-action";
import {
  ClipboardCaptureList,
} from "@/features/clipboard/components/clipboard-capture-list";
import { ClipboardCaptureDetail } from "@/features/clipboard/components/clipboard-capture-detail";
import {
  ClipboardEmptyState,
  type ClipboardEmptyStateTone,
} from "@/features/clipboard/components/clipboard-empty-state";
import {
  buildClipboardCaptureGroups,
  captureTitle,
  getClipboardFilterOptions,
  getClipboardFilterOption,
  getDefaultClipboardSelection,
  getDefaultVisibleClipboardSelection,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardAccessibilityStore } from "@/features/clipboard/stores/clipboard-accessibility-store";
import {
  selectClipboardSearchFocusBlockingLayer,
  useClipboardBoardStore,
} from "@/features/clipboard/stores/clipboard-board-store";
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
  pinnedCaptures,
  hasNextPage,
  isRefreshingList,
  isFetchingNextPage,
  onLoadMore,
  emptyStateTitle,
  emptyStateDescription,
  emptyStateTone,
  onRetry,
  fillHeight = false,
  windowMode = false,
  autoFocusSearch = false,
  searchFocusRequest = 0,
}: {
  captures: ClipboardCapture[];
  pinnedCaptures: ClipboardCapture[];
  hasNextPage?: boolean;
  isRefreshingList?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  emptyStateTone?: ClipboardEmptyStateTone;
  onRetry?: () => void;
  fillHeight?: boolean;
  windowMode?: boolean;
  autoFocusSearch?: boolean;
  searchFocusRequest?: number;
}) {
  const t = useScopedT("clipboard");
  const selectedCaptureId = useClipboardBoardStore((state) => state.selectedCaptureId);
  const previewingImageId = useClipboardBoardStore((state) => state.previewingImageId);
  const previewingOcrCaptureId = useClipboardBoardStore((state) => state.previewingOcrCaptureId);
  const pendingDeleteCapture = useClipboardBoardStore((state) => state.pendingDeleteCapture);
  const pendingPinCapture = useClipboardBoardStore((state) => state.pendingPinCapture);
  const isShortcutHelpOpen = useClipboardBoardStore((state) => state.isShortcutHelpOpen);
  const searchValue = useClipboardBoardStore((state) => state.searchValue);
  const filter = useClipboardBoardStore((state) => state.filter);
  const listScrollRequest = useClipboardBoardStore((state) => state.listScrollRequest);
  const setPreviewingImageId = useClipboardBoardStore((state) => state.setPreviewingImageId);
  const setPreviewingOcrCaptureId = useClipboardBoardStore((state) => state.setPreviewingOcrCaptureId);
  const setPendingDeleteCapture = useClipboardBoardStore((state) => state.setPendingDeleteCapture);
  const setPendingPinCapture = useClipboardBoardStore((state) => state.setPendingPinCapture);
  const setIsShortcutHelpOpen = useClipboardBoardStore((state) => state.setIsShortcutHelpOpen);
  const openImageLightbox = useCommand<{ captureId: string }>("clipboard.showImageLightbox");
  const confirmPinCapture = useCommand<{
    capture: ClipboardCapture;
    replaceOldest?: boolean;
  }>("clipboard.pinCapture");
  const confirmDeleteCapture = useCommand<{ capture: ClipboardCapture }>("clipboard.deleteCapture");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [showWindowSelectionTip, setShowWindowSelectionTip] = useState(false);
  const [windowTargetAppName, setWindowTargetAppName] = useState<string | null>(null);
  const hideWindowSelectionTipTimeoutRef = useRef<number | null>(null);
  const lastActiveTipCaptureIdRef = useRef<string | null>(null);
  const visibleCaptures = [...pinnedCaptures, ...captures];
  const captureGroups = buildClipboardCaptureGroups({
    captures,
    pinnedCaptures,
    t,
  });
  const oldestPinnedLabel = pinnedCaptures[0]
    ? captureTitle(pinnedCaptures[0], t)
    : t("dialogs.pinLimit.oldestFallback");
  const defaultSelectedCapture = getDefaultClipboardSelection(captures, pinnedCaptures);
  const selectedCapture =
    visibleCaptures.find((capture) => capture.id === selectedCaptureId) ??
    defaultSelectedCapture ??
    null;
  const previewingImage =
    visibleCaptures.find((capture) => capture.id === previewingImageId) ?? null;
  const previewingOcrCapture =
    visibleCaptures.find((capture) => capture.id === previewingOcrCaptureId) ?? null;
  const canShowWindowSelectionTip =
    windowMode &&
    Boolean(selectedCapture) &&
    !previewingImageId &&
    !previewingOcrCaptureId &&
    !pendingDeleteCapture &&
    !pendingPinCapture;
  const highlightQuery = searchValue.trim();
  const hasVisibleCaptures = visibleCaptures.length > 0;
  const isFilteringResults = filter !== "all" || highlightQuery.length > 0;
  const showEmptyOverlay = !hasVisibleCaptures;
  const renderedCaptureGroups = captureGroups;
  const renderedSelectedCapture = selectedCapture;
  const resolvedEmptyStateTitle =
    emptyStateTitle ??
    (isFilteringResults ? t("empty.filteredTitle") : t("empty.defaultTitle"));
  const resolvedEmptyStateDescription =
    emptyStateDescription ??
    (isFilteringResults
      ? t("empty.filteredDescription")
      : t("empty.defaultDescription"));

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
      getDefaultVisibleClipboardSelection(
        state.visibleCaptures,
        state.pinnedCaptures.map((entry) => entry.capture.id),
      )?.id ??
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
  }, [searchFocusRequest, windowMode]);

  useEffect(() => {
    if (!windowMode) {
      return;
    }

    const syncWindowSelectionTip = (state = useClipboardBoardStore.getState()) => {
      const activeCaptureId = resolveActiveCaptureId(state);
      const canShowTip =
        Boolean(activeCaptureId) &&
        !state.previewingImageId &&
        !state.previewingOcrCaptureId &&
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
      const previewingOcrChanged =
        state.previewingOcrCaptureId !== previousState.previewingOcrCaptureId;
      const pendingDeleteCaptureChanged =
        state.pendingDeleteCapture?.id !== previousState.pendingDeleteCapture?.id;

      if (
        activeCaptureId === previousActiveCaptureId &&
        !previewingImageChanged &&
        !previewingOcrChanged &&
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
  }, [searchFocusRequest, windowMode]);

  function closeDeleteDialog() {
    setPendingDeleteCapture(null);
  }

  function closePinDialog() {
    setPendingPinCapture(null);
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

  function handleConfirmPin(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!pendingPinCapture || isPinning) {
      return;
    }

    try {
      const result = confirmPinCapture.execute({
        capture: pendingPinCapture,
        replaceOldest: true,
      });
      if (!isPromiseLike(result)) {
        closePinDialog();
        return;
      }

      setIsPinning(true);
      void Promise.resolve(result)
        .then(() => {
          closePinDialog();
        })
        .catch((error) => {
          console.error("[clipboard] failed to pin capture", error);
        })
        .finally(() => {
          setIsPinning(false);
        });
    } catch (error) {
      console.error("[clipboard] failed to pin capture", error);
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
        <ClipboardBoardToolbar
          autoFocusSearch={autoFocusSearch}
          searchFocusRequest={searchFocusRequest}
          windowMode={windowMode}
        />
        <ClipboardAccessibilityBanner />

        <div className={cn("overflow-hidden", windowMode && "min-h-0 flex-1")}>
          <div className="relative min-h-0 h-full">
            <div
              className={cn(
                windowMode
                  ? "grid min-h-0 grid-cols-[clamp(15rem,24vw,24rem)_minmax(0,1fr)] items-stretch gap-0"
                  : "grid min-h-0 grid-cols-[clamp(14rem,24vw,24rem)_minmax(0,1fr)] items-stretch gap-0",
                windowMode
                  ? "h-full"
                  : fillHeight
                    ? "h-[calc(100vh-3.75rem)]"
                    : "h-[clamp(34rem,68vh,46rem)] xl:h-[calc(100vh-18rem)]",
              )}
              aria-hidden={showEmptyOverlay}
              inert={showEmptyOverlay}
            >
              <ClipboardCaptureList
                groups={renderedCaptureGroups}
                selectedCaptureId={renderedSelectedCapture?.id ?? null}
                hasNextPage={hasNextPage}
                isRefreshingList={isRefreshingList}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={onLoadMore}
                scrollToTopRequest={listScrollRequest}
                viewportResetRequest={windowMode ? searchFocusRequest : 0}
              />

              <div className="flex h-full min-h-0 min-w-0 flex-col self-stretch bg-card/92">
                <ClipboardCaptureDetail
                  capture={renderedSelectedCapture}
                  highlightQuery={highlightQuery}
                  onOpenImage={() => {
                    if (renderedSelectedCapture) {
                      void openImageLightbox.execute({ captureId: renderedSelectedCapture.id });
                    }
                  }}
                  onOpenImageOcr={() => {
                    if (renderedSelectedCapture?.contentKind !== "image") {
                      return;
                    }

                    setPreviewingImageId(null);
                    setPreviewingOcrCaptureId(renderedSelectedCapture.id);
                  }}
                />
              </div>
            </div>

            {showEmptyOverlay ? (
              <div className="absolute inset-0 z-10">
                <ClipboardEmptyState
                  title={resolvedEmptyStateTitle}
                  description={resolvedEmptyStateDescription}
                  onRetry={onRetry}
                  tone={emptyStateTone}
                  className="h-full min-h-0 w-full rounded-none border-0 shadow-none"
                />
              </div>
            ) : null}
          </div>
        </div>

        {windowMode ? (
          <ClipboardWindowSelectionTip
            targetLabel={windowTargetAppName}
            visible={showWindowSelectionTip && canShowWindowSelectionTip}
          />
        ) : null}

        <ClipboardBoardCornerAction onOpenShortcuts={() => setIsShortcutHelpOpen(true)} />
      </section>

      <CaptureImageLightbox
        capture={previewingImage}
        onClose={() => setPreviewingImageId(null)}
      />

      <CaptureOcrLightbox
        key={previewingOcrCapture?.id ?? "clipboard-ocr-preview"}
        capture={previewingOcrCapture}
        onClose={() => setPreviewingOcrCaptureId(null)}
      />

      <AlertDialog
        open={isShortcutHelpOpen}
        onOpenChange={setIsShortcutHelpOpen}
      >
        <AlertDialogContent className="max-w-[min(34rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0 sm:p-0">
          <ClipboardShortcutHelpDialogBody windowMode={windowMode} />
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingPinCapture)}
        onOpenChange={(open: boolean) => {
          if (!open && !isPinning) {
            closePinDialog();
          }
        }}
      >
        <AlertDialogContent className="max-w-[min(25rem,calc(100vw-2rem))]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.pinLimit.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialogs.pinLimit.description", {
                values: {
                  oldest: oldestPinnedLabel,
                },
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPinning}>{t("dialogs.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPinning || !pendingPinCapture}
              onClick={handleConfirmPin}
            >
              {isPinning ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("dialogs.pinLimit.pending")}
                </>
              ) : (
                t("dialogs.pinLimit.confirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogTitle>{t("dialogs.deleteCapture.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialogs.deleteCapture.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("dialogs.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting || !pendingDeleteCapture}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("dialogs.deleteCapture.pending")}
                </>
              ) : (
                t("dialogs.deleteCapture.confirm")
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
  const t = useScopedT("clipboard");
  const title = targetLabel
    ? t("window.pasteToTarget", {
        values: {
          appName: targetLabel,
        },
      })
    : t("window.pasteToPreviousApp");

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
          className="shrink-0"
          size="lg"
        />
      </div>
    </div>
  );
}

function ClipboardShortcutHelpDialogBody({ windowMode }: { windowMode: boolean }) {
  const t = useScopedT("clipboard");
  const shortcutRows: Array<{
    id: string;
    description: string;
    shortcutIds: string[];
  }> = [
    {
      id: "open-selected-capture",
      description: t("dialogs.shortcuts.rows.openSelectedCapture"),
      shortcutIds: ["clipboard.openSelectedCapture"],
    },
    {
      id: "open-actions",
      description: t("dialogs.shortcuts.rows.openActions"),
      shortcutIds: ["contextMenu.openActiveTarget"],
    },
    {
      id: "cycle-preview-modes",
      description: t("dialogs.shortcuts.rows.cyclePreviewModes"),
      shortcutIds: [
        "clipboard.cyclePreviewModeBackward",
        "clipboard.cyclePreviewModeForward",
      ],
    },
    {
      id: "move-between-captures",
      description: t("dialogs.shortcuts.rows.moveBetweenCaptures"),
      shortcutIds: [
        "clipboard.selectPreviousCapture",
        "clipboard.selectNextCapture",
      ],
    },
    {
      id: "focus-search",
      description: t("dialogs.shortcuts.rows.focusSearch"),
      shortcutIds: ["clipboard.focusSearch"],
    },
    {
      id: "open-filter",
      description: t("dialogs.shortcuts.rows.openFilter"),
      shortcutIds: ["clipboard.openFilter"],
    },
    {
      id: "jump-to-edges",
      description: t("dialogs.shortcuts.rows.jumpToEdges"),
      shortcutIds: [
        "clipboard.selectFirstCapture",
        "clipboard.selectLastCapture",
      ],
    },
    {
      id: "paste",
      description: windowMode
        ? t("dialogs.shortcuts.rows.pasteBack")
        : t("dialogs.shortcuts.rows.pasteFloating"),
      shortcutIds: ["clipboard.confirmWindowSelection"],
    },
    {
      id: "dismiss",
      description: t("dialogs.shortcuts.rows.dismiss"),
      shortcutIds: ["clipboard.dismissWindow"],
    },
  ];

  return (
    <div className="grid">
      <div className="border-b border-border/55 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--card)_92%,white_8%),color-mix(in_oklch,var(--card)_86%,var(--background)_14%))] px-4 pt-3.5 pb-3 sm:px-5 sm:pt-4 sm:pb-3.5">
        <AlertDialogTitle className="text-base sm:text-[1.02rem]">
          {t("dialogs.shortcuts.title")}
        </AlertDialogTitle>
      </div>

      <div className="px-4 pt-2 pb-2.5 sm:px-5 sm:pt-2 sm:pb-3">
        <div className="mb-1 hidden grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1 py-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/70 uppercase sm:grid">
          <span>{t("dialogs.shortcuts.actionHeader")}</span>
          <span>{t("dialogs.shortcuts.shortcutHeader")}</span>
        </div>

        <div className="divide-y divide-border/45">
          {shortcutRows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2 px-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
            >
              <div className="min-w-0">
                <p className="text-sm leading-5.5 text-foreground/88">{row.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {row.shortcutIds.map((shortcutId, index) => (
                  <span key={shortcutId} className="inline-flex items-center gap-2">
                    {index > 0 ? (
                      <span
                        aria-hidden="true"
                        className="text-xs text-muted-foreground/52"
                      >
                        /
                      </span>
                    ) : null}
                    <ShortcutKbd shortcutId={shortcutId} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t border-border/55 px-4 pt-3 pb-3.5 sm:px-5 sm:pt-3 sm:pb-4">
        <AlertDialogCancel className="h-8 px-3 text-xs">
          {t("dialogs.gotIt")}
        </AlertDialogCancel>
      </div>
    </div>
  );
}

function ClipboardBoardToolbar({
  autoFocusSearch = false,
  searchFocusRequest = 0,
  windowMode = false,
}: {
  autoFocusSearch?: boolean;
  searchFocusRequest?: number;
  windowMode?: boolean;
}) {
  const t = useScopedT("clipboard");
  const searchValue = useClipboardBoardStore((state) => state.searchValue);
  const filter = useClipboardBoardStore((state) => state.filter);
  const isFilterSelectOpen = useClipboardBoardStore((state) => state.isFilterSelectOpen);
  const searchInputFocusRequest = useClipboardBoardStore((state) => state.searchInputFocusRequest);
  const hasClipboardFocusBlockingLayer = useClipboardBoardStore(
    selectClipboardSearchFocusBlockingLayer,
  );
  const setSearchValue = useClipboardBoardStore((state) => state.setSearchValue);
  const setFilter = useClipboardBoardStore((state) => state.setFilter);
  const setIsFilterSelectOpen = useClipboardBoardStore((state) => state.setIsFilterSelectOpen);
  const isContextMenuOpen = useContextMenuStore((state) => state.isOpen);
  const filterOptions = getClipboardFilterOptions(t);
  const activeFilter = getClipboardFilterOption(filter, t);
  const hasSearchValue = searchValue.trim().length > 0;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasFocusBlockingLayer = hasClipboardFocusBlockingLayer || isContextMenuOpen;
  const previousFocusBlockingLayerRef = useRef(hasFocusBlockingLayer);

  useEffect(() => {
    if (
      (!autoFocusSearch || searchFocusRequest === 0)
      && searchInputFocusRequest === 0
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocusSearch, searchFocusRequest, searchInputFocusRequest]);

  useEffect(() => {
    const wasFocusBlocked = previousFocusBlockingLayerRef.current;
    previousFocusBlockingLayerRef.current = hasFocusBlockingLayer;

    if (!windowMode || !wasFocusBlocked || hasFocusBlockingLayer) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [hasFocusBlockingLayer, windowMode]);

  return (
    <div className="app-board-toolbar border-b border-border/55 px-2.5 py-2.5 sm:px-3 sm:py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-2.5">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            ref={searchInputRef}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder={t("toolbar.searchPlaceholder")}
            data-clipboard-search-input="true"
            autoFocus={autoFocusSearch}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-form-type="other"
            name="clipboard-panel-search"
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
              aria-label={t("toolbar.clearSearch")}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center justify-end">
          <div className="relative">
            <span className="sr-only">{t("toolbar.filterAria")}</span>
            <Select
              open={isFilterSelectOpen}
              value={filter}
              onOpenChange={setIsFilterSelectOpen}
              onValueChange={setFilter}
            >
              <SelectTrigger
                aria-label={t("toolbar.filterAria")}
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
              <SelectContent
                align="end"
                className="rounded-[18px] border-border/70 bg-card/96 shadow-[0_16px_40px_color-mix(in_oklch,var(--foreground)_12%,transparent)]"
              >
                {filterOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-10 rounded-[13px] py-2"
                  >
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
