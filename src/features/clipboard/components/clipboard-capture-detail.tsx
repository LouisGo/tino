import { lazy, Suspense, type ReactNode } from "react";

import { Copy, ExternalLink, FolderOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useCommand } from "@/core/commands";
import { useContextMenu } from "@/core/context-menu";
import { clipboardCaptureContextMenu } from "@/features/clipboard/clipboard-capture-context-menu";
import { PreviewToolbarPillButton } from "@/features/clipboard/components/preview-toolbar";
import {
  captureSourceLabel,
  captureSurfaceClassName,
  detailRows,
  formatCaptureStatus,
  formatKindLabel,
  statusVariant,
} from "@/features/clipboard/lib/clipboard-board";
import {
  getFileReferenceContentTypeLabel,
  resolveFileReferencePreviewModel,
} from "@/features/clipboard/lib/file-reference-preview";
import { useClipboardAssetSrc } from "@/features/clipboard/hooks/use-clipboard-asset-src";
import { useScopedT, type TranslationKey } from "@/i18n";
import { formatRelativeTimestamp } from "@/lib/time";
import type { ClipboardCapture } from "@/types/shell";

const CaptureDetailPreview = lazy(async () => {
  const module = await import("@/features/clipboard/components/capture-preview");
  return {
    default: module.CaptureDetailPreview,
  };
});

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

export function ClipboardCaptureDetail({
  capture,
  highlightQuery,
  onOpenImage,
  onOpenImageOcr,
}: {
  capture: ClipboardCapture | null;
  highlightQuery: string;
  onOpenImage: () => void;
  onOpenImageOcr: () => void;
}) {
  const t = useScopedT("clipboard");
  const copyCapture = useCommand<{ capture: ClipboardCapture }>("clipboard.copyCapture");
  const openCaptureExternally = useCommand<ClipboardOpenCapturePayload | undefined>(
    "clipboard.openCaptureExternally",
    { capture },
  );
  const revealCaptureAsset = useCommand<{ capture: ClipboardCapture; path: string }>("clipboard.revealCaptureAsset");
  const { onContextMenu } = useContextMenu(clipboardCaptureContextMenu);

  if (!capture) {
    return <div className="min-h-0 flex-1" aria-hidden="true" />;
  }

  const kindLabel = resolveCaptureKindLabel(capture, t);
  const toolbarMeta = (
    <>
      <Badge className="px-1.5 py-0.5 text-[10px] font-medium">
        {kindLabel}
      </Badge>
      <Badge variant={statusVariant(capture.status)} className="px-1.5 py-0.5 text-[10px] font-medium">
        {formatCaptureStatus(capture.status, t)}
      </Badge>
      <span className="shrink-0 text-[9px] text-muted-foreground/76">
        {formatRelativeTimestamp(capture.capturedAt)}
      </span>
    </>
  );

  const toolbarControls = capture.contentKind === "image" && capture.assetPath
    ? (
        <div className="flex items-center gap-1.5">
          {openCaptureExternally.canExecute ? (
            <PreviewToolbarPillButton
              aria-label={t("actions.openInPreview")}
              className="app-kind-text-image"
              shortcutId="clipboard.openSelectedCapture"
              // tooltipLabel={t("actions.open")}
              onClick={() => void openCaptureExternally.execute()}
            >
              {t("actions.open")}
              <ExternalLink className="size-3.5" />
            </PreviewToolbarPillButton>
          ) : null}
          <PreviewToolbarPillButton
            aria-label={t("actions.revealFile")}
            title={t("actions.revealFile")}
            className="app-kind-text-image"
            onClick={() =>
              void revealCaptureAsset.execute({
                capture,
                path: capture.assetPath ?? "",
              })}
          >
            {t("actions.revealFile")}
            <FolderOpen className="size-3.5" />
          </PreviewToolbarPillButton>
        </div>
      )
    : undefined;

  const toolbarActions = (
    <>
      <TooltipIconButton
        label={t("actions.copyAgain")}
        onClick={() => void copyCapture.execute({ capture })}
      >
        <Copy />
      </TooltipIconButton>
    </>
  );

  return (
    <>
      <div
        className={`grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_auto] ${captureSurfaceClassName(capture)}`}
        onContextMenu={(event) => onContextMenu(event, capture)}
      >
        <div className="min-h-0 min-w-0">
          <Suspense fallback={<div className="h-full w-full" />}>
            <CaptureDetailPreview
              capture={capture}
              highlightQuery={highlightQuery}
              onOpenImage={onOpenImage}
              onOpenImageOcr={onOpenImageOcr}
              sharedSurface
              toolbarMeta={toolbarMeta}
              toolbarControls={toolbarControls}
              toolbarActions={toolbarActions}
            />
          </Suspense>
        </div>

        <DetailInformation capture={capture} />
      </div>
    </>
  );
}

function resolveCaptureKindLabel(
  capture: ClipboardCapture,
  t: ClipboardTranslate,
) {
  if (capture.contentKind === "file" || capture.contentKind === "video") {
    return getFileReferenceContentTypeLabel(resolveFileReferencePreviewModel(capture), t);
  }

  return formatKindLabel(capture.contentKind, t);
}

function TooltipIconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
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
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </div>
    </Tooltip>
  );
}

function DetailInformation({ capture }: { capture: ClipboardCapture }) {
  const t = useScopedT("clipboard");
  const rows = detailRows(capture, t);
  const visibleRows = rows.slice(0, 6);
  const cells = Array.from({ length: 6 }, (_, index) => visibleRows[index] ?? null);
  const sourceAppIconSrc = useClipboardAssetSrc(capture.sourceAppIconPath);
  const sourceAppLabel = captureSourceLabel(capture, t);

  return (
    <section className="px-2 pb-2 pt-0">
      <div className="app-detail-grid-shell overflow-hidden rounded-[16px]">
        <div className="app-detail-grid h-[108px]">
          {cells.map((cell, index) => (
            <div
              key={cell ? cell.key : `empty-${index}`}
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
                    {cell.key === "sourceApp" && sourceAppIconSrc ? (
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="inline-flex size-[18px] shrink-0 overflow-hidden rounded-md bg-card/72 align-middle">
                          <img
                            src={sourceAppIconSrc}
                            alt={t("capture.detail.sourceAppIconAlt", {
                              values: {
                                appName: sourceAppLabel,
                              },
                            })}
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
