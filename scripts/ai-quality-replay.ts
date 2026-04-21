import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { createOpenAI } from "@ai-sdk/openai"
import { generateText, Output, streamText, type FinishReason } from "ai"

import {
  MODEL_SCHEMA_VERSION,
  modelBatchDecisionSchema,
  type ModelBatchDecision,
} from "../src/features/ai/schemas/model-output"
import {
  batchReviewSchemaDescription,
  batchReviewSchemaName,
  prepareBatchReviewPromptBundle,
  runBatchReview,
  type BatchReviewExecutor,
  type BatchReviewProgress,
  type BatchReviewProviderMetadata,
} from "../src/features/ai/legacy-review/batch-review-engine"
import { buildMockBatchReview } from "../src/features/ai/legacy-review/mock-review"
import {
  batchFixtureSchema,
  datasetManifestSchema,
  goldenFixtureSchema,
  topicIndexFixtureSchema,
  type BatchFixture,
  type DatasetManifest,
  type GoldenFixture,
  type TopicIndexFixture,
} from "./lib/ai-quality-contracts"
import { scoreFixtureRun, summarizeScores } from "./lib/ai-quality-scorer"

const rawArgs = process.argv.slice(2)
const [command = "run", ...restArgs] = rawArgs
const options = parseArgs(restArgs)
const projectRoot = process.cwd()
const fixturesRoot = path.join(projectRoot, "fixtures", "ai-quality")
const experimentsRoot = path.join(fixturesRoot, "experiments")
const defaultMode = (options.mode ?? "mock") as ReplayMode
const defaultPipeline = (options.pipeline ?? "legacy") as ReplayPipeline
const defaultSplit = (options.split ?? "dev") as "dev" | "holdout" | "all"
const defaultProfile = (options.profile ?? "preview") as "preview" | "production"
const runnerVersion = "tino.ai_quality.replay.v0.1"
const legacyRetrievalVersion = "tino.topic_lexical.v1"
const legacyPromptVersion = "tino.batch_review.engine.v6"
const backgroundRetrievalVersion = "tino.background_compile.topic_select.v1"
const backgroundPromptVersion = "tino.background_compile.provider_prompt.v1"
const comparisonDeltaThreshold = 0.01

type ReplayMode = "mock" | "live"
type ReplayPipeline = "legacy" | "background"
type ReplayLocale = "en-US" | "zh-CN"
type ReplayReview = ModelBatchDecision
type ReplayScore = ReturnType<typeof scoreFixtureRun>

type ReplayArtifactSummary = {
  createdAt: string
  experimentId: string
  fixtureId: string
  generationMode: ReplayMode
  model: string | null
  parsedReview: ReplayReview | null
  pipeline: ReplayPipeline
  pipelineMetadata: {
    sourceKind: string | null
    sourceLabel: string | null
  } | null
  promptVersion: string
  scoringResult: ReplayScore
  validationErrors: string[]
}

type BackgroundReplayBundle = {
  fixtures: Array<{
    availableTopics: TopicIndexFixture["entries"]
    batch: {
      captureCount: number
      createdAt: string
      firstCapturedAt: string
      id: string
      lastCapturedAt: string
      runtimeState: string
      sourceIds: string[]
      triggerReason: string
    }
    captures: BatchFixture["captures"]
    fixtureId: string
  }>
  locale: ReplayLocale
  mode: ReplayMode
  provider: {
    apiKey: string
    baseUrl: string
    model: string
    name: string
    vendor: "openai" | "deepseek"
  } | null
}

type BackgroundReplayResponse = {
  results: Array<{
    decisions: Array<{
      confidence: number
      decisionId: string
      disposition: "write_topic" | "write_inbox" | "discard_noise"
      keyPoints: string[]
      rationale: string
      sourceCaptureIds: string[]
      summary: string
      tags: string[]
      title: string
      topicName: string | null
      topicSlug: string | null
    }>
    error: string | null
    fixtureId: string
    sourceKind: "injected_mock" | "provider_profile"
    sourceLabel: string
  }>
}

type ReplayRunRecord = {
  artifact: ReplayArtifactSummary
  artifactPath: string
  fixture: BatchFixture
  golden: GoldenFixture
}

type ReplayCaseNarrative = {
  actual: string
  expected: string
  failures: string[]
  fixtureId: string
  scenario: string
  score: number
  why: string | null
}

type ReplayComparisonCase = {
  after: string
  before: string
  currentScore: number
  delta: number
  expected: string
  fixtureId: string
  previousScore: number
  scenario: string
  why: string | null
}

type ReplayComparison = {
  compareToExperimentId: string
  comparedRuns: number
  improved: ReplayComparisonCase[]
  metricDiffs: Array<{
    after: number | null
    before: number | null
    delta: number | null
    name: string
  }>
  missingFixtureIds: string[]
  regressed: ReplayComparisonCase[]
  unchangedCount: number
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})

async function main() {
  switch (command) {
    case "run":
      await runReplay()
      return
    case "help":
    case "--help":
    case "-h":
      printUsage()
      return
    default:
      printUsage()
      process.exitCode = 1
  }
}

