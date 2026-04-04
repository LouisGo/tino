import type { ReactNode } from "react";

import { Copy, Expand, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  CaptureDetailPreview,
} from "@/features/clipboard/components/capture-preview";
import {
  detailRows,
  formatKindLabel,
  kindBadgeClass,
  statusVariant,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { copyCaptureToClipboard, openImageInPreview } from "@/lib/tauri";
import { formatRelativeTimestamp } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ClipboardCapture } from "@/types/shell";

import { ClipboardEmptyState } from "./clipboard-empty-state";

export function ClipboardCaptureDetail({
  capture,
  onOpenImage,
}: {
  capture: ClipboardCapture | null;
  onOpenImage: () => void;
}) {
  if (!capture) {
    return (
      <div className="p-4">
        <ClipboardEmptyState
          title="Clipboard board is empty"
          description="Copy text, links, or images on macOS and the recent capture board will populate here."
        />
      </div>
    );
  }

  return (
    <>
      <div className="app-card-header-elevated flex h-[50px] items-center justify-between gap-3 border-b border-border/70 px-4">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
          <Badge className={kindBadgeClass(capture.contentKind)}>
            {formatKindLabel(capture.contentKind)}
          </Badge>
          <Badge variant={statusVariant(capture.status)}>
            {capture.status}
          </Badge>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelativeTimestamp(capture.capturedAt)}
          </span>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
          <TooltipIconButton label="Copy Again" onClick={() => void copyCaptureToClipboard(capture)}>
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
              onClick={() => void openImageInPreview(capture.assetPath ?? "")}
            >
              <ImageIcon />
            </TooltipIconButton>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
        <div className="min-h-0 min-w-0">
          <CaptureDetailPreview capture={capture} onOpenImage={onOpenImage} />
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
          className="size-8 rounded-[14px] border-border/70 bg-card/75 shadow-none [&_svg]:size-3.5"
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
  const tableRows = chunkDetailRows(rows, 3);
  const sourceAppIconSrc = useClipboardAssetSrc(capture.sourceAppIconPath);

  return (
    <section className="px-2.5 py-2.5">
      <div className="overflow-hidden rounded-[18px] border border-border/70 bg-background/65">
        <div className="overflow-auto">
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {tableRows.map((tableRow, rowIndex) => (
                <tr
                  key={`detail-row-${rowIndex}`}
                  className={cn(rowIndex > 0 ? "border-t border-border/70" : "")}
                >
                  {tableRow.map((cell, cellIndex) =>
                    cell ? (
                      <td
                        key={cell.label}
                        className={cn(
                          "align-top px-3 py-2.5",
                          cellIndex > 0 ? "border-l border-border/70" : "",
                        )}
                        >
                          <div className="space-y-0.5">
                            <div className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                              {cell.label}
                            </div>
                            <div className="app-selectable break-all text-[13px] leading-5 text-foreground">
                              {cell.label === "Source App" && sourceAppIconSrc ? (
                                <span className="inline-flex items-center gap-2">
                                  <span className="inline-flex size-5 shrink-0 overflow-hidden rounded-md bg-card/80 align-middle">
                                    <img
                                      src={sourceAppIconSrc}
                                      alt={capture.sourceAppName || capture.source || "Source application icon"}
                                      className="size-full object-cover"
                                    />
                                  </span>
                                  <span>{cell.value}</span>
                                </span>
                              ) : (
                                cell.value
                              )}
                            </div>
                        </div>
                      </td>
                    ) : (
                      <td
                        key={`empty-${rowIndex}-${cellIndex}`}
                        className={cn(
                          "px-3 py-2.5",
                          cellIndex > 0 ? "border-l border-border/70" : "",
                        )}
                      />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function chunkDetailRows<T>(items: T[], size: number) {
  const result: Array<Array<T | null>> = [];

  for (let index = 0; index < items.length; index += size) {
    const chunk: Array<T | null> = items.slice(index, index + size);
    while (chunk.length < size) {
      chunk.push(null);
    }
    result.push(chunk);
  }

  return result;
}
