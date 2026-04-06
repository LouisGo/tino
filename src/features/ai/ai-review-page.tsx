import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowUpRight,
  FolderTree,
  Inbox,
  RefreshCcw,
  Trash2,
} from "lucide-react"

import { queryKeys } from "@/app/query-keys"
import {
  FloatingFeedbackCard,
  type FloatingFeedbackChoice,
} from "@/components/feedback/floating-feedback-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  useAiReviewWorkspace,
  type ValueFeedback,
} from "@/features/ai/hooks/use-ai-review-workspace"
import { isMockAiBatchId } from "@/features/ai/lib/mock-fixtures"
import { formatBatchRuntimeStateLabel } from "@/features/ai/runtime/batch-state-machine"
import { getAiBatchPayload, getReadyAiBatches } from "@/lib/tauri-ai"
import { formatRelativeTimestamp } from "@/lib/time"
import type {
  AiBatchPayload,
  ApplyBatchDecisionResult,
  BatchDecisionCluster,
  BatchDecisionReview,
  ReviewAction,
} from "@/types/shell"
import { cn } from "@/lib/utils"

const valueFeedbackOptions = [
  {
    value: "helpful",
    label: "Useful",
    description: "The result felt worth keeping.",
    sentiment: "positive",
  },
  {
    value: "mixed",
    label: "Mixed",
    description: "Some parts helped, but it still needs tuning.",
    sentiment: "neutral",
  },
  {
    value: "not_worth_it",
    label: "Not Useful",
    description: "The result did not justify the run.",
    sentiment: "negative",
  },
] as const satisfies readonly FloatingFeedbackChoice[]

const feedbackReasonOptions = [
  "Wrong destination",
  "Summary too vague",
  "Too much manual fixing",
  "Useful summary",
  "Saved time",
  "Need more context",
] as const

