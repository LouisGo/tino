import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Clock3,
  FolderRoot,
  FolderSearch,
  Images,
  RefreshCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/app/query-keys";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events";
import { formatRelativeTimestamp } from "@/lib/time";
import { getDashboardSnapshot, revealPath } from "@/lib/tauri";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { data, isFetching, refetch } = useQuery({
    queryKey: queryKeys.dashboardSnapshot(),
    queryFn: getDashboardSnapshot,
    staleTime: 2 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });
  useClipboardCaptureEvents(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() });
  });
  const recentCaptures = data?.recentCaptures.slice(0, 3) ?? [];
  const cards = [
    {
      label: "Knowledge Root",
      value: data?.defaultKnowledgeRoot ?? "~/tino-inbox",
      description: "Current archive workspace used by Rust-side file writes.",
      icon: FolderRoot,
      action: data?.defaultKnowledgeRoot
        ? () => void revealPath(data.defaultKnowledgeRoot)
        : undefined,
      actionLabel: "Open knowledge root in file manager",
    },
    {
      label: "Queue Policy",
      value: data?.queuePolicy ?? "20 captures or 10 minutes",
      description: "Frozen hybrid batch rule reserved for the next milestone.",
      icon: Clock3,
      action: undefined,
      actionLabel: undefined,
    },
    {
      label: "Runtime",
      value: `${data?.appName ?? "Tino"} ${data?.appVersion ?? "0.1.0"}`,
      description: `${data?.os ?? "browser"} · ${data?.captureMode ?? "Rust clipboard poller active"}`,
      icon: ArrowUpRight,
      action: undefined,
      actionLabel: undefined,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="app-hero-surface">
        <div className="app-hero-control px-6 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                Control Tower
              </p>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">
                  Clipboard capture now lands in `daily/*.md` through the Rust
                  runtime.
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  The shell remains narrow on purpose: keep capture reliable,
                  expose just enough recent state to verify it, and use a dedicated
                  board for richer clipboard inspection.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCcw className={isFetching ? "animate-spin" : ""} />
              Refresh Snapshot
            </Button>
          </div>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="bg-surface-panel">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <CardDescription>{card.label}</CardDescription>
                {card.action ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="app-icon-chip"
                    onClick={card.action}
                    aria-label={card.actionLabel}
                    title={card.actionLabel}
                  >
                    <FolderSearch className="size-4" />
                  </Button>
                ) : (
                  <div className="app-icon-chip">
                    <card.icon className="size-4" />
                  </div>
                )}
              </div>
              <CardTitle className="text-xl leading-7">{card.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="app-icon-chip">
                  <Images className="size-4" />
                </div>
                <CardTitle>Clipboard Board</CardTitle>
              </div>
              <CardDescription className="max-w-2xl text-sm leading-6">
                Recent captures now live in a dedicated two-panel board with search,
                filtering, quick preview, and structured detail.
              </CardDescription>
            </div>

            <Button asChild>
              <Link to="/clipboard">
                Open Clipboard Board
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          {recentCaptures.length ? (
            recentCaptures.map((capture) => (
              <div
                key={capture.id}
                className="rounded-[24px] border border-border/80 bg-surface-elevated p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">
                    {formatKindLabel(capture.contentKind)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTimestamp(capture.capturedAt)}
                  </span>
                </div>
                <p className="mt-4 line-clamp-2 text-sm font-semibold leading-6 text-foreground">
                  {capture.preview}
                </p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {capture.secondaryPreview ?? capture.rawText}
                </p>
              </div>
            ))
          ) : (
            <div className="col-span-full flex min-h-40 items-center justify-center rounded-[24px] border border-dashed border-border/80 bg-surface-soft px-6 text-sm text-muted-foreground">
              No captures yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatKindLabel(contentKind: string) {
  switch (contentKind) {
    case "plain_text":
      return "Text";
    case "rich_text":
      return "Rich Text";
    case "link":
      return "Link";
    case "image":
      return "Image";
    default:
      return contentKind;
  }
}