async function runReplay() {
  const promptVersion =
    defaultPipeline === "background" ? backgroundPromptVersion : legacyPromptVersion
  const retrievalVersion =
    defaultPipeline === "background" ? backgroundRetrievalVersion : legacyRetrievalVersion
  const manifest = readJson(
    path.join(fixturesRoot, "manifests", "dataset.v0.1.json"),
    datasetManifestSchema,
  )
  const topicIndex = readJson(
    path.join(fixturesRoot, "topics", "topic-index.v0.1.json"),
    topicIndexFixtureSchema,
  )

  const fixtures = loadFixtures({
    fixtureId: options.fixture,
    limit: parseOptionalPositiveInt(options.limit),
    manifest,
    split: defaultSplit,
  })

  if (!fixtures.length) {
    throw new Error("No fixtures matched the requested replay selection.")
  }

  const experimentId = options["experiment-id"] ?? buildExperimentId(experimentsRoot)
  const experimentDir = path.join(experimentsRoot, experimentId)
  const runsDir = path.join(experimentDir, "runs")
  const reportsDir = path.join(experimentDir, "reports")
  fs.mkdirSync(runsDir, { recursive: true })
  fs.mkdirSync(reportsDir, { recursive: true })

  const liveConfig =
    defaultMode === "live"
      ? resolveLiveProviderConfig({
          apiKey: options["api-key"] ?? process.env.OPENAI_API_KEY ?? "",
          baseUrl: options["base-url"] ?? process.env.TINO_AI_BASE_URL ?? "",
          model: options.model ?? process.env.TINO_AI_MODEL ?? "",
          profile: defaultProfile,
          settingsPath: options["settings-path"],
          vendor: normalizeVendor(options.vendor ?? process.env.TINO_AI_VENDOR ?? ""),
        })
      : null
  const replayLocale = resolveReplayLocale({
    explicitLocale: options.locale,
    profile: defaultProfile,
    settingsPath: options["settings-path"],
  })
  const backgroundResultsByFixture =
    defaultPipeline === "background"
      ? runBackgroundReplayBundle({
          fixtures,
          liveConfig,
          locale: replayLocale,
          mode: defaultMode,
          topicIndex,
        })
      : new Map<string, BackgroundReplayResponse["results"][number]>()

  const runArtifacts: Array<{
    artifactPath: string
    fixtureId: string
    overallScore: number
  }> = []
  const runRecords: ReplayRunRecord[] = []
  const scores: ReplayScore[] = []

  console.log(
    `Running AI quality replay: experiment=${experimentId} pipeline=${defaultPipeline} mode=${defaultMode} fixtures=${fixtures.length}`,
  )

  for (const item of fixtures) {
    const startedAt = new Date().toISOString()
    const runId = `run_${item.fixture.fixtureId}_${crypto.randomBytes(4).toString("hex")}`
    const payload = {
      batch: item.fixture.batch,
      captures: item.fixture.captures,
      availableTopics: resolveAvailableTopics(item.fixture, topicIndex),
    }
    const prompt =
      defaultPipeline === "legacy" ? prepareBatchReviewPromptBundle(payload) : null
    let parsedReview: ReplayReview | null = null
    let providerMetadata: BatchReviewProviderMetadata | null = null
    let pipelineMetadata: ReplayArtifactSummary["pipelineMetadata"] = null
    let rawResponseText: string | null = null
    let usedFallback = false
    let validationErrors: string[] = []

    try {
      if (defaultPipeline === "legacy") {
        if (defaultMode === "mock") {
          parsedReview = buildMockBatchReview(payload)
          providerMetadata = buildMockProviderMetadata()
          rawResponseText = JSON.stringify({ clusters: parsedReview.clusters }, null, 2)
        } else {
          const executor = createNodeBatchReviewExecutor(liveConfig!)
          const result = await runBatchReview(payload, executor, {
            onProgress: createProgressLogger(item.fixture.fixtureId),
            timeoutMs: parseOptionalPositiveInt(options.timeout) ?? 120_000,
          })
          parsedReview = result.review
          providerMetadata = result.metadata
          rawResponseText = result.rawResponseText
          usedFallback = result.usedFallback
        }
      } else {
        const backgroundResult = backgroundResultsByFixture.get(item.fixture.fixtureId)
        if (!backgroundResult) {
          throw new Error(
            `Background replay result was not returned for fixture ${item.fixture.fixtureId}.`,
          )
        }

        pipelineMetadata = {
          sourceKind: backgroundResult.sourceKind,
          sourceLabel: backgroundResult.sourceLabel,
        }
        rawResponseText = JSON.stringify(
          { decisions: backgroundResult.decisions },
          null,
          2,
        )

        if (backgroundResult.error) {
          throw new Error(backgroundResult.error)
        }

        parsedReview = mapBackgroundResultToReplayReview(backgroundResult)
      }
    } catch (error) {
      validationErrors = [error instanceof Error ? error.message : String(error)]
    }

    const scoringResult = scoreFixtureRun(item.fixture, item.golden, parsedReview)
    const persistProjection = parsedReview
      ? buildPersistProjection(parsedReview, startedAt)
      : {
          mocked: true,
          outputs: [],
        }

    const artifact = {
      createdAt: startedAt,
      experimentId,
      fixtureChecksum: item.fixtureChecksum,
      fixtureId: item.fixture.fixtureId,
      generationMode: defaultMode,
      model:
        defaultPipeline === "legacy"
          ? providerMetadata?.model ?? null
          : null,
      parsedReview,
      persistDryRunResult: persistProjection,
      pipeline: defaultPipeline,
      pipelineMetadata,
      promptText: prompt
        ? {
            system: prompt.systemPrompt,
            user: prompt.userPrompt,
          }
        : null,
      promptVersion,
      provider:
        defaultMode === "mock"
          ? "mock"
          : {
              baseUrl: liveConfig?.baseUrl ?? null,
              label:
                defaultPipeline === "legacy"
                  ? providerMetadata?.providerLabel ?? null
                  : null,
              vendor: liveConfig?.vendor ?? null,
            },
      providerMetadata,
      rawResponseText,
      retrievalVersion,
      runId,
      runnerVersion,
      scoringResult,
      schemaVersion: MODEL_SCHEMA_VERSION,
      selectedTopics: prompt?.relevantTopics ?? null,
      split: item.fixture.split,
      usedFallback,
      validationErrors,
    }
    const artifactSummary: ReplayArtifactSummary = {
      createdAt: startedAt,
      experimentId,
      fixtureId: item.fixture.fixtureId,
      generationMode: defaultMode,
      model:
        defaultPipeline === "legacy"
          ? providerMetadata?.model ?? null
          : null,
      parsedReview,
      pipeline: defaultPipeline,
      pipelineMetadata,
      promptVersion,
      scoringResult,
      validationErrors,
    }

    const artifactPath = path.join(runsDir, `${item.fixture.fixtureId}.json`)
    fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`)
    const relativeArtifactPath = path.relative(experimentDir, artifactPath)
    runArtifacts.push({
      artifactPath: relativeArtifactPath,
      fixtureId: item.fixture.fixtureId,
      overallScore: scoringResult.overallScore,
    })
    runRecords.push({
      artifact: artifactSummary,
      artifactPath: relativeArtifactPath,
      fixture: item.fixture,
      golden: item.golden,
    })
    scores.push(scoringResult)
    console.log(
      `${validationErrors.length === 0 ? "OK" : "ERR"} ${item.fixture.fixtureId} score=${scoringResult.overallScore.toFixed(3)}`,
    )
  }

  const summary = summarizeScores(scores)
  const comparison = options["compare-to"]
    ? buildExperimentComparison({
        compareToExperimentId: options["compare-to"],
        currentRuns: runRecords,
      })
    : null
  const topFailures = buildFailureNarratives(runRecords, 5)
  const summaryJsonPath = path.join(reportsDir, "summary.json")
  const summaryMdPath = path.join(reportsDir, "summary.md")
  const experimentManifestPath = path.join(experimentDir, "manifest.json")

  fs.writeFileSync(
    summaryJsonPath,
    `${JSON.stringify(
      {
        experimentId,
        mode: defaultMode,
        pipeline: defaultPipeline,
        promptVersion,
        runnerVersion,
        summary,
        comparison,
        topFailures,
      },
      null,
      2,
    )}\n`,
  )
  fs.writeFileSync(
    summaryMdPath,
    buildSummaryMarkdown({
      comparison,
      experimentId,
      mode: defaultMode,
      pipeline: defaultPipeline,
      promptVersion,
      summary,
      topFailures,
    }),
  )
  fs.writeFileSync(
    experimentManifestPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        experimentId,
        fixtureCount: fixtures.length,
        fixtures: fixtures.map((item) => item.fixture.fixtureId),
        mode: defaultMode,
        pipeline: defaultPipeline,
        provider:
          defaultMode === "live"
            ? {
                baseUrl: liveConfig?.baseUrl ?? null,
                model: liveConfig?.model ?? null,
                vendor: liveConfig?.vendor ?? null,
              }
            : "mock",
        runArtifacts,
        runnerVersion,
        split: defaultSplit,
      },
      null,
      2,
    )}\n`,
  )

  console.log(`Wrote experiment manifest: ${path.relative(projectRoot, experimentManifestPath)}`)
  console.log(`Wrote summary report: ${path.relative(projectRoot, summaryMdPath)}`)
}

