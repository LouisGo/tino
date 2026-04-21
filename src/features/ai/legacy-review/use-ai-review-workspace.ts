import { startTransition, useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/app/query-keys"
import type { FloatingFeedbackStatus } from "@/components/feedback/floating-feedback-card"
import { buildMockBatchReview } from "./mock-review"
import { resolveProviderAccessConfig, type ProviderCallMetadata } from "@/features/ai/lib/provider-access"
import { isMockAiBatchId } from "@/features/ai/lib/mock-fixtures"
import { transitionBatchRuntimeState } from "./batch-state-machine"
import {
  isLiveBatchReviewError,
  runLiveBatchReview,
  type LiveBatchReviewProgress,
} from "./live-batch-review"
import { resolveActiveRuntimeProvider } from "@/features/settings/lib/runtime-provider"
import { usePersistedAppSettings } from "@/hooks/use-persisted-app-settings"
import { createRendererLogger } from "@/lib/logger"
import { applyBatchDecision } from "@/lib/tauri-ai"
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
}

export type ValueFeedback = "helpful" | "mixed" | "not_worth_it"

type SubmitReviewInput = {
  actionOverride?: ReviewAction
  valueFeedbackOverride?: ValueFeedback | null
  feedbackReasonsOverride?: string[]
}

type LiveRunSummary = {
  metadata: ProviderCallMetadata
  relevantTopicCount: number
}

type LiveRunProgress = LiveBatchReviewProgress

