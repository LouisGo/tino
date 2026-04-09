import {
  summarizeRatio,
  type ClipboardFilter,
} from "@/features/clipboard/lib/clipboard-board";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ClipboardPageSummary } from "@/types/shell";

export function ClipboardBoardSummary({
  summary,
  historyDays,
  status,
}: {
  summary: ClipboardPageSummary;
  historyDays: number;
  status?: "loading" | "error" | "ready";
}) {
  const t = useScopedT("clipboard");
  const activeFilter = useClipboardBoardStore((state) => state.filter);
  const toggleSummaryFilter = useClipboardBoardStore((state) => state.toggleSummaryFilter);
  const statusLabel =
    status === "loading"
      ? t("board.status.loading")
      : status === "error"
        ? t("board.status.readError")
        : null;
  const waitingHint = t("board.summary.waiting");
  const summaryTiles = [
    {
      filter: "all" as ClipboardFilter,
      label: t("filters.all.shortLabel"),
      value: statusLabel ? "..." : summary.total,
      hint:
        status === "loading"
          ? t("board.summary.recentLoadingHint")
          : status === "error"
            ? t("board.summary.recentErrorHint")
            : t("board.summary.recentWindow", {
                values: {
                  days: historyDays,
                },
              }),
      toneClass: "app-summary-tone-recent",
    },
    {
      filter: "text" as ClipboardFilter,
      label: t("filters.text.shortLabel"),
      value: statusLabel ? "..." : summary.text,
      hint: statusLabel ? waitingHint : summarizeRatio(summary.text, summary.total, t),
      toneClass: "app-summary-tone-text",
    },
    {
      filter: "link" as ClipboardFilter,
      label: t("filters.link.shortLabel"),
      value: statusLabel ? "..." : summary.links,
      hint: statusLabel ? waitingHint : summarizeRatio(summary.links, summary.total, t),
      toneClass: "app-summary-tone-links",
    },
    {
      filter: "image" as ClipboardFilter,
      label: t("filters.image.shortLabel"),
      value: statusLabel ? "..." : summary.images,
      hint: statusLabel ? waitingHint : summarizeRatio(summary.images, summary.total, t),
      toneClass: "app-summary-tone-images",
    },
    {
      filter: "video" as ClipboardFilter,
      label: t("filters.video.shortLabel"),
      value: statusLabel ? "..." : summary.videos,
      hint: statusLabel ? waitingHint : summarizeRatio(summary.videos, summary.total, t),
      toneClass: "app-summary-tone-videos",
    },
    {
      filter: "file" as ClipboardFilter,
      label: t("filters.file.shortLabel"),
      value: statusLabel ? "..." : summary.files,
      hint: statusLabel ? waitingHint : summarizeRatio(summary.files, summary.total, t),
      toneClass: "app-summary-tone-files",
    },
  ] as const;

  return (
    <div className="app-hero-surface">
      <div className="app-hero-clipboard px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-primary uppercase sm:text-xs">
            {t("board.title")}
          </p>
          <p className="rounded-full border border-border/80 bg-surface-elevated px-2.5 py-0.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            {statusLabel
              ?? t("board.status.captureCount", {
                values: {
                  count: summary.total,
                },
              })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 min-[900px]:grid-cols-3 min-[1320px]:grid-cols-6">
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
  const t = useScopedT("clipboard");

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
          {t("board.summary.active")}
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
