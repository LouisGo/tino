import type { BatchFixture, GoldenFixture } from "./ai-quality-contracts"

type ReviewClusterLike = {
  clusterId: string
  decision: "archive_to_topic" | "send_to_inbox" | "discard"
  sourceIds: string[]
  title: string
  topicNameSuggestion: string | null
  topicSlugSuggestion: string | null
}

type ReviewLike = {
  clusters: ReviewClusterLike[]
}

type SourceAssignmentIntegrity = {
  duplicateSourceIds: string[]
  missingSourceIds: string[]
  pass: boolean
  unknownSourceIds: string[]
}

type FractionMetric = {
  correct: number
  rate: number | null
  total: number
}

type PairwiseCounts = {
  falseNegative: number
  falsePositive: number
  truePositive: number
}

type FixtureScore = {
  clusterComparisons: Array<{
    expectedClusterId: string
    overlapCount: number
    predictedClusterId: string | null
  }>
  criticalFailures: string[]
  fixtureId: string
  metrics: {
    clusterPairwiseF1: number
    destinationAccuracy: FractionMetric
    falseArchiveRate: FractionMetric
    newTopicPrecision: FractionMetric
    persistSemanticCorrectness: FractionMetric
    schemaValid: boolean
    sourceAssignmentIntegrity: SourceAssignmentIntegrity
    topicMergeAccuracy: FractionMetric
  }
  overallScore: number
  pairwiseCounts: PairwiseCounts
}

type ScoreAccumulator = {
  destinationCorrect: number
  destinationTotal: number
  falseArchiveCount: number
  falseArchiveTotal: number
  newTopicCorrect: number
  newTopicTotal: number
  pairwiseCounts: PairwiseCounts
  persistCorrect: number
  persistTotal: number
  schemaValidCount: number
  sourceIntegrityPassCount: number
  totalRuns: number
  topicMergeCorrect: number
  topicMergeTotal: number
}

export type AiQualityScoreSummary = {
  gateResults: Array<{
    actual: number
    name: string
    passed: boolean
    threshold: string
  }>
  metrics: {
    clusterPairwiseF1: number
    destinationAccuracy: number
    falseArchiveRate: number
    newTopicPrecision: number | null
    persistSemanticCorrectness: number
    schemaValidRate: number
    sourceAssignmentIntegrityRate: number
    topicMergeAccuracy: number | null
  }
  runs: number
}

export type AiQualityFixtureScore = FixtureScore

