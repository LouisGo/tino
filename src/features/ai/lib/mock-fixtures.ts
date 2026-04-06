import { minutesAgoIsoString, nowIsoString } from "@/lib/time"
import type {
  AiBatchPayload,
  AiBatchSummary,
  ApplyBatchDecisionRequest,
  ApplyBatchDecisionResult,
  TopicIndexEntry,
} from "@/types/shell"

const mockTopicIndexEntries = [
  {
    topicSlug: "ai-runtime",
    topicName: "AI Runtime",
    topicSummary:
      "Layering, runtime state transitions, and review-first execution rules for Tino AI batches.",
    recentTags: ["runtime", "review", "ipc"],
    lastUpdatedAt: minutesAgoIsoString(45),
  },
  {
    topicSlug: "personal-knowledge-system",
    topicName: "Personal Knowledge System",
    topicSummary:
      "Rules for how captured fragments become structured markdown knowledge assets over time.",
    recentTags: ["knowledge", "topics", "archive"],
    lastUpdatedAt: minutesAgoIsoString(140),
  },
  {
    topicSlug: "provider-access",
    topicName: "Provider Access",
    topicSummary:
      "Renderer-side model access boundaries for OpenAI-compatible providers and structured generation.",
    recentTags: ["provider", "vercel-ai-sdk", "schema"],
    lastUpdatedAt: minutesAgoIsoString(220),
  },
] satisfies TopicIndexEntry[]

const mockAiBatchPayloads = [
  {
    batch: {
      id: "mock_batch_contract_001",
      runtimeState: "ready",
      createdAt: minutesAgoIsoString(18),
      triggerReason: "capture_count",
      captureCount: 4,
      firstCapturedAt: minutesAgoIsoString(24),
      lastCapturedAt: minutesAgoIsoString(11),
      sourceIds: ["cap_ai_001", "cap_ai_002", "cap_ai_003", "cap_ai_004"],
    },
    captures: [
      {
        id: "cap_ai_001",
        contentKind: "plain_text",
        capturedAt: minutesAgoIsoString(24),
        source: "clipboard",
        sourceAppName: "Obsidian",
        sourceAppBundleId: "md.obsidian",
        preview: "Need a contract-first batch review flow before touching persistence.",
        rawText:
          "Need a contract-first batch review flow before touching persistence. Rust should own durable writes, while the renderer only prepares reviewable decisions.",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: null,
      },
      {
        id: "cap_ai_002",
        contentKind: "plain_text",
        capturedAt: minutesAgoIsoString(20),
        source: "clipboard",
        sourceAppName: "Typora",
        sourceAppBundleId: "abnerworks.Typora",
        preview: "Batch runtime needs explicit states: ready -> running -> review_pending.",
        rawText:
          "Batch runtime needs explicit states: ready -> running -> review_pending -> reviewed. Persisting should stay behind the Rust tool boundary and come later.",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: null,
      },
      {
        id: "cap_ai_003",
        contentKind: "link",
        capturedAt: minutesAgoIsoString(14),
        source: "clipboard",
        sourceAppName: "Safari",
        sourceAppBundleId: "com.apple.Safari",
        preview: "https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data",
        rawText: "https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: "https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data",
      },
      {
        id: "cap_ai_004",
        contentKind: "plain_text",
        capturedAt: minutesAgoIsoString(11),
        source: "clipboard",
        sourceAppName: "Linear",
        sourceAppBundleId: "com.linear",
        preview: "Review panel should explain confidence, reason, and possible topic reroutes.",
        rawText:
          "Review panel should explain confidence, reason, and possible topic reroutes so the user can correct AI without opening a chat window.",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: null,
      },
    ],
    availableTopics: mockTopicIndexEntries,
  },
  {
    batch: {
      id: "mock_batch_contract_002",
      runtimeState: "ready",
      createdAt: minutesAgoIsoString(95),
      triggerReason: "max_wait",
      captureCount: 3,
      firstCapturedAt: minutesAgoIsoString(112),
      lastCapturedAt: minutesAgoIsoString(92),
      sourceIds: ["cap_ai_005", "cap_ai_006", "cap_ai_007"],
    },
    captures: [
      {
        id: "cap_ai_005",
        contentKind: "plain_text",
        capturedAt: minutesAgoIsoString(112),
        source: "clipboard",
        sourceAppName: "VS Code",
        sourceAppBundleId: "com.microsoft.VSCode",
        preview: "Model-facing schema can live in renderer zod, but persistence DTO must come from Rust.",
        rawText:
          "Model-facing schema can live in renderer zod, but once the reviewed decision crosses into persistence, the DTO must come from Rust bindings.",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: null,
      },
      {
        id: "cap_ai_006",
        contentKind: "plain_text",
        capturedAt: minutesAgoIsoString(103),
        source: "clipboard",
        sourceAppName: "Notes",
        sourceAppBundleId: "com.apple.Notes",
        preview: "Topic index passed to model should be top-N summaries, never full markdown files.",
        rawText:
          "Topic index passed to model should be top-N summaries, never full markdown files. The AI only suggests a topic slug; the program decides the actual path.",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: null,
      },
      {
        id: "cap_ai_007",
        contentKind: "plain_text",
        capturedAt: minutesAgoIsoString(92),
        source: "clipboard",
        sourceAppName: "Slack",
        sourceAppBundleId: "com.tinyspeck.slackmacgap",
        preview: "Do not wire AI output directly to arbitrary file writes.",
        rawText:
          "Do not wire AI output directly to arbitrary file writes. Review, observability, and explicit apply commands must stay in the middle.",
        rawRich: null,
        rawRichFormat: null,
        linkUrl: null,
      },
    ],
    availableTopics: mockTopicIndexEntries,
  },
] satisfies AiBatchPayload[]

