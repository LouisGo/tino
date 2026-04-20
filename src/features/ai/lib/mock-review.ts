import type { AiBatchCapture, AiBatchPayload, TopicIndexEntry } from "../../../types/shell"
import {
  type ModelBatchDecision,
  modelBatchDecisionSchema,
} from "../schemas/model-output"
import { buildBatchDecisionReview } from "../runtime/batch-review-engine"

export function buildMockBatchReview(payload: AiBatchPayload) {
  const parsed = modelBatchDecisionSchema.parse(buildMockModelOutput(payload))
  return buildBatchDecisionReview(payload.batch.id, parsed)
}

function buildMockModelOutput(payload: AiBatchPayload): ModelBatchDecision {
  const captures = payload.captures
  const archiveCaptures = captures.filter((capture) => capture.contentKind !== "link")
  const referenceCaptures = captures.filter((capture) => capture.contentKind === "link")
  const clusters: ModelBatchDecision["clusters"] = []
  const primaryTopic = payload.availableTopics[0] ?? null

  if (archiveCaptures.length) {
    clusters.push({
      clusterId: `${payload.batch.id}_cluster_primary`,
      sourceIds: archiveCaptures.slice(0, Math.max(1, Math.min(2, archiveCaptures.length))).map(
        (capture) => capture.id,
      ),
      decision: "archive_to_topic",
      topicSlugSuggestion: primaryTopic?.topicSlug ?? buildTopicSlug(archiveCaptures[0].preview),
      topicNameSuggestion: primaryTopic?.topicName ?? buildTopicName(archiveCaptures[0].preview),
      title: buildClusterTitle(archiveCaptures),
      summary: buildClusterSummary(archiveCaptures),
      keyPoints: buildKeyPoints(archiveCaptures),
      tags: buildClusterTags(archiveCaptures, primaryTopic),
      confidence: confidenceFor(archiveCaptures.length, Boolean(primaryTopic)),
      reason:
        "The batch repeatedly discusses runtime layering, review gating, and Rust-side persistence boundaries.",
      possibleTopics: payload.availableTopics.slice(0, 3).map((topic) => ({
        topicSlug: topic.topicSlug,
        topicName: topic.topicName,
        reason: topic.topicSummary,
      })),
      missingContext: [],
    })
  }

  const remainingCaptures = archiveCaptures.slice(2).concat(referenceCaptures)
  if (remainingCaptures.length) {
    const decision: ModelBatchDecision["clusters"][number]["decision"] =
      referenceCaptures.length > 0 ? "send_to_inbox" : "archive_to_topic"

    clusters.push({
      clusterId: `${payload.batch.id}_cluster_secondary`,
      sourceIds: remainingCaptures.map((capture) => capture.id),
      decision,
      topicSlugSuggestion:
        referenceCaptures.length > 0
          ? null
          : payload.availableTopics[1]?.topicSlug ?? buildTopicSlug(remainingCaptures[0].preview),
      topicNameSuggestion:
        referenceCaptures.length > 0
          ? null
          : payload.availableTopics[1]?.topicName ?? buildTopicName(remainingCaptures[0].preview),
      title:
        referenceCaptures.length > 0
          ? "Provider access references need manual confirmation"
          : buildClusterTitle(remainingCaptures),
      summary:
        referenceCaptures.length > 0
          ? "Reference links and loose follow-up notes are held for review before they influence persistence."
          : buildClusterSummary(remainingCaptures),
      keyPoints: buildKeyPoints(remainingCaptures),
      tags: buildClusterTags(remainingCaptures, payload.availableTopics[1] ?? null),
      confidence: referenceCaptures.length > 0 ? 0.54 : 0.71,
      reason:
        referenceCaptures.length > 0
          ? "This slice includes a provider reference and incomplete follow-up context, so it should remain user-reviewed."
          : "The content still fits the same AI engineering theme but with lower evidence density.",
      possibleTopics: payload.availableTopics.slice(0, 3).map((topic) => ({
        topicSlug: topic.topicSlug,
        topicName: topic.topicName,
        reason: topic.topicSummary,
      })),
      missingContext:
        referenceCaptures.length > 0
          ? ["Need confirmation whether the external reference should become a long-term topic section."]
          : [],
    })
  }

  return {
    clusters,
  }
}

function buildClusterTitle(captures: AiBatchCapture[]) {
  const firstPreview = captures[0]?.preview?.trim() ?? "Untitled cluster"
  return truncate(firstPreview, 58)
}

function buildClusterSummary(captures: AiBatchCapture[]) {
  return captures
    .slice(0, 2)
    .map((capture) => capture.rawText.trim())
    .filter(Boolean)
    .join(" ")
}

function buildKeyPoints(captures: AiBatchCapture[]) {
  return captures
    .map((capture) => capture.preview.trim())
    .filter(Boolean)
    .slice(0, 4)
}

function buildClusterTags(captures: AiBatchCapture[], topic: TopicIndexEntry | null) {
  const tags = new Set<string>()
  if (topic) {
    topic.recentTags.forEach((tag) => tags.add(tag))
  }

  captures.forEach((capture) => {
    tags.add(capture.contentKind)
    if (capture.sourceAppName) {
      tags.add(capture.sourceAppName.toLowerCase().replace(/\s+/g, "-"))
    }
  })

  return [...tags].slice(0, 5)
}

function confidenceFor(captureCount: number, hasTopic: boolean) {
  if (captureCount >= 3 && hasTopic) {
    return 0.83
  }

  if (captureCount >= 2) {
    return 0.76
  }

  return 0.67
}

function buildTopicSlug(preview: string) {
  const normalized = preview
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  return normalized || "new-topic"
}

function buildTopicName(preview: string) {
  return truncate(preview.replace(/\s+/g, " ").trim(), 36)
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value
  }

  if (limit <= 3) {
    return value.slice(0, limit)
  }

  return `${value.slice(0, limit - 3)}...`
}
