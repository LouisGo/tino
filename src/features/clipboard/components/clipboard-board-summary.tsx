import { cn } from "@/lib/utils";
import type { ClipboardCapture } from "@/types/shell";
import {
  buildClipboardSummary,
  summarizeRatio,
} from "@/features/clipboard/lib/clipboard-board";

export function ClipboardBoardSummary({
  captures,
}: {
  captures: ClipboardCapture[];
}) {
  const summary = buildClipboardSummary(captures);
  const summaryTiles = [
    {
      label: "Recent",
      value: summary.total,
      hint: "Total entries in recent board",
      toneClass: "app-summary-tone-recent",
    },
    {
      label: "Text",
      value: summary.text,
      hint: summarizeRatio(summary.text, summary.total),
      toneClass: "app-summary-tone-text",
    },
    {
      label: "Links",
      value: summary.links,
      hint: summarizeRatio(summary.links, summary.total),
      toneClass: "app-summary-tone-links",
    },
    {
      label: "Images",
      value: summary.images,
      hint: summarizeRatio(summary.images, summary.total),
      toneClass: "app-summary-tone-images",
    },
  ] as const;

  return (
    <div className="app-hero-surface">
      <div className="app-hero-clipboard px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase sm:text-xs">
            Clipboard Board
          </p>
          <p className="rounded-full border border-border/80 bg-surface-elevated px-2.5 py-0.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            {summary.total} Captures
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {summaryTiles.map((tile) => (
            <SummaryTile
              key={tile.label}
              label={tile.label}
              value={tile.value}
              hint={tile.hint}
              toneClass={tile.toneClass}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  toneClass,
}: {
  label: string;
  value: number;
  hint: string;
  toneClass: string;
}) {
  return (
    <div className={cn("app-summary-tile", toneClass)}>
      <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-[1.4rem] font-semibold leading-none tracking-tight sm:text-[1.55rem]">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}