function loadFixtures(input: {
  fixtureId?: string
  limit: number | null
  manifest: DatasetManifest
  split: "dev" | "holdout" | "all"
}) {
  const requestedFixtureIds = input.fixtureId
    ? new Set(
        input.fixtureId
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      )
    : null

  const fixtureMeta = input.manifest.fixtures.filter((entry) => {
    if (input.split !== "all" && entry.split !== input.split) {
      return false
    }

    if (requestedFixtureIds && !requestedFixtureIds.has(entry.fixtureId)) {
      return false
    }

    return true
  })

  const limitedMeta = input.limit ? fixtureMeta.slice(0, input.limit) : fixtureMeta

  return limitedMeta.map((meta) => {
    const fixturePath = path.join(fixturesRoot, "batches", meta.split, `${meta.fixtureId}.json`)
    const goldenPath = path.join(fixturesRoot, "goldens", meta.split, `${meta.fixtureId}.json`)
    const fixtureRaw = fs.readFileSync(fixturePath, "utf8")

    return {
      fixture: batchFixtureSchema.parse(JSON.parse(fixtureRaw)) as BatchFixture,
      fixtureChecksum: checksum(fixtureRaw),
      golden: readJson(goldenPath, goldenFixtureSchema) as GoldenFixture,
    }
  })
}

function resolveAvailableTopics(fixture: BatchFixture, topicIndex: TopicIndexFixture) {
  const entriesBySlug = new Map(
    topicIndex.entries.map((entry) => [entry.topicSlug, entry]),
  )

  return fixture.availableTopicSlugs.map((topicSlug) => {
    const entry = entriesBySlug.get(topicSlug)
    if (!entry) {
      throw new Error(
        `Fixture ${fixture.fixtureId} references missing topic slug "${topicSlug}".`,
      )
    }

    return entry
  })
}

function buildMockProviderMetadata(): BatchReviewProviderMetadata {
  return {
    apiMode: "responses",
    durationMs: 0,
    finishReason: "stop" satisfies FinishReason,
    inputTokens: undefined,
    model: "mock-batch-review",
    outputTokens: undefined,
    providerLabel: "Mock Generator",
    responseModel: "mock-batch-review",
  }
}

function buildPersistProjection(
  review: ReplayReview,
  submittedAt: string,
) {
  const inboxDate = submittedAt.slice(0, 10)

  return {
    mocked: true,
    outputs: review.clusters.map((cluster) => {
      if (cluster.decision === "discard") {
        return {
          clusterId: cluster.clusterId,
          destination: "discard",
          filePath: null,
          topicName: null,
          topicSlug: null,
        }
      }

      if (cluster.decision === "send_to_inbox") {
        return {
          clusterId: cluster.clusterId,
          destination: "inbox",
          filePath: `_inbox/${inboxDate}.md`,
          topicName: null,
          topicSlug: null,
        }
      }

      const topicSlug = resolveTopicSlug(cluster)
      return {
        clusterId: cluster.clusterId,
        destination: "topic",
        filePath: `topics/${topicSlug}.md`,
        topicName: cluster.topicNameSuggestion?.trim() || cluster.title.trim() || topicSlug,
        topicSlug,
      }
    }),
  }
}

