import { APICallError, type FinishReason, RetryError } from "ai"
import { ZodError } from "zod"

import {
  MODEL_SCHEMA_VERSION,
  modelBatchDecisionSchema,
  type ModelBatchDecision,
} from "../schemas/model-output"
import type { AiBatchPayload, BatchDecisionReview, TopicIndexEntry } from "../../../types/shell"

const capturePromptTextLimit = 1_200
const relevantTopicLimit = 5
const termStopwords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "been",
  "from",
  "have",
  "into",
  "just",
  "more",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "those",
  "were",
  "with",
  "your",
])

export const batchReviewSchemaName = "tinoBatchDecision"
export const batchReviewSchemaDescription =
  "Structured batch clustering, destination choice, summary, and confidence for Tino's hidden intervention flow."

export type BatchReviewErrorCode =
  | "provider_not_configured"
  | "schema_invalid"
  | "generation_failed"

export class BatchReviewError extends Error {
  cause: unknown
  code: BatchReviewErrorCode

  constructor(code: BatchReviewErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = "BatchReviewError"
    this.code = code
    this.cause = cause
  }
}

export type BatchReviewProgressPhase = "starting" | "streaming" | "fallback"

export type BatchReviewProgress = {
  eventCount: number
  firstReasoningLatencyMs: number | null
  firstTextLatencyMs: number | null
  lastEventType: string | null
  phase: BatchReviewProgressPhase
  receivedChars: number
  reasoningChars: number
  reasoningText: string
  text: string
}

export type BatchReviewProviderMetadata = {
  apiMode: "chat" | "responses"
  durationMs: number
  finishReason: FinishReason
  inputTokens: number | undefined
  model: string
  outputTokens: number | undefined
  providerLabel: string
  responseModel: string
}

export type BatchReviewPromptBundle = {
  relevantTopics: TopicIndexEntry[]
  systemPrompt: string
  userPrompt: string
}

export type BatchReviewObjectResponse = {
  metadata: BatchReviewProviderMetadata
  object: unknown
  rawText?: string | null
}

export type BatchReviewTextResponse = {
  metadata: BatchReviewProviderMetadata
  text: string
}

export type BatchReviewExecutor = {
  generateObject: (request: {
    onTextStream?: (progress: BatchReviewProgress) => void
    systemPrompt: string
    timeoutMs?: number
    userPrompt: string
  }) => Promise<BatchReviewObjectResponse>
  generateText: (request: {
    systemPrompt: string
    timeoutMs?: number
    userPrompt: string
  }) => Promise<BatchReviewTextResponse>
}

export type RunBatchReviewOptions = {
  onProgress?: (progress: BatchReviewProgress) => void
  timeoutMs?: number
}

export type BatchReviewRunResult = {
  metadata: BatchReviewProviderMetadata
  prompt: BatchReviewPromptBundle
  rawResponseText: string | null
  relevantTopics: TopicIndexEntry[]
  review: BatchDecisionReview
  usedFallback: boolean
}

export function prepareBatchReviewPromptBundle(payload: AiBatchPayload): BatchReviewPromptBundle {
  const relevantTopics = selectRelevantTopics(payload)

  return {
    relevantTopics,
    systemPrompt: buildFallbackSystemPrompt(),
    userPrompt: buildFallbackUserPrompt(payload, relevantTopics),
  }
}

