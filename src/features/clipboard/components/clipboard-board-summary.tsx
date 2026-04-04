import { cn } from "@/lib/utils";
import type { ClipboardPageSummary } from "@/types/shell";
import {
  summarizeRatio,
  type ClipboardFilter,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";

export function ClipboardBoardSummary({
  summary,
  historyDays,
  status,
}: {
  summary: ClipboardPageSummary;
  historyDays: number;
  status?: "loading" | "error" | "ready";
}) {
  const activeFilter = useClipboardBoardStore((state) => state.filter);
  const toggleSummaryFilter = useClipboardBoardStore((state) => state.toggleSummaryFilter);
  const statusLabel =
    status === "loading" ? "Loading" : status === "error" ? "Read Error" : null;
  const summaryTiles = [
    {
      filter: "all" as ClipboardFilter,
      label: "Recent",
      value: statusLabel ? "..." : summary.total,
      hint:
        status === "loading"
          ? "Reading recent clipboard history"
          : status === "error"
            ? "Check runtime logs and retry"
            : `Within the last ${historyDays} day${historyDays === 1 ? "" : "s"}`,
      toneClass: "app-summary-tone-recent",
    },
    {
      filter: "text" as ClipboardFilter,
      label: "Text",
      value: statusLabel ? "..." : summary.text,
      hint: statusLabel ? "Waiting for summary" : summarizeRatio(summary.text, summary.total),
      toneClass: "app-summary-tone-text",
    },
    {
      filter: "link" as ClipboardFilter,
      label: "Links",
      value: statusLabel ? "..." : summary.links,
      hint: statusLabel ? "Waiting for summary" : summarizeRatio(summary.links, summary.total),
      toneClass: "app-summary-tone-links",
    },
    {
      filter: "image" as ClipboardFilter,
      label: "Images",
      value: statusLabel ? "..." : summary.images,
      hint: statusLabel ? "Waiting for summary" : summarizeRatio(summary.images, summary.total),
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
            {statusLabel ?? `${summary.total} Captures`}
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
              active={activeFilter === tile.filter}
              onClick={() => toggleSummaryFilter(tile.filter)}
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
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  toneClass: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "app-summary-tile group relative flex min-h-[5.6rem] w-full flex-col items-start text-left transition duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-md",
        active && "border-foreground/14 shadow-md ring-1 ring-foreground/8",
        toneClass,
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase transition group-hover:text-foreground/72">
          {label}
        </p>
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] uppercase transition",
            active
              ? "border-foreground/12 bg-card/80 text-foreground"
              : "border-transparent bg-transparent text-transparent",
          )}
        >
          Active
        </span>
      </div>
      <p className="mt-1 text-[1.4rem] font-semibold leading-none tracking-tight sm:text-[1.55rem]">
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        {hint}
      </p>
    </button>
  );
}
