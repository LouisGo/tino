import {
  createAiObjectGenerator,
  type ProviderAccessConfig,
  type ProviderCallMetadata,
  type StructuredObjectTextStreamProgress,
} from "@/features/ai/lib/provider-access"
import { modelBatchDecisionSchema } from "@/features/ai/schemas/model-output"
import { createRendererLogger } from "@/lib/logger"
import type { AiBatchPayload } from "@/types/shell"
import {
  batchReviewSchemaDescription,
  batchReviewSchemaName,
  BatchReviewError,
  type BatchReviewErrorCode,
  type BatchReviewProgress,
  runBatchReview,
} from "./batch-review-engine"

const logger = createRendererLogger("agent.runtime.live")
const liveBatchReviewProviderTimeoutMs = 120_000

export type LiveBatchReviewError = BatchReviewError
export type LiveBatchReviewErrorCode = BatchReviewErrorCode
export type LiveBatchReviewProgress = BatchReviewProgress
export type LiveBatchReviewResult = {
  metadata: ProviderCallMetadata
  prompt: Awaited<ReturnType<typeof runBatchReview>>["prompt"]
  rawResponseText: string | null
  relevantTopics: Awaited<ReturnType<typeof runBatchReview>>["relevantTopics"]
  review: Awaited<ReturnType<typeof runBatchReview>>["review"]
  usedFallback: boolean
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

  const generator = createAiObjectGenerator(settings)
  const result = await runBatchReview(
    payload,
    {
      generateObject: async ({ systemPrompt, userPrompt, timeoutMs, onTextStream }) => {
        const generated = await generator.generateObject({
          systemPrompt,
          userPrompt,
          schema: modelBatchDecisionSchema,
          schemaDescription: batchReviewSchemaDescription,
          schemaName: batchReviewSchemaName,
          timeoutMs,
          onTextStream: onTextStream
            ? (progress: StructuredObjectTextStreamProgress) => {
                onTextStream({
                  ...progress,
                  phase: progress.eventCount > 0 ? "streaming" : "starting",
                })
              }
            : undefined,
        })
        const { object, ...metadata } = generated
        return {
          metadata,
          object,
          rawText: null,
        }
      },
      generateText: async ({ systemPrompt, userPrompt, timeoutMs }) => {
        const generated = await generator.generateText({
          systemPrompt,
          userPrompt,
          timeoutMs,
        })
        const { text, ...metadata } = generated
        return {
          metadata,
          text,
        }
      },
    },
    {
      onProgress: options?.onProgress,
      timeoutMs: liveBatchReviewProviderTimeoutMs,
    },
  )

  logger.info("Generated live AI batch candidate", {
    batchId: payload.batch.id,
    captureCount: payload.captures.length,
    clusterCount: result.review.clusters.length,
    durationMs: result.metadata.durationMs,
    providerLabel: result.metadata.providerLabel,
    relevantTopicCount: result.relevantTopics.length,
    responseModel: result.metadata.responseModel,
    usedFallback: result.usedFallback,
  })

  return result
}

export function isLiveBatchReviewError(error: unknown): error is LiveBatchReviewError {
  return error instanceof BatchReviewError
}

function assertProviderReady(settings: ProviderAccessConfig) {
  const missingFields = [
    settings.baseUrl.trim() ? null : "Base URL",
    settings.apiKey.trim() ? null : "API key",
  ].filter(Boolean)

  if (!missingFields.length) {
    return
  }

  throw new BatchReviewError(
    "provider_not_configured",
    `${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required before running a live candidate.`,
  )
}
