import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
  type FloatingFeedbackStatus,
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
import { buildMockBatchReview } from "@/features/ai/lib/mock-review"
import { isMockAiBatchId } from "@/features/ai/lib/mock-fixtures"
import {
  formatBatchRuntimeStateLabel,
  transitionBatchRuntimeState,
} from "@/features/ai/runtime/batch-state-machine"
import { createRendererLogger } from "@/lib/logger"
import {
  applyBatchDecision,
  getAiBatchPayload,
  getReadyAiBatches,
} from "@/lib/tauri"
import { formatRelativeTimestamp } from "@/lib/time"
import type {
  AiBatchPayload,
  AiBatchRuntimeState,
  BatchDecisionCluster,
  BatchDecisionReview,
  ReviewAction,
} from "@/types/shell"
import { cn } from "@/lib/utils"

const logger = createRendererLogger("agent.review")

type InitialReviewState = {
  reviewDraft: BatchDecisionReview | null
  runtimeState: AiBatchRuntimeState
  submitAction: ReviewAction
  reviewNote: string
  editedClusterIds: string[]
}

type ValueFeedback = "helpful" | "mixed" | "not_worth_it"

type SubmitReviewInput = {
  actionOverride?: ReviewAction
  valueFeedbackOverride?: ValueFeedback | null
  feedbackReasonsOverride?: string[]
}

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
  const queryClient = useQueryClient()
  const initialState = buildInitialReviewState(payload)
  const [reviewDraft, setReviewDraft] = useState(initialState.reviewDraft)
  const [runtimeState, setRuntimeState] = useState(initialState.runtimeState)
  const [submitAction, setSubmitAction] = useState(initialState.submitAction)
  const [reviewNote, setReviewNote] = useState(initialState.reviewNote)
  const [editedClusterIds, setEditedClusterIds] = useState(initialState.editedClusterIds)
  const [valueFeedback, setValueFeedback] = useState<ValueFeedback | null>(null)
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([])
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState<FloatingFeedbackStatus | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const timer = window.setTimeout(() => {
      setFeedbackOpen(true)
    }, 1200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (feedbackStatus?.tone !== "success" || typeof window === "undefined") {
      return
    }

    const timer = window.setTimeout(() => {
      setFeedbackOpen(false)
      setFeedbackStatus(null)
    }, 1600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [feedbackStatus])

  const submitReviewMutation = useMutation({
    mutationFn: async (input?: SubmitReviewInput) => {
      if (!reviewDraft) {
        throw new Error("No review draft available")
      }

      const finalAction = input?.actionOverride ?? submitAction
      const nextValueFeedback =
        input && "valueFeedbackOverride" in input
          ? input.valueFeedbackOverride ?? null
          : valueFeedback
      const nextFeedbackReasons =
        input?.feedbackReasonsOverride ?? feedbackReasons
      const nextRuntimeState = resolveSubmittedReviewState(runtimeState)
      const nextReview = {
        ...reviewDraft,
        runtimeState: nextRuntimeState,
      }

      const request = {
        batchId: nextReview.batchId,
        review: nextReview,
        feedback: {
          batchId: nextReview.batchId,
          reviewId: nextReview.reviewId,
          action: finalAction,
          editedClusterIds,
          note: buildFeedbackNote(reviewNote, nextValueFeedback, nextFeedbackReasons),
          submittedAt: new Date().toISOString(),
        },
      }

      const result = await applyBatchDecision(request)
      return {
        finalAction,
        nextRuntimeState,
        nextReview,
        submittedValueFeedback: nextValueFeedback,
        result,
      }
    },
    onSuccess: ({
      finalAction,
      nextRuntimeState,
      nextReview,
      submittedValueFeedback,
      result,
    }) => {
      setRuntimeState(nextRuntimeState)
      setReviewDraft(nextReview)
      setFeedbackStatus(buildFeedbackSuccessStatus(submittedValueFeedback))
      logger.info("Submitted AI review", {
        batchId: nextReview.batchId,
        action: finalAction,
        mocked: result.mocked,
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiBatchSummaries() })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.aiBatchPayload(nextReview.batchId),
      })
    },
    onError: (error) => {
      setFeedbackOpen(true)
      setFeedbackStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to submit feedback.",
        sentiment: "negative",
      })
      logger.error("Failed to submit AI review", error)
    },
  })

  if (!reviewDraft) {
    return (
      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardContent className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm leading-7 text-muted-foreground">
          The preview result could not be built for this batch.
        </CardContent>
      </Card>
    )
  }

  const capturesById = new Map(payload.captures.map((capture) => [capture.id, capture]))
  const outcomeSummary = summarizeReview(reviewDraft.clusters)
  const orderedClusters = sortClustersForDisplay(reviewDraft.clusters)
  const visibleTags = buildBatchCategoryTags(orderedClusters, capturesById)
  const quickConfirmAction: ReviewAction =
    editedClusterIds.length > 0 ? "accept_with_edits" : "accept_all"
  const isPreviewResult = isMockAiBatchId(payload.batch.id)
  const reviewSignals = buildReviewSignalSummary(orderedClusters)

  function submitQuickFeedback(nextValue: ValueFeedback) {
    setValueFeedback(nextValue)
    setFeedbackStatus(null)
    void submitReviewMutation.mutateAsync({
      actionOverride: quickConfirmAction,
      valueFeedbackOverride: nextValue,
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-border/80 bg-surface-panel px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {isPreviewResult ? "Preview example" : "Live batch"}
          </Badge>
          <Badge variant="secondary">
            {isPreviewResult ? "Example sort" : "Trial sorting pass"}
          </Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {isPreviewResult
            ? "This is example data for previewing the review flow."
            : "You are reviewing a live batch with the current trial sorting pass. Saving your review is real, but Tino still will not write topic pages until the next phase is connected."}
        </p>
      </div>

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
                {isPreviewResult ? "Preview result" : "Live batch"}
              </Badge>
              <Badge variant="secondary">{payload.captures.length} items</Badge>
              {editedClusterIds.length ? (
                <Badge variant="secondary">{editedClusterIds.length} edit(s)</Badge>
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
                {isPreviewResult ? "Preview example" : "Live batch + trial sort"}
              </Badge>
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
                      onValueChange={(value) => {
                        setReviewDraft((current) =>
                          updateCluster(current, cluster.clusterId, (draft) => {
                            draft.decision = value as typeof draft.decision
                          }),
                        )
                        markClusterEdited(cluster.clusterId, setEditedClusterIds)
                      }}
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
                      onChange={(event) => {
                        const nextTopicName = event.target.value
                        setReviewDraft((current) =>
                          updateCluster(current, cluster.clusterId, (draft) => {
                            draft.topicNameSuggestion = nextTopicName || null
                            draft.topicSlugSuggestion = nextTopicName
                              ? slugify(nextTopicName)
                              : null
                          }),
                        )
                        markClusterEdited(cluster.clusterId, setEditedClusterIds)
                      }}
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
                void submitReviewMutation.mutateAsync({
                  actionOverride: submitAction,
                })
              }
              disabled={submitReviewMutation.isPending}
            >
              Submit Detailed Review
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
        primaryActionLabel={editedClusterIds.length ? "Keep Edited Result" : "Keep This Result"}
        onPrimaryAction={() =>
          void submitReviewMutation.mutateAsync({
            actionOverride: quickConfirmAction,
          })
        }
        primaryPending={submitReviewMutation.isPending}
        primaryDisabled={!valueFeedback}
        secondaryActionLabel="Close"
        footerNote={
          valueFeedback
            ? "This submits review feedback only. File writes still stay disabled in this phase."
            : "Choose one rating first. Detailed reasons are optional."
        }
        status={feedbackStatus}
      />
    </div>
  )
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

function buildFeedbackNote(
  reviewNote: string,
  valueFeedback: ValueFeedback | null,
  feedbackReasons: string[],
) {
  const parts = [
    reviewNote.trim(),
    valueFeedback ? `value=${valueFeedback}` : "",
    feedbackReasons.length ? `reasons=${feedbackReasons.join(", ")}` : "",
  ].filter(Boolean)

  return parts.length ? parts.join(" | ") : null
}

function buildFeedbackSuccessStatus(
  valueFeedback: ValueFeedback | null,
): FloatingFeedbackStatus {
  switch (valueFeedback) {
    case "helpful":
      return {
        tone: "success",
        sentiment: "positive",
        title: "Useful signal captured",
        message: "This pass earned its keep. We will reinforce the parts that saved you time.",
      }
    case "mixed":
      return {
        tone: "success",
        sentiment: "neutral",
        title: "Mixed signal captured",
        message: "That nuance helps. We will tune the parts that worked, but still felt rough.",
      }
    case "not_worth_it":
      return {
        tone: "success",
        sentiment: "negative",
        title: "Thanks for the honesty",
        message: "That miss is useful too. We will use it to sharpen the next sorting pass.",
      }
    default:
      return {
        tone: "success",
        sentiment: "positive",
        title: "Feedback captured",
        message: "Your input is in. We will use it to improve the next run.",
      }
  }
}

function resolveSubmittedReviewState(currentState: AiBatchRuntimeState) {
  if (currentState === "reviewed") {
    return currentState
  }

  return transitionBatchRuntimeState(currentState, "submit_review")
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

function buildInitialReviewState(payload: AiBatchPayload): InitialReviewState {
  try {
    const reviewDraft = buildMockBatchReview(payload)
    const reviewState =
      payload.batch.runtimeState === "ready" ? "review_pending" : payload.batch.runtimeState

    return {
      reviewDraft: {
        ...reviewDraft,
        runtimeState: reviewState,
      },
      runtimeState: reviewState,
      submitAction: "accept_with_edits",
      reviewNote: "",
      editedClusterIds: [],
    }
  } catch (error) {
    logger.error("Failed to prepare mock AI review session", error)
    return {
      reviewDraft: null,
      runtimeState: "schema_failed",
      submitAction: "accept_with_edits",
      reviewNote: "",
      editedClusterIds: [],
    }
  }
}

function updateCluster(
  reviewDraft: BatchDecisionReview | null,
  clusterId: string,
  update: (cluster: BatchDecisionReview["clusters"][number]) => void,
) {
  if (!reviewDraft) {
    return reviewDraft
  }

  return {
    ...reviewDraft,
    clusters: reviewDraft.clusters.map((cluster) => {
      if (cluster.clusterId !== clusterId) {
        return cluster
      }

      const nextCluster = { ...cluster }
      update(nextCluster)
      return nextCluster
    }),
  }
}

function markClusterEdited(
  clusterId: string,
  setEditedClusterIds: Dispatch<SetStateAction<string[]>>,
) {
  setEditedClusterIds((current) =>
    current.includes(clusterId) ? current : [...current, clusterId],
  )
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
