import { useEffect, useRef, useState } from "react";

import {
  LoaderCircle,
  Pause,
  Play,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dismissClipboardCapturePauseGuide,
  getClipboardCapturePauseGuideDismissed,
} from "@/features/clipboard/lib/clipboard-capture-pause-guide";
import { useClipboardCaptureControl } from "@/hooks/use-clipboard-capture-control";
import { usePersistedAppSettings } from "@/hooks/use-persisted-app-settings";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";

const PAUSE_GUIDE_AUTO_HIDE_MS = 5000;

export function ClipboardBoardCornerAction({
  onOpenShortcuts,
}: {
  onOpenShortcuts: () => void;
}) {
  const t = useScopedT("clipboard");
  const persistedSettingsQuery = usePersistedAppSettings();
  const clipboardCaptureEnabled = persistedSettingsQuery.data?.clipboardCaptureEnabled ?? true;
  const { isPending, setClipboardCaptureEnabled } = useClipboardCaptureControl();
  const [isPauseGuideOpen, setIsPauseGuideOpen] = useState(false);
  const showGuideTimeoutRef = useRef<number | null>(null);
  const autoHideTimeoutRef = useRef<number | null>(null);
  const previousPausedRef = useRef(false);
  const paused = !clipboardCaptureEnabled;

  function clearShowGuideTimeout() {
    if (showGuideTimeoutRef.current !== null) {
      window.clearTimeout(showGuideTimeoutRef.current);
      showGuideTimeoutRef.current = null;
    }
  }

  function clearAutoHideTimeout() {
    if (autoHideTimeoutRef.current !== null) {
      window.clearTimeout(autoHideTimeoutRef.current);
      autoHideTimeoutRef.current = null;
    }
  }

  function openPauseGuide(autoHide: boolean) {
    clearShowGuideTimeout();
    setIsPauseGuideOpen(true);
    clearAutoHideTimeout();

    if (!autoHide) {
      return;
    }

    autoHideTimeoutRef.current = window.setTimeout(() => {
      autoHideTimeoutRef.current = null;
      setIsPauseGuideOpen(false);
    }, PAUSE_GUIDE_AUTO_HIDE_MS);
  }

  function closePauseGuide(options?: { persistDismissal?: boolean }) {
    clearShowGuideTimeout();
    clearAutoHideTimeout();
    setIsPauseGuideOpen(false);

    if (options?.persistDismissal) {
      dismissClipboardCapturePauseGuide();
    }
  }

  useEffect(() => {
    const wasPaused = previousPausedRef.current;
    previousPausedRef.current = paused;

    if (!paused) {
      if (showGuideTimeoutRef.current !== null) {
        window.clearTimeout(showGuideTimeoutRef.current);
        showGuideTimeoutRef.current = null;
      }

      if (autoHideTimeoutRef.current !== null) {
        window.clearTimeout(autoHideTimeoutRef.current);
        autoHideTimeoutRef.current = null;
      }
      return;
    }

    if (wasPaused || getClipboardCapturePauseGuideDismissed()) {
      return;
    }

    if (showGuideTimeoutRef.current !== null) {
      window.clearTimeout(showGuideTimeoutRef.current);
    }

    showGuideTimeoutRef.current = window.setTimeout(() => {
      showGuideTimeoutRef.current = null;
      setIsPauseGuideOpen(true);

      if (autoHideTimeoutRef.current !== null) {
        window.clearTimeout(autoHideTimeoutRef.current);
      }

      autoHideTimeoutRef.current = window.setTimeout(() => {
        autoHideTimeoutRef.current = null;
        setIsPauseGuideOpen(false);
      }, PAUSE_GUIDE_AUTO_HIDE_MS);
    }, 0);
  }, [paused]);

  useEffect(() => () => {
    if (showGuideTimeoutRef.current !== null) {
      window.clearTimeout(showGuideTimeoutRef.current);
    }

    if (autoHideTimeoutRef.current !== null) {
      window.clearTimeout(autoHideTimeoutRef.current);
    }
  }, []);

  return (
    <div className="absolute right-4 bottom-4 z-20 flex flex-col items-end gap-2">
      {paused && isPauseGuideOpen ? (
        <div className="relative w-[min(21rem,calc(100vw-2.5rem))] max-w-full">
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto rounded-[22px] border border-border/70 bg-card/96 p-3.5 shadow-[0_18px_46px_color-mix(in_oklch,var(--foreground)_12%,transparent)] backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/14 text-amber-700 dark:text-amber-300">
                <Pause className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {t("window.capturePaused.title")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("window.capturePaused.description")}
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      void setClipboardCaptureEnabled(true)
                        .then(() => {
                          closePauseGuide();
                        })
                        .catch(() => {});
                    }}
                  >
                    {isPending ? <LoaderCircle className="size-4 animate-spin" /> : (
                      <Play className="size-4" />
                    )}
                    {isPending
                      ? t("window.capturePaused.pending")
                      : t("window.capturePaused.resume")}
                  </Button>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/80 transition hover:bg-secondary/70 hover:text-foreground"
                aria-label={t("window.capturePaused.dismiss")}
                onClick={() => closePauseGuide({ persistDismissal: true })}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="absolute right-3 bottom-[-0.55rem] size-4 rotate-45 border-r border-b border-border/70 bg-card/96"
          />
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          "size-8 rounded-full border-border/60 bg-card/88 shadow-[0_12px_28px_color-mix(in_oklch,var(--foreground)_10%,transparent)] backdrop-blur-md transition hover:-translate-y-0.5 hover:border-border/75 hover:bg-card focus-visible:ring-[2px] focus-visible:ring-ring/24",
          paused ? "text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200" : "text-muted-foreground/88 hover:text-foreground",
        )}
        aria-label={paused ? t("window.pauseStatusButtonAria") : t("window.shortcutsButtonAria")}
        onClick={() => {
          if (paused) {
            openPauseGuide(false);
            return;
          }

          onOpenShortcuts();
        }}
      >
        {paused ? <Pause className="size-4" /> : (
          <span className="text-sm font-semibold leading-none">?</span>
        )}
      </Button>
    </div>
  );
}