const mockAiBatchPayloadById = new Map(
  mockAiBatchPayloads.map((payload) => [payload.batch.id, payload]),
)

export function getMockAiBatchSummaries(): AiBatchSummary[] {
  return mockAiBatchPayloads.map((payload) => payload.batch)
}

export function getMockAiBatchPayload(batchId?: string | null): AiBatchPayload {
  if (batchId && mockAiBatchPayloadById.has(batchId)) {
    return mockAiBatchPayloadById.get(batchId)!
  }

  return mockAiBatchPayloads[0]
}

export function getMockTopicIndexEntries(): TopicIndexEntry[] {
  return mockTopicIndexEntries
}

export function isMockAiBatchId(batchId: string) {
  return batchId.startsWith("mock_batch_")
}

export function buildMockApplyBatchDecisionResult(
  request: ApplyBatchDecisionRequest,
): ApplyBatchDecisionResult {
  const persistedOutputs = request.review.clusters.map((cluster) => {
    const destination: ApplyBatchDecisionResult["persistedOutputs"][number]["destination"] =
      request.feedback.action === "discard"
        ? "discard"
        : request.feedback.action === "reroute_to_inbox"
          ? cluster.decision === "discard"
            ? "discard"
            : "inbox"
          : cluster.decision === "archive_to_topic"
            ? "topic"
            : cluster.decision === "send_to_inbox"
              ? "inbox"
              : "discard"

    return {
      clusterId: cluster.clusterId,
      destination,
      filePath:
        destination === "topic"
          ? `topics/${cluster.topicSlugSuggestion ?? "mock-topic"}.md`
          : destination === "inbox"
            ? "_inbox/2026-04-06.md"
            : null,
      topicSlug: destination === "topic" ? (cluster.topicSlugSuggestion ?? "mock-topic") : null,
      topicName:
        destination === "topic" ? (cluster.topicNameSuggestion ?? "Mock Topic") : null,
    }
  })

  return {
    batchId: request.batchId,
    accepted: true,
    mocked: true,
    runtimeState: "persisted",
    message: `Mock apply completed via ${request.feedback.action} at ${nowIsoString()}.`,
    persistedOutputs,
  }
}