function resolveTopicSlug(cluster: {
  title: string
  topicNameSuggestion: string | null
  topicSlugSuggestion: string | null
}) {
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

function runBackgroundReplayBundle(input: {
  fixtures: Array<{
    fixture: BatchFixture
    fixtureChecksum: string
    golden: GoldenFixture
  }>
  liveConfig: ReturnType<typeof resolveLiveProviderConfig> | null
  locale: ReplayLocale
  mode: ReplayMode
  topicIndex: TopicIndexFixture
}) {
  const bundle: BackgroundReplayBundle = {
    fixtures: input.fixtures.map((item) => ({
      availableTopics: resolveAvailableTopics(item.fixture, input.topicIndex),
      batch: {
        captureCount: item.fixture.batch.captureCount,
        createdAt: item.fixture.batch.createdAt,
        firstCapturedAt: item.fixture.batch.firstCapturedAt,
        id: item.fixture.batch.id,
        lastCapturedAt: item.fixture.batch.lastCapturedAt,
        runtimeState: item.fixture.batch.runtimeState,
        sourceIds: item.fixture.batch.sourceIds,
        triggerReason: item.fixture.batch.triggerReason,
      },
      captures: item.fixture.captures,
      fixtureId: item.fixture.fixtureId,
    })),
    locale: input.locale,
    mode: input.mode,
    provider:
      input.mode === "live" && input.liveConfig
        ? {
            apiKey: input.liveConfig.apiKey,
            baseUrl: input.liveConfig.baseUrl,
            model: input.liveConfig.model,
            name: "AI Quality Replay",
            vendor: input.liveConfig.vendor,
          }
        : null,
  }

  try {
    const stdout = execFileSync(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--bin",
        "ai_quality_compile",
        "--",
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        input: `${JSON.stringify(bundle)}\n`,
        maxBuffer: 10 * 1024 * 1024,
      },
    )
    const parsed = JSON.parse(stdout) as BackgroundReplayResponse
    return new Map(parsed.results.map((result) => [result.fixtureId, result]))
  } catch (error) {
    const stderr =
      typeof error === "object"
      && error
      && "stderr" in error
      && typeof error.stderr === "string"
        ? error.stderr.trim()
        : ""
    const message =
      error instanceof Error ? error.message : "Background replay command failed."
    throw new Error(
      stderr ? `${message}\n${stderr}` : message,
    )
  }
}

function mapBackgroundResultToReplayReview(
  result: BackgroundReplayResponse["results"][number],
): ReplayReview {
  return {
    clusters: result.decisions.map((decision) => ({
      clusterId: decision.decisionId,
      confidence: decision.confidence,
      decision: mapBackgroundDisposition(decision.disposition),
      keyPoints: decision.keyPoints.length ? decision.keyPoints : ["No stable key point extracted."],
      missingContext: [],
      possibleTopics: [],
      reason: decision.rationale,
      sourceIds: decision.sourceCaptureIds,
      summary: decision.summary.trim() || "Summary unavailable.",
      tags: decision.tags,
      title: decision.title.trim() || "Untitled cluster",
      topicNameSuggestion: decision.topicName,
      topicSlugSuggestion: decision.topicSlug,
    })),
  }
}

function mapBackgroundDisposition(
  disposition: BackgroundReplayResponse["results"][number]["decisions"][number]["disposition"],
) {
  switch (disposition) {
    case "write_topic":
      return "archive_to_topic" as const
    case "write_inbox":
      return "send_to_inbox" as const
    case "discard_noise":
      return "discard" as const
  }
}

function createProgressLogger(fixtureId: string) {
  let lastEventCount = -1
  let lastLoggedChars = -1
  let lastLoggedPhase: BatchReviewProgress["phase"] | null = null

  return (progress: BatchReviewProgress) => {
    if (progress.eventCount === lastEventCount) {
      return
    }

    lastEventCount = progress.eventCount
    if (progress.eventCount === 0) {
      return
    }

    const shouldLog =
      progress.phase !== lastLoggedPhase
      || progress.eventCount % 100 === 0
      || progress.receivedChars - lastLoggedChars >= 400

    if (!shouldLog) {
      return
    }

    lastLoggedPhase = progress.phase
    lastLoggedChars = progress.receivedChars

    console.log(
      `  progress fixture=${fixtureId} phase=${progress.phase} events=${progress.eventCount} chars=${progress.receivedChars}`,
    )
  }
}

function createNodeBatchReviewExecutor(config: {
  apiKey: string
  baseUrl: string
  model: string
  vendor: "openai" | "deepseek"
}): BatchReviewExecutor {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "")
  const apiMode = resolveApiMode(config.vendor, baseUrl, config.model)
  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: baseUrl,
    name: apiMode === "chat" ? "openai-chat" : "openai-responses",
  })
  const model =
    apiMode === "chat"
      ? provider.chat(config.model)
      : provider.responses(config.model)

  return {
    async generateObject({ systemPrompt, userPrompt, timeoutMs, onTextStream }) {
      const startedAt = performance.now()
      const output = Output.object({
        schema: modelBatchDecisionSchema,
        name: batchReviewSchemaName,
        description: batchReviewSchemaDescription,
      })
      let eventCount = 0
      let firstReasoningLatencyMs: number | null = null
      let firstTextLatencyMs: number | null = null
      let lastEventType: string | null = null
      let reasoningChars = 0
      let reasoningText = ""
      let receivedChars = 0
      let streamedText = ""

      onTextStream?.({
        eventCount,
        firstReasoningLatencyMs,
        firstTextLatencyMs,
        lastEventType,
        phase: "starting",
        receivedChars,
        reasoningChars,
        reasoningText,
        text: streamedText,
      })

      const streamResult = streamText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        timeout: {
          totalMs: timeoutMs ?? 120_000,
        },
        maxRetries: 3,
        includeRawChunks: true,
        experimental_include: { requestBody: true },
        onChunk: ({ chunk }) => {
          eventCount += 1
          lastEventType = chunk.type

          if (chunk.type === "reasoning-delta") {
            reasoningChars += chunk.text.length
            reasoningText = appendPreviewText(reasoningText, chunk.text)
            if (firstReasoningLatencyMs == null) {
              firstReasoningLatencyMs = Math.round(performance.now() - startedAt)
            }
          }

          if (chunk.type === "text-delta") {
            receivedChars += chunk.text.length
            streamedText = appendPreviewText(streamedText, chunk.text)
            if (firstTextLatencyMs == null) {
              firstTextLatencyMs = Math.round(performance.now() - startedAt)
            }
          }

          onTextStream?.({
            eventCount,
            firstReasoningLatencyMs,
            firstTextLatencyMs,
            lastEventType,
            phase: "streaming",
            receivedChars,
            reasoningChars,
            reasoningText,
            text: streamedText,
          })
        },
      })
      const steps = await Promise.resolve(streamResult.steps)
      const finalStep = steps.at(-1)

      if (!finalStep) {
        throw new Error("Provider stream completed without a final step.")
      }

      const object = await output.parseCompleteOutput(
        { text: finalStep.text },
        {
          finishReason: finalStep.finishReason,
          response: finalStep.response,
          usage: finalStep.usage,
        },
      )

      return {
        metadata: {
          apiMode,
          durationMs: Math.round(performance.now() - startedAt),
          finishReason: finalStep.finishReason,
          inputTokens: finalStep.usage.inputTokens,
          model: config.model,
          outputTokens: finalStep.usage.outputTokens,
          providerLabel: `${config.vendor}:${config.model}`,
          responseModel: finalStep.response.modelId,
        },
        object,
        rawText: finalStep.text,
      }
    },
    async generateText({ systemPrompt, userPrompt, timeoutMs }) {
      const startedAt = performance.now()
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
        timeout: timeoutMs ?? 30_000,
        maxRetries: 3,
      })

      return {
        metadata: {
          apiMode,
          durationMs: Math.round(performance.now() - startedAt),
          finishReason: result.finishReason,
          inputTokens: result.usage.inputTokens,
          model: config.model,
          outputTokens: result.usage.outputTokens,
          providerLabel: `${config.vendor}:${config.model}`,
          responseModel: result.response.modelId,
        },
        text: result.text,
      }
    },
  }
}