export async function runBatchReview(
  payload: AiBatchPayload,
  executor: BatchReviewExecutor,
  options?: RunBatchReviewOptions,
): Promise<BatchReviewRunResult> {
  const prompt = prepareBatchReviewPromptBundle(payload)
  let latestStreamProgress: Omit<BatchReviewProgress, "phase"> = {
    eventCount: 0,
    firstReasoningLatencyMs: null,
    firstTextLatencyMs: null,
    lastEventType: null,
    receivedChars: 0,
    reasoningChars: 0,
    reasoningText: "",
    text: "",
  }

  emitBatchReviewProgress(options?.onProgress, {
    ...latestStreamProgress,
    phase: "starting",
  })

  try {
    const generated = await executor.generateObject({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      timeoutMs: options?.timeoutMs,
      onTextStream: (progress) => {
        latestStreamProgress = {
          eventCount: progress.eventCount,
          firstReasoningLatencyMs: progress.firstReasoningLatencyMs,
          firstTextLatencyMs: progress.firstTextLatencyMs,
          lastEventType: progress.lastEventType,
          receivedChars: progress.receivedChars,
          reasoningChars: progress.reasoningChars,
          reasoningText: progress.reasoningText,
          text: progress.text,
        }
        emitBatchReviewProgress(options?.onProgress, {
          ...latestStreamProgress,
          phase: progress.eventCount > 0 ? "streaming" : "starting",
        })
      },
    })

    const modelDecision = parseModelDecision(payload, generated.object)

    return {
      metadata: generated.metadata,
      prompt,
      rawResponseText: generated.rawText ?? null,
      relevantTopics: prompt.relevantTopics,
      review: buildBatchDecisionReview(payload.batch.id, modelDecision),
      usedFallback: false,
    }
  } catch (error) {
    if (!shouldUseSyncFallback(error)) {
      throw toBatchReviewGenerationError(error)
    }
  }

  emitBatchReviewProgress(options?.onProgress, {
    ...latestStreamProgress,
    phase: "fallback",
  })

  try {
    const fallback = await executor.generateText({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      timeoutMs: options?.timeoutMs,
    })
    const modelDecision = parseModelDecision(payload, parseFallbackTextResult(fallback.text))

    return {
      metadata: fallback.metadata,
      prompt,
      rawResponseText: fallback.text,
      relevantTopics: prompt.relevantTopics,
      review: buildBatchDecisionReview(payload.batch.id, modelDecision),
      usedFallback: true,
    }
  } catch (error) {
    throw toBatchReviewGenerationError(error)
  }
}

export function buildBatchDecisionReview(
  batchId: string,
  decision: ModelBatchDecision,
): BatchDecisionReview {
  return {
    reviewId: `review_${batchId}_${Date.now()}`,
    batchId,
    runtimeState: "review_pending",
    createdAt: new Date().toISOString(),
    modelSchemaVersion: MODEL_SCHEMA_VERSION,
    clusters: decision.clusters,
  }
}

export function parseModelDecision(payload: AiBatchPayload, object: unknown) {
  let modelDecision: ModelBatchDecision

  try {
    modelDecision = modelBatchDecisionSchema.parse(object)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BatchReviewError(
        "schema_invalid",
        "The model returned an invalid batch decision shape.",
        error,
      )
    }

    throw error
  }

  validateDecisionAgainstBatch(payload, modelDecision)
  return modelDecision
}

export function validateDecisionAgainstBatch(
  payload: AiBatchPayload,
  decision: ModelBatchDecision,
) {
  const batchSourceIds = new Set(payload.captures.map((capture) => capture.id))
  const seenClusterIds = new Set<string>()
  const assignedSourceIds = new Set<string>()

  for (const cluster of decision.clusters) {
    if (seenClusterIds.has(cluster.clusterId)) {
      throw new BatchReviewError(
        "schema_invalid",
        `The model reused clusterId "${cluster.clusterId}".`,
      )
    }
    seenClusterIds.add(cluster.clusterId)

    for (const sourceId of cluster.sourceIds) {
      if (!batchSourceIds.has(sourceId)) {
        throw new BatchReviewError(
          "schema_invalid",
          `The model referenced unknown sourceId "${sourceId}".`,
        )
      }

      if (assignedSourceIds.has(sourceId)) {
        throw new BatchReviewError(
          "schema_invalid",
          `The model assigned sourceId "${sourceId}" to more than one cluster.`,
        )
      }

      assignedSourceIds.add(sourceId)
    }
  }

  const missingSourceIds = payload.captures
    .map((capture) => capture.id)
    .filter((sourceId) => !assignedSourceIds.has(sourceId))

  if (missingSourceIds.length > 0) {
    throw new BatchReviewError(
      "schema_invalid",
      `The model left ${missingSourceIds.length} sourceIds unassigned: ${missingSourceIds.join(", ")}.`,
    )
  }
}

