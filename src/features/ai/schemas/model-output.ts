import { z } from "zod"

export const MODEL_SCHEMA_VERSION = "tino.batch_review.v1"

export const aiDecisionSchema = z.enum([
  "archive_to_topic",
  "send_to_inbox",
  "discard",
])

export const possibleTopicSuggestionSchema = z.object({
  topicSlug: z.string().min(1),
  topicName: z.string().min(1),
  reason: z.string().trim().min(1).nullable(),
})

export const batchDecisionClusterSchema = z.object({
  clusterId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  decision: aiDecisionSchema,
  topicSlugSuggestion: z.string().trim().min(1).nullable(),
  topicNameSuggestion: z.string().trim().min(1).nullable(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).min(1),
  tags: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1),
  possibleTopics: z.array(possibleTopicSuggestionSchema).default([]),
  missingContext: z.array(z.string().trim().min(1)).default([]),
})

export const modelBatchDecisionSchema = z.object({
  clusters: z.array(batchDecisionClusterSchema).min(1),
})

export type ModelBatchDecision = z.infer<typeof modelBatchDecisionSchema>
