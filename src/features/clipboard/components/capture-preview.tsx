import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  startTransition,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";

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
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { openExternalTarget } from "@/lib/tauri";
import type { ClipboardCapture } from "@/types/shell";

const MIN_IMAGE_SCALE = 0.8;
const MAX_IMAGE_SCALE = 6;

type Point = {
  x: number;
  y: number;
};

export function CaptureDetailPreview({
  capture,
  onOpenImage,
}: {
  capture: ClipboardCapture;
  onOpenImage: () => void;
}) {
  const assetSrc = useClipboardAssetSrc(
    capture.contentKind === "image" ? capture.assetPath : null,
  );

  if (capture.contentKind === "image") {
    return (
      <section className="app-preview-image h-full px-4 py-4">
        <button
          type="button"
          onClick={onOpenImage}
          className="group flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[22px] border border-border/70 bg-surface-panel px-4 py-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
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
      <section className="app-preview-link h-full px-4 py-4">
        <button
          type="button"
          onClick={() => void openExternalTarget(target)}
          className="flex h-full min-h-0 w-full flex-col items-start justify-between rounded-[22px] border border-border/70 bg-surface-panel px-5 py-5 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
          <div className="space-y-3">
            <div className="app-kind-badge-link inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
              <Link2 className="size-3.5" />
              Open in system browser
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

          <div className="app-kind-text-link inline-flex items-center gap-2 text-sm font-medium">
            Preview in browser
            <ExternalLink className="size-4" />
          </div>
        </button>
      </section>
    );
  }

  return (
    <section className="app-preview-text h-full px-4 py-4 sm:px-5 sm:py-5">
      <div className="h-full min-h-0 overflow-auto">
        <div className="app-selectable app-kind-text-text text-[14px] leading-7 whitespace-pre-wrap">
          {capture.rawText || capturePreviewTitle(capture)}
        </div>
      </div>
    </section>
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
      className="app-overlay-backdrop fixed inset-0 z-[140] backdrop-blur-[2px]"
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