export function scoreFixtureRun(
  fixture: BatchFixture,
  golden: GoldenFixture,
  review: ReviewLike | null,
): AiQualityFixtureScore {
  if (!review) {
    return {
      clusterComparisons: [],
      criticalFailures: ["No parsed review was produced for this fixture."],
      fixtureId: fixture.fixtureId,
      metrics: {
        clusterPairwiseF1: 0,
        destinationAccuracy: emptyMetric(),
        falseArchiveRate: emptyMetric(),
        newTopicPrecision: emptyMetric(),
        persistSemanticCorrectness: emptyMetric(),
        schemaValid: false,
        sourceAssignmentIntegrity: {
          duplicateSourceIds: [],
          missingSourceIds: fixture.batch.sourceIds,
          pass: false,
          unknownSourceIds: [],
        },
        topicMergeAccuracy: emptyMetric(),
      },
      overallScore: 0,
      pairwiseCounts: {
        falseNegative: 0,
        falsePositive: 0,
        truePositive: 0,
      },
    }
  }

  const sourceIds = fixture.batch.sourceIds
  const expectedBySource = new Map<string, GoldenFixture["expectedClusters"][number]>()

  for (const cluster of golden.expectedClusters) {
    for (const sourceId of cluster.sourceIds) {
      expectedBySource.set(sourceId, cluster)
    }
  }

  const predictedBySource = new Map<string, ReviewClusterLike>()
  const duplicateSourceIds = new Set<string>()
  const unknownSourceIds = new Set<string>()

  for (const cluster of review.clusters) {
    for (const sourceId of cluster.sourceIds) {
      if (!sourceIds.includes(sourceId)) {
        unknownSourceIds.add(sourceId)
        continue
      }

      if (predictedBySource.has(sourceId)) {
        duplicateSourceIds.add(sourceId)
      }

      predictedBySource.set(sourceId, cluster)
    }
  }

  const missingSourceIds = sourceIds.filter((sourceId) => !predictedBySource.has(sourceId))
  const sourceAssignmentIntegrity = {
    duplicateSourceIds: [...duplicateSourceIds].sort(),
    missingSourceIds,
    pass:
      duplicateSourceIds.size === 0
      && missingSourceIds.length === 0
      && unknownSourceIds.size === 0,
    unknownSourceIds: [...unknownSourceIds].sort(),
  }

  let destinationCorrect = 0
  let falseArchiveCount = 0
  let falseArchiveTotal = 0
  let topicMergeCorrect = 0
  let topicMergeTotal = 0
  let persistCorrect = 0
  let predictedNewTopicCorrect = 0
  const criticalFailures = [...buildIntegrityFailures(sourceAssignmentIntegrity)]

  for (const sourceId of sourceIds) {
    const expectedCluster = expectedBySource.get(sourceId)
    const predictedCluster = predictedBySource.get(sourceId)

    if (!expectedCluster || !predictedCluster) {
      continue
    }

    if (predictedCluster.decision === expectedCluster.expectedDestination) {
      destinationCorrect += 1
    }

    if (expectedCluster.expectedDestination !== "archive_to_topic") {
      falseArchiveTotal += 1
      if (predictedCluster.decision === "archive_to_topic") {
        falseArchiveCount += 1
      }
    }

    if (expectedCluster.topicMode === "existing_topic") {
      topicMergeTotal += 1
      if (
        predictedCluster.decision === "archive_to_topic"
        && resolvePredictedTopicSlug(predictedCluster) === expectedCluster.expectedTopicSlug
      ) {
        topicMergeCorrect += 1
      }
    }

    if (isPersistSemanticMatch(predictedCluster, expectedCluster)) {
      persistCorrect += 1
    }
  }

  const availableTopicSlugSet = new Set(fixture.availableTopicSlugs)
  const predictedNewTopicClusters = review.clusters.filter(
    (cluster) =>
      cluster.decision === "archive_to_topic"
      && !availableTopicSlugSet.has(resolvePredictedTopicSlug(cluster)),
  )

  for (const cluster of predictedNewTopicClusters) {
    const expectedCluster = findBestMatchingExpectedCluster(cluster, golden.expectedClusters)
    if (
      expectedCluster
      && expectedCluster.topicMode === "new_topic"
      && resolvePredictedTopicSlug(cluster) === expectedCluster.expectedTopicSlug
    ) {
      predictedNewTopicCorrect += 1
    }
  }

  const pairwiseCounts = buildPairwiseCounts(sourceIds, expectedBySource, predictedBySource)
  const clusterPairwiseF1 = computePairwiseF1(pairwiseCounts)
  const clusterComparisons = golden.expectedClusters.map((expectedCluster) => {
    const predictedCluster = findBestMatchingPredictedCluster(expectedCluster, review.clusters)
    return {
      expectedClusterId: expectedCluster.clusterId,
      overlapCount: predictedCluster
        ? intersectionSize(new Set(expectedCluster.sourceIds), new Set(predictedCluster.sourceIds))
        : 0,
      predictedClusterId: predictedCluster?.clusterId ?? null,
    }
  })

  if (falseArchiveCount > 0) {
    criticalFailures.push(`False archive count: ${falseArchiveCount}`)
  }
  if (topicMergeTotal > 0 && topicMergeCorrect < topicMergeTotal) {
    criticalFailures.push(
      `Wrong existing-topic merge on ${topicMergeTotal - topicMergeCorrect}/${topicMergeTotal} source assignments.`,
    )
  }

  const destinationAccuracy = fractionMetric(destinationCorrect, sourceIds.length)
  const falseArchiveRate = fractionMetric(falseArchiveCount, falseArchiveTotal)
  const topicMergeAccuracy = fractionMetric(topicMergeCorrect, topicMergeTotal)
  const newTopicPrecision = fractionMetric(
    predictedNewTopicCorrect,
    predictedNewTopicClusters.length,
  )
  const persistSemanticCorrectness = fractionMetric(persistCorrect, sourceIds.length)
  const schemaValid = sourceAssignmentIntegrity.pass
  const overallScore = computeOverallScore({
    clusterPairwiseF1,
    destinationAccuracy: destinationAccuracy.rate,
    falseArchiveRate: falseArchiveRate.rate,
    persistSemanticCorrectness: persistSemanticCorrectness.rate,
    schemaValid,
    sourceAssignmentIntegrity: sourceAssignmentIntegrity.pass ? 1 : 0,
    topicMergeAccuracy: topicMergeAccuracy.rate,
    newTopicPrecision: newTopicPrecision.rate,
  })

  return {
    clusterComparisons,
    criticalFailures,
    fixtureId: fixture.fixtureId,
    metrics: {
      clusterPairwiseF1,
      destinationAccuracy,
      falseArchiveRate,
      newTopicPrecision,
      persistSemanticCorrectness,
      schemaValid,
      sourceAssignmentIntegrity,
      topicMergeAccuracy,
    },
    overallScore,
    pairwiseCounts,
  }
}