export function AiReviewPage() {
  const [requestedBatchId, setRequestedBatchId] = useState<string | null>(null)

  const batchesQuery = useQuery({
    queryKey: queryKeys.aiBatchSummaries(),
    queryFn: getReadyAiBatches,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  })

  const batches = batchesQuery.data ?? []
  const selectedBatchId =
    requestedBatchId && batches.some((batch) => batch.id === requestedBatchId)
      ? requestedBatchId
      : batches[0]?.id ?? null

  const payloadQuery = useQuery({
    queryKey: queryKeys.aiBatchPayload(selectedBatchId ?? ""),
    queryFn: () => getAiBatchPayload(selectedBatchId ?? ""),
    enabled: Boolean(selectedBatchId),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  })

  const currentPayload = payloadQuery.data

  return (
    <div className="app-scroll-area h-full overflow-y-auto pr-2">
      <div className="space-y-6 pb-8">
        <div className="app-hero-surface">
          <div className="app-hero-control px-6 py-6">
            <div className="space-y-3">
              <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                AI Organizer
              </p>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">
                  See the result first, then decide whether it looks right.
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  Open one batch to see where the content landed, what already looks
                  stable, and where you may still want to step in.
                </p>
              </div>
            </div>
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-border/80 bg-surface-panel">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Ready Batches</CardTitle>
                  <CardDescription>
                    Pick a live batch to review. Example data stays in browser-only
                    preview mode instead of mixing into the app runtime.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    void batchesQuery.refetch()
                    void payloadQuery.refetch()
                  }}
                  disabled={batchesQuery.isFetching || payloadQuery.isFetching}
                >
                  <RefreshCcw
                    className={
                      batchesQuery.isFetching || payloadQuery.isFetching
                        ? "animate-spin"
                        : ""
                    }
                  />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {batches.length ? (
                batches.map((batch) => (
                  <button
                    key={batch.id}
                    type="button"
                    onClick={() => setRequestedBatchId(batch.id)}
                    className={cn(
                      "w-full rounded-[22px] border px-4 py-4 text-left transition",
                      selectedBatchId === batch.id
                        ? "border-primary/70 bg-primary/8"
                        : "border-border/80 bg-surface-elevated hover:border-primary/35",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">
                          {formatBatchPrimaryLabel(batch.captureCount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTriggerReasonLabel(batch.triggerReason)} ·{" "}
                          {formatBatchWindowLabel(
                            batch.firstCapturedAt,
                            batch.lastCapturedAt,
                          )}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {formatBatchRuntimeStateLabel(batch.runtimeState)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Ready {formatRelativeTimestamp(batch.createdAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {isMockAiBatchId(batch.id) ? "Preview" : "Live batch"}
                      </Badge>
                      <Badge variant="secondary">{batch.id}</Badge>
                      {batch.sourceIds.slice(0, 1).map((sourceId) => (
                        <Badge key={sourceId} variant="secondary">
                          {sourceId}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/80 bg-surface-soft px-5 py-6 text-sm leading-6 text-muted-foreground">
                  No live batches are ready yet. Once the queue promotes a batch, it
                  will appear here for review.
                </div>
              )}
            </CardContent>
          </Card>

          {currentPayload ? (
            <AiOrganizerWorkspace key={currentPayload.batch.id} payload={currentPayload} />
          ) : (
            <Card className="overflow-hidden border-border/80 bg-surface-panel">
              <CardContent className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm leading-7 text-muted-foreground">
                Choose a batch from the left to see what entered the analysis and what
                the AI turned it into.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  )
}

function AiOrganizerWorkspace({ payload }: { payload: AiBatchPayload }) {
  const {
    changeClusterDecision,
    changeClusterTopicName,
    editedClusterIds,
    feedbackOpen,
    feedbackReasons,
    feedbackStatus,
    liveRunError,
    liveRunProgress,
    liveRunSummary,
    providerAccess,
    reviewDraft,
    reviewNote,
    runLiveReviewMutation,
    runtimeState,
    settingsQuery,
    setFeedbackOpen,
    setFeedbackReasons,
    setFeedbackStatus,
    setReviewNote,
    setSubmitAction,
    submitResult,
    setValueFeedback,
    submitAction,
    submitQuickFeedback,
    submitReviewMutation,
    valueFeedback,
  } = useAiReviewWorkspace(payload)

  const isPreviewResult = isMockAiBatchId(payload.batch.id)

  if (!reviewDraft) {
    return (
      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardHeader className="border-b border-border/70">
          <CardTitle>Run One Live Candidate</CardTitle>
          <CardDescription>
            This hidden intervention step runs the current provider once against the
            ready batch and keeps the result in renderer memory until you apply it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{formatBatchRuntimeStateLabel(runtimeState)}</Badge>
            <Badge variant="secondary">Live batch</Badge>
            <Badge variant="secondary">
              {providerAccess?.providerLabel ?? "Provider pending"}
            </Badge>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            Tino will call the configured model, validate the structured result, and
            turn it into a candidate review. Applying that result now writes to
            controlled topic or inbox files through the Rust boundary.
          </p>

          {liveRunError ? (
            <div className="rounded-[18px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive">
              {liveRunError}
            </div>
          ) : null}

          {liveRunProgress ? <LiveRunProgressCard progress={liveRunProgress} /> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => runLiveReviewMutation.mutate()}
              disabled={!providerAccess?.isConfigured || settingsQuery.isLoading || runLiveReviewMutation.isPending}
            >
              <RefreshCcw className={runLiveReviewMutation.isPending ? "animate-spin" : ""} />
              {runLiveReviewMutation.isPending ? "Running live candidate" : "Run live candidate"}
            </Button>

            <Button type="button" variant="outline" asChild>
              <Link to="/settings">
                Open settings
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          <p className="text-xs leading-6 text-muted-foreground">
            {settingsQuery.isLoading
              ? "Loading provider settings..."
              : providerAccess?.isConfigured
                ? "Provider looks ready. This run is manual on purpose."
                : "Base URL, model, and API key must be configured before this batch can run live."}
          </p>
        </CardContent>
      </Card>
    )
  }

  const {
    capturesById,
    orderedClusters,
    outcomeSummary,
    quickConfirmAction,
    reviewSignals,
    visibleTags,
  } = buildAiOrganizerWorkspaceViewState(payload, reviewDraft, editedClusterIds)
  const isPersistedResult = runtimeState === "persisted"

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-border/80 bg-surface-panel px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {isPreviewResult ? "Preview example" : "Live batch"}
          </Badge>
          <Badge variant="secondary">
            {isPreviewResult ? "Example sort" : "Manual live candidate"}
          </Badge>
          {!isPreviewResult && liveRunSummary ? (
            <Badge variant="secondary">{liveRunSummary.metadata.responseModel}</Badge>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {isPreviewResult
            ? "This is example data for previewing the review flow."
            : liveRunSummary
              ? `Manual live candidate generated in ${liveRunSummary.metadata.durationMs} ms via ${liveRunSummary.metadata.providerLabel}. Applying it now writes the routed output into topic or inbox files.`
              : "This batch now holds a live candidate result in renderer memory. Review it here before applying it to the knowledge layer."}
        </p>
      </div>

      {!isPreviewResult && liveRunSummary ? (
        <Card className="overflow-hidden border-border/80 bg-surface-panel">
          <CardContent className="grid gap-3 p-4 md:grid-cols-4">
            <RunMetric
              label="Model"
              value={liveRunSummary.metadata.responseModel}
              hint={liveRunSummary.metadata.providerLabel}
            />
            <RunMetric
              label="Duration"
              value={`${liveRunSummary.metadata.durationMs} ms`}
              hint="Single manual run"
            />
            <RunMetric
              label="Tokens"
              value={formatTokenSummary(
                liveRunSummary.metadata.inputTokens,
                liveRunSummary.metadata.outputTokens,
              )}
              hint="Input + output"
            />
            <RunMetric
              label="Topic Refs"
              value={`${liveRunSummary.relevantTopicCount}`}
              hint="Top-N context"
            />
          </CardContent>
        </Card>
      ) : null}

      {runLiveReviewMutation.isPending && liveRunProgress ? (
        <LiveRunProgressCard progress={liveRunProgress} />
      ) : null}

      {submitResult ? (
        <Card className="overflow-hidden border-border/80 bg-surface-panel">
          <CardHeader className="border-b border-border/70">
            <CardTitle>Knowledge Write Completed</CardTitle>
            <CardDescription>{submitResult.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {formatBatchRuntimeStateLabel(submitResult.runtimeState)}
              </Badge>
              <Badge variant="secondary">
                {submitResult.persistedOutputs.length} output
                {submitResult.persistedOutputs.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {submitResult.persistedOutputs.map((output) => (
                <div
                  key={output.clusterId}
                  className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4"
                >
                  <p className="text-sm font-semibold">
                    {formatPersistedOutputTitle(output)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {formatPersistedOutputDetail(output)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                At A Glance
              </p>
              <div className="space-y-1">
                <CardTitle className="text-2xl">
                  {buildOutcomeHero(
                    payload.captures.length,
                    reviewDraft.clusters.length,
                    outcomeSummary,
                  )}
                </CardTitle>
                <CardDescription>
                  The first thing to check is where the batch landed. The rest of the
                  page explains why.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {isPreviewResult ? "Preview result" : "Live candidate"}
              </Badge>
              <Badge variant="secondary">{payload.captures.length} items</Badge>
              {editedClusterIds.length ? (
                <Badge variant="secondary">{editedClusterIds.length} edit(s)</Badge>
              ) : null}
              {!isPreviewResult ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => runLiveReviewMutation.mutate()}
                  disabled={runLiveReviewMutation.isPending || isPersistedResult}
                >
                  <RefreshCcw className={runLiveReviewMutation.isPending ? "animate-spin" : ""} />
                  {runLiveReviewMutation.isPending ? "Running" : "Rerun candidate"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                "archive_to_topic",
                "send_to_inbox",
                "discard",
              ] as const satisfies readonly BatchDecisionCluster["decision"][]
            ).map((decision) => (
              <DestinationSummaryTile
                key={decision}
                decision={decision}
                count={getDecisionCount(outcomeSummary, decision)}
                clusters={orderedClusters}
              />
            ))}
          </div>

          {visibleTags.length ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Category Tags
              </p>
              <div className="flex flex-wrap gap-2">
                {visibleTags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {reviewSignals.length ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                What Needs Attention
              </p>
              <div className="flex flex-wrap gap-2">
                {reviewSignals.map((signal) => (
                  <Badge key={signal} variant="secondary">
                    {signal}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardHeader className="border-b border-border/70">
          <CardTitle>Sorted Results</CardTitle>
          <CardDescription>
            Each card shows the final category, the tags, and the source items it was
            built from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {orderedClusters.map((cluster, index) => {
            const decisionMeta = getDecisionMeta(cluster.decision)
            const sourceCaptures = getClusterSourceCaptures(cluster, capturesById)
            const visibleSourceCaptures = sourceCaptures.slice(0, 3)
            const clusterTags = buildClusterCategoryTags(cluster, capturesById)

            return (
              <div
                key={cluster.clusterId}
                className={cn(
                  "rounded-[26px] border p-5",
                  decisionMeta.cardClass,
                )}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                          decisionMeta.badgeClass,
                        )}
                      >
                        <decisionMeta.icon className="size-3.5" />
                        {decisionMeta.label}
                      </span>
                      <Badge variant="secondary">Result {index + 1}</Badge>
                      <Badge variant="secondary">{describeClusterDestination(cluster)}</Badge>
                    </div>

                    <div className="space-y-2">
                      <p className="text-lg font-semibold">{cluster.title}</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {cluster.summary}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {clusterTags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>

                    <div className="grid gap-3 pt-1 xl:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4">
                        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                          Why It Landed Here
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {cluster.reason}
                        </p>
                        {cluster.missingContext.length ? (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Still needs: {cluster.missingContext.join(" ")}
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4">
                        <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                          Review Signals
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {buildClusterReviewSignals(cluster).map((signal) => (
                            <Badge key={signal} variant="secondary">
                              {signal}
                            </Badge>
                          ))}
                        </div>
                        {cluster.possibleTopics.length ? (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Other possible homes:{" "}
                            {cluster.possibleTopics
                              .slice(0, 2)
                              .map((topic) => topic.topicName)
                              .join(", ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "rounded-[20px] border px-4 py-4 xl:max-w-[280px]",
                      decisionMeta.panelClass,
                    )}
                  >
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      What AI Did
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {buildClusterProcessSteps(cluster).map((step) => (
                        <Badge key={step} variant="secondary">
                          {step}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      Built From
                    </p>
                    {sourceCaptures.length > visibleSourceCaptures.length ? (
                      <p className="text-xs text-muted-foreground">
                        + {sourceCaptures.length - visibleSourceCaptures.length} more item(s)
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    {visibleSourceCaptures.map((capture) => (
                      <div
                        key={capture.id}
                        className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {formatCaptureKindLabel(capture.contentKind)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {capture.sourceAppName ?? capture.source}
                          </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold">{capture.preview}</p>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                          {capture.rawText}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardHeader className="border-b border-border/70">
          <CardTitle>Each Item And Its Destination</CardTitle>
          <CardDescription>
            This is the fastest way to confirm where every captured item ended up.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 xl:grid-cols-2">
          {payload.captures.map((capture) => {
            const destinations = buildCaptureDestinations(capture.id, orderedClusters)

            return (
              <div
                key={capture.id}
                className="rounded-[22px] border border-border/80 bg-surface-elevated px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{capture.preview}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCaptureKindLabel(capture.contentKind)} ·{" "}
                      {capture.sourceAppName ?? capture.source} ·{" "}
                      {formatRelativeTimestamp(capture.capturedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    {destinations.length ? (
                      destinations.map((destination) => {
                        const decisionMeta = getDecisionMeta(destination.decision)
                        return (
                          <span
                            key={`${capture.id}_${destination.label}`}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                              decisionMeta.badgeClass,
                            )}
                          >
                            <decisionMeta.icon className="size-3.5" />
                            {destination.label}
                          </span>
                        )
                      })
                    ) : (
                      <Badge variant="secondary">Not grouped</Badge>
                    )}
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {capture.rawText}
                </p>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <details className="rounded-[24px] border border-border/80 bg-surface-panel p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold">
          More Options
        </summary>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Open this only if you want to tweak destinations, topic names, or view system
          details.
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-[20px] border border-border/80 bg-surface-elevated p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {formatBatchRuntimeStateLabel(runtimeState)}
              </Badge>
              <Badge variant="secondary">{payload.batch.id}</Badge>
              <Badge variant="secondary">
                {isPreviewResult ? "Preview example" : "Live batch + live candidate"}
              </Badge>
              {!isPreviewResult && liveRunSummary ? (
                <Badge variant="secondary">
                  {formatTokenSummary(
                    liveRunSummary.metadata.inputTokens,
                    liveRunSummary.metadata.outputTokens,
                  )}
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Need provider or model changes?{" "}
              <Link
                to="/settings"
                className="font-medium text-foreground underline decoration-border underline-offset-4"
              >
                Open settings
              </Link>
              <ArrowUpRight className="ml-1 inline size-3.5" />
            </p>
          </div>

          {reviewDraft.clusters.map((cluster) => (
            <div
              key={cluster.clusterId}
              className="rounded-[20px] border border-border/80 bg-surface-elevated p-4"
            >
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">{cluster.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cluster.reason}
                  </p>
                </div>

                <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      Decision
                    </label>
                    <Select
                      value={cluster.decision}
                      onValueChange={(value) =>
                        changeClusterDecision(
                          cluster.clusterId,
                          value as typeof cluster.decision,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="archive_to_topic">Archive to topic</SelectItem>
                        <SelectItem value="send_to_inbox">Send to inbox</SelectItem>
                        <SelectItem value="discard">Discard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      Topic Name
                    </label>
                    <Input
                      value={cluster.topicNameSuggestion ?? ""}
                      disabled={cluster.decision !== "archive_to_topic"}
                      onChange={(event) =>
                        changeClusterTopicName(cluster.clusterId, event.target.value)
                      }
                      placeholder="Topic name"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Submit As
              </label>
              <Select
                value={submitAction}
                onValueChange={(value) => setSubmitAction(value as ReviewAction)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accept_all">Accept all</SelectItem>
                  <SelectItem value="accept_with_edits">Accept with edits</SelectItem>
                  <SelectItem value="reroute_to_inbox">Reroute to inbox</SelectItem>
                  <SelectItem value="reroute_topic">Reroute topic</SelectItem>
                  <SelectItem value="discard">Discard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Extra Note
              </label>
              <Textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Optional note about what you changed."
                className="min-h-[110px]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Edited suggestions: {editedClusterIds.length}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                submitReviewMutation.mutate({
                  actionOverride: submitAction,
                })
              }
              disabled={submitReviewMutation.isPending || isPersistedResult}
            >
              Apply Detailed Review
            </Button>
          </div>
        </div>
      </details>

      <FloatingFeedbackCard
        open={feedbackOpen}
        onOpenChange={(open) => {
          setFeedbackOpen(open)
          if (!open && feedbackStatus?.tone === "error") {
            setFeedbackStatus(null)
          }
        }}
        collapsedLabel="Feedback"
        eyebrow="Quick Feedback"
        title="Did this sorting help?"
        description="Pick one quick signal, or open details if you want to explain the rough spots."
        badges={[
          `${payload.captures.length} items`,
          `${reviewDraft.clusters.length} results`,
          isMockAiBatchId(payload.batch.id) ? "Preview result" : "Live batch",
        ]}
        detailMode="toggle"
        detailToggleLabel="Add details"
        options={valueFeedbackOptions}
        selectedValue={valueFeedback}
        onSelect={(value) => {
          setValueFeedback(value as ValueFeedback)
          setFeedbackStatus(null)
        }}
        onQuickSelect={(value) => submitQuickFeedback(value as ValueFeedback)}
        reasonLabel="What stood out?"
        reasons={feedbackReasonOptions.map((reason) => ({
          value: reason,
          label: reason,
        }))}
        selectedReasons={feedbackReasons}
        onToggleReason={(reason) =>
          setFeedbackReasons((current) =>
            current.includes(reason)
              ? current.filter((item) => item !== reason)
              : [...current, reason],
          )
        }
        primaryActionLabel={editedClusterIds.length ? "Apply Edited Result" : "Apply This Result"}
        onPrimaryAction={() =>
          submitReviewMutation.mutate({
            actionOverride: quickConfirmAction,
          })
        }
        primaryPending={submitReviewMutation.isPending}
        primaryDisabled={!valueFeedback || isPersistedResult}
        secondaryActionLabel="Close"
        footerNote={
          isPersistedResult
            ? "This batch has already been persisted. Refresh or choose another batch if you want a new pass."
            : valueFeedback
            ? "This applies the current result and writes the routed output into topic or inbox files."
            : "Choose one rating first. Detailed reasons are optional."
        }
        status={feedbackStatus}
      />
    </div>
  )
}

function RunMetric({
  hint,
  label,
  value,
}: {
  hint: string
  label: string
  value: string
}) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  )
}

function LiveRunProgressCard({
  progress,
}: {
  progress: {
    eventCount: number
    firstReasoningLatencyMs: number | null
    firstTextLatencyMs: number | null
    lastEventType: string | null
    phase: "starting" | "streaming" | "fallback"
    receivedChars: number
    reasoningChars: number
    reasoningText: string
    text: string
  }
}) {
  const thinkingText = progress.reasoningText.trim()
  const previewText = progress.text.trim()
  const hasThinkingTrace = progress.reasoningChars > 0 || thinkingText.length > 0
  const statusCopy =
    progress.phase === "starting"
      ? "Request sent. Waiting for provider activity."
      : progress.phase === "streaming"
        ? progress.receivedChars > 0
          ? hasThinkingTrace
            ? "Provider is exposing its thinking trace and streaming the final JSON."
            : "Provider is streaming a JSON response."
          : hasThinkingTrace
            ? "Provider is still thinking before the final JSON arrives."
            : "Provider is connected and still thinking. Some providers stay silent until the final JSON arrives."
        : "Streaming path failed after retries. Retrying once with the sync fallback."

  return (
    <Card className="overflow-hidden border-border/80 bg-surface-panel">
      <CardHeader className="border-b border-border/70">
        <CardTitle>Live Run Status</CardTitle>
        <CardDescription>{statusCopy}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{formatLiveRunPhaseLabel(progress.phase)}</Badge>
          <Badge variant="secondary">{progress.eventCount} events</Badge>
          {progress.reasoningChars > 0 ? (
            <Badge variant="secondary">{progress.reasoningChars} thinking chars</Badge>
          ) : null}
          <Badge variant="secondary">{progress.receivedChars} chars</Badge>
          {progress.firstReasoningLatencyMs !== null ? (
            <Badge variant="secondary">Thinking {progress.firstReasoningLatencyMs} ms</Badge>
          ) : null}
          {progress.firstTextLatencyMs !== null ? (
            <Badge variant="secondary">First token {progress.firstTextLatencyMs} ms</Badge>
          ) : null}
          {progress.lastEventType ? (
            <Badge variant="secondary">{progress.lastEventType}</Badge>
          ) : null}
        </div>

        {hasThinkingTrace ? (
          <div className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Thinking Trace
            </p>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-muted-foreground">
              {thinkingText || "No thinking text received yet."}
            </pre>
          </div>
        ) : null}

        <div className="rounded-[20px] border border-border/70 bg-background/85 px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Output Preview
          </p>
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-muted-foreground">
            {previewText || "No final text received yet."}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}

function formatLiveRunPhaseLabel(phase: "starting" | "streaming" | "fallback") {
  if (phase === "starting") {
    return "Waiting"
  }

  if (phase === "streaming") {
    return "Streaming"
  }

  return "Fallback"
}

function formatTokenSummary(inputTokens: number | undefined, outputTokens: number | undefined) {
  if (inputTokens === undefined && outputTokens === undefined) {
    return "Tokens unavailable"
  }

  const input = inputTokens ?? 0
  const output = outputTokens ?? 0
  return `${input} in / ${output} out`
}

function formatPersistedOutputTitle(
  output: ApplyBatchDecisionResult["persistedOutputs"][number],
) {
  switch (output.destination) {
    case "topic":
      return output.topicName ?? output.topicSlug ?? "Topic write"
    case "inbox":
      return "Inbox write"
    case "discard":
      return "Discarded"
  }
}

function formatPersistedOutputDetail(
  output: ApplyBatchDecisionResult["persistedOutputs"][number],
) {
  switch (output.destination) {
    case "topic":
      return output.filePath
        ? `${output.filePath} · cluster ${output.clusterId}`
        : `cluster ${output.clusterId}`
    case "inbox":
      return output.filePath
        ? `${output.filePath} · cluster ${output.clusterId}`
        : `cluster ${output.clusterId}`
    case "discard":
      return `No file write · cluster ${output.clusterId}`
  }
}

function buildAiOrganizerWorkspaceViewState(
  payload: AiBatchPayload,
  reviewDraft: BatchDecisionReview,
  editedClusterIds: string[],
) {
  const capturesById = new Map(payload.captures.map((capture) => [capture.id, capture]))
  const orderedClusters = sortClustersForDisplay(reviewDraft.clusters)

  return {
    capturesById,
    isPreviewResult: isMockAiBatchId(payload.batch.id),
    orderedClusters,
    outcomeSummary: summarizeReview(reviewDraft.clusters),
    quickConfirmAction: editedClusterIds.length > 0 ? "accept_with_edits" : "accept_all",
    reviewSignals: buildReviewSignalSummary(orderedClusters),
    visibleTags: buildBatchCategoryTags(orderedClusters, capturesById),
  } satisfies {
    capturesById: Map<string, AiBatchPayload["captures"][number]>
    isPreviewResult: boolean
    orderedClusters: BatchDecisionCluster[]
    outcomeSummary: ReturnType<typeof summarizeReview>
    quickConfirmAction: ReviewAction
    reviewSignals: string[]
    visibleTags: string[]
  }
}

function DestinationSummaryTile({
  decision,
  count,
  clusters,
}: {
  decision: BatchDecisionCluster["decision"]
  count: number
  clusters: BatchDecisionCluster[]
}) {
  const decisionMeta = getDecisionMeta(decision)

  return (
    <div className={cn("rounded-[24px] border px-4 py-4", decisionMeta.cardClass)}>
      <div className="flex items-start gap-3">
        <div className="app-icon-chip">
          <decisionMeta.icon className="size-4" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {decisionMeta.tileLabel}
          </p>
          <p className="text-2xl font-semibold tracking-tight">{count}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {buildDecisionTileDescription(decision, count, clusters)}
          </p>
        </div>
      </div>
    </div>
  )
}

function summarizeReview(clusters: BatchDecisionCluster[]) {
  return clusters.reduce(
    (summary, cluster) => {
      if (cluster.decision === "archive_to_topic") {
        summary.archive += 1
      } else if (cluster.decision === "send_to_inbox") {
        summary.inbox += 1
      } else if (cluster.decision === "discard") {
        summary.discard += 1
      }

      return summary
    },
    {
      archive: 0,
      inbox: 0,
      discard: 0,
    },
  )
}

function buildReviewSignalSummary(clusters: BatchDecisionCluster[]) {
  const lowConfidenceCount = clusters.filter((cluster) => cluster.confidence < 0.65).length
  const missingContextCount = clusters.filter((cluster) => cluster.missingContext.length > 0).length
  const inboxCount = clusters.filter((cluster) => cluster.decision === "send_to_inbox").length
  const summary = []

  if (lowConfidenceCount) {
    summary.push(
      `${lowConfidenceCount} result${lowConfidenceCount === 1 ? "" : "s"} need a close look`,
    )
  }

  if (missingContextCount) {
    summary.push(
      `${missingContextCount} result${missingContextCount === 1 ? "" : "s"} still need context`,
    )
  }

  if (inboxCount) {
    summary.push(`${inboxCount} result${inboxCount === 1 ? "" : "s"} stayed in Inbox`)
  }

  if (!summary.length) {
    summary.push("Most results look stable enough for a quick confirmation")
  }

  return summary
}

function buildClusterReviewSignals(cluster: BatchDecisionCluster) {
  const signals = [describeClusterConfidence(cluster.confidence)]

  if (cluster.missingContext.length) {
    signals.push("Needs more context")
  }

  if (cluster.decision === "send_to_inbox") {
    signals.push("Held for your review")
  }

  if (cluster.decision === "discard") {
    signals.push("Skipped this pass")
  }

  if (cluster.possibleTopics.length > 1) {
    signals.push("Had alternate homes")
  }

  return signals
}

function describeClusterConfidence(confidence: number) {
  if (confidence >= 0.8) {
    return "Looks solid"
  }

  if (confidence >= 0.65) {
    return "Worth a quick check"
  }

  return "Needs your call"
}

function describeClusterDestination(cluster: BatchDecisionCluster) {
  switch (cluster.decision) {
    case "archive_to_topic":
      return cluster.topicNameSuggestion?.trim() || "New topic"
    case "send_to_inbox":
      return "Inbox"
    case "discard":
      return "Discarded"
  }

  return "Unassigned"
}

function formatBatchPrimaryLabel(captureCount: number) {
  return `${captureCount} item${captureCount === 1 ? "" : "s"} ready to sort`
}

function formatTriggerReasonLabel(triggerReason: string) {
  switch (triggerReason) {
    case "capture_count":
      return "Started after enough items arrived"
    case "max_wait":
      return "Started after waiting a while"
    default:
      return triggerReason.replace(/_/g, " ")
  }
}

function formatBatchWindowLabel(firstCapturedAt: string, lastCapturedAt: string) {
  if (firstCapturedAt === lastCapturedAt) {
    return `captured ${formatRelativeTimestamp(lastCapturedAt)}`
  }

  return `${formatRelativeTimestamp(firstCapturedAt)} to ${formatRelativeTimestamp(lastCapturedAt)}`
}

function formatCaptureKindLabel(contentKind: string) {
  switch (contentKind) {
    case "plain_text":
      return "Text"
    case "rich_text":
      return "Rich text"
    case "link":
      return "Link"
    case "image":
      return "Image"
    default:
      return contentKind.replace(/_/g, " ")
  }
}

function buildOutcomeHero(
  captureCount: number,
  resultCount: number,
  summary: ReturnType<typeof summarizeReview>,
) {
  if (!resultCount) {
    return `${captureCount} item${captureCount === 1 ? "" : "s"} came in, but nothing was sorted yet`
  }

  const strongestDestination = [
    summary.archive ? `${summary.archive} moved to topic${summary.archive === 1 ? "" : "s"}` : "",
    summary.inbox ? `${summary.inbox} kept in inbox` : "",
    summary.discard ? `${summary.discard} skipped` : "",
  ].filter(Boolean)

  return `${captureCount} item${captureCount === 1 ? "" : "s"} became ${resultCount} result card${
    resultCount === 1 ? "" : "s"
  }${strongestDestination.length ? `, with ${strongestDestination.join(" / ")}` : ""}`
}

function getDecisionMeta(decision: BatchDecisionCluster["decision"]) {
  switch (decision) {
    case "archive_to_topic":
      return {
        icon: FolderTree,
        label: "Topic",
        tileLabel: "To Topics",
        badgeClass:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        cardClass: "border-emerald-500/20 bg-emerald-500/6",
        panelClass: "border-emerald-500/20 bg-background/85",
      }
    case "send_to_inbox":
      return {
        icon: Inbox,
        label: "Inbox",
        tileLabel: "Kept In Inbox",
        badgeClass:
          "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        cardClass: "border-sky-500/20 bg-sky-500/6",
        panelClass: "border-sky-500/20 bg-background/85",
      }
    case "discard":
      return {
        icon: Trash2,
        label: "Skipped",
        tileLabel: "Skipped",
        badgeClass:
          "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
        cardClass: "border-zinc-500/20 bg-zinc-500/6",
        panelClass: "border-zinc-500/20 bg-background/85",
      }
  }

  return {
    icon: FolderTree,
    label: "Topic",
    tileLabel: "To Topics",
    badgeClass:
      "border-border/80 bg-background/80 text-foreground",
    cardClass: "border-border/80 bg-surface-elevated",
    panelClass: "border-border/80 bg-background/85",
  }
}

function getDecisionCount(
  summary: ReturnType<typeof summarizeReview>,
  decision: BatchDecisionCluster["decision"],
) {
  switch (decision) {
    case "archive_to_topic":
      return summary.archive
    case "send_to_inbox":
      return summary.inbox
    case "discard":
      return summary.discard
  }

  return 0
}

function buildDecisionTileDescription(
  decision: BatchDecisionCluster["decision"],
  count: number,
  clusters: BatchDecisionCluster[],
) {
  if (!count) {
    switch (decision) {
      case "archive_to_topic":
        return "Nothing was filed under a topic in this batch."
      case "send_to_inbox":
        return "Nothing was held for later review."
      case "discard":
        return "Nothing was skipped in this batch."
    }
  }

  const matchingClusters = clusters.filter((cluster) => cluster.decision === decision)

  switch (decision) {
    case "archive_to_topic": {
      const topicNames = matchingClusters
        .map((cluster) => cluster.topicNameSuggestion?.trim())
        .filter((value): value is string => Boolean(value))
        .slice(0, 2)

      return topicNames.length
        ? `Main categories: ${topicNames.join(" / ")}`
        : `${count} result${count === 1 ? "" : "s"} looked ready for long-term topics.`
    }
    case "send_to_inbox":
      return `${count} result${count === 1 ? "" : "s"} still need a second look before filing.`
    case "discard":
      return `${count} result${count === 1 ? "" : "s"} were treated as low-value for storage.`
  }

  return ""
}

function sortClustersForDisplay(clusters: BatchDecisionCluster[]) {
  const order: Record<BatchDecisionCluster["decision"], number> = {
    archive_to_topic: 0,
    send_to_inbox: 1,
    discard: 2,
  }

  return [...clusters].sort((left, right) => {
    if (order[left.decision] !== order[right.decision]) {
      return order[left.decision] - order[right.decision]
    }

    if (right.sourceIds.length !== left.sourceIds.length) {
      return right.sourceIds.length - left.sourceIds.length
    }

    return left.title.localeCompare(right.title)
  })
}

function getClusterSourceCaptures(
  cluster: BatchDecisionCluster,
  capturesById: Map<string, AiBatchPayload["captures"][number]>,
) {
  return cluster.sourceIds
    .map((sourceId) => capturesById.get(sourceId) ?? null)
    .filter((capture): capture is AiBatchPayload["captures"][number] => Boolean(capture))
}

function buildClusterCategoryTags(
  cluster: BatchDecisionCluster,
  capturesById: Map<string, AiBatchPayload["captures"][number]>,
) {
  const tags = new Set<string>()

  if (cluster.decision === "archive_to_topic" && cluster.topicNameSuggestion?.trim()) {
    tags.add(cluster.topicNameSuggestion.trim())
  }

  if (cluster.decision === "send_to_inbox") {
    tags.add("Needs review")
  }

  if (cluster.decision === "discard") {
    tags.add("Low value")
  }

  getClusterSourceCaptures(cluster, capturesById).forEach((capture) => {
    tags.add(formatCaptureKindLabel(capture.contentKind))
  })

  return [...tags].slice(0, 4)
}

function buildBatchCategoryTags(
  clusters: BatchDecisionCluster[],
  capturesById: Map<string, AiBatchPayload["captures"][number]>,
) {
  const tags = new Set<string>()

  clusters.forEach((cluster) => {
    buildClusterCategoryTags(cluster, capturesById).forEach((tag) => tags.add(tag))
  })

  return [...tags].slice(0, 8)
}

function buildCaptureDestinations(
  captureId: string,
  clusters: BatchDecisionCluster[],
) {
  const destinations = new Map<string, { decision: BatchDecisionCluster["decision"]; label: string }>()

  clusters.forEach((cluster) => {
    if (!cluster.sourceIds.includes(captureId)) {
      return
    }

    const label =
      cluster.decision === "archive_to_topic"
        ? describeClusterDestination(cluster)
        : getDecisionMeta(cluster.decision).label

    destinations.set(`${cluster.decision}:${label}`, {
      decision: cluster.decision,
      label,
    })
  })

  return [...destinations.values()]
}

function buildClusterProcessSteps(cluster: BatchDecisionCluster) {
  const steps = [
    `Grouped ${cluster.sourceIds.length} item${cluster.sourceIds.length === 1 ? "" : "s"}`,
    "Created one short summary",
  ]

  switch (cluster.decision) {
    case "archive_to_topic":
      steps.push(`Filed under ${describeClusterDestination(cluster)}`)
      break
    case "send_to_inbox":
      steps.push("Held it in Inbox")
      break
    case "discard":
      steps.push("Marked it as skip")
      break
  }

  return steps
}
