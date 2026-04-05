import { useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Link } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FolderTree,
  Inbox,
  Layers3,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react"

import { queryKeys } from "@/app/query-keys"
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
  ApplyBatchDecisionResult,
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
  submissionResult: ApplyBatchDecisionResult | null
}

type ValueFeedback = "helpful" | "mixed" | "not_worth_it"

const valueFeedbackOptions = [
  {
    value: "helpful",
    label: "Helpful",
    description: "The result was worth the run.",
  },
  {
    value: "mixed",
    label: "Mixed",
    description: "Some parts helped, some did not.",
  },
  {
    value: "not_worth_it",
    label: "Not Worth It",
    description: "The result did not justify the effort.",
  },
] as const satisfies readonly {
  value: ValueFeedback
  label: string
  description: string
}[]

const feedbackReasonOptions = [
  "Wrong destination",
  "Summary too vague",
  "Too much manual fixing",
  "Useful summary",
  "Saved time",
  "Need more context",
] as const

const resultColumns = [
  {
    decision: "archive_to_topic",
    label: "Sorted To Topics",
    description: "These notes look ready to live under a topic.",
    emptyLabel: "Nothing was sent to a topic in this batch.",
  },
  {
    decision: "send_to_inbox",
    label: "Kept In Inbox",
    description: "These items need a second look before they are filed.",
    emptyLabel: "Nothing stayed in the inbox this time.",
  },
  {
    decision: "discard",
    label: "Skipped",
    description: "These items were treated as low-value for long-term storage.",
    emptyLabel: "Nothing was skipped in this batch.",
  },
] as const satisfies readonly {
  decision: BatchDecisionCluster["decision"]
  label: string
  description: string
  emptyLabel: string
}[]

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
                  Pick a batch, see where it goes, then decide if it helped.
                </h2>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  This screen stays focused on three things: what entered the analysis,
                  how the AI grouped it, and where each result would land.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Need model access later?{" "}
                <Link
                  to="/settings"
                  className="font-medium text-foreground underline decoration-border underline-offset-4"
                >
                  Open provider settings
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-border/80 bg-surface-panel">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Batches Waiting</CardTitle>
                  <CardDescription>
                    Pick one batch. The page will show exactly what the AI did with it.
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
                  No ready batches yet. Mock preview data will appear here until the
                  real queue fills up.
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
  const initialState = buildInitialReviewState(payload)
  const [reviewDraft, setReviewDraft] = useState(initialState.reviewDraft)
  const [runtimeState, setRuntimeState] = useState(initialState.runtimeState)
  const [submitAction, setSubmitAction] = useState(initialState.submitAction)
  const [reviewNote, setReviewNote] = useState(initialState.reviewNote)
  const [editedClusterIds, setEditedClusterIds] = useState(initialState.editedClusterIds)
  const [submissionResult, setSubmissionResult] = useState(initialState.submissionResult)
  const [focusedClusterId, setFocusedClusterId] = useState(
    initialState.reviewDraft?.clusters[0]?.clusterId ?? null,
  )
  const [valueFeedback, setValueFeedback] = useState<ValueFeedback | null>(null)
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([])

  const submitReviewMutation = useMutation({
    mutationFn: async (actionOverride?: ReviewAction) => {
      if (!reviewDraft) {
        throw new Error("No review draft available")
      }

      const finalAction = actionOverride ?? submitAction
      const nextRuntimeState = transitionBatchRuntimeState(runtimeState, "submit_review")
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
          note: buildFeedbackNote(reviewNote, valueFeedback, feedbackReasons),
          submittedAt: new Date().toISOString(),
        },
      }

      const result = await applyBatchDecision(request)
      return {
        finalAction,
        nextRuntimeState,
        nextReview,
        result,
      }
    },
    onSuccess: ({ finalAction, nextRuntimeState, nextReview, result }) => {
      setRuntimeState(nextRuntimeState)
      setReviewDraft(nextReview)
      setSubmissionResult(result)
      logger.info("Submitted AI review", {
        batchId: nextReview.batchId,
        action: finalAction,
        mocked: result.mocked,
      })
    },
    onError: (error) => {
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

  const outcomeSummary = summarizeReview(reviewDraft.clusters)
  const focusedCluster =
    reviewDraft.clusters.find((cluster) => cluster.clusterId === focusedClusterId) ??
    reviewDraft.clusters[0]
  const focusedSourceIds = new Set(focusedCluster?.sourceIds ?? [])
  const sortedCaptures = [...payload.captures].sort((left, right) => {
    const leftIncluded = focusedSourceIds.has(left.id)
    const rightIncluded = focusedSourceIds.has(right.id)

    if (leftIncluded === rightIncluded) {
      return right.capturedAt.localeCompare(left.capturedAt)
    }

    return leftIncluded ? -1 : 1
  })
  const quickConfirmAction: ReviewAction =
    editedClusterIds.length > 0 ? "accept_with_edits" : "accept_all"

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/80 bg-surface-panel">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Current Batch
              </p>
              <div className="space-y-1">
                <CardTitle className="text-2xl">
                  {payload.captures.length} items became {reviewDraft.clusters.length} sorted
                  results
                </CardTitle>
                <CardDescription>
                  Click any result below and the matching inputs will light up on the left.
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {isMockAiBatchId(payload.batch.id)
                  ? "Preview result"
                  : "Live batch"}
              </Badge>
              {editedClusterIds.length ? (
                <Badge variant="secondary">{editedClusterIds.length} edit(s)</Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
            <FlowStep
              icon={Layers3}
              title={`${payload.captures.length} items went in`}
              description="Everything in this batch entered the analysis."
            />
            <ArrowRight className="mx-auto hidden size-4 text-muted-foreground xl:block" />
            <FlowStep
              icon={Sparkles}
              title={`${reviewDraft.clusters.length} result card(s) came out`}
              description="Related notes were grouped together and summarized."
            />
            <ArrowRight className="mx-auto hidden size-4 text-muted-foreground xl:block" />
            <FlowStep
              icon={CheckCircle2}
              title={buildOutcomeHeadline(outcomeSummary)}
              description="That is where the content will go if you keep the result."
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)]">
        <Card className="overflow-hidden border-border/80 bg-surface-panel">
          <CardHeader className="border-b border-border/70">
            <CardTitle>What Went In</CardTitle>
            <CardDescription>
              All of these items entered the batch. The selected result is highlighted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {sortedCaptures.map((capture, index) => {
              const included = focusedSourceIds.has(capture.id)
              return (
                <div
                  key={capture.id}
                  className={cn(
                    "rounded-[22px] border px-4 py-4 transition",
                    included
                      ? "border-primary/65 bg-primary/8"
                      : "border-border/80 bg-surface-elevated",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-background/80 text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <p className="text-sm font-semibold">{capture.preview}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatCaptureKindLabel(capture.contentKind)} ·{" "}
                        {capture.sourceAppName ?? capture.source} ·{" "}
                        {formatRelativeTimestamp(capture.capturedAt)}
                      </p>
                    </div>
                    {included ? (
                      <Badge variant="secondary">In selected result</Badge>
                    ) : (
                      <Badge variant="secondary">Also analyzed</Badge>
                    )}
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {capture.rawText}
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden border-border/80 bg-surface-panel">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Where It Went</CardTitle>
              <CardDescription>
                Results are grouped by destination so the sorting is easy to scan.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 xl:grid-cols-3">
              {resultColumns.map((column) => {
                const columnClusters = reviewDraft.clusters.filter(
                  (cluster) => cluster.decision === column.decision,
                )
                const columnMeta = getDecisionMeta(column.decision)

                return (
                  <div
                    key={column.decision}
                    className="rounded-[24px] border border-border/80 bg-surface-elevated/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <columnMeta.icon className="size-4 text-foreground" />
                          <p className="text-sm font-semibold">{column.label}</p>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {column.description}
                        </p>
                      </div>
                      <Badge variant="secondary">{columnClusters.length}</Badge>
                    </div>

                    <div className="mt-4 space-y-3">
                      {columnClusters.length ? (
                        columnClusters.map((cluster) => (
                          <button
                            key={cluster.clusterId}
                            type="button"
                            onClick={() => setFocusedClusterId(cluster.clusterId)}
                            className={cn(
                              "w-full rounded-[22px] border px-4 py-4 text-left transition",
                              cluster.clusterId === focusedCluster?.clusterId
                                ? "border-primary/70 bg-primary/8"
                                : "border-border/80 bg-background/85 hover:border-primary/35",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-base font-semibold">{cluster.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {cluster.sourceIds.length} item(s) used
                                </p>
                              </div>
                              <Badge variant="secondary">
                                {describeClusterDestination(cluster)}
                              </Badge>
                            </div>

                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {cluster.summary}
                            </p>

                            <div className="mt-4 rounded-[18px] border border-border/70 bg-background/80 px-3 py-3">
                              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                                AI Actions
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {buildClusterProcessSteps(cluster).map((step) => (
                                  <Badge key={step} variant="secondary">
                                    {step}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-[20px] border border-dashed border-border/80 bg-background/70 px-4 py-5 text-sm leading-6 text-muted-foreground">
                          {column.emptyLabel}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/80 bg-surface-panel">
            <CardHeader className="border-b border-border/70">
              <CardTitle>Did This Help?</CardTitle>
              <CardDescription>
                One tap is enough. Extra feedback stays optional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap gap-2">
                {valueFeedbackOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={valueFeedback === option.value ? "default" : "outline"}
                    onClick={() =>
                      setValueFeedback((current) =>
                        current === option.value ? null : option.value,
                      )
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>

              {valueFeedback ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    Optional reason
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {feedbackReasonOptions.map((reason) => {
                      const selected = feedbackReasons.includes(reason)
                      return (
                        <Button
                          key={reason}
                          type="button"
                          size="sm"
                          variant={selected ? "secondary" : "outline"}
                          onClick={() =>
                            setFeedbackReasons((current) =>
                              current.includes(reason)
                                ? current.filter((item) => item !== reason)
                                : [...current, reason],
                            )
                          }
                        >
                          {reason}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-border/80 bg-background/80 px-4 py-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {editedClusterIds.length
                      ? "You changed the sort. Keep your version if it looks right."
                      : "If the sorting looks right, keep it and move on."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This step currently records the review and feedback only. It does
                    not write files yet.
                  </p>
                  {submissionResult ? (
                    <p className="text-xs text-muted-foreground">
                      {submissionResult.message}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  className="rounded-full"
                  onClick={() => void submitReviewMutation.mutateAsync(quickConfirmAction)}
                  disabled={submitReviewMutation.isPending}
                >
                  <Sparkles
                    className={submitReviewMutation.isPending ? "animate-pulse" : ""}
                  />
                  Keep This Sort
                </Button>
              </div>
            </CardContent>
          </Card>

          <details className="rounded-[24px] border border-border/80 bg-surface-panel p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold">
              More Options
            </summary>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open this only if you want to tweak destinations, topic names, or view
              system details.
            </p>

            <div className="mt-4 space-y-4">
              <div className="rounded-[20px] border border-border/80 bg-surface-elevated p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {formatBatchRuntimeStateLabel(runtimeState)}
                  </Badge>
                  <Badge variant="secondary">{payload.batch.id}</Badge>
                  <Badge variant="secondary">
                    {isMockAiBatchId(payload.batch.id)
                      ? "Mock result"
                      : "Real batch + mock result"}
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
                  onClick={() => void submitReviewMutation.mutateAsync(submitAction)}
                  disabled={submitReviewMutation.isPending}
                >
                  Submit Detailed Review
                </Button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}

function FlowStep({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof CheckCircle2
  title: string
  description: string
}) {
  return (
    <div className="rounded-[24px] border border-border/80 bg-surface-elevated px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="app-icon-chip">
          <Icon className="size-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
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

function describeClusterDestination(cluster: BatchDecisionCluster) {
  switch (cluster.decision) {
    case "archive_to_topic":
      return cluster.topicNameSuggestion?.trim() || "New topic"
    case "send_to_inbox":
      return "Inbox"
    case "discard":
      return "Discarded"
  }
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

function buildOutcomeHeadline(summary: ReturnType<typeof summarizeReview>) {
  const parts = [
    summary.archive ? `${summary.archive} to topic${summary.archive === 1 ? "" : "s"}` : "",
    summary.inbox ? `${summary.inbox} kept in inbox` : "",
    summary.discard ? `${summary.discard} skipped` : "",
  ].filter(Boolean)

  return parts.length ? parts.join(" / ") : "Nothing was sorted"
}

function getDecisionMeta(decision: BatchDecisionCluster["decision"]) {
  switch (decision) {
    case "archive_to_topic":
      return {
        icon: FolderTree,
      }
    case "send_to_inbox":
      return {
        icon: Inbox,
      }
    case "discard":
      return {
        icon: Trash2,
      }
  }
}

function buildClusterProcessSteps(cluster: BatchDecisionCluster) {
  const steps = [
    `Grouped ${cluster.sourceIds.length} item${cluster.sourceIds.length === 1 ? "" : "s"}`,
    "Wrote a short summary",
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
    const runningState = transitionBatchRuntimeState(payload.batch.runtimeState, "start_run")
    const reviewDraft = buildMockBatchReview(payload)
    const readyState = transitionBatchRuntimeState(runningState, "review_ready")

    return {
      reviewDraft: {
        ...reviewDraft,
        runtimeState: readyState,
      },
      runtimeState: readyState,
      submitAction: "accept_with_edits",
      reviewNote: "",
      editedClusterIds: [],
      submissionResult: null,
    }
  } catch (error) {
    logger.error("Failed to prepare mock AI review session", error)
    return {
      reviewDraft: null,
      runtimeState: "schema_failed",
      submitAction: "accept_with_edits",
      reviewNote: "",
      editedClusterIds: [],
      submissionResult: null,
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