function resolveLiveProviderConfig(config: {
  apiKey: string
  baseUrl: string
  model: string
  profile: "preview" | "production"
  settingsPath?: string
  vendor: "openai" | "deepseek" | null
}) {
  const explicit = {
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
    vendor: config.vendor,
  }
  const settings = loadRuntimeSettings(config.settingsPath, config.profile)
  const settingsProvider = settings?.provider ?? null

  const vendor = explicit.vendor ?? settingsProvider?.vendor ?? null
  if (!vendor) {
    throw new Error("Unable to resolve provider vendor from CLI/env or app settings.")
  }

  const normalized = {
    apiKey: explicit.apiKey || settingsProvider?.apiKey || "",
    baseUrl:
      explicit.baseUrl || settingsProvider?.baseUrl || defaultBaseUrlForVendor(vendor),
    model:
      explicit.model
      || settingsProvider?.model
      || defaultModelForVendor(vendor),
    settingsPath: settingsProvider?.settingsPath ?? null,
    vendor,
  }

  if (!normalized.baseUrl) {
    throw new Error("Missing provider base URL for live replay mode.")
  }
  if (!normalized.apiKey) {
    throw new Error("Missing provider API key for live replay mode.")
  }
  if (!normalized.model) {
    throw new Error("Missing provider model for live replay mode.")
  }

  return normalized
}

function resolveReplayLocale(config: {
  explicitLocale?: string
  profile: "preview" | "production"
  settingsPath?: string
}): ReplayLocale {
  const explicitLocale = normalizeReplayLocale(config.explicitLocale ?? "")
  if (explicitLocale) {
    return explicitLocale
  }

  return loadRuntimeSettings(config.settingsPath, config.profile)?.locale ?? "en-US"
}

function loadRuntimeSettings(
  explicitSettingsPath: string | undefined,
  profile: "preview" | "production",
) {
  const settingsPath =
    explicitSettingsPath?.trim() || resolveDefaultSettingsPath(profile)

  if (!settingsPath || !fs.existsSync(settingsPath)) {
    if (explicitSettingsPath) {
      throw new Error(`Settings file not found: ${settingsPath}`)
    }

    return null
  }

  const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
    activeRuntimeProviderId?: string
    localePreference?: {
      locale?: string
    }
    runtimeProviderProfiles?: Array<{
      apiKey?: string
      baseUrl?: string
      id?: string
      model?: string
      vendor?: string
    }>
  }

  const profiles = Array.isArray(raw.runtimeProviderProfiles)
    ? raw.runtimeProviderProfiles
    : []
  const activeProvider =
    profiles.find((profileItem) => profileItem.id === raw.activeRuntimeProviderId)
    ?? profiles[0]
    ?? null

  if (!activeProvider) {
    return {
      locale: normalizeReplayLocale(raw.localePreference?.locale ?? "") ?? "en-US",
      provider: null,
      settingsPath,
    }
  }

  const vendor = normalizeVendor(activeProvider.vendor ?? "")
  if (!vendor) {
    throw new Error(`Unsupported provider vendor in settings: ${activeProvider.vendor ?? ""}`)
  }

  return {
    locale: normalizeReplayLocale(raw.localePreference?.locale ?? "") ?? "en-US",
    provider: {
      apiKey: activeProvider.apiKey?.trim() ?? "",
      baseUrl: activeProvider.baseUrl?.trim() ?? defaultBaseUrlForVendor(vendor),
      model: activeProvider.model?.trim() || defaultModelForVendor(vendor),
      vendor,
    },
    settingsPath,
  }
}

function resolveDefaultSettingsPath(profile: "preview" | "production") {
  const channel = profile === "production" ? "production" : "shared"
  return path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Tino",
    channel,
    "settings.json",
  )
}

function normalizeVendor(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === "openai" || normalized === "deepseek") {
    return normalized
  }

  return null
}

function normalizeReplayLocale(value: string): ReplayLocale | null {
  const normalized = value.trim()
  if (normalized === "en-US" || normalized === "zh-CN") {
    return normalized
  }

  return null
}

function defaultModelForVendor(vendor: "openai" | "deepseek") {
  return vendor === "deepseek" ? "deepseek-chat" : "gpt-5.4"
}

function defaultBaseUrlForVendor(vendor: "openai" | "deepseek") {
  return vendor === "deepseek"
    ? "https://api.deepseek.com/v1"
    : "https://api.openai.com/v1"
}

function resolveApiMode(vendor: "openai" | "deepseek", baseUrl: string, model: string) {
  if (vendor === "deepseek") {
    return "chat" as const
  }

  if (model.trim().toLowerCase().startsWith("deepseek-")) {
    return "chat" as const
  }

  try {
    if (new URL(baseUrl).host.toLowerCase() === "api.deepseek.com") {
      return "chat" as const
    }
  } catch {
    return "responses" as const
  }

  return "responses" as const
}

