import { APICallError, RetryError } from "ai"
import { ZodError } from "zod"

import {
  createAiObjectGenerator,
  type ProviderAccessConfig,
  type ProviderCallMetadata,
  resolveRuntimeProviderApiMode,
  type StructuredObjectTextStreamProgress,
} from "@/features/ai/lib/provider-access"
import {
  MODEL_SCHEMA_VERSION,
  modelBatchDecisionSchema,
  type ModelBatchDecision,
} from "@/features/ai/schemas/model-output"
import { createRendererLogger } from "@/lib/logger"
import type { AiBatchPayload, BatchDecisionReview, TopicIndexEntry } from "@/types/shell"

const logger = createRendererLogger("agent.runtime.live")
const liveBatchReviewProviderTimeoutMs = 120_000

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

export type LiveBatchReviewErrorCode =
  | "provider_not_configured"
  | "schema_invalid"
  | "generation_failed"

export class LiveBatchReviewError extends Error {
  cause: unknown
  code: LiveBatchReviewErrorCode

  constructor(code: LiveBatchReviewErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = "LiveBatchReviewError"
    this.code = code
    this.cause = cause
  }
}

export type LiveBatchReviewResult = {
  review: BatchDecisionReview
  metadata: ProviderCallMetadata
  relevantTopics: TopicIndexEntry[]
}

export type LiveBatchReviewProgressPhase = "starting" | "streaming" | "fallback"

export type LiveBatchReviewProgress = {
  eventCount: number
  firstReasoningLatencyMs: number | null
  firstTextLatencyMs: number | null
  lastEventType: string | null
  phase: LiveBatchReviewProgressPhase
  receivedChars: number
  reasoningChars: number
  reasoningText: string
  text: string
}

type RunLiveBatchReviewOptions = {
  onProgress?: (progress: LiveBatchReviewProgress) => void
}

