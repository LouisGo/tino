import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpRight, Clock3, FolderRoot, RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardSnapshot } from "@/lib/tauri";
import { formatRelativeTimestamp } from "@/lib/utils";
import type { CapturePreview } from "@/types/shell";

const columnHelper = createColumnHelper<CapturePreview>();

const columns = [
  columnHelper.accessor("preview", {
    header: "Capture Preview",
    cell: (info) => (
      <div className="space-y-1">
        <p className="font-medium">{info.getValue()}</p>
        <p className="text-xs text-muted-foreground">
          {info.row.original.source} · {info.row.original.contentKind}
        </p>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => (
      <Badge
        variant={
          info.getValue() === "archived"
            ? "success"
            : info.getValue() === "filtered"
              ? "warning"
              : "secondary"
        }
      >
        {info.getValue()}
      </Badge>
    ),
  }),
  columnHelper.accessor("capturedAt", {
    header: "Captured At",
    cell: (info) => (
      <span className="text-sm text-muted-foreground">
        {formatRelativeTimestamp(info.getValue())}
      </span>
    ),
  }),
];

export function DashboardPage() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-snapshot"],
    queryFn: getDashboardSnapshot,
  });

  // TanStack Table returns an imperative instance by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.recentCaptures ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const cards = useMemo(
    () => [
      {
        label: "Knowledge Root",
        value: data?.defaultKnowledgeRoot ?? "~/tino-inbox",
        description: "User-selected Markdown workspace root.",
        icon: FolderRoot,
      },
      {
        label: "Queue Policy",
        value: data?.queuePolicy ?? "20 captures or 10 minutes",
        description: "Hybrid batching from the technical freeze.",
        icon: Clock3,
      },
      {
        label: "Runtime",
        value: `${data?.appName ?? "Tino"} ${data?.appVersion ?? "0.1.0"}`,
        description: `${data?.os ?? "browser"} · ${data?.buildChannel ?? "debug"}`,
        icon: ArrowUpRight,
      },
    ],
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-border/80 bg-card px-6 py-6 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
            Control Tower
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              Desktop shell is wired and ready for the real capture pipeline.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              This scaffold already wires Tauri, tray support, Rust commands,
              Zustand shell state, and TanStack Query / Router / Table / Form.
              The next layer is business logic, not more setup churn.
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

      <section className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="bg-card/95">
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <CardDescription>{card.label}</CardDescription>
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <card.icon className="size-4" />
                </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Recent Captures</CardTitle>
          <CardDescription>
            Table scaffold powered by TanStack Table. Replace this mock snapshot
            with real Rust-side capture history next.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No captures yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
