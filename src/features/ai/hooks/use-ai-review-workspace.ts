import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/app/query-keys"
import type { FloatingFeedbackStatus } from "@/components/feedback/floating-feedback-card"
import { buildMockBatchReview } from "@/features/ai/lib/mock-review"
import { transitionBatchRuntimeState } from "@/features/ai/runtime/batch-state-machine"
import { createRendererLogger } from "@/lib/logger"
import { applyBatchDecision } from "@/lib/tauri-ai"
import type {
  AiBatchPayload,
  AiBatchRuntimeState,
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

  function submitQuickFeedback(nextValue: ValueFeedback) {
    setValueFeedback(nextValue)
    setFeedbackStatus(null)
    void submitReviewMutation.mutateAsync({
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
    reviewDraft,
    reviewNote,
    runtimeState,
    setEditedClusterIds,
    setFeedbackOpen,
    setFeedbackReasons,
    setFeedbackStatus,
    setReviewDraft,
    setReviewNote,
    setRuntimeState,
    setSubmitAction,
    setValueFeedback,
    submitAction,
    submitQuickFeedback,
    submitReviewMutation,
    valueFeedback,
  }
}

export function buildInitialReviewState(payload: AiBatchPayload): InitialReviewState {
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
  if (currentState === "reviewed") {
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
