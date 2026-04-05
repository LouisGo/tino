import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Bot,
  Clock3,
  FolderRoot,
  FolderSearch,
  Images,
  RefreshCcw,
} from "lucide-react";

import { queryKeys } from "@/app/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCommand } from "@/core/commands";
import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events";
import { useScopedT } from "@/i18n";
import { formatRelativeTimestamp } from "@/lib/time";
import { getDashboardSnapshot } from "@/lib/tauri";

export function DashboardPage() {
  const tCommon = useScopedT("common");
  const tDashboard = useScopedT("dashboard");
  const queryClient = useQueryClient();
  const revealPath = useCommand<{ path: string }>("system.revealPath");
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
      label: tDashboard("cards.knowledgeRoot.label"),
      value:
        data?.defaultKnowledgeRoot ?? tDashboard("cards.knowledgeRoot.fallbackValue"),
      description: tDashboard("cards.knowledgeRoot.description"),
      icon: FolderRoot,
      action: data?.defaultKnowledgeRoot
        ? () =>
            void revealPath.execute({
              path: data.defaultKnowledgeRoot,
            })
        : undefined,
      actionLabel: tDashboard("cards.knowledgeRoot.actionLabel"),
    },
    {
      label: tDashboard("cards.queuePolicy.label"),
      value: data?.queuePolicy ?? tDashboard("cards.queuePolicy.fallbackValue"),
      description: tDashboard("cards.queuePolicy.description"),
      icon: Clock3,
      action: undefined,
      actionLabel: undefined,
    },
    {
      label: tDashboard("cards.runtime.label"),
      value: `${data?.appName ?? tCommon("appName")} ${data?.appVersion ?? "0.1.0"}`,
      description: tDashboard("cards.runtime.description", {
        values: {
          os: data?.os ?? tDashboard("cards.runtime.fallbackOs"),
          captureMode:
            data?.captureMode ?? tDashboard("cards.runtime.fallbackCaptureMode"),
        },
      }),
      icon: ArrowUpRight,
      action: undefined,
      actionLabel: undefined,
    },
  ] as const;

  const aiItems = [
    tDashboard("sections.ai.item1"),
    tDashboard("sections.ai.item2"),
    tDashboard("sections.ai.item3"),
  ];

  return (
    <div className="app-scroll-area h-full overflow-y-auto pr-2">
      <div className="space-y-6 pb-8">
        <div className="app-hero-surface">
          <div className="app-hero-control px-6 py-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-3">
                <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                  {tDashboard("hero.eyebrow")}
                </p>
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    {tDashboard("hero.title")}
                  </h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                    {tDashboard("hero.description")}
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
                {tDashboard("hero.refresh")}
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
                    <Bot className="size-4" />
                  </div>
                  <CardTitle>{tDashboard("sections.ai.title")}</CardTitle>
                </div>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  {tDashboard("sections.ai.description")}
                </CardDescription>
              </div>

              <Button asChild>
                <Link to="/ai">
                  {tDashboard("sections.ai.actionLabel")}
                  <ArrowUpRight />
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="grid gap-3 p-4 md:grid-cols-3">
            {aiItems.map((item) => (
              <div
                key={item}
                className="rounded-[24px] border border-border/80 bg-surface-elevated p-4 shadow-sm"
              >
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/80 bg-surface-panel">
          <CardHeader className="border-b border-border/70">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="app-icon-chip">
                    <Images className="size-4" />
                  </div>
                  <CardTitle>{tDashboard("sections.clipboard.title")}</CardTitle>
                </div>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  {tDashboard("sections.clipboard.description")}
                </CardDescription>
              </div>

              <Button asChild>
                <Link to="/clipboard">
                  {tDashboard("sections.clipboard.actionLabel")}
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
                      {formatKindLabel(capture.contentKind, tDashboard)}
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
                {tDashboard("sections.clipboard.empty")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatKindLabel(
  contentKind: string,
  tDashboard: (
    key:
      | "kindLabels.plainText"
      | "kindLabels.richText"
      | "kindLabels.link"
      | "kindLabels.image",
  ) => string,
) {
  switch (contentKind) {
    case "plain_text":
      return tDashboard("kindLabels.plainText");
    case "rich_text":
      return tDashboard("kindLabels.richText");
    case "link":
      return tDashboard("kindLabels.link");
    case "image":
      return tDashboard("kindLabels.image");
    default:
      return contentKind;
  }
}
