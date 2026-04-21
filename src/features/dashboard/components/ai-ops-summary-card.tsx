import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { queryKeys } from "@/app/query-keys";
import { Badge } from "@/components/ui/badge";
import { formatAppNumber, formatAppRelativeTime, useScopedT } from "@/i18n";
import { getAiSystemSnapshot } from "@/lib/tauri";
import type { AiSystemPhase, AiSystemSnapshot, BatchCompileRuntimeStatus } from "@/types/shell";

type DashboardT = ReturnType<typeof useScopedT<"dashboard">>;

export function AiOpsSummaryCard() {
  const tDashboard = useScopedT("dashboard");
  const aiSystemQuery = useQuery({
    queryKey: queryKeys.aiSystemSnapshot(),
    queryFn: getAiSystemSnapshot,
    staleTime: 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });

  const snapshot = aiSystemQuery.data;
  const runtimeLabel = snapshot
    ? formatRuntimeStatusLabel(tDashboard, snapshot.runtime.status)
    : aiSystemQuery.isError
      ? tDashboard("aiOps.status.unavailable")
      : tDashboard("aiOps.status.loading");
  const runtimeBadgeVariant = resolveRuntimeBadgeVariant(snapshot, aiSystemQuery.isError);
  const phaseLabel = snapshot
    ? formatPhaseLabel(tDashboard, snapshot.phase)
    : tDashboard("aiOps.phase.loading");
  const sourceLabel = snapshot ? resolveSourceLabel(snapshot, tDashboard) : null;
  const summary = resolveSummaryCopy(snapshot, aiSystemQuery.isError, tDashboard);
  const latestWrite = snapshot ? resolveLatestWrite(snapshot) : null;
  const activityCopy = snapshot ? resolveActivityCopy(snapshot, tDashboard) : null;
  const correctionRate = formatCorrectionRate(snapshot, tDashboard);

  return (
    <section
      aria-label={tDashboard("aiOps.label")}
      className="w-full min-w-0 rounded-[1.4rem] border border-border/65 bg-background/72 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-sm md:w-[23rem] md:flex-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.14em] text-foreground/55 uppercase">
            <Activity className="size-3.5" />
            <span>{tDashboard("aiOps.label")}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {sourceLabel
              ? tDashboard("aiOps.titleWithSource", {
                  values: {
                    phase: phaseLabel,
                    source: sourceLabel,
                  },
                })
              : tDashboard("aiOps.title", {
                  values: {
                    phase: phaseLabel,
                  },
                })}
          </p>
        </div>
        <Badge variant={runtimeBadgeVariant} className="shrink-0">
          {runtimeLabel}
        </Badge>
      </div>

      <p className="mt-2 line-clamp-2 text-[0.8rem] leading-5 text-foreground/64">
        {summary}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2.5">
        <MetricTile
          label={tDashboard("aiOps.metrics.pending")}
          value={formatMetricValue(snapshot?.runtime.observedPendingCaptureCount)}
        />
        <MetricTile
          label={tDashboard("aiOps.metrics.backlog")}
          value={formatMetricValue(snapshot?.runtime.observedBatchBacklogCount)}
        />
        <MetricTile
          label={tDashboard("aiOps.metrics.feedback")}
          value={formatMetricValue(snapshot?.feedbackEventCount)}
        />
        <MetricTile
          label={tDashboard("aiOps.metrics.correctionRate")}
          value={correctionRate}
        />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="outline">{phaseLabel}</Badge>
        {sourceLabel ? (
          <Badge variant="secondary" className="max-w-full truncate">
            {sourceLabel}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 border-t border-border/55 pt-3">
        <p className="text-[0.76rem] leading-5 text-foreground/62">
          {activityCopy ?? tDashboard("aiOps.summary.noActivity")}
        </p>
        {latestWrite ? (
          <p className="mt-1 truncate text-[0.72rem] text-foreground/48">
            {latestWrite.knowledgePath}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-border/55 bg-background/70 px-3 py-2.5">
      <dt className="text-[0.68rem] tracking-[0.12em] text-foreground/44 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function formatMetricValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "--";
  }

  return formatAppNumber(value);
}

function formatCorrectionRate(
  snapshot: AiSystemSnapshot | undefined,
  tDashboard: DashboardT,
) {
  const correctionRate = snapshot?.latestQualitySnapshot?.correctionRate;
  if (correctionRate === null || correctionRate === undefined) {
    return "--";
  }

  return tDashboard("aiOps.metrics.correctionRateValue", {
    values: {
      rate: formatAppNumber(correctionRate * 100, {
        maximumFractionDigits: 0,
      }),
    },
  });
}

function resolveRuntimeBadgeVariant(
  snapshot: AiSystemSnapshot | undefined,
  isError: boolean,
): "secondary" | "warning" | "success" {
  if (isError) {
    return "warning";
  }

  if (!snapshot) {
    return "secondary";
  }

  if (
    snapshot.runtime.lastError
    || !snapshot.capability.backgroundCompileConfigured
    || snapshot.runtime.status === "awaiting_capability"
    || snapshot.runtime.status === "blocked"
  ) {
    return "warning";
  }

  return "success";
}

function resolveSummaryCopy(
  snapshot: AiSystemSnapshot | undefined,
  isError: boolean,
  tDashboard: DashboardT,
) {
  if (isError) {
    return tDashboard("aiOps.summary.unavailable");
  }

  if (!snapshot) {
    return tDashboard("aiOps.summary.loading");
  }

  if (snapshot.runtime.lastError) {
    return tDashboard("aiOps.summary.lastError", {
      values: {
        message: snapshot.runtime.lastError,
      },
    });
  }

  if (snapshot.capability.backgroundSourceReason) {
    return snapshot.capability.backgroundSourceReason;
  }

  if (!snapshot.capability.backgroundCompileConfigured) {
    return tDashboard("aiOps.summary.unconfigured");
  }

  return tDashboard("aiOps.summary.secondary");
}

function resolveSourceLabel(
  snapshot: AiSystemSnapshot,
  tDashboard: DashboardT,
) {
  return snapshot.capability.backgroundSourceLabel
    || snapshot.capability.activeProviderName
    || tDashboard("aiOps.summary.unconfiguredSource");
}

function resolveActivityCopy(
  snapshot: AiSystemSnapshot,
  tDashboard: DashboardT,
) {
  const latestWrite = resolveLatestWrite(snapshot);
  if (latestWrite) {
    return tDashboard("aiOps.summary.lastWrite", {
      values: {
        time: formatAppRelativeTime(latestWrite.persistedAt),
      },
    });
  }

  const lastFeedbackAt = snapshot.latestQualitySnapshot?.lastFeedbackAt;
  if (lastFeedbackAt) {
    return tDashboard("aiOps.summary.lastFeedback", {
      values: {
        time: formatAppRelativeTime(lastFeedbackAt),
      },
    });
  }

  if (snapshot.runtime.lastTransitionAt) {
    return tDashboard("aiOps.summary.lastTransition", {
      values: {
        time: formatAppRelativeTime(snapshot.runtime.lastTransitionAt),
      },
    });
  }

  return tDashboard("aiOps.summary.noActivity");
}

function resolveLatestWrite(snapshot: AiSystemSnapshot) {
  return snapshot.recentWrites.reduce<AiSystemSnapshot["recentWrites"][number] | null>(
    (latestWrite, currentWrite) => {
      if (!latestWrite) {
        return currentWrite;
      }

      const latestTime = new Date(latestWrite.persistedAt).getTime();
      const currentTime = new Date(currentWrite.persistedAt).getTime();
      if (Number.isNaN(currentTime)) {
        return latestWrite;
      }

      if (Number.isNaN(latestTime) || currentTime > latestTime) {
        return currentWrite;
      }

      return latestWrite;
    },
    null,
  );
}

function formatPhaseLabel(
  tDashboard: DashboardT,
  phase: AiSystemPhase,
) {
  switch (phase) {
    case "contract_reset":
      return tDashboard("aiOps.phase.contractReset");
    case "storage_reset":
      return tDashboard("aiOps.phase.storageReset");
    case "capability_boundary":
      return tDashboard("aiOps.phase.capabilityBoundary");
    case "background_compiler":
      return tDashboard("aiOps.phase.backgroundCompiler");
    case "quality_loop":
      return tDashboard("aiOps.phase.qualityLoop");
    case "ai_ops":
      return tDashboard("aiOps.phase.aiOps");
    default:
      return phase;
  }
}

function formatRuntimeStatusLabel(
  tDashboard: DashboardT,
  status: BatchCompileRuntimeStatus,
) {
  switch (status) {
    case "not_bootstrapped":
      return tDashboard("aiOps.status.notBootstrapped");
    case "awaiting_capability":
      return tDashboard("aiOps.status.awaitingCapability");
    case "idle":
      return tDashboard("aiOps.status.idle");
    case "running":
      return tDashboard("aiOps.status.running");
    case "retry_backoff":
      return tDashboard("aiOps.status.retryBackoff");
    case "blocked":
      return tDashboard("aiOps.status.blocked");
    default:
      return status;
  }
}
