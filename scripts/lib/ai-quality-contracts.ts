import { z } from "zod"

const runtimeStateSchema = z.enum([
  "ready",
  "running",
  "schema_failed",
  "review_pending",
  "reviewed",
  "persisting",
  "persisted",
  "failed",
])

const aiDecisionSchema = z.enum([
  "archive_to_topic",
  "send_to_inbox",
  "discard",
])

const topicIndexEntrySchema = z.object({
  topicSlug: z.string().min(1),
  topicName: z.string().min(1),
  topicSummary: z.string().min(1),
  recentTags: z.array(z.string().min(1)),
  lastUpdatedAt: z.string().min(1),
})

const aiBatchSummarySchema = z.object({
  id: z.string().min(1),
  runtimeState: runtimeStateSchema,
  createdAt: z.string().min(1),
  triggerReason: z.string().min(1),
  captureCount: z.number().int().nonnegative(),
  firstCapturedAt: z.string().min(1),
  lastCapturedAt: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
})

const aiBatchCaptureSchema = z.object({
  id: z.string().min(1),
  contentKind: z.string().min(1),
  capturedAt: z.string().min(1),
  source: z.string().min(1),
  sourceAppName: z.string().nullable(),
  sourceAppBundleId: z.string().nullable(),
  preview: z.string(),
  rawText: z.string(),
  rawRich: z.string().nullable(),
  rawRichFormat: z.string().nullable(),
  linkUrl: z.string().nullable(),
})

export const batchFixtureSchema = z.object({
  fixtureVersion: z.literal("tino.ai_quality.batch_fixture.v0.1"),
  fixtureId: z.string().min(1),
  split: z.enum(["dev", "holdout"]),
  scenarioFamily: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topicIndexRef: z.string().min(1),
  availableTopicSlugs: z.array(z.string().min(1)).min(1),
  notes: z.array(z.string().min(1)).default([]),
  batch: aiBatchSummarySchema,
  captures: z.array(aiBatchCaptureSchema).min(1),
})

export const goldenClusterSchema = z.object({
  clusterId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  expectedDestination: aiDecisionSchema,
  topicMode: z.enum(["existing_topic", "new_topic", "inbox", "discard"]),
  expectedTopicSlug: z.string().nullable(),
  expectedTopicName: z.string().nullable(),
  mustSupport: z.array(z.string().min(1)).default([]),
  severity: z.enum(["low", "medium", "high"]),
})

export const goldenFixtureSchema = z.object({
  fixtureVersion: z.literal("tino.ai_quality.golden.v0.1"),
  fixtureId: z.string().min(1),
  batchId: z.string().min(1),
  split: z.enum(["dev", "holdout"]),
  scenarioFamily: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  expectedClusters: z.array(goldenClusterSchema).min(1),
  criticalChecks: z.array(z.string().min(1)).default([]),
  annotationNotes: z.array(z.string().min(1)).default([]),
})

export const topicIndexFixtureSchema = z.object({
  fixtureVersion: z.literal("tino.ai_quality.topic_index.v0.1"),
  topicIndexId: z.string().min(1),
  createdAt: z.string().min(1),
  entries: z.array(topicIndexEntrySchema).min(1),
})

export const datasetManifestSchema = z.object({
  datasetVersion: z.literal("tino.ai_quality.dataset.v0.1"),
  status: z.string().min(1),
  createdAt: z.string().min(1),
  planDocument: z.string().min(1),
  fixtureSchemaVersion: z.string().min(1),
  goldenSchemaVersion: z.string().min(1),
  topicIndexRef: z.string().min(1),
  targetBatchCount: z.number().int().nonnegative(),
  currentBatchCount: z.number().int().nonnegative(),
  currentCaptureCount: z.number().int().nonnegative(),
  splits: z.object({
    dev: z.number().int().nonnegative(),
    holdout: z.number().int().nonnegative(),
  }),
  contentKinds: z.array(z.string().min(1)).min(1),
  scenarioFamilies: z.array(z.string().min(1)).min(1),
  fixtures: z.array(
    z.object({
      fixtureId: z.string().min(1),
      split: z.enum(["dev", "holdout"]),
      scenarioFamily: z.string().min(1),
      difficulty: z.enum(["easy", "medium", "hard"]),
      captureCount: z.number().int().nonnegative(),
      primaryExpectation: z.string().min(1),
    }),
  ).min(1),
})

export type BatchFixture = z.infer<typeof batchFixtureSchema>
export type GoldenFixture = z.infer<typeof goldenFixtureSchema>
export type TopicIndexFixture = z.infer<typeof topicIndexFixtureSchema>
export type DatasetManifest = z.infer<typeof datasetManifestSchema>