export async function runLiveBatchReview(
  payload: AiBatchPayload,
  settings: ProviderAccessConfig,
  options?: RunLiveBatchReviewOptions,
): Promise<LiveBatchReviewResult> {
  assertProviderReady(settings)

  const relevantTopics = selectRelevantTopics(payload)
  const apiMode = resolveRuntimeProviderApiMode(settings)
  const generator = createAiObjectGenerator(settings)
  const streamingUserPrompt = buildFallbackUserPrompt(payload, relevantTopics)
  const streamingSystemPrompt = buildFallbackSystemPrompt()
  let latestStreamProgress: StructuredObjectTextStreamProgress = {
    eventCount: 0,
    firstReasoningLatencyMs: null,
    firstTextLatencyMs: null,
    lastEventType: null,
    receivedChars: 0,
    reasoningChars: 0,
    reasoningText: "",
    text: "",
  }

  emitLiveBatchReviewProgress(options?.onProgress, {
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

  let generated
  try {
    logger.info("Starting live batch review generation", {
      batchId: payload.batch.id,
      captureCount: payload.captures.length,
      promptChars: streamingUserPrompt.length,
      relevantTopicCount: relevantTopics.length,
      requestMode: apiMode === "chat" ? "chat_sse_text_json" : "responses_sse_text_json",
    })

    generated = await generator.generateObject({
      systemPrompt: streamingSystemPrompt,
      userPrompt: streamingUserPrompt,
      schema: modelBatchDecisionSchema,
      schemaDescription:
        "Structured batch clustering, destination choice, summary, and confidence for Tino's hidden intervention flow.",
      schemaName: "tinoBatchDecision",
      timeoutMs: liveBatchReviewProviderTimeoutMs,
      onTextStream: (progress) => {
        latestStreamProgress = progress
        emitLiveBatchReviewProgress(options?.onProgress, {
          eventCount: progress.eventCount,
          firstReasoningLatencyMs: progress.firstReasoningLatencyMs,
          firstTextLatencyMs: progress.firstTextLatencyMs,
          lastEventType: progress.lastEventType,
          phase: progress.eventCount > 0 ? "streaming" : "starting",
          receivedChars: progress.receivedChars,
          reasoningChars: progress.reasoningChars,
          reasoningText: progress.reasoningText,
          text: progress.text,
        })
      },
    })
  } catch (error) {
    if (!shouldUseSyncFallback(error)) {
      throw new LiveBatchReviewError(
        "generation_failed",
        error instanceof Error ? error.message : "Failed to generate a live batch candidate.",
        error,
      )
    }

    logger.warn("Streamed JSON generation failed, retrying with sync text JSON fallback", {
      batchId: payload.batch.id,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    emitLiveBatchReviewProgress(options?.onProgress, {
      eventCount: latestStreamProgress.eventCount,
      firstReasoningLatencyMs: latestStreamProgress.firstReasoningLatencyMs,
      firstTextLatencyMs: latestStreamProgress.firstTextLatencyMs,
      lastEventType: latestStreamProgress.lastEventType,
      phase: "fallback",
      receivedChars: latestStreamProgress.receivedChars,
      reasoningChars: latestStreamProgress.reasoningChars,
      reasoningText: latestStreamProgress.reasoningText,
      text: latestStreamProgress.text,
    })

    try {
      logger.info("Starting live batch review fallback generation", {
        batchId: payload.batch.id,
        captureCount: payload.captures.length,
        promptChars: streamingUserPrompt.length,
        relevantTopicCount: relevantTopics.length,
        requestMode:
          apiMode === "chat" ? "chat_sync_text_json_fallback" : "responses_sync_text_json_fallback",
      })

      const fallback = await generator.generateText({
        systemPrompt: streamingSystemPrompt,
        userPrompt: streamingUserPrompt,
        timeoutMs: liveBatchReviewProviderTimeoutMs,
      })
      const modelDecision = parseModelDecision(payload, parseFallbackTextResult(fallback.text))
      const review = buildBatchDecisionReview(payload.batch.id, modelDecision)

      logger.info("Generated live AI batch candidate through text JSON fallback", {
        batchId: payload.batch.id,
        captureCount: payload.captures.length,
        clusterCount: review.clusters.length,
        durationMs: fallback.durationMs,
        providerLabel: fallback.providerLabel,
        relevantTopicCount: relevantTopics.length,
        responseModel: fallback.responseModel,
      })

      return {
        review,
        metadata: fallback,
        relevantTopics,
      }
    } catch (fallbackError) {
      throw new LiveBatchReviewError(
        "generation_failed",
        fallbackError instanceof Error
          ? fallbackError.message
          : error instanceof Error
            ? error.message
            : "Failed to generate a live batch candidate.",
        fallbackError,
      )
    }
  }

  const { object, ...metadata } = generated
  const modelDecision = parseModelDecision(payload, object)
  const review = buildBatchDecisionReview(payload.batch.id, modelDecision)

  logger.info("Generated live AI batch candidate", {
    batchId: payload.batch.id,
    captureCount: payload.captures.length,
    clusterCount: review.clusters.length,
    durationMs: metadata.durationMs,
    providerLabel: metadata.providerLabel,
    relevantTopicCount: relevantTopics.length,
    responseModel: metadata.responseModel,
  })

  return {
    review,
    metadata,
    relevantTopics,
  }
}

export function isLiveBatchReviewError(error: unknown): error is LiveBatchReviewError {
  return error instanceof LiveBatchReviewError
}

function emitLiveBatchReviewProgress(
  onProgress: RunLiveBatchReviewOptions["onProgress"] | undefined,
  progress: LiveBatchReviewProgress,
) {
  onProgress?.(progress)
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

function buildBatchDecisionReview(batchId: string, decision: ModelBatchDecision): BatchDecisionReview {
  return {
    reviewId: `review_${batchId}_${Date.now()}`,
    batchId,
    runtimeState: "review_pending",
    createdAt: new Date().toISOString(),
    modelSchemaVersion: MODEL_SCHEMA_VERSION,
    clusters: decision.clusters,
  }
}

function parseModelDecision(payload: AiBatchPayload, object: unknown) {
  let modelDecision: ModelBatchDecision

  try {
    modelDecision = modelBatchDecisionSchema.parse(object)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new LiveBatchReviewError(
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

function validateDecisionAgainstBatch(payload: AiBatchPayload, decision: ModelBatchDecision) {
  const batchSourceIds = new Set(payload.captures.map((capture) => capture.id))
  const seenClusterIds = new Set<string>()
  const assignedSourceIds = new Set<string>()

  for (const cluster of decision.clusters) {
    if (seenClusterIds.has(cluster.clusterId)) {
      throw new LiveBatchReviewError(
        "schema_invalid",
        `The model reused clusterId "${cluster.clusterId}".`,
      )
    }
    seenClusterIds.add(cluster.clusterId)

    for (const sourceId of cluster.sourceIds) {
      if (!batchSourceIds.has(sourceId)) {
        throw new LiveBatchReviewError(
          "schema_invalid",
          `The model referenced unknown sourceId "${sourceId}".`,
        )
      }

      if (assignedSourceIds.has(sourceId)) {
        throw new LiveBatchReviewError(
          "schema_invalid",
          `The model assigned sourceId "${sourceId}" to more than one cluster.`,
        )
      }

      assignedSourceIds.add(sourceId)
    }
  }
}

function assertProviderReady(settings: ProviderAccessConfig) {
  const missingFields = [
    settings.baseUrl.trim() ? null : "Base URL",
    settings.model.trim() ? null : "model",
    settings.apiKey.trim() ? null : "API key",
  ].filter(Boolean)

  if (!missingFields.length) {
    return
  }

  throw new LiveBatchReviewError(
    "provider_not_configured",
    `${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required before running a live candidate.`,
  )
}

function buildFallbackSystemPrompt() {
  return [
    "You are Tino's background batch compiler.",
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
    "Relevant topic index entries",
    buildTopicIndexBlock(relevantTopics),
    "",
    "Captures",
    payload.captures
      .map((capture, index) => buildCapturePromptBlock(capture, index + 1))
      .join("\n\n"),
  ].join("\n")
}

function buildFallbackUserPrompt(payload: AiBatchPayload, relevantTopics: TopicIndexEntry[]) {
  return [
    buildUserPrompt(payload, relevantTopics),
    "",
    "Important output rules",
    "1. Output valid JSON only.",
    "2. Use only sourceIds from the captures above.",
    "3. Do not repeat sourceIds across clusters.",
    "4. Use null when topic suggestion is unavailable.",
    "5. Include missingContext and possibleTopics arrays even when empty.",
  ].join("\n")
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

function selectRelevantTopics(payload: AiBatchPayload) {
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
    throw new LiveBatchReviewError(
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
    throw new LiveBatchReviewError(
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
