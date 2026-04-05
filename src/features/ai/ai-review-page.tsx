import { useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Link } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowUpRight,
  Bot,
  RefreshCcw,
  Sparkles,
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
  BatchDecisionReview,
  ReviewAction,
} from "@/types/shell"

const logger = createRendererLogger("agent.review")

type InitialReviewState = {
  reviewDraft: BatchDecisionReview | null
  runtimeState: AiBatchRuntimeState
  submitAction: ReviewAction
  reviewNote: string
  editedClusterIds: string[]
  submissionResult: ApplyBatchDecisionResult | null
}

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
  const initialWorkspaceState = currentPayload
    ? buildInitialReviewState(currentPayload)
    : null

  return (
    <div className="app-scroll-area h-full overflow-y-auto pr-2">
      <div className="space-y-6 pb-8">
        <div className="app-hero-surface">
          <div className="app-hero-control px-6 py-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
                  AI Runtime
                </p>
                <div className="space-y-2">
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Review one AI batch at a time before anything is persisted.
                  </h2>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                    This page now only does three things: pick a batch, inspect the AI
                    suggestion, and confirm or adjust the result. It is not a chat
                    window, and it still does not write topic files yet.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Phase 1
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Review First
                </Badge>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/settings">
                    Provider Settings
                    <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-border/80 bg-surface-panel">
          <CardHeader className="border-b border-border/70">
            <div className="flex items-center gap-3">
              <div className="app-icon-chip">
                <Bot className="size-4" />
              </div>
              <div>
                <CardTitle>What This Page Does</CardTitle>
                <CardDescription>
                  Keep the first AI slice narrow and understandable.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-3">
            {[
              "1. Read one ready batch from the queue.",
              "2. Show AI suggestions in a reviewable form.",
              "3. Let you confirm or edit before later persistence work.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[24px] border border-border/80 bg-surface-elevated p-4"
              >
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="overflow-hidden border-border/80 bg-surface-panel">
            <CardHeader className="border-b border-border/70">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>Pick A Batch</CardTitle>
                  <CardDescription>
                    Start from one batch on the left, then review the AI suggestion on
                    the right.
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
                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                      selectedBatchId === batch.id
                        ? "border-primary/70 bg-primary/8"
                        : "border-border/80 bg-surface-elevated hover:border-primary/35"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{batch.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.captureCount} captures · {batch.triggerReason}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {formatBatchRuntimeStateLabel(batch.runtimeState)}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Created {formatRelativeTimestamp(batch.createdAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {isMockAiBatchId(batch.id) ? (
                        <Badge variant="secondary">Mock</Badge>
                      ) : (
                        <Badge variant="secondary">Rust</Badge>
                      )}
                      {batch.sourceIds.slice(0, 2).map((sourceId) => (
                        <Badge key={sourceId} variant="secondary">
                          {sourceId}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/80 bg-surface-soft px-5 py-6 text-sm leading-6 text-muted-foreground">
                  No ready batches yet. The page will fall back to mock fixtures once the
                  query returns.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden border-border/80 bg-surface-panel">
              <CardHeader className="border-b border-border/70">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="app-icon-chip">
                        <Bot className="size-4" />
                      </div>
                      <CardTitle>AI Suggestions</CardTitle>
                    </div>
                    <CardDescription>
                      This is the main step: the AI groups the batch, suggests where it
                      should go, and you decide whether to keep or change it.
                    </CardDescription>
                  </div>
                  {currentPayload ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {currentPayload.captures.length} inputs
                      </Badge>
                      <Badge variant="secondary">
                        {initialWorkspaceState?.reviewDraft?.clusters.length ?? 0} suggestions
                      </Badge>
                    </div>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-4 p-4">
                {currentPayload ? (
                  <AiReviewWorkspace
                    key={currentPayload.batch.id}
                    payload={currentPayload}
                  />
                ) : (
                  <div className="rounded-[24px] border border-dashed border-border/80 bg-surface-soft px-6 py-10 text-sm leading-6 text-muted-foreground">
                    Select a batch to build a mock review session.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  )
}

function AiReviewWorkspace({
  payload,
}: {
  payload: AiBatchPayload
}) {
  const initialState = buildInitialReviewState(payload)
  const [reviewDraft, setReviewDraft] = useState(initialState.reviewDraft)
  const [runtimeState, setRuntimeState] = useState(initialState.runtimeState)
  const [submitAction, setSubmitAction] = useState(initialState.submitAction)
  const [reviewNote, setReviewNote] = useState(initialState.reviewNote)
  const [editedClusterIds, setEditedClusterIds] = useState(initialState.editedClusterIds)
  const [submissionResult, setSubmissionResult] = useState(initialState.submissionResult)

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      if (!reviewDraft) {
        throw new Error("No review draft available")
      }

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
          action: submitAction,
          editedClusterIds,
          note: reviewNote.trim() || null,
          submittedAt: new Date().toISOString(),
        },
      }

      const result = await applyBatchDecision(request)
      return {
        nextRuntimeState,
        nextReview,
        result,
      }
    },
    onSuccess: ({ nextRuntimeState, nextReview, result }) => {
      setRuntimeState(nextRuntimeState)
      setReviewDraft(nextReview)
      setSubmissionResult(result)
      logger.info("Submitted AI review", {
        batchId: nextReview.batchId,
        action: submitAction,
        mocked: result.mocked,
      })
    },
    onError: (error) => {
      logger.error("Failed to submit AI review", error)
    },
  })

  if (!reviewDraft) {
    return (
      <div className="rounded-[24px] border border-dashed border-border/80 bg-surface-soft px-6 py-10 text-sm leading-6 text-muted-foreground">
        Schema validation failed while building the mock review session.
      </div>
    )
  }

  return (
    <>
      <div className="rounded-[22px] border border-border/80 bg-surface-elevated px-4 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{payload.batch.id}</p>
            <Badge variant="secondary">
              {formatBatchRuntimeStateLabel(runtimeState)}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {isMockAiBatchId(payload.batch.id)
              ? "The current AI result is still mock-generated, but the batch selection and submit contract are already wired."
              : "This batch comes from the real Rust queue. The AI output shown here is still mock-generated for Phase 1."}
          </p>
          <p className="text-xs text-muted-foreground">
            {payload.captures.length} inputs in this batch, {reviewDraft.clusters.length} AI
            suggestions to review.
          </p>
        </div>
      </div>

      {reviewDraft.clusters.map((cluster) => (
        <div
          key={cluster.clusterId}
          className="rounded-[24px] border border-border/80 bg-surface-elevated p-4"
        >
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <p className="text-base font-semibold">{cluster.title}</p>
              <p className="text-sm leading-6 text-muted-foreground">{cluster.summary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {(cluster.confidence * 100).toFixed(0)}% confidence
              </Badge>
            </div>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                AI Suggests
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
              <label className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                Topic
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
              <p className="text-xs text-muted-foreground">
                Internal slug: {cluster.topicSlugSuggestion ?? "not assigned"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {cluster.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                What AI Kept
              </p>
              <ul className="space-y-2 text-sm leading-6">
                {cluster.keyPoints.map((item) => (
                  <li
                    key={item}
                    className="rounded-[16px] border border-border/70 bg-background/70 px-3 py-2"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                  Why AI Thinks So
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {cluster.reason}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                  Alternative Topics
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cluster.possibleTopics.length ? (
                    cluster.possibleTopics.map((topic) => (
                      <Badge key={topic.topicSlug} variant="secondary">
                        {topic.topicName}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No alternatives suggested.
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
                  What Is Still Unclear
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {cluster.missingContext.length
                    ? cluster.missingContext.join(" ")
                    : "No additional context requested."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
            Confirm As
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
          <label className="text-xs font-semibold tracking-[0.12em] uppercase text-muted-foreground">
            Note
          </label>
          <Textarea
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Optional note about what you changed or why."
            className="min-h-[110px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-border/80 bg-background/80 px-4 py-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">
            Changes made: {editedClusterIds.length}
          </p>
          <p className="text-xs text-muted-foreground">
            This submit still does not write `topics/` or `_inbox/`. It only confirms
            the review contract for the next phase.
          </p>
          {submissionResult ? (
            <p className="text-xs text-muted-foreground">{submissionResult.message}</p>
          ) : null}
        </div>
        <Button
          type="button"
          className="rounded-full"
          onClick={() => void submitReviewMutation.mutateAsync()}
          disabled={submitReviewMutation.isPending}
        >
          <Sparkles className={submitReviewMutation.isPending ? "animate-pulse" : ""} />
          Confirm Review
        </Button>
      </div>
    </>
  )
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
