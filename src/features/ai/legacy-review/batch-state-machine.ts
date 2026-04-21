import type { AiBatchRuntimeState } from "@/types/shell"

export type BatchRuntimeEvent =
  | "start_run"
  | "review_ready"
  | "schema_invalid"
  | "submit_review"
  | "begin_persist"
  | "persist_succeeded"
  | "mark_failed"

const stateTransitions: Record<
  AiBatchRuntimeState,
  Partial<Record<BatchRuntimeEvent, AiBatchRuntimeState>>
> = {
  ready: {
    start_run: "running",
    mark_failed: "failed",
  },
  running: {
    review_ready: "review_pending",
    schema_invalid: "schema_failed",
    mark_failed: "failed",
  },
  schema_failed: {
    start_run: "running",
    mark_failed: "failed",
  },
  review_pending: {
    start_run: "running",
    submit_review: "reviewed",
    mark_failed: "failed",
  },
  reviewed: {
    start_run: "running",
    begin_persist: "persisting",
    mark_failed: "failed",
  },
  persisting: {
    persist_succeeded: "persisted",
    mark_failed: "failed",
  },
  persisted: {},
  failed: {
    start_run: "running",
  },
}

export function transitionBatchRuntimeState(
  currentState: AiBatchRuntimeState,
  event: BatchRuntimeEvent,
) {
  const nextState = stateTransitions[currentState][event]
  if (!nextState) {
    throw new Error(`Invalid AI batch state transition: ${currentState} -> ${event}`)
  }

  return nextState
}

export function formatBatchRuntimeStateLabel(state: AiBatchRuntimeState) {
  switch (state) {
    case "ready":
      return "Ready"
    case "running":
      return "Running"
    case "schema_failed":
      return "Schema Failed"
    case "review_pending":
      return "Review Pending"
    case "reviewed":
      return "Reviewed"
    case "persisting":
      return "Persisting"
    case "persisted":
      return "Persisted"
    case "failed":
      return "Failed"
  }
}