export function useAiReviewWorkspace(payload: AiBatchPayload) {
  const queryClient = useQueryClient()
  const [initialState] = useState(() => buildInitialReviewState(payload))
  const [reviewDraft, setReviewDraft] = useState(initialState.reviewDraft)
  const [runtimeState, setRuntimeState] = useState(initialState.runtimeState)
  const [submitAction, setSubmitAction] = useState(initialState.submitAction)
  const [reviewNote, setReviewNote] = useState(initialState.reviewNote)
  const [editedClusterIds, setEditedClusterIds] = useState(initialState.editedClusterIds)
  const [valueFeedback, setValueFeedback] = useState<ValueFeedback | null>(null)
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([])
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState<FloatingFeedbackStatus | null>(null)
  const [liveRunError, setLiveRunError] = useState<string | null>(null)
  const [liveRunProgress, setLiveRunProgress] = useState<LiveRunProgress | null>(null)
  const [liveRunSummary, setLiveRunSummary] = useState<LiveRunSummary | null>(null)
  const [submitResult, setSubmitResult] = useState<ApplyBatchDecisionResult | null>(null)
  const isPreviewBatch = isMockAiBatchId(payload.batch.id)

  const settingsQuery = usePersistedAppSettings()

  const activeProvider = settingsQuery.data
    ? resolveActiveRuntimeProvider(settingsQuery.data)
    : null

  const providerAccess = activeProvider
    ? resolveProviderAccessConfig(activeProvider)
    : null

  useEffect(() => {
    if (!reviewDraft || typeof window === "undefined") {
      return
    }

    const timer = window.setTimeout(() => {
      setFeedbackOpen(true)
    }, 1200)

    return () => {
      window.clearTimeout(timer)
    }
  }, [reviewDraft])

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

  const runLiveReviewMutation = useMutation({
    mutationFn: async () => {
      if (isPreviewBatch) {
        return {
          review: buildMockBatchReview(payload),
          summary: null,
        }
      }

      if (!settingsQuery.data) {
        throw new Error("Provider settings are still loading.")
      }

      if (!activeProvider || !providerAccess?.isConfigured) {
        throw new Error(
          "Complete Base URL and API key before running a live candidate.",
        )
      }

      const result = await runLiveBatchReview(payload, activeProvider, {
        onProgress: (progress) => {
          startTransition(() => {
            setLiveRunProgress(progress)
          })
        },
      })
      return {
        review: result.review,
        summary: {
          metadata: result.metadata,
          relevantTopicCount: result.relevantTopics.length,
        } satisfies LiveRunSummary,
      }
    },
    onMutate: () => {
      setLiveRunError(null)
      setLiveRunProgress({
        eventCount: 0,
        firstReasoningLatencyMs: null,
        firstTextLatencyMs: null,
        lastEventType: null,
        phase: "starting",
        receivedChars: 0,
        reasoningChars: 0,
        reasoningText: "",
        text: "",
      })
      setLiveRunSummary(null)
      setSubmitResult(null)
      setFeedbackStatus(null)
      setRuntimeState((current) => {
        try {
          return transitionBatchRuntimeState(current, "start_run")
        } catch {
          return "running"
        }
      })
    },
    onSuccess: ({ review, summary }) => {
      setLiveRunProgress(null)
      setReviewDraft(review)
      setRuntimeState(review.runtimeState)
      setEditedClusterIds([])
      setReviewNote("")
      setFeedbackOpen(false)
      setLiveRunSummary(summary)
      logger.info("Prepared live AI candidate", {
        batchId: review.batchId,
        clusterCount: review.clusters.length,
        responseModel: summary?.metadata.responseModel,
      })
    },
    onError: (error) => {
      const nextState =
        isLiveBatchReviewError(error) && error.code === "schema_invalid"
          ? "schema_failed"
          : "failed"

      setRuntimeState(nextState)
      setLiveRunError(
        error instanceof Error
          ? error.message
          : "Failed to prepare a live candidate for this batch.",
      )
      logger.error("Failed to prepare live AI candidate", error)
    },
  })

  const submitReviewMutation = useMutation({
    mutationFn: async (input?: SubmitReviewInput) => {
      if (!reviewDraft) {
        throw new Error("No review draft available")
      }

      if (runtimeState === "persisted") {
        throw new Error("This batch has already been persisted.")
      }

      const finalAction = input?.actionOverride ?? submitAction
      const nextValueFeedback =
        input && "valueFeedbackOverride" in input
          ? input.valueFeedbackOverride ?? null
          : valueFeedback
      const nextFeedbackReasons = input?.feedbackReasonsOverride ?? feedbackReasons
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
      nextReview,
      submittedValueFeedback,
      result,
    }) => {
      setRuntimeState(result.runtimeState)
      setReviewDraft({
        ...nextReview,
        runtimeState: result.runtimeState,
      })
      setSubmitResult(result)
      setFeedbackStatus(buildFeedbackSuccessStatus(submittedValueFeedback))
      logger.info("Submitted AI review", {
        batchId: nextReview.batchId,
        action: finalAction,
        mocked: result.mocked,
        runtimeState: result.runtimeState,
        persistedOutputCount: result.persistedOutputs.length,
      })
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.aiBatchSummaries(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.aiBatchPayload(nextReview.batchId),
          exact: true,
        }),
      ])
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

  function submitQuickFeedback(nextValue: ValueFeedback) {
    setValueFeedback(nextValue)
    setFeedbackStatus(null)
    submitReviewMutation.mutate({
      actionOverride: editedClusterIds.length > 0 ? "accept_with_edits" : "accept_all",
      valueFeedbackOverride: nextValue,
    })
  }

  function changeClusterDecision(
    clusterId: string,
    decision: BatchDecisionReview["clusters"][number]["decision"],
  ) {
    setReviewDraft((current) =>
      updateCluster(current, clusterId, (draft) => {
        draft.decision = decision
      }),
    )
    markClusterEdited(clusterId, setEditedClusterIds)
  }

  function changeClusterTopicName(clusterId: string, nextTopicName: string) {
    setReviewDraft((current) =>
      updateCluster(current, clusterId, (draft) => {
        draft.topicNameSuggestion = nextTopicName || null
        draft.topicSlugSuggestion = nextTopicName ? slugify(nextTopicName) : null
      }),
    )
    markClusterEdited(clusterId, setEditedClusterIds)
  }

  return {
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
    setEditedClusterIds,
    setFeedbackOpen,
    setFeedbackReasons,
    setFeedbackStatus,
    setReviewDraft,
    setReviewNote,
    setRuntimeState,
    setSubmitAction,
    submitResult,
    setValueFeedback,
    submitAction,
    submitQuickFeedback,
    submitReviewMutation,
    valueFeedback,
  }
}

export function buildInitialReviewState(payload: AiBatchPayload): InitialReviewState {
  if (!isMockAiBatchId(payload.batch.id)) {
    return {
      reviewDraft: null,
      runtimeState: payload.batch.runtimeState,
      submitAction: "accept_with_edits",
      reviewNote: "",
      editedClusterIds: [],
    }
  }

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
  if (currentState === "reviewed" || currentState === "persisted") {
    return currentState
  }

  return transitionBatchRuntimeState(currentState, "submit_review")
}

export function updateCluster(
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

export function markClusterEdited(
  clusterId: string,
  setEditedClusterIds: Dispatch<SetStateAction<string[]>>,
) {
  setEditedClusterIds((current) =>
    current.includes(clusterId) ? current : [...current, clusterId],
  )
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
