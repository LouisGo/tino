import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import {
  Check,
  Copy,
  Expand,
  ExternalLink,
  Link2,
  Minus,
  Plus,
  RotateCcw,
  ScanText,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useCommand } from "@/core/commands";
import { useShortcutScope } from "@/core/shortcuts";
import { FileReferencePreview } from "@/features/clipboard/components/file-reference-preview";
import { MarkdownTextPreview } from "@/features/clipboard/components/markdown-text-preview";
import {
  PreviewToolbar,
  PreviewToolbarPillButton,
} from "@/features/clipboard/components/preview-toolbar";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import {
  buildClipboardTextPreviewTabs,
  canRenderHtmlPreview,
  canRenderMarkdownPreview,
  normalizeMarkdownSource,
  preferredClipboardTextPreviewMode,
  resolveClipboardTextPreviewMode,
} from "@/features/clipboard/lib/clipboard-preview-modes";
import {
  PREVIEW_HIGHLIGHT_SELECTOR,
  highlightSanitizedHtmlContent,
  highlightTextContent,
  normalizeHighlightQuery,
} from "@/features/clipboard/lib/clipboard-preview-highlight";
import { normalizePreviewHtmlLayout } from "@/features/clipboard/lib/clipboard-preview-layout";
import {
  captureTitle,
  captureSurfaceClassName,
  isFileReferenceKind,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import {
  getExternalLinkTargetFromEventTarget,
  openExternalLink,
} from "@/lib/external-links";
import { useScopedT, type TranslationKey } from "@/i18n";
import { resolvePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";
import type { ClipboardCapture } from "@/types/shell";

const MIN_IMAGE_SCALE = 0.8;
const DEFAULT_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 6;
type ClipboardTranslate = (
  key: TranslationKey<"clipboard">,
  options?: {
    defaultValue?: string;
    values?: Record<string, boolean | Date | null | number | string | undefined>;
  },
) => string;
type ClipboardOpenCapturePayload = {
  capture?: ClipboardCapture | null;
};

export function CaptureDetailPreview({
  capture,
  highlightQuery,
  onOpenImage,
  onOpenImageOcr,
  sharedSurface = false,
  toolbarMeta,
  toolbarControls,
  toolbarActions,
}: {
  capture: ClipboardCapture;
  highlightQuery: string;
  onOpenImage: () => void;
  onOpenImageOcr: () => void;
  sharedSurface?: boolean;
  toolbarMeta?: ReactNode;
  toolbarControls?: ReactNode;
  toolbarActions?: ReactNode;
}) {
  const t = useScopedT("clipboard");
  const tCommon = useScopedT("common");
  const openCaptureExternally = useCommand<ClipboardOpenCapturePayload | undefined>(
    "clipboard.openCaptureExternally",
    { capture },
  );
  const assetSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.assetPath : null,
  );
  const linkIconSrc = useClipboardAssetSrc(
    capture.contentKind === "link" ? capture.linkMetadata?.iconPath ?? null : null,
  );
  const surfaceClassName = sharedSurface ? "" : captureSurfaceClassName(capture);
  const normalizedOcrText = capture.contentKind === "image"
    ? normalizeOcrText(capture.ocrText)
    : "";

  if (capture.contentKind === "image") {
    return (
      <section className={cn(surfaceClassName, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden")}>
        <PreviewToolbar meta={toolbarMeta} controls={toolbarControls} actions={toolbarActions} />
        <div className="group flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-3 pt-2 transition">
          {assetSrc ? (
            <div className="relative flex h-full min-h-0 w-full items-center justify-center">
              <button
                type="button"
                onClick={onOpenImage}
                className="flex h-full w-full items-center justify-center overflow-hidden rounded-[18px]"
              >
                <img
                  src={assetSrc}
                  alt={capturePreviewTitle(capture, t)}
                  className="max-h-full w-full rounded-[18px] object-contain"
                />
              </button>
              <div className="pointer-events-none absolute right-3 bottom-3 z-10 flex items-center gap-2">
                <ImageOverlayActionButton
                  label={tCommon("clipboardPreview.enlarge")}
                  onClick={onOpenImage}
                >
                  <Expand className="size-4" />
                </ImageOverlayActionButton>
                {normalizedOcrText ? (
                  <ImageOverlayActionButton
                    label={tCommon("clipboardPreview.ocrResult")}
                    onClick={onOpenImageOcr}
                  >
                    <ScanText className="size-4" />
                  </ImageOverlayActionButton>
                ) : null}
              </div>
            </div>
          ) : (
            <PreviewEmptyState
              title={t("empty.imagePreviewUnavailableTitle")}
              description={t("empty.imagePreviewUnavailableDescription")}
            />
          )}
        </div>
      </section>
    );
  }

  if (capture.contentKind === "link") {
    const target = capture.linkUrl ?? capture.rawText;
    const hostname = target ? extractHostname(target) : null;
    const linkTitle = capture.linkMetadata?.title?.trim()
      || capture.preview.trim()
      || hostname
      || t("preview.titles.linkFallback");
    const linkDescription = capture.linkMetadata?.description?.trim() || "";

    return (
      <section className={cn(surfaceClassName, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden")}>
        <PreviewToolbar
          meta={toolbarMeta}
          controls={openCaptureExternally.canExecute
            ? (
                <PreviewToolbarPillButton
                  aria-label={t("preview.linkOpen")}
                  className="app-kind-text-link"
                  shortcutId="clipboard.openSelectedCapture"
                  // tooltipLabel={t("actions.open")}
                  onClick={() => void openCaptureExternally.execute()}
                >
                  {t("actions.open")}
                  <ExternalLink className="size-3.5" />
                </PreviewToolbarPillButton>
              )
            : undefined}
          actions={toolbarActions}
        />
        <div className="flex min-h-0 flex-1 flex-col items-start justify-between px-4 pb-4 pt-4 text-left">
          <div className="space-y-2.5">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-border/55 bg-background/70 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                  {linkIconSrc ? (
                    <img
                      src={linkIconSrc}
                      alt={linkTitle}
                      className="size-[22px] object-contain"
                    />
                  ) : (
                    <Link2 className="size-5 text-muted-foreground/75" />
                  )}
                </span>
                <div className="min-w-0 space-y-1.5">
                  <p className="app-kind-text-link line-clamp-2 text-lg font-semibold leading-7">
                    {linkTitle}
                  </p>
                  {hostname ? (
                    <p className="text-[12px] font-medium tracking-[0.02em] text-muted-foreground/80">
                      {hostname}
                    </p>
                  ) : null}
                </div>
              </div>
              {linkDescription ? (
                <p className="app-selectable line-clamp-4 max-w-[62ch] text-[13px] leading-6 text-foreground/78">
                  {linkDescription}
                </p>
              ) : null}
              {openCaptureExternally.canExecute ? (
                <button
                  type="button"
                  onClick={() => void openCaptureExternally.execute()}
                  className="app-selectable app-kind-text-link break-all text-left font-mono text-[13px] leading-6 transition hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:underline-offset-4"
                  title={target}
                >
                  {target}
                </button>
              ) : (
                <p className="app-selectable app-kind-text-link break-all font-mono text-[13px] leading-6">
                  {target}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (isFileReferenceKind(capture.contentKind)) {
    return (
      <FileReferencePreview
        capture={capture}
        sharedSurface={sharedSurface}
        toolbarMeta={toolbarMeta}
        toolbarActions={toolbarActions}
      />
    );
  }

  return (
    <TextCapturePreview
      key={capture.id}
      capture={capture}
      highlightQuery={highlightQuery}
      sharedSurface={sharedSurface}
      toolbarMeta={toolbarMeta}
      toolbarActions={toolbarActions}
    />
  );
}

function TextCapturePreview({
  capture,
  highlightQuery,
  sharedSurface = false,
  toolbarMeta,
  toolbarActions,
}: {
  capture: ClipboardCapture;
  highlightQuery: string;
  sharedSurface?: boolean;
  toolbarMeta?: ReactNode;
  toolbarActions?: ReactNode;
}) {
  const t = useScopedT("clipboard");
  const previewModeCaptureId = useClipboardBoardStore((state) => state.previewModeCaptureId);
  const selectedPreviewMode = useClipboardBoardStore((state) => state.selectedPreviewMode);
  const setSelectedPreviewMode = useClipboardBoardStore((state) => state.setSelectedPreviewMode);
  const normalizedMarkdownSource = normalizeMarkdownSource(capture.rawText);
  const normalizedHighlightQuery = normalizeHighlightQuery(highlightQuery);
  const deferredHighlightQuery = useDeferredValue(normalizedHighlightQuery);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const lastHandledScrollKeyRef = useRef<string | null>(null);

  const previewKind = canRenderMarkdownPreview(capture)
    ? "markdown"
    : canRenderHtmlPreview(capture)
      ? "html"
      : "text";
  const tabs = buildClipboardTextPreviewTabs(capture, t);
  const showModeToggle = tabs.length > 1;
  const preferredMode = preferredClipboardTextPreviewMode(capture);
  const mode = resolveClipboardTextPreviewMode(
    capture,
    previewModeCaptureId === capture.id ? selectedPreviewMode : preferredMode,
  );
  const previewScrollKey = `${capture.id}:${mode}:${deferredHighlightQuery}`;

  useEffect(() => {
    if (previewModeCaptureId !== capture.id || selectedPreviewMode !== mode) {
      setSelectedPreviewMode(capture.id, mode);
    }
  }, [
    capture.id,
    mode,
    previewModeCaptureId,
    selectedPreviewMode,
    setSelectedPreviewMode,
  ]);

  useEffect(() => {
    if (!deferredHighlightQuery) {
      lastHandledScrollKeyRef.current = null;
      return;
    }

    const scrollViewport = scrollViewportRef.current;
    if (!scrollViewport) {
      return;
    }

    if (lastHandledScrollKeyRef.current === previewScrollKey) {
      return;
    }

    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;

      const highlights = Array.from(
        scrollViewport.querySelectorAll<HTMLElement>(PREVIEW_HIGHLIGHT_SELECTOR),
      );

      if (highlights.length === 0) {
        lastHandledScrollKeyRef.current = previewScrollKey;
        return;
      }

      const firstHiddenHighlight = highlights.find(
        (highlight) => !isElementFullyVisibleWithin(highlight, scrollViewport),
      );

      if (firstHiddenHighlight) {
        firstHiddenHighlight.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }

      lastHandledScrollKeyRef.current = previewScrollKey;
    });

    return () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
        pendingScrollFrameRef.current = null;
      }
    };
  }, [deferredHighlightQuery, previewScrollKey]);

  return (
    <section
      className={cn(
        sharedSurface ? "" : captureSurfaceClassName(capture),
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
      )}
    >
      <PreviewToolbar
        meta={toolbarMeta}
        controls={
          showModeToggle ? (
            <div className="inline-flex h-[26px] items-center gap-0.5 rounded-full border border-border/55 bg-background/78 p-0.5 shadow-none">
              {tabs.map((tab) => (
                <PreviewModeButton
                  key={tab.mode}
                  active={mode === tab.mode}
                  onClick={() => setSelectedPreviewMode(capture.id, tab.mode)}
                >
                  {tab.label}
                </PreviewModeButton>
              ))}
            </div>
          ) : null
        }
        actions={toolbarActions}
      />

      <div
        ref={scrollViewportRef}
        data-window-drag-disabled="true"
        className="app-scroll-area min-h-0 min-w-0 flex-1 overflow-auto px-4 pb-4 pt-3"
      >
        {mode === "preview" && previewKind === "html" ? (
          <HtmlRichPreview html={capture.rawRich ?? ""} highlightQuery={deferredHighlightQuery} />
        ) : null}
        {mode === "preview" && previewKind === "markdown" ? (
          <MarkdownTextPreview markdown={normalizedMarkdownSource} highlightQuery={deferredHighlightQuery} />
        ) : null}
        {mode === "preview" && previewKind === "text" ? (
          <RawTextPreview
            content={capture.rawText}
            highlightQuery={deferredHighlightQuery}
          />
        ) : null}
        {mode === "raw_text" ? (
          <RawTextPreview
            content={capture.rawText}
            highlightQuery={deferredHighlightQuery}
            tone={previewKind === "text" ? "reading" : "raw"}
          />
        ) : null}
        {mode === "raw_rich" ? (
          <RawTextPreview content={capture.rawRich ?? ""} highlightQuery={deferredHighlightQuery} />
        ) : null}
      </div>
    </section>
  );
}

function PreviewModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-foreground px-2.5 py-[3px] text-[11px] font-medium text-background"
          : "rounded-full px-2.5 py-[3px] text-[11px] font-medium text-muted-foreground/80 transition hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function ImageOverlayActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip
      content={label}
      placement="bottom"
      className="app-preview-action-tooltip rounded-full px-3 py-1.5 text-[11px] font-medium"
    >
      <div className="shrink-0">
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className="app-overlay-chip pointer-events-auto inline-flex size-8 items-center justify-center rounded-full opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
        >
          {children}
        </button>
      </div>
    </Tooltip>
  );
}

function HtmlRichPreview({
  html,
  highlightQuery,
}: {
  html: string;
  highlightQuery: string;
}) {
  const sanitizedHtml = useMemo(
    () => DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_ATTR: ["style", "class"],
    }),
    [html],
  );
  const highlightedHtml = useMemo(
    () => normalizePreviewHtmlLayout(highlightSanitizedHtmlContent(sanitizedHtml, highlightQuery)),
    [highlightQuery, sanitizedHtml],
  );

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = getExternalLinkTargetFromEventTarget(event.target);
    if (!target) {
      return;
    }

    event.preventDefault();
    void openExternalLink(target);
  };

  return (
    <div
      className="app-markdown-preview app-selectable app-kind-text-text max-w-[72ch] text-[13px] leading-[1.7]"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}

function RawTextPreview({
  content,
  highlightQuery,
  tone = "raw",
  className,
}: {
  content: string;
  highlightQuery: string;
  tone?: "raw" | "reading";
  className?: string;
}) {
  const t = useScopedT("clipboard");
  const highlightedContent = useMemo(
    () => highlightTextContent(content, highlightQuery, t("preview.noRawSource")),
    [content, highlightQuery, t],
  );

  return (
    <div
      className={cn(
        "app-selectable app-kind-text-text overflow-x-hidden whitespace-pre-wrap [overflow-wrap:anywhere]",
        tone === "reading"
          ? "w-full max-w-[72ch] font-sans text-[13px] leading-[1.7] text-foreground/90 break-words"
          : "w-0 min-w-full max-w-full font-mono text-[13px] leading-7 break-all",
        className,
      )}
    >
      {highlightedContent}
    </div>
  );
}

function isElementFullyVisibleWithin(element: HTMLElement, scrollViewport: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const viewportRect = scrollViewport.getBoundingClientRect();

  return (
    elementRect.top >= viewportRect.top
    && elementRect.bottom <= viewportRect.bottom
    && elementRect.left >= viewportRect.left
    && elementRect.right <= viewportRect.right
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CaptureImageLightbox({
  capture,
  onClose,
}: {
  capture: ClipboardCapture | null;
  onClose: () => void;
}) {
  const assetSrc = useClipboardAssetSrc(capture?.assetPath);
  const t = useScopedT("clipboard");
  useShortcutScope("clipboard.imagePreview", { active: Boolean(capture) });
  const portalContainer = resolvePortalContainer();

  if (!capture || capture.contentKind !== "image" || !portalContainer) {
    return null;
  }

  return createPortal(
    <div
      data-window-drag-disabled="true"
      className="app-overlay-backdrop fixed inset-0 z-[140]"
      onClick={onClose}
    >
      <div className="relative h-full w-full">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-4 sm:p-6">
          <Button
            variant="outline"
            size="icon"
            className="pointer-events-auto size-10 rounded-full border-white/20 bg-black/45 text-white shadow-none hover:bg-black/60 hover:text-white"
            aria-label={t("preview.closePreview")}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X />
          </Button>
        </div>
        <InteractiveImageViewport
          src={assetSrc}
          alt={capturePreviewTitle(capture, t)}
          width={capture.imageWidth ?? undefined}
          height={capture.imageHeight ?? undefined}
        />
      </div>
    </div>,
    portalContainer,
  );
}

export function CaptureOcrLightbox({
  capture,
  onClose,
}: {
  capture: ClipboardCapture | null;
  onClose: () => void;
}) {
  const tCommon = useScopedT("common");
  const portalContainer = resolvePortalContainer();
  const titleId = useId();
  const normalizedOcrText = capture?.contentKind === "image"
    ? normalizeOcrText(capture.ocrText)
    : "";
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [didCopy, setDidCopy] = useState(false);

  useShortcutScope("clipboard.imagePreview", {
    active: Boolean(capture) && Boolean(normalizedOcrText),
  });

  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => () => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  if (!capture || capture.contentKind !== "image" || !normalizedOcrText || !portalContainer) {
    return null;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(normalizedOcrText);
      setDidCopy(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setDidCopy(false);
        copyResetTimeoutRef.current = null;
      }, 1600);
    } catch (error) {
      console.error("[clipboard] failed to copy OCR text", error);
    }
  }

  return createPortal(
    <div
      data-window-drag-disabled="true"
      className="app-overlay-backdrop fixed inset-0 z-[140]"
      onClick={onClose}
    >
      <div className="flex h-full w-full items-center justify-center p-3 sm:p-5">
        <section
          data-window-drag-disabled="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="app-lightbox-surface app-ocr-sheet relative flex min-h-[12rem] w-[min(32rem,calc(100vw-1.5rem))] max-h-[min(28rem,calc(100vh-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-white/10"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="app-ocr-sheet-header shrink-0 border-b border-border/60 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <h2
                id={titleId}
                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold tracking-[0.02em] text-foreground/92"
              >
                {tCommon("clipboardPreview.ocrDialogTitle")}
              </h2>
              <Tooltip
                content={didCopy
                  ? tCommon("clipboardPreview.copiedToClipboard")
                  : tCommon("clipboardPreview.copyOcrResult")}
                placement="bottom"
                className="app-preview-action-tooltip rounded-full px-3 py-1.5 text-[11px] font-medium"
              >
                <div className="shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 rounded-full border-border/60 bg-background/76 text-muted-foreground/80 shadow-none hover:bg-secondary/72 hover:text-foreground"
                    aria-label={tCommon("clipboardPreview.copyOcrResult")}
                    onClick={() => void handleCopy()}
                  >
                    {didCopy ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              </Tooltip>
            </div>
          </header>

          <div
            ref={scrollViewportRef}
            data-window-drag-disabled="true"
            className="app-scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4 sm:px-5"
          >
            <div className="flex min-h-full items-center justify-center">
              <RawTextPreview
                content={normalizedOcrText}
                highlightQuery=""
                tone="reading"
                className="w-full max-w-full text-left text-[11px] leading-[1.72] text-foreground/84 sm:text-[11.5px]"
              />
            </div>
          </div>
        </section>
      </div>
    </div>,
    portalContainer,
  );
}

function InteractiveImageViewport({
  src,
  alt,
  width,
  height,
}: {
  src: string | null;
  alt: string;
  width?: number;
  height?: number;
}) {
  const t = useScopedT("clipboard");
  const [displayScale, setDisplayScale] = useState(DEFAULT_IMAGE_SCALE);

  return (
    <TransformWrapper
      minScale={MIN_IMAGE_SCALE}
      maxScale={MAX_IMAGE_SCALE}
      initialScale={DEFAULT_IMAGE_SCALE}
      limitToBounds
      centerOnInit
      centerZoomedOut
      doubleClick={{
        mode: "toggle",
        step: 2.5,
      }}
      wheel={{
        step: 0.14,
        activationKeys: (keys) => keys.includes("Control") || keys.includes("Meta"),
      }}
      panning={{
        disabled: !src,
        allowLeftClickPan: true,
      }}
      pinch={{
        disabled: !src,
      }}
      trackPadPanning={{
        disabled: !src,
      }}
      velocityAnimation={{
        disabled: true,
      }}
      onTransform={(_ref, state) => {
        setDisplayScale(state.scale);
      }}
      onInit={(ref) => {
        setDisplayScale(ref.state.scale);
      }}
    >
      {({ resetTransform, zoomIn, zoomOut }) => (
        <div data-window-drag-disabled="true" className="relative h-full w-full">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4 sm:p-6">
            <div
              className="pointer-events-auto flex items-center gap-1.5"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                variant="outline"
                size="sm"
                className="rounded-[14px] border-white/14 bg-black/52 text-white shadow-none hover:bg-black/66 hover:text-white"
                onClick={() => zoomOut(0.2)}
                disabled={displayScale <= MIN_IMAGE_SCALE}
              >
                <Minus />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-w-[72px] rounded-[14px] border-white/14 bg-black/52 px-2.5 font-mono text-[11px] text-white shadow-none hover:bg-black/66 hover:text-white"
                onClick={() => resetTransform()}
              >
                {Math.round((displayScale / DEFAULT_IMAGE_SCALE) * 100)}%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-[14px] border-white/14 bg-black/52 text-white shadow-none hover:bg-black/66 hover:text-white"
                onClick={() => zoomIn(0.2)}
                disabled={displayScale >= MAX_IMAGE_SCALE}
              >
                <Plus />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-[14px] border-white/14 bg-black/52 text-white shadow-none hover:bg-black/66 hover:text-white"
                onClick={() => resetTransform()}
              >
                <RotateCcw />
              </Button>
            </div>
          </div>

          {src ? (
            <TransformComponent
              wrapperStyle={{
                height: "100%",
                width: "100%",
              }}
              wrapperClass="touch-none select-none"
              contentStyle={{
                alignItems: "center",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                style={{
                  height: height ? `${height}px` : undefined,
                  maxHeight: "calc(100vh - 5rem)",
                  maxWidth: "calc(100vw - 3rem)",
                  objectFit: "contain",
                  width: width ? `${width}px` : undefined,
                }}
                className="block select-none shadow-[0_24px_80px_rgba(0,0,0,0.34)]"
              />
            </TransformComponent>
          ) : (
            <div
              className="flex h-full items-center justify-center p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <PreviewEmptyState
                title={t("empty.imagePreviewUnavailableTitle")}
                description={t("empty.enlargedPreviewUnavailableDescription")}
              />
            </div>
          )}
        </div>
      )}
    </TransformWrapper>
  );
}

function PreviewEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-background/60 px-5 py-6 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function normalizeOcrText(input: string | null | undefined) {
  return input?.trim() ?? "";
}

function capturePreviewTitle(
  capture: ClipboardCapture,
  t: ClipboardTranslate,
) {
  return captureTitle(capture, t);
}

function extractHostname(target: string) {
  try {
    return new URL(target).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