function appendPreviewText(current: string, delta: string) {
  const next = current + delta
  if (next.length <= 8_000) {
    return next
  }

  return `...${next.slice(-7_997)}`
}

function buildExperimentId(root: string) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const prefix = `exp-${day}-`
  const existing = fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter((name) => name.startsWith(prefix))
        .length
    : 0

  return `${prefix}${String(existing + 1).padStart(3, "0")}`
}

function checksum(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function parseArgs(args: string[]) {
  const parsed: Record<string, string> = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith("--")) {
      continue
    }

    const key = arg.slice(2)
    const next = args[index + 1]
    const value = next && !next.startsWith("--") ? next : "true"
    parsed[key] = value
    if (value !== "true") {
      index += 1
    }
  }

  return parsed
}

function parseOptionalPositiveInt(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${value}".`)
  }

  return parsed
}

function readJson<T>(filePath: string, schema: { parse: (value: unknown) => T }) {
  return schema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")))
}

function buildFailureNarratives(
  runRecords: ReplayRunRecord[],
  limit: number,
): ReplayCaseNarrative[] {
  return [...runRecords]
    .sort((left, right) => left.artifact.scoringResult.overallScore - right.artifact.scoringResult.overallScore)
    .slice(0, limit)
    .map((record) => ({
      actual: describePredictedBehavior(
        record.fixture,
        record.artifact.parsedReview,
        record.artifact.validationErrors,
      ),
      expected: describeExpectedBehavior(record.fixture, record.golden),
      failures: record.artifact.scoringResult.criticalFailures,
      fixtureId: record.fixture.fixtureId,
      scenario: describeScenario(record.fixture),
      score: record.artifact.scoringResult.overallScore,
      why: describeWhyItMatters(record.fixture, record.golden),
    }))
}

function buildExperimentComparison(input: {
  compareToExperimentId: string
  currentRuns: ReplayRunRecord[]
}): ReplayComparison {
  const currentComparableRuns: ReplayRunRecord[] = []
  const previousScores: ReplayScore[] = []
  const currentScores: ReplayScore[] = []
  const improved: ReplayComparisonCase[] = []
  const regressed: ReplayComparisonCase[] = []
  const missingFixtureIds: string[] = []
  let unchangedCount = 0

  for (const currentRun of input.currentRuns) {
    const previousArtifact = loadReplayArtifactSummary(
      input.compareToExperimentId,
      currentRun.fixture.fixtureId,
    )

    if (!previousArtifact) {
      missingFixtureIds.push(currentRun.fixture.fixtureId)
      continue
    }

    previousScores.push(previousArtifact.scoringResult)
    currentScores.push(currentRun.artifact.scoringResult)
    currentComparableRuns.push(currentRun)

    const comparisonCase: ReplayComparisonCase = {
      after: describePredictedBehavior(
        currentRun.fixture,
        currentRun.artifact.parsedReview,
        currentRun.artifact.validationErrors,
      ),
      before: describePredictedBehavior(
        currentRun.fixture,
        previousArtifact.parsedReview,
        previousArtifact.validationErrors,
      ),
      currentScore: currentRun.artifact.scoringResult.overallScore,
      delta:
        currentRun.artifact.scoringResult.overallScore
        - previousArtifact.scoringResult.overallScore,
      expected: describeExpectedBehavior(currentRun.fixture, currentRun.golden),
      fixtureId: currentRun.fixture.fixtureId,
      previousScore: previousArtifact.scoringResult.overallScore,
      scenario: describeScenario(currentRun.fixture),
      why: describeWhyItMatters(currentRun.fixture, currentRun.golden),
    }

    const comparisonClass = classifyComparisonCase(
      previousArtifact.scoringResult,
      currentRun.artifact.scoringResult,
    )
    if (comparisonClass === "improved") {
      improved.push(comparisonCase)
    } else if (comparisonClass === "regressed") {
      regressed.push(comparisonCase)
    } else {
      unchangedCount += 1
    }
  }

  const previousSummary = summarizeScores(previousScores)
  const currentSummary = summarizeScores(currentScores)

  return {
    compareToExperimentId: input.compareToExperimentId,
    comparedRuns: currentComparableRuns.length,
    improved: improved.sort((left, right) => right.delta - left.delta),
    metricDiffs: buildMetricDiffs(previousSummary, currentSummary),
    missingFixtureIds,
    regressed: regressed.sort((left, right) => left.delta - right.delta),
    unchangedCount,
  }
}

function loadReplayArtifactSummary(
  experimentId: string,
  fixtureId: string,
): ReplayArtifactSummary | null {
  const artifactPath = path.join(experimentsRoot, experimentId, "runs", `${fixtureId}.json`)
  if (!fs.existsSync(artifactPath)) {
    return null
  }

  const raw = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as ReplayArtifactSummary
  return {
    createdAt: raw.createdAt,
    experimentId: raw.experimentId,
    fixtureId: raw.fixtureId,
    generationMode: raw.generationMode,
    model: raw.model,
    parsedReview: raw.parsedReview ?? null,
    pipeline: raw.pipeline ?? "legacy",
    pipelineMetadata: raw.pipelineMetadata ?? null,
    promptVersion: raw.promptVersion,
    scoringResult: raw.scoringResult,
    validationErrors: Array.isArray(raw.validationErrors) ? raw.validationErrors : [],
  }
}

function classifyComparisonCase(previousScore: ReplayScore, currentScore: ReplayScore) {
  const scoreDelta = currentScore.overallScore - previousScore.overallScore
  const criticalFailureDelta =
    currentScore.criticalFailures.length - previousScore.criticalFailures.length

  if (scoreDelta > comparisonDeltaThreshold || criticalFailureDelta < 0) {
    return "improved" as const
  }

  if (scoreDelta < -comparisonDeltaThreshold || criticalFailureDelta > 0) {
    return "regressed" as const
  }

  return "unchanged" as const
}