export function summarizeScores(scores: AiQualityFixtureScore[]): AiQualityScoreSummary {
  const accumulator: ScoreAccumulator = {
    destinationCorrect: 0,
    destinationTotal: 0,
    falseArchiveCount: 0,
    falseArchiveTotal: 0,
    newTopicCorrect: 0,
    newTopicTotal: 0,
    pairwiseCounts: {
      falseNegative: 0,
      falsePositive: 0,
      truePositive: 0,
    },
    persistCorrect: 0,
    persistTotal: 0,
    schemaValidCount: 0,
    sourceIntegrityPassCount: 0,
    totalRuns: scores.length,
    topicMergeCorrect: 0,
    topicMergeTotal: 0,
  }

  for (const score of scores) {
    accumulator.destinationCorrect += score.metrics.destinationAccuracy.correct
    accumulator.destinationTotal += score.metrics.destinationAccuracy.total
    accumulator.falseArchiveCount += score.metrics.falseArchiveRate.correct
    accumulator.falseArchiveTotal += score.metrics.falseArchiveRate.total
    accumulator.newTopicCorrect += score.metrics.newTopicPrecision.correct
    accumulator.newTopicTotal += score.metrics.newTopicPrecision.total
    accumulator.pairwiseCounts.falseNegative += score.pairwiseCounts.falseNegative
    accumulator.pairwiseCounts.falsePositive += score.pairwiseCounts.falsePositive
    accumulator.pairwiseCounts.truePositive += score.pairwiseCounts.truePositive
    accumulator.persistCorrect += score.metrics.persistSemanticCorrectness.correct
    accumulator.persistTotal += score.metrics.persistSemanticCorrectness.total
    accumulator.schemaValidCount += score.metrics.schemaValid ? 1 : 0
    accumulator.sourceIntegrityPassCount += score.metrics.sourceAssignmentIntegrity.pass ? 1 : 0
    accumulator.topicMergeCorrect += score.metrics.topicMergeAccuracy.correct
    accumulator.topicMergeTotal += score.metrics.topicMergeAccuracy.total
  }

  const metrics = {
    clusterPairwiseF1: computePairwiseF1(accumulator.pairwiseCounts),
    destinationAccuracy: safeRate(accumulator.destinationCorrect, accumulator.destinationTotal),
    falseArchiveRate: safeRate(accumulator.falseArchiveCount, accumulator.falseArchiveTotal),
    newTopicPrecision:
      accumulator.newTopicTotal > 0
        ? safeRate(accumulator.newTopicCorrect, accumulator.newTopicTotal)
        : null,
    persistSemanticCorrectness: safeRate(accumulator.persistCorrect, accumulator.persistTotal),
    schemaValidRate: safeRate(accumulator.schemaValidCount, accumulator.totalRuns),
    sourceAssignmentIntegrityRate: safeRate(
      accumulator.sourceIntegrityPassCount,
      accumulator.totalRuns,
    ),
    topicMergeAccuracy:
      accumulator.topicMergeTotal > 0
        ? safeRate(accumulator.topicMergeCorrect, accumulator.topicMergeTotal)
        : null,
  }

  return {
    gateResults: [
      {
        actual: metrics.schemaValidRate,
        name: "schema_valid_rate",
        passed: metrics.schemaValidRate >= 0.98,
        threshold: ">= 0.98",
      },
      {
        actual: metrics.sourceAssignmentIntegrityRate,
        name: "source_assignment_integrity",
        passed: metrics.sourceAssignmentIntegrityRate === 1,
        threshold: "= 1.00",
      },
      {
        actual: metrics.falseArchiveRate,
        name: "false_archive_rate",
        passed: metrics.falseArchiveRate <= 0.05,
        threshold: "<= 0.05",
      },
      {
        actual: metrics.destinationAccuracy,
        name: "destination_accuracy",
        passed: metrics.destinationAccuracy >= 0.85,
        threshold: ">= 0.85",
      },
      {
        actual: metrics.topicMergeAccuracy ?? 0,
        name: "topic_merge_accuracy",
        passed: metrics.topicMergeAccuracy == null || metrics.topicMergeAccuracy >= 0.8,
        threshold: ">= 0.80",
      },
    ],
    metrics,
    runs: accumulator.totalRuns,
  }
}

