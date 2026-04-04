import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  startTransition,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import {
  Expand,
  ExternalLink,
  Link2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCommand } from "@/core/commands";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { capturePreviewSurfaceClassName } from "@/features/clipboard/lib/clipboard-board";
import {
  getExternalLinkTargetFromEventTarget,
  openExternalLink,
  resolveExternalLinkTarget,
} from "@/lib/external-links";
import { cn } from "@/lib/utils";
import type { ClipboardCapture } from "@/types/shell";

const MIN_IMAGE_SCALE = 0.8;
const MAX_IMAGE_SCALE = 6;
type TextPreviewMode = "preview" | "raw_text" | "raw_rich";

type Point = {
  x: number;
  y: number;
};

export function CaptureDetailPreview({
  capture,
  onOpenImage,
  sharedSurface = false,
}: {
  capture: ClipboardCapture;
  onOpenImage: () => void;
  sharedSurface?: boolean;
}) {
  const openTarget = useCommand<{ target: string }>("system.openExternalTarget");
  const assetSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.assetPath : null,
  );
  const surfaceClassName = sharedSurface ? "" : capturePreviewSurfaceClassName(capture.contentKind);

  if (capture.contentKind === "image") {
    return (
      <section className={cn(surfaceClassName, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-2.5 py-2.5")}>
        <PreviewHeader title="Image Preview" />
        <button
          type="button"
          onClick={onOpenImage}
          className="group flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3 pb-3 pt-2 transition"
        >
          {assetSrc ? (
            <div className="relative flex h-full min-h-0 w-full items-center justify-center">
              <img
                src={assetSrc}
                alt={capturePreviewTitle(capture)}
                className="max-h-full w-full rounded-[18px] object-contain"
              />
              <div className="app-overlay-chip pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium opacity-0 transition group-hover:opacity-100">
                <Expand className="size-3.5" />
                Click to enlarge
              </div>
            </div>
          ) : (
            <PreviewEmptyState
              title="Image preview unavailable"
              description="The capture exists, but the local preview asset could not be loaded into the board."
            />
          )}
        </button>
      </section>
    );
  }

  if (capture.contentKind === "link") {
    const target = capture.linkUrl ?? capture.rawText;
    const hostname = target ? extractHostname(target) : null;

    return (
      <section className={cn(surfaceClassName, "flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-2.5 py-2.5")}>
        <PreviewHeader
          title="Link Preview"
          controls={(
            <button
              type="button"
              onClick={() => void openTarget.execute({ target })}
              className="app-kind-text-link inline-flex h-8 items-center gap-2 rounded-full border border-border/70 bg-card/85 px-3 text-xs font-medium shadow-sm transition hover:border-primary/30 hover:bg-secondary/60"
            >
              Preview in browser
              <ExternalLink className="size-4" />
            </button>
          )}
        />
        <div className="flex min-h-0 flex-1 flex-col items-start justify-between px-3.5 pb-3.5 pt-2 text-left">
          <div className="space-y-3">
            <div className="app-kind-badge-link inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
              <Link2 className="size-3.5" />
              Link capture
            </div>
            <div className="space-y-2.5">
              <p className="app-kind-text-link text-lg font-semibold leading-7">
                {hostname ?? "Link capture"}
              </p>
              <p className="app-selectable break-all font-mono text-sm leading-6 text-muted-foreground">
                {target}
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return <TextCapturePreview key={capture.id} capture={capture} sharedSurface={sharedSurface} />;
}

function TextCapturePreview({
  capture,
  sharedSurface = false,
}: {
  capture: ClipboardCapture;
  sharedSurface?: boolean;
}) {
  const [mode, setMode] = useState<TextPreviewMode>(() => preferredTextPreviewMode(capture));
  const normalizedMarkdownSource = normalizeMarkdownSource(capture.rawText);

  const htmlPreview = canRenderHtmlPreview(capture);
  const markdownPreview = canRenderMarkdownPreview(capture);
  const previewKind = markdownPreview ? "markdown" : htmlPreview ? "html" : "text";
  const tabs = buildTextPreviewTabs(capture, previewKind);
  const showModeToggle = tabs.length > 1;
  const previewTitle =
    previewKind === "markdown"
      ? "Markdown Preview"
      : previewKind === "html"
        ? "Rich Text Preview"
        : "Text Preview";

  return (
    <section
      className={cn(
        sharedSurface ? "" : capturePreviewSurfaceClassName(capture.contentKind),
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-2.5 py-2.5",
      )}
    >
      <PreviewHeader
        title={previewTitle}
        controls={
          showModeToggle ? (
            <div className="inline-flex h-7 items-center gap-0.5 rounded-full border border-border/70 bg-background/82 p-0.5 shadow-sm backdrop-blur">
              {tabs.map((tab) => (
                <PreviewModeButton
                  key={tab.mode}
                  active={mode === tab.mode}
                  onClick={() => setMode(tab.mode)}
                >
                  {tab.label}
                </PreviewModeButton>
              ))}
            </div>
          ) : null
        }
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-auto px-3.5 pb-3.5 pt-2">
        {mode === "preview" && previewKind === "html" ? (
          <HtmlRichPreview html={capture.rawRich ?? ""} />
        ) : null}
        {mode === "preview" && previewKind === "markdown" ? (
          <MarkdownTextPreview markdown={normalizedMarkdownSource} />
        ) : null}
        {mode === "preview" && previewKind === "text" ? (
          <RawTextPreview
            content={capture.rawText}
          />
        ) : null}
        {mode === "raw_text" ? <RawTextPreview content={capture.rawText} /> : null}
        {mode === "raw_rich" ? <RawTextPreview content={capture.rawRich ?? ""} /> : null}
      </div>
    </section>
  );
}

function PreviewHeader({
  title,
  controls,
}: {
  title: string;
  controls?: ReactNode;
}) {
  return (
    <div className="flex min-h-10 min-w-0 shrink-0 items-center justify-between gap-3 px-3.5 py-1.5">
      <p className="min-w-0 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </p>
      {controls ? <div className="shrink-0">{controls}</div> : null}
    </div>
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
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-foreground px-2.5 py-1 text-[12px] font-medium text-background"
          : "rounded-full px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function HtmlRichPreview({ html }: { html: string }) {
  const sanitizedHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_ATTR: ["style", "class"],
  });

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
      className="app-markdown-preview app-selectable app-kind-text-text text-[14px] leading-7"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

function MarkdownTextPreview({ markdown }: { markdown: string }) {
  return (
    <div className="app-markdown-preview app-selectable app-kind-text-text text-[14px] leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children, ...props }) => {
            const target = resolveExternalLinkTarget(href ?? "");

            if (!target) {
              return (
                <a {...props} href={href}>
                  {children}
                </a>
              );
            }

            return (
              <a
                {...props}
                href={target}
                rel="noopener noreferrer"
                target="_blank"
                onClick={(event) => {
                  event.preventDefault();
                  void openExternalLink(target);
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function RawTextPreview({ content }: { content: string }) {
  return (
    <div className="app-selectable app-kind-text-text w-0 min-w-full max-w-full overflow-x-hidden font-mono text-[13px] leading-7 whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
      {content || "No raw source available."}
    </div>
  );
}

export function CaptureImageLightbox({
  capture,
  onClose,
}: {
  capture: ClipboardCapture | null;
  onClose: () => void;
}) {
  const assetSrc = useClipboardAssetSrc(capture?.assetPath);
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
  });

  useEffect(() => {
    if (!capture) {
      return;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [capture]);

  if (!capture || capture.contentKind !== "image" || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="app-overlay-backdrop fixed inset-0 z-[140]"
      onClick={onClose}
    >
      <div className="relative h-full w-full">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-4 sm:p-6">
          <Button
            variant="outline"
            size="icon"
            className="pointer-events-auto size-10 rounded-full border-white/20 bg-black/45 text-white shadow-none hover:bg-black/60 hover:text-white"
            aria-label="Close preview"
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
          alt={capturePreviewTitle(capture)}
          width={capture.imageWidth ?? undefined}
          height={capture.imageHeight ?? undefined}
        />
      </div>
    </div>,
    document.body,
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
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({
    width: width ?? 0,
    height: height ?? 0,
  });
  const [scale, setScale] = useState(MIN_IMAGE_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<{
    pointerId: number;
    start: Point;
    origin: Point;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    offset: Point;
    midpoint: Point;
  } | null>(null);

  useEffect(() => {
    if (!containerElement) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width: nextWidth, height: nextHeight } = entry.contentRect;
      setContainerSize({ width: nextWidth, height: nextHeight });
    });

    observer.observe(containerElement);
    return () => observer.disconnect();
  }, [containerElement]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const imageWidth = naturalSize.width || width || 1;
  const imageHeight = naturalSize.height || height || 1;
  const fitScale =
    containerSize.width > 0 && containerSize.height > 0
      ? Math.min(containerSize.width / imageWidth, containerSize.height / imageHeight)
      : 1;
  const fitWidth = imageWidth * fitScale;
  const fitHeight = imageHeight * fitScale;

  function panLimit(nextScale = scaleRef.current) {
    return {
      x: Math.abs(fitWidth * nextScale - containerSize.width) / 2,
      y: Math.abs(fitHeight * nextScale - containerSize.height) / 2,
    };
  }

  function clampOffset(nextOffset: Point, nextScale = scale) {
    if (containerSize.width <= 0 || containerSize.height <= 0) {
      return { x: 0, y: 0 };
    }

    const limits = panLimit(nextScale);

    return {
      x: clamp(nextOffset.x, -limits.x, limits.x),
      y: clamp(nextOffset.y, -limits.y, limits.y),
    };
  }

  function zoomTo(
    nextScale: number,
    anchor?: Point,
    baseScale = scaleRef.current,
    baseOffset = offsetRef.current,
  ) {
    const clampedScale = clamp(nextScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);

    if (
      containerSize.width <= 0 ||
      containerSize.height <= 0 ||
      clampedScale === baseScale
    ) {
      setScale(clampedScale);
      if (clampedScale === MIN_IMAGE_SCALE) {
        setOffset({ x: 0, y: 0 });
      }
      return;
    }

    const anchorPoint = anchor ?? {
      x: containerSize.width / 2,
      y: containerSize.height / 2,
    };
    const relativeX = anchorPoint.x - containerSize.width / 2;
    const relativeY = anchorPoint.y - containerSize.height / 2;
    const imageX = (relativeX - baseOffset.x) / baseScale;
    const imageY = (relativeY - baseOffset.y) / baseScale;
    const nextOffset = clampOffset(
      {
        x: relativeX - imageX * clampedScale,
        y: relativeY - imageY * clampedScale,
      },
      clampedScale,
    );

    setScale(clampedScale);
    setOffset(clampedScale === MIN_IMAGE_SCALE ? { x: 0, y: 0 } : nextOffset);
  }

  useEffect(() => {
    setOffset((currentOffset) => {
      const limits = {
        x: Math.abs(fitWidth * scale - containerSize.width) / 2,
        y: Math.abs(fitHeight * scale - containerSize.height) / 2,
      };
      const clamped = {
        x: clamp(currentOffset.x, -limits.x, limits.x),
        y: clamp(currentOffset.y, -limits.y, limits.y),
      };

      if (clamped.x === currentOffset.x && clamped.y === currentOffset.y) {
        return currentOffset;
      }

      return clamped;
    });
  }, [fitHeight, fitWidth, scale, containerSize.height, containerSize.width]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!src) {
      return;
    }

    const point = pointFromPointerEvent(event);
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 1) {
      setIsDragging(true);
      dragRef.current =
        canPanAtScale(scaleRef.current)
          ? {
              pointerId: event.pointerId,
              start: point,
              origin: offsetRef.current,
            }
          : null;
      pinchRef.current = null;
      return;
    }

    if (pointersRef.current.size === 2) {
      const [firstPoint, secondPoint] = [...pointersRef.current.values()];
      pinchRef.current = {
        distance: pointDistance(firstPoint, secondPoint),
        scale: scaleRef.current,
        offset: offsetRef.current,
        midpoint: midpoint(firstPoint, secondPoint),
      };
      dragRef.current = null;
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const point = pointFromPointerEvent(event);
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [firstPoint, secondPoint] = [...pointersRef.current.values()];
      const nextMidpoint = midpoint(firstPoint, secondPoint);
      const nextDistance = pointDistance(firstPoint, secondPoint);
      const scaleRatio =
        pinchRef.current.distance > 0
          ? nextDistance / pinchRef.current.distance
          : 1;
      const nextScale = clamp(
        pinchRef.current.scale * scaleRatio,
        MIN_IMAGE_SCALE,
        MAX_IMAGE_SCALE,
      );
      const startRelativeX =
        pinchRef.current.midpoint.x - containerSize.width / 2;
      const startRelativeY =
        pinchRef.current.midpoint.y - containerSize.height / 2;
      const imageX =
        (startRelativeX - pinchRef.current.offset.x) / pinchRef.current.scale;
      const imageY =
        (startRelativeY - pinchRef.current.offset.y) / pinchRef.current.scale;
      const nextRelativeX = nextMidpoint.x - containerSize.width / 2;
      const nextRelativeY = nextMidpoint.y - containerSize.height / 2;
      const nextOffset = clampOffset(
        {
          x: nextRelativeX - imageX * nextScale,
          y: nextRelativeY - imageY * nextScale,
        },
        nextScale,
      );

      setScale(nextScale);
      setOffset(nextScale === MIN_IMAGE_SCALE ? { x: 0, y: 0 } : nextOffset);
      return;
    }

    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      const nextOffset = clampOffset({
        x: dragRef.current.origin.x + point.x - dragRef.current.start.x,
        y: dragRef.current.origin.y + point.y - dragRef.current.start.y,
      });

      setOffset(nextOffset);
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (pointersRef.current.size === 1 && canPanAtScale(scaleRef.current)) {
      const [remainingPointerId, remainingPoint] = [...pointersRef.current.entries()][0];
      dragRef.current = {
        pointerId: remainingPointerId,
        start: remainingPoint,
        origin: offsetRef.current,
      };
      return;
    }

    dragRef.current = null;
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!src) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const direction = event.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? 1.14 : 1 / 1.14;

      zoomTo(scaleRef.current * factor, anchor);
      return;
    }

    if (canPanAtScale(scaleRef.current)) {
      event.preventDefault();
      setOffset((currentOffset) =>
        clampOffset({
          x: currentOffset.x - event.deltaX,
          y: currentOffset.y - event.deltaY,
        }),
      );
    }
  }

  function handleDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!src) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    zoomTo(scaleRef.current > 1.8 ? MIN_IMAGE_SCALE : 2, anchor);
  }

  function canPanAtScale(nextScale: number) {
    const limits = panLimit(nextScale);
    return limits.x > 0.5 || limits.y > 0.5;
  }

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4 sm:p-6">
        <div
          className="pointer-events-auto flex items-center gap-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            variant="outline"
            size="sm"
            className="rounded-[14px] border-white/14 bg-black/52 text-white shadow-none hover:bg-black/66 hover:text-white"
            onClick={() => zoomTo(scale - 0.1)}
            disabled={scale <= MIN_IMAGE_SCALE}
          >
            <Minus />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-w-[72px] rounded-[14px] border-white/14 bg-black/52 px-2.5 font-mono text-[11px] text-white shadow-none hover:bg-black/66 hover:text-white"
            onClick={() => zoomTo(MIN_IMAGE_SCALE)}
          >
            {Math.round(scale * 100)}%
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-[14px] border-white/14 bg-black/52 text-white shadow-none hover:bg-black/66 hover:text-white"
            onClick={() => zoomTo(scale + 0.1)}
            disabled={scale >= MAX_IMAGE_SCALE}
          >
            <Plus />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-[14px] border-white/14 bg-black/52 text-white shadow-none hover:bg-black/66 hover:text-white"
            onClick={() => {
              setScale(MIN_IMAGE_SCALE);
              setOffset({ x: 0, y: 0 });
            }}
          >
            <RotateCcw />
          </Button>
        </div>
      </div>

      <div
        ref={setContainerElement}
        className="absolute inset-0 overflow-hidden touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        {src ? (
          <div className="absolute inset-0">
            <div
              className="absolute top-1/2 left-1/2 will-change-transform"
              style={{
                width: fitWidth,
                height: fitHeight,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transformOrigin: "center center",
                cursor: canPanAtScale(scale) ? (isDragging ? "grabbing" : "grab") : "zoom-in",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                className="size-full object-contain shadow-[0_24px_80px_rgba(0,0,0,0.34)]"
                onLoad={(event) => {
                  const nextWidth = event.currentTarget.naturalWidth;
                  const nextHeight = event.currentTarget.naturalHeight;

                  if (nextWidth && nextHeight) {
                    startTransition(() => {
                      setNaturalSize({ width: nextWidth, height: nextHeight });
                    });
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div
            className="flex h-full items-center justify-center p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <PreviewEmptyState
              title="Image preview unavailable"
              description="The image asset could not be loaded for enlarged preview."
            />
          </div>
        )}
      </div>
    </div>
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

function preferredTextPreviewMode(capture: ClipboardCapture): TextPreviewMode {
  return markdownLooksSupported(capture) || canRenderHtmlPreview(capture)
    ? "preview"
    : "raw_text";
}

function canRenderHtmlPreview(capture: ClipboardCapture) {
  return capture.contentKind === "rich_text"
    && capture.rawRichFormat === "html"
    && Boolean(capture.rawRich?.trim());
}

function canRenderMarkdownPreview(capture: ClipboardCapture) {
  if (capture.contentKind === "link" || capture.contentKind === "image") {
    return false;
  }

  return looksLikeMarkdown(normalizeMarkdownSource(capture.rawText));
}

function markdownLooksSupported(capture: ClipboardCapture) {
  return canRenderMarkdownPreview(capture);
}

function buildTextPreviewTabs(
  capture: ClipboardCapture,
  previewKind: "markdown" | "html" | "text",
) {
  const tabs: Array<{ mode: TextPreviewMode; label: string }> = [];

  if (previewKind === "markdown") {
    tabs.push({ mode: "preview", label: "Markdown" });
  } else if (previewKind === "html") {
    tabs.push({ mode: "preview", label: "Rich Text" });
  }

  if (capture.rawText.trim()) {
    tabs.push({ mode: "raw_text", label: "Text" });
  }

  if (capture.rawRich?.trim()) {
    tabs.push({
      mode: "raw_rich",
      label: capture.rawRichFormat === "html" ? "HTML" : "Raw Rich",
    });
  }

  if (tabs.length === 0) {
    tabs.push({ mode: "raw_text", label: "Raw" });
  }

  return tabs;
}

function looksLikeMarkdown(input: string) {
  const normalized = input.trim();
  if (!normalized) {
    return false;
  }

  return [
    /^#{1,6}\s/m,
    /^>\s/m,
    /^(-|\*|\+)\s/m,
    /^\d+\.\s/m,
    /```/,
    /\|.+\|/,
    /\[[^\]]+\]\([^)]+\)/,
    /(\*\*|__)[^*_]+(\*\*|__)/,
    /`[^`\n]+`/,
    /~~[^~]+~~/,
  ].some((pattern) => pattern.test(normalized));
}

function normalizeMarkdownSource(input: string) {
  return input.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function capturePreviewTitle(capture: ClipboardCapture) {
  if (capture.contentKind === "image") {
    return capture.imageWidth && capture.imageHeight
      ? `Image (${capture.imageWidth}×${capture.imageHeight})`
      : capture.preview || "Image capture";
  }

  if (capture.contentKind === "link") {
    return capture.preview || capture.linkUrl || "Link capture";
  }

  const normalized = (capture.preview || capture.rawText).trim();
  if (normalized) {
    return normalized;
  }

  return capture.contentKind === "rich_text"
    ? "Formatted text capture"
    : "Text capture";
}

function extractHostname(target: string) {
  try {
    return new URL(target).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function pointFromPointerEvent(event: ReactPointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function pointDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function midpoint(first: Point, second: Point) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