function buildMetricDiffs(
  previousSummary: ReturnType<typeof summarizeScores>,
  currentSummary: ReturnType<typeof summarizeScores>,
) {
  return [
    {
      after: currentSummary.metrics.schemaValidRate,
      before: previousSummary.metrics.schemaValidRate,
      delta: currentSummary.metrics.schemaValidRate - previousSummary.metrics.schemaValidRate,
      name: "schema_valid_rate",
    },
    {
      after: currentSummary.metrics.sourceAssignmentIntegrityRate,
      before: previousSummary.metrics.sourceAssignmentIntegrityRate,
      delta:
        currentSummary.metrics.sourceAssignmentIntegrityRate
        - previousSummary.metrics.sourceAssignmentIntegrityRate,
      name: "source_assignment_integrity",
    },
    {
      after: currentSummary.metrics.destinationAccuracy,
      before: previousSummary.metrics.destinationAccuracy,
      delta: currentSummary.metrics.destinationAccuracy - previousSummary.metrics.destinationAccuracy,
      name: "destination_accuracy",
    },
    {
      after: currentSummary.metrics.falseArchiveRate,
      before: previousSummary.metrics.falseArchiveRate,
      delta: currentSummary.metrics.falseArchiveRate - previousSummary.metrics.falseArchiveRate,
      name: "false_archive_rate",
    },
    {
      after: currentSummary.metrics.topicMergeAccuracy,
      before: previousSummary.metrics.topicMergeAccuracy,
      delta:
        currentSummary.metrics.topicMergeAccuracy == null
        || previousSummary.metrics.topicMergeAccuracy == null
          ? null
          : currentSummary.metrics.topicMergeAccuracy - previousSummary.metrics.topicMergeAccuracy,
      name: "topic_merge_accuracy",
    },
    {
      after: currentSummary.metrics.newTopicPrecision,
      before: previousSummary.metrics.newTopicPrecision,
      delta:
        currentSummary.metrics.newTopicPrecision == null
        || previousSummary.metrics.newTopicPrecision == null
          ? null
          : currentSummary.metrics.newTopicPrecision - previousSummary.metrics.newTopicPrecision,
      name: "new_topic_precision",
    },
    {
      after: currentSummary.metrics.clusterPairwiseF1,
      before: previousSummary.metrics.clusterPairwiseF1,
      delta: currentSummary.metrics.clusterPairwiseF1 - previousSummary.metrics.clusterPairwiseF1,
      name: "cluster_pairwise_f1",
    },
    {
      after: currentSummary.metrics.persistSemanticCorrectness,
      before: previousSummary.metrics.persistSemanticCorrectness,
      delta:
        currentSummary.metrics.persistSemanticCorrectness
        - previousSummary.metrics.persistSemanticCorrectness,
      name: "persist_semantic_correctness",
    },
  ]
}

function describeScenario(fixture: BatchFixture) {
  const labels: Record<string, string> = {
    bilingual_or_mixed_language: "bilingual mixed-language clipboard batch",
    coding_debugging: "coding and debugging snippets",
    duplicate_and_near_duplicate: "near-duplicate durable knowledge notes",
    focused_research: "focused research notes",
    link_led_context_sparse: "link-heavy sparse research batch",
    low_value_noise: "low-value mixed clipboard noise",
    meeting_chat_actionables: "meeting and demo actionables",
    task_switching_interruptions: "task-switching operational notes",
    topic_overlap_ambiguous: "overlapping Python-analysis and eval-system notes",
    writing_planning: "writing and planning notes",
  }

  return labels[fixture.scenarioFamily] ?? fixture.notes[0] ?? fixture.fixtureId
}

function describeWhyItMatters(fixture: BatchFixture, golden: GoldenFixture) {
  return fixture.notes[1] ?? golden.annotationNotes[0] ?? golden.criticalChecks[0] ?? null
}

function describeExpectedBehavior(fixture: BatchFixture, golden: GoldenFixture) {
  const clusterDescriptions = golden.expectedClusters.map((cluster) =>
    describeExpectedCluster(cluster, fixture.batch.sourceIds.length),
  )

  if (clusterDescriptions.length === 1) {
    return clusterDescriptions[0]
  }

  return `split into ${clusterDescriptions.join("; ")}`
}

function describeExpectedCluster(
  cluster: GoldenFixture["expectedClusters"][number],
  batchSourceCount: number,
) {
  const sizeLabel =
    cluster.sourceIds.length === batchSourceCount
      ? "the whole batch"
      : `${cluster.sourceIds.length} captures`

  if (cluster.expectedDestination === "send_to_inbox") {
    return `send ${sizeLabel} to inbox`
  }

  if (cluster.expectedDestination === "discard") {
    return `discard ${sizeLabel}`
  }

  if (cluster.topicMode === "new_topic") {
    return `archive ${sizeLabel} to new topic \`${cluster.expectedTopicSlug}\``
  }

  return `archive ${sizeLabel} to existing topic \`${cluster.expectedTopicSlug}\``
}

function describePredictedBehavior(
  fixture: BatchFixture,
  review: ReplayReview | null,
  validationErrors: string[],
) {
  if (!review) {
    const errorLabel = validationErrors[0] ? ` (${compactText(validationErrors[0], 120)})` : ""
    return `no valid review produced${errorLabel}`
  }

  const clusters = [...review.clusters].sort(
    (left, right) => right.sourceIds.length - left.sourceIds.length,
  )
  const clusterDescriptions = clusters.map((cluster) =>
    describePredictedCluster(fixture, cluster, fixture.batch.sourceIds.length),
  )

  if (clusterDescriptions.length === 1) {
    return clusterDescriptions[0]
  }

  return clusterDescriptions.join("; ")
}

function describePredictedCluster(
  fixture: BatchFixture,
  cluster: ReplayReview["clusters"][number],
  batchSourceCount: number,
) {
  const sizeLabel =
    cluster.sourceIds.length === batchSourceCount
      ? "the whole batch"
      : `${cluster.sourceIds.length} captures`
  const titleLabel = cluster.title ? ` ("${compactText(cluster.title, 72)}")` : ""

  if (cluster.decision === "send_to_inbox") {
    return `send ${sizeLabel} to inbox${titleLabel}`
  }

  if (cluster.decision === "discard") {
    return `discard ${sizeLabel}${titleLabel}`
  }

  const topicSlug = resolvePredictedTopicSlug(cluster)
  const topicLabel = fixture.availableTopicSlugs.includes(topicSlug)
    ? `existing topic \`${topicSlug}\``
    : `new topic \`${topicSlug}\``

  return `archive ${sizeLabel} to ${topicLabel}${titleLabel}`
}