function buildIntegrityFailures(integrity: SourceAssignmentIntegrity) {
  const failures: string[] = []

  if (integrity.unknownSourceIds.length > 0) {
    failures.push(`Unknown sourceIds: ${integrity.unknownSourceIds.join(", ")}`)
  }
  if (integrity.duplicateSourceIds.length > 0) {
    failures.push(`Duplicate sourceIds: ${integrity.duplicateSourceIds.join(", ")}`)
  }
  if (integrity.missingSourceIds.length > 0) {
    failures.push(`Missing sourceIds: ${integrity.missingSourceIds.join(", ")}`)
  }

  return failures
}

function emptyMetric(): FractionMetric {
  return {
    correct: 0,
    rate: null,
    total: 0,
  }
}

function fractionMetric(correct: number, total: number): FractionMetric {
  return {
    correct,
    rate: total > 0 ? correct / total : null,
    total,
  }
}

function safeRate(correct: number, total: number) {
  if (total <= 0) {
    return 0
  }

  return correct / total
}

function buildPairwiseCounts(
  sourceIds: string[],
  expectedBySource: Map<string, GoldenFixture["expectedClusters"][number]>,
  predictedBySource: Map<string, ReviewClusterLike>,
): PairwiseCounts {
  const counts: PairwiseCounts = {
    falseNegative: 0,
    falsePositive: 0,
    truePositive: 0,
  }

  for (let leftIndex = 0; leftIndex < sourceIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sourceIds.length; rightIndex += 1) {
      const leftId = sourceIds[leftIndex]
      const rightId = sourceIds[rightIndex]
      const expectedSame =
        expectedBySource.get(leftId)?.clusterId === expectedBySource.get(rightId)?.clusterId
      const predictedSame =
        predictedBySource.get(leftId)?.clusterId === predictedBySource.get(rightId)?.clusterId

      if (expectedSame && predictedSame) {
        counts.truePositive += 1
      } else if (!expectedSame && predictedSame) {
        counts.falsePositive += 1
      } else if (expectedSame && !predictedSame) {
        counts.falseNegative += 1
      }
    }
  }

  return counts
}

