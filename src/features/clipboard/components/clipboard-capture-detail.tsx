import { lazy, Suspense, type ReactNode } from "react";

import { Copy, Expand, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCommand } from "@/core/commands";
import { useContextMenu } from "@/core/context-menu";
import { clipboardCaptureContextMenu } from "@/features/clipboard/clipboard-capture-context-menu";
import { Tooltip } from "@/components/ui/tooltip";
import {
  capturePreviewSurfaceClassName,
  detailRows,
  formatKindLabel,
  statusVariant,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { formatRelativeTimestamp } from "@/lib/time";
import type { ClipboardCapture } from "@/types/shell";

const CaptureDetailPreview = lazy(async () => {
  const module = await import("@/features/clipboard/components/capture-preview");
  return {
    default: module.CaptureDetailPreview,
  };
});

export function ClipboardCaptureDetail({
  capture,
  highlightQuery,
  onOpenImage,
}: {
  capture: ClipboardCapture | null;
  highlightQuery: string;
  onOpenImage: () => void;
}) {
  const copyCapture = useCommand<{ capture: ClipboardCapture }>("clipboard.copyCapture");
  const openImagePreview = useCommand<{ path: string }>("system.openImageInPreview");
  const { onContextMenu } = useContextMenu(clipboardCaptureContextMenu);

  if (!capture) {
    return <div className="min-h-0 flex-1" aria-hidden="true" />;
  }

  const toolbarMeta = (
    <>
      <Badge className="px-1.5 py-0.5 text-[10px] font-medium">
        {formatKindLabel(capture.contentKind)}
      </Badge>
      <Badge variant={statusVariant(capture.status)} className="px-1.5 py-0.5 text-[10px] font-medium">
        {capture.status}
      </Badge>
      <span className="shrink-0 text-[9px] text-muted-foreground/76">
        {formatRelativeTimestamp(capture.capturedAt)}
      </span>
    </>
  );

  const toolbarActions = (
    <>
      <TooltipIconButton
        label="Copy Again"
        onClick={() => void copyCapture.execute({ capture })}
      >
        <Copy />
      </TooltipIconButton>
      {capture.contentKind === "image" && capture.assetPath ? (
        <TooltipIconButton label="Enlarge" onClick={onOpenImage}>
          <Expand />
        </TooltipIconButton>
      ) : null}
      {capture.contentKind === "image" && capture.assetPath ? (
        <TooltipIconButton
          label="Open in Preview"
          onClick={() =>
            void openImagePreview.execute({
              path: capture.assetPath ?? "",
            })}
        >
          <ImageIcon />
        </TooltipIconButton>
      ) : null}
    </>
  );

  return (
    <>
      <div
        className={`grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] ${capturePreviewSurfaceClassName(capture.contentKind)}`}
        onContextMenu={(event) => onContextMenu(event, capture)}
      >
        <div className="min-h-0 min-w-0">
          <Suspense fallback={<div className="h-full w-full" />}>
            <CaptureDetailPreview
              capture={capture}
              highlightQuery={highlightQuery}
              onOpenImage={onOpenImage}
              sharedSurface
              toolbarMeta={toolbarMeta}
              toolbarActions={toolbarActions}
            />
          </Suspense>
        </div>

        <DetailInformation capture={capture} />
      </div>
    </>
  );
}

function TooltipIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label} placement="bottom">
      <div className="shrink-0">
        <Button
          variant="outline"
          size="icon"
          className="size-7 rounded-[10px] border-border/50 bg-background/42 text-muted-foreground/80 shadow-none transition hover:bg-secondary/50 hover:text-foreground [&_svg]:size-3"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </div>
    </Tooltip>
  );
}

function DetailInformation({ capture }: { capture: ClipboardCapture }) {
  const rows = detailRows(capture);
  const visibleRows = rows.slice(0, 6);
  const cells = Array.from({ length: 6 }, (_, index) => visibleRows[index] ?? null);
  const sourceAppIconSrc = useClipboardAssetSrc(capture.sourceAppIconPath);

  return (
    <section className="px-2 pb-2 pt-0">
      <div className="app-detail-grid-shell overflow-hidden rounded-[16px]">
        <div className="app-detail-grid h-[108px]">
          {cells.map((cell, index) => (
            <div
              key={cell ? cell.label : `empty-${index}`}
              className="app-detail-grid-cell min-w-0 px-2.5 py-2"
            >
              {cell ? (
                <div className="flex h-full min-w-0 flex-col justify-center gap-0.5">
                  <div className="truncate text-[9px] font-medium tracking-[0.12em] text-muted-foreground/74 uppercase">
                    {cell.label}
                  </div>
                  <div
                    className="app-selectable min-w-0 truncate text-[12px] leading-5 text-foreground/80"
                    title={cell.value}
                  >
                    {cell.label === "Source App" && sourceAppIconSrc ? (
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="inline-flex size-[18px] shrink-0 overflow-hidden rounded-md bg-card/72 align-middle">
                          <img
                            src={sourceAppIconSrc}
                            alt={capture.sourceAppName || capture.source || "Source application icon"}
                            className="size-full object-cover"
                          />
                        </span>
                        <span className="truncate">{cell.value}</span>
                      </span>
                    ) : (
                      cell.value
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