function resolvePredictedTopicSlug(
  cluster: Pick<ReplayReview["clusters"][number], "title" | "topicNameSuggestion" | "topicSlugSuggestion">,
) {
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

function compactText(value: string, limit: number) {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= limit) {
    return compact
  }

  return `${compact.slice(0, limit - 1)}...`
}

function buildSummaryMarkdown(input: {
  comparison: ReplayComparison | null
  experimentId: string
  mode: ReplayMode
  pipeline: ReplayPipeline
  promptVersion: string
  summary: ReturnType<typeof summarizeScores>
  topFailures: ReplayCaseNarrative[]
}) {
  const comparisonBlock = input.comparison
    ? [
        `## Compare To ${input.comparison.compareToExperimentId}`,
        ``,
        `- compared_runs: \`${input.comparison.comparedRuns}\``,
        `- improved_fixtures: \`${input.comparison.improved.length}\``,
        `- regressed_fixtures: \`${input.comparison.regressed.length}\``,
        `- unchanged_fixtures: \`${input.comparison.unchangedCount}\``,
        input.comparison.missingFixtureIds.length
          ? `- missing_in_baseline: \`${input.comparison.missingFixtureIds.join(", ")}\``
          : `- missing_in_baseline: \`none\``,
        ``,
        `### Metric Delta`,
        ``,
        ...input.comparison.metricDiffs.map(
          (metric) =>
            `- ${metric.name}: \`${formatNullableRate(metric.before)} -> ${formatNullableRate(metric.after)} (${formatNullablePointDelta(metric.delta)})\``,
        ),
        ``,
        `### Biggest Improvements`,
        ``,
        ...(
          input.comparison.improved.length
            ? input.comparison.improved.slice(0, 5).flatMap((item) => [
                `#### ${item.fixtureId} (${formatScoreDelta(item.delta)})`,
                `- scenario: ${item.scenario}`,
                `- expected: ${item.expected}`,
                `- before: ${item.before}`,
                `- after: ${item.after}`,
                ...(item.why ? [`- why it matters: ${item.why}`] : []),
                ``,
              ])
            : [`- none`, ``]
        ),
        `### Regressions`,
        ``,
        ...(
          input.comparison.regressed.length
            ? input.comparison.regressed.slice(0, 5).flatMap((item) => [
                `#### ${item.fixtureId} (${formatScoreDelta(item.delta)})`,
                `- scenario: ${item.scenario}`,
                `- expected: ${item.expected}`,
                `- before: ${item.before}`,
                `- after: ${item.after}`,
                ...(item.why ? [`- why it matters: ${item.why}`] : []),
                ``,
              ])
            : [`- none`, ``]
        ),
      ]
    : []

  return [
    `# AI Quality Replay Summary`,
    ``,
    `- experiment: \`${input.experimentId}\``,
    `- pipeline: \`${input.pipeline}\``,
    `- mode: \`${input.mode}\``,
    `- prompt_version: \`${input.promptVersion}\``,
    `- runs: \`${input.summary.runs}\``,
    ``,
    `## Metrics`,
    ``,
    `- schema_valid_rate: \`${formatRate(input.summary.metrics.schemaValidRate)}\``,
    `- source_assignment_integrity: \`${formatRate(input.summary.metrics.sourceAssignmentIntegrityRate)}\``,
    `- destination_accuracy: \`${formatRate(input.summary.metrics.destinationAccuracy)}\``,
    `- false_archive_rate: \`${formatRate(input.summary.metrics.falseArchiveRate)}\``,
    `- topic_merge_accuracy: \`${formatNullableRate(input.summary.metrics.topicMergeAccuracy)}\``,
    `- new_topic_precision: \`${formatNullableRate(input.summary.metrics.newTopicPrecision)}\``,
    `- cluster_pairwise_f1: \`${formatRate(input.summary.metrics.clusterPairwiseF1)}\``,
    `- persist_semantic_correctness: \`${formatRate(input.summary.metrics.persistSemanticCorrectness)}\``,
    ``,
    `## Gates`,
    ``,
    ...input.summary.gateResults.map(
      (gate) =>
        `- ${gate.name}: ${gate.passed ? "PASS" : "FAIL"} (${formatRate(gate.actual)} ${gate.threshold})`,
    ),
    ``,
    ...comparisonBlock,
    `## Current Problem Cases`,
    ``,
    ...input.topFailures.flatMap((item) => [
      `#### ${item.fixtureId} (score=${item.score.toFixed(3)})`,
      `- scenario: ${item.scenario}`,
      `- expected: ${item.expected}`,
      `- actual: ${item.actual}`,
      ...(item.failures.length ? [`- failures: ${item.failures.join(" | ")}`] : []),
      ...(item.why ? [`- why it matters: ${item.why}`] : []),
      ``,
    ]),
  ].join("\n")
}

function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatNullableRate(value: number | null) {
  return value == null ? "n/a" : formatRate(value)
}

function formatNullablePointDelta(value: number | null) {
  if (value == null) {
    return "n/a"
  }

  return formatPointDelta(value)
}

function formatPointDelta(value: number) {
  const points = value * 100
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`
}

function formatScoreDelta(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  pnpm ai-quality:replay run [--pipeline legacy|background] [--mode mock|live]",
      "                              [--split dev|holdout|all]",
      "                              [--fixture id1,id2] [--limit N]",
      "                              [--experiment-id exp-YYYYMMDD-001]",
      "                              [--compare-to exp-YYYYMMDD-001]",
      "                              [--profile preview|production] [--settings-path PATH]",
      "                              [--vendor openai|deepseek] [--base-url URL]",
      "                              [--api-key KEY] [--model MODEL] [--locale en-US|zh-CN]",
      "                              [--timeout MS]",
    ].join("\n"),
  )
}