export function selectRelevantTopics(payload: AiBatchPayload) {
  if (payload.availableTopics.length <= relevantTopicLimit) {
    return payload.availableTopics
  }

  const batchTerms = extractBatchTerms(payload)
  if (!batchTerms.length) {
    return payload.availableTopics.slice(0, relevantTopicLimit)
  }

  return payload.availableTopics
    .map((topic, index) => ({
      index,
      score: scoreTopicAgainstBatch(topic, batchTerms),
      topic,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.index - right.index
    })
    .slice(0, relevantTopicLimit)
    .map((entry) => entry.topic)
}

function emitBatchReviewProgress(
  onProgress: RunBatchReviewOptions["onProgress"] | undefined,
  progress: BatchReviewProgress,
) {
  onProgress?.(progress)
}

function toBatchReviewGenerationError(error: unknown) {
  if (error instanceof BatchReviewError) {
    return error
  }

  return new BatchReviewError(
    "generation_failed",
    error instanceof Error ? error.message : "Failed to generate a batch review candidate.",
    error,
  )
}

function shouldUseSyncFallback(error: unknown) {
  if (RetryError.isInstance(error) || APICallError.isInstance(error)) {
    return false
  }

  if (!(error instanceof Error)) {
    return true
  }

  return !(
    /resource id .* is invalid/i.test(error.message)
    || /provider request was blocked/i.test(error.message)
    || /provider stream stalled or exceeded/i.test(error.message)
    || /bad gateway|service unavailable|gateway timeout|temporarily unavailable/i.test(error.message)
    || /timed out|timeout/i.test(error.message)
  )
}

function buildFallbackSystemPrompt() {
  return [
    "You are Tino's background batch compiler.",
    "Cluster related captures and choose the safest destination for each cluster.",
    "Optimize for durable knowledge quality, not aggressive archival.",
    "A false archive is worse than sending a cluster to the inbox.",
    "",
    "Decision definitions",
    "- archive_to_topic: durable, reusable knowledge, stable product/technical decisions, reusable assets such as libraries/playbooks/macros/templates, or long-lived reference material that should still matter weeks later.",
    "- send_to_inbox: actionable work, meeting prep, owner/deadline driven notes, follow-ups, sparse watchlists, or anything that still needs human triage.",
    "- discard: obvious low-value noise or accidental scraps with no durable value and no follow-up value.",
    "",
    "Hard routing rules",
    "- If the cluster contains owners, deadlines, requests, TODOs, next steps, meeting prep, release coordination, demo prep, or 'need to / ask / invite / record / prepare' style language, use send_to_inbox.",
    "- If the cluster is mostly raw links, docs, or references with little synthesis or only vague context like 'maybe useful later', use send_to_inbox.",
    "- A supporting issue link or doc link should stay attached to the actionable or substantive cluster it belongs to. Do not split it into a standalone cluster unless it is clearly unrelated.",
    "- Repeated or near-duplicate captures usually strengthen one cluster. Do not fragment them just because the wording repeats.",
    "",
    "Topic matching rules",
    "- Prefer an existing topic whenever it is a reasonable broader or parent home for the cluster.",
    "- Do not create a new topic just because you can invent a narrower name.",
    "- Only create a new topic when the knowledge is clearly durable, clearly distinct from every available topic, and would still deserve its own page weeks later.",
    "- Reusable assets can justify a new topic even if they were created for an upcoming launch or tester wave, as long as the cluster is defining the reusable asset itself rather than just tracking immediate execution.",
    "- If a cluster could fit an existing topic with a broader scope, merge into that existing topic.",
    "- Planning notes are still durable knowledge when they define a stable framework, evaluation rubric, architecture principle, or metrics strategy. Do not send them to inbox just because they mention v0.1, planning, or prompt tuning.",
    "- Prefer the most semantically direct existing topic over a broader meta topic. User-facing copy, tone, headline, and product-message guidance belongs with writing/playbook topics rather than generic knowledge-ops topics.",
    "- When material overlaps two adjacent topics, split by durable responsibility or ownership, not by superficial keyword overlap.",
    "- If Python is acting as an analysis sidecar after stable artifacts are produced, keep Python notebook, pandas, and error-bucketing material with the Python analysis topic; keep runner/scorer ownership and evaluation-metric system notes with the evaluation topic.",
    "- When import/conversion-library fit overlaps with runtime ownership, keep library-fit and normalization notes with the document/import topic, keep execution-boundary and scheduler-ownership notes with the runtime topic, and keep pure follow-up benchmark asks in inbox.",
    "",
    "Compact calibration examples",
    "1. Meeting/demo prep with owners, assignments, deadlines, and a supporting issue link -> one cluster -> send_to_inbox. Do not archive it to a recurring ops topic.",
    "2. Four evaluation-tool links plus one vague note like 'maybe useful later for scorecards' -> one cluster -> send_to_inbox. Sparse link collections are not durable topic knowledge yet.",
    "3. Several near-duplicate notes about clipboard retention durability -> one cluster -> archive_to_topic using the best existing broader topic. Do not invent a narrower new topic.",
    "4. Mixed batch: Python notebook and pandas references for post-run analysis, plus separate notes that runner/scorer ownership stays in TypeScript -> split into Python analysis and evaluation-system clusters, then merge each into the matching existing topic.",
    "",
    "Return one JSON object only.",
    "Do not use markdown fences.",
    "Do not add explanation before or after the JSON.",
    "The JSON must match this shape exactly:",
    '{ "clusters": [{ "clusterId": string, "sourceIds": string[], "decision": "archive_to_topic" | "send_to_inbox" | "discard", "topicSlugSuggestion": string | null, "topicNameSuggestion": string | null, "title": string, "summary": string, "keyPoints": string[], "tags": string[], "confidence": number, "reason": string, "possibleTopics": [{ "topicSlug": string, "topicName": string, "reason": string | null }], "missingContext": string[] }] }',
  ].join("\n")
}

function buildUserPrompt(payload: AiBatchPayload, relevantTopics: TopicIndexEntry[]) {
  return [
    "Batch metadata",
    `batch_id: ${payload.batch.id}`,
    `capture_count: ${payload.captures.length}`,
    `trigger_reason: ${payload.batch.triggerReason}`,
    `window: ${payload.batch.firstCapturedAt} -> ${payload.batch.lastCapturedAt}`,
    "",
    "Relevant topic index entries (treat these as canonical topic candidates; prefer them over inventing a new topic)",
    buildTopicIndexBlock(relevantTopics),
    "",
    "Captures",
    payload.captures
      .map((capture, index) => buildCapturePromptBlock(capture, index + 1))
      .join("\n\n"),
  ].join("\n")
}

function buildFallbackUserPrompt(payload: AiBatchPayload, relevantTopics: TopicIndexEntry[]) {
  const calibrationHints = buildCalibrationHints(payload)

  return [
    buildUserPrompt(payload, relevantTopics),
    ...(calibrationHints.length > 0
      ? [
          "",
          "Batch-specific calibration hints",
          ...calibrationHints.map((hint, index) => `${index + 1}. ${hint}`),
        ]
      : []),
    "",
    "Decision checklist",
    "1. If the cluster is execution-oriented or time-bound, send it to inbox.",
    "2. If the cluster is link-heavy with weak synthesis, send it to inbox.",
    "3. If the cluster is durable and fits an existing topic, archive to that existing topic.",
    "4. Create a new topic only when none of the listed topics is a reasonable broader home and the cluster defines durable knowledge or a reusable asset.",
    "5. Keep near-duplicates together when they restate the same durable point.",
    "6. Use discard only for obvious noise with no follow-up value.",
    "",
    "Important output rules",
    "1. Output valid JSON only.",
    "2. Use only sourceIds from the captures above.",
    "3. Do not repeat sourceIds across clusters.",
    "4. Assign every sourceId exactly once.",
    "5. Use an exact listed topic slug when you merge into an existing topic.",
    "6. Use null when topic suggestion is unavailable.",
    "7. Include missingContext and possibleTopics arrays even when empty.",
  ].join("\n")
}

function buildCalibrationHints(payload: AiBatchPayload) {
  const batchText = payload.captures
    .map((capture) =>
      [capture.preview, capture.rawText, capture.linkUrl, capture.sourceAppName]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n")
    .toLowerCase()

  const hints: string[] = []

  if (
    hasAnyPhrase(batchText, [
      "fixtures",
      "goldens",
      "replay runner",
      "scorer",
      "holdout",
      "false archive",
      "topic merge",
      "source assignment integrity",
    ])
  ) {
    hints.push(
      "Batches about fixtures, goldens, replay runners, scorers, holdout splits, or structural quality metrics are durable evaluation-system knowledge and should merge into the evaluation topic instead of going to inbox.",
    )
  }

  if (
    hasAnyPhrase(batchText, [
      "homepage",
      "tone",
      "headline",
      "quiet inbox",
      "capture first",
      "organize later",
      "manual filing",
      "warm but still technical",
    ])
  ) {
    hints.push(
      "Copy, tone, headline, and product-message guidance belongs with a writing/playbook topic; keep terminal commands, compiler errors, and personal reminders in separate inbox or discard clusters.",
    )
  }

  if (
    hasAnyPhrase(batchText, [
      "support macro",
      "support macros",
      "reply structure",
      "failure mode",
      "zendesk",
      "diagnostic step",
      "escalation rule",
    ])
  ) {
    hints.push(
      "A cohesive batch defining reusable support macros, grouped by failure mode with a stable reply structure, can justify archive_to_topic and even a new topic if no listed topic fits.",
    )
  }

  if (
    hasAnyPhrase(batchText, [
      "markitdown",
      "import adapter",
      "import adapters",
      "document import",
      "clipboard normalization",
      "rust background jobs",
      "async boundaries",
      "scheduler",
    ])
  ) {
    hints.push(
      "Import/conversion-library fit and normalization notes belong with the document/import topic; runtime ownership and scheduler-boundary notes belong with the runtime topic; pure benchmark follow-up asks belong in inbox.",
    )
  }

  return hints
}

function hasAnyPhrase(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle))
}