function computePairwiseF1(counts: PairwiseCounts) {
  const precision =
    counts.truePositive + counts.falsePositive > 0
      ? counts.truePositive / (counts.truePositive + counts.falsePositive)
      : 1
  const recall =
    counts.truePositive + counts.falseNegative > 0
      ? counts.truePositive / (counts.truePositive + counts.falseNegative)
      : 1

  if (precision + recall === 0) {
    return 0
  }

  return (2 * precision * recall) / (precision + recall)
}

function resolvePredictedTopicSlug(cluster: ReviewClusterLike) {
  const raw =
    cluster.topicSlugSuggestion?.trim()
    || cluster.topicNameSuggestion?.trim()
    || cluster.title.trim()

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  return normalized || "new-topic"
}

function isPersistSemanticMatch(
  predictedCluster: ReviewClusterLike,
  expectedCluster: GoldenFixture["expectedClusters"][number],
) {
  if (predictedCluster.decision !== expectedCluster.expectedDestination) {
    return false
  }

  if (predictedCluster.decision !== "archive_to_topic") {
    return true
  }

  return resolvePredictedTopicSlug(predictedCluster) === expectedCluster.expectedTopicSlug
}

function findBestMatchingExpectedCluster(
  cluster: ReviewClusterLike,
  expectedClusters: GoldenFixture["expectedClusters"],
) {
  let bestCluster: GoldenFixture["expectedClusters"][number] | null = null
  let bestOverlap = 0

  for (const expectedCluster of expectedClusters) {
    const overlap = intersectionSize(new Set(cluster.sourceIds), new Set(expectedCluster.sourceIds))
    if (overlap > bestOverlap) {
      bestCluster = expectedCluster
      bestOverlap = overlap
    }
  }

  return bestCluster
}

function findBestMatchingPredictedCluster(
  expectedCluster: GoldenFixture["expectedClusters"][number],
  predictedClusters: ReviewLike["clusters"],
) {
  let bestCluster: ReviewLike["clusters"][number] | null = null
  let bestOverlap = 0

  for (const predictedCluster of predictedClusters) {
    const overlap = intersectionSize(
      new Set(expectedCluster.sourceIds),
      new Set(predictedCluster.sourceIds),
    )
    if (overlap > bestOverlap) {
      bestCluster = predictedCluster
      bestOverlap = overlap
    }
  }

  return bestCluster
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let count = 0

  for (const value of left) {
    if (right.has(value)) {
      count += 1
    }
  }

  return count
}

function mean(values: number[]) {
  if (!values.length) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function computeOverallScore(input: {
  clusterPairwiseF1: number
  destinationAccuracy: number | null
  falseArchiveRate: number | null
  newTopicPrecision: number | null
  persistSemanticCorrectness: number | null
  schemaValid: boolean
  sourceAssignmentIntegrity: number
  topicMergeAccuracy: number | null
}) {
  const routingScore = mean([
    input.destinationAccuracy ?? 0,
    input.falseArchiveRate == null ? 0 : 1 - input.falseArchiveRate,
    input.sourceAssignmentIntegrity,
  ])
  const topicScore = mean(
    [input.topicMergeAccuracy, input.newTopicPrecision].filter(
      (value): value is number => value != null,
    ),
  )

  return (
    routingScore * 0.4
    + input.clusterPairwiseF1 * 0.25
    + topicScore * 0.2
    + (input.persistSemanticCorrectness ?? 0) * 0.1
    + (input.schemaValid ? 1 : 0) * 0.05
  )
}