function buildTopicIndexBlock(topics: TopicIndexEntry[]) {
  if (!topics.length) {
    return "- none available"
  }

  return topics
    .map((topic, index) =>
      [
        `${index + 1}. ${topic.topicName} [${topic.topicSlug}]`,
        `   summary: ${sanitizeInline(topic.topicSummary, 220)}`,
        `   recent_tags: ${topic.recentTags.length ? topic.recentTags.join(", ") : "none"}`,
        `   last_updated_at: ${topic.lastUpdatedAt || "unknown"}`,
      ].join("\n"),
    )
    .join("\n")
}

function buildCapturePromptBlock(capture: AiBatchPayload["captures"][number], index: number) {
  return [
    `capture_${index}:`,
    `id: ${capture.id}`,
    `content_kind: ${capture.contentKind}`,
    `captured_at: ${capture.capturedAt}`,
    `source: ${capture.source}`,
    `source_app_name: ${capture.sourceAppName ?? "unknown"}`,
    `preview: ${sanitizeInline(capture.preview, 220)}`,
    capture.linkUrl ? `link_url: ${capture.linkUrl}` : null,
    "raw_text:",
    indentBlock(truncateBlock(capture.rawText, capturePromptTextLimit)),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
}

function extractBatchTerms(payload: AiBatchPayload) {
  const batchText = payload.captures
    .map((capture) => [capture.preview, capture.rawText, capture.sourceAppName].filter(Boolean).join(" "))
    .join("\n")
    .toLowerCase()
  const rawTerms = batchText.match(/[\p{L}\p{N}_-]+/gu) ?? []
  const seenTerms = new Set<string>()
  const terms: string[] = []

  for (const term of rawTerms) {
    if (term.length < 3 || termStopwords.has(term) || seenTerms.has(term)) {
      continue
    }

    seenTerms.add(term)
    terms.push(term)

    if (terms.length >= 80) {
      break
    }
  }

  return terms
}

function scoreTopicAgainstBatch(topic: TopicIndexEntry, batchTerms: string[]) {
  const topicText = [
    topic.topicSlug,
    topic.topicName,
    topic.topicSummary,
    topic.recentTags.join(" "),
  ]
    .join(" ")
    .toLowerCase()

  return batchTerms.reduce((score, term) => {
    if (!topicText.includes(term)) {
      return score
    }

    return score + (term.length >= 7 ? 2 : 1)
  }, 0)
}

function truncateBlock(value: string, limit: number) {
  const normalized = value.replace(/\r\n/g, "\n").trim()
  if (!normalized) {
    return "(empty)"
  }

  if (normalized.length <= limit) {
    return normalized
  }

  return `${normalized.slice(0, limit - 1)}...`
}

function sanitizeInline(value: string, limit: number) {
  const compact = value.replace(/\s+/g, " ").trim()
  if (!compact) {
    return "(empty)"
  }

  if (compact.length <= limit) {
    return compact
  }

  return `${compact.slice(0, limit - 1)}...`
}

function indentBlock(value: string) {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
}

function parseFallbackTextResult(text: string) {
  const normalized = text.trim()
  if (!normalized) {
    throw new BatchReviewError(
      "schema_invalid",
      "The fallback text response was empty.",
    )
  }

  const candidate =
    extractMarkdownJsonBlock(normalized) ??
    extractFirstJsonValue(normalized) ??
    normalized

  try {
    return JSON.parse(candidate) as unknown
  } catch (error) {
    throw new BatchReviewError(
      "schema_invalid",
      "The fallback text response was not valid JSON.",
      error,
    )
  }
}

function extractMarkdownJsonBlock(value: string) {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return match?.[1]?.trim() || null
}

function extractFirstJsonValue(value: string) {
  const start = value.search(/[[{]/)
  if (start === -1) {
    return null
  }

  const opening = value[start]
  const closing = opening === "{" ? "}" : "]"
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }

      if (character === "\\") {
        escaped = true
        continue
      }

      if (character === "\"") {
        inString = false
      }

      continue
    }

    if (character === "\"") {
      inString = true
      continue
    }

    if (character === opening) {
      depth += 1
      continue
    }

    if (character === closing) {
      depth -= 1
      if (depth === 0) {
        return value.slice(start, index + 1).trim()
      }
    }
  }

  return null
}
