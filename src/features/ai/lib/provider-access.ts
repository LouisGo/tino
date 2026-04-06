import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  RetryError,
  streamText,
  type FinishReason,
  type FlexibleSchema,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import {
  getRuntimeProviderModelLabel,
  getRuntimeProviderVendorLabel,
  resolveRuntimeProviderEffectiveModel,
} from "@/features/settings/lib/runtime-provider";
import { createRendererLogger } from "@/lib/logger";
import { isTauriRuntime } from "@/lib/tauri";
import type { RuntimeProviderProfile } from "@/types/shell";

const logger = createRendererLogger("agent.provider");
const defaultRequestTimeoutMs = 30_000;
const defaultStructuredObjectTimeoutMs = 90_000;
const defaultProviderMaxRetries = 3;
const defaultStreamPreviewCharLimit = 12_000;
const defaultTextPreviewCharLimit = 320;
const testPromptDefault = "Say hello from Tino in one short sentence.";

export type ProviderAccessConfig = Pick<
  RuntimeProviderProfile,
  "vendor" | "baseUrl" | "apiKey" | "model"
>;

export type StructuredObjectRequest<SCHEMA extends FlexibleSchema<unknown>> = {
  systemPrompt?: string;
  userPrompt: string;
  schema: SCHEMA;
  schemaDescription?: string;
  schemaName: string;
  timeoutMs?: number;
  onTextStream?: (progress: StructuredObjectTextStreamProgress) => void;
};

export type StructuredObjectResult<T> = ProviderCallMetadata & {
  object: T;
};

export type StructuredTextRequest = {
  systemPrompt?: string;
  userPrompt: string;
  timeoutMs?: number;
};

export type StructuredTextResult = ProviderCallMetadata & {
  text: string;
};

export type ProviderCallMetadata = {
  apiMode: RuntimeProviderApiMode;
  durationMs: number;
  finishReason: FinishReason;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  model: string;
  providerLabel: string;
  responseModel: string;
};

export type StructuredObjectTextStreamProgress = {
  eventCount: number;
  firstReasoningLatencyMs: number | null;
  firstTextLatencyMs: number | null;
  lastEventType: string | null;
  receivedChars: number;
  reasoningChars: number;
  reasoningText: string;
  text: string;
};

export type RuntimeProviderApiMode = "chat" | "responses";

export interface AiObjectGenerator {
  generateObject<T, SCHEMA extends FlexibleSchema<unknown>>(
    request: StructuredObjectRequest<SCHEMA>,
  ): Promise<StructuredObjectResult<T>>;
  generateText(request: StructuredTextRequest): Promise<StructuredTextResult>;
}

export function resolveProviderAccessConfig(settings: ProviderAccessConfig) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const apiKey = settings.apiKey.trim();
  const model = resolveRuntimeProviderEffectiveModel(settings);
  const providerHost = getProviderHost(baseUrl);
  const vendor = settings.vendor;
  const modelLabel = getRuntimeProviderModelLabel(model, vendor);
  const vendorLabel = getRuntimeProviderVendorLabel(vendor);

  return {
    apiKey,
    apiMode: resolveRuntimeProviderApiMode({ vendor, apiKey, baseUrl, model }),
    baseUrl,
    isConfigured: baseUrl.length > 0 && apiKey.length > 0,
    model,
    providerHost,
    vendor,
    vendorLabel,
    providerLabel: `${vendorLabel} · ${modelLabel}`,
  };
}

export function createAiObjectGenerator(settings: ProviderAccessConfig): AiObjectGenerator {
  const access = assertProviderConfigured(settings);
  const provider = createOpenAI({
    apiKey: access.apiKey,
    baseURL: access.baseUrl,
    fetch: createLoggedProviderFetch(access),
    name: buildProviderName(access.providerHost),
  });
  const model =
    access.apiMode === "chat"
      ? provider.chat(access.model)
      : provider.responses(access.model);

  return {
    async generateObject<T, SCHEMA extends FlexibleSchema<unknown>>(
      request: StructuredObjectRequest<SCHEMA>,
    ) {
      const startedAt = performance.now();
      const timeout = resolveStructuredStreamTimeout(request.timeoutMs);
      const chunkTypeCounts: Record<string, number> = {};
      let eventCount = 0;
      let firstReasoningLatencyMs: number | null = null;
      let firstTextLatencyMs: number | null = null;
      let lastEventType: string | null = null;
      let reasoningChars = 0;
      let reasoningText = "";
      let receivedChars = 0;
      let streamedText = "";
      const output = Output.object({
        schema: request.schema,
        name: request.schemaName,
        description: request.schemaDescription,
      });

      try {
        logger.info("Starting streamed JSON object generation", {
          apiMode: access.apiMode,
          maxRetries: defaultProviderMaxRetries,
          model: access.model,
          promptChars: request.userPrompt.length,
          providerLabel: access.providerLabel,
          schemaName: request.schemaName,
          timeout,
        });

        request.onTextStream?.({
          eventCount,
          firstReasoningLatencyMs,
          firstTextLatencyMs,
          lastEventType,
          reasoningChars,
          reasoningText,
          receivedChars,
          text: streamedText,
        });

        const streamResult = streamText({
          model,
          system: request.systemPrompt,
          prompt: request.userPrompt,
          timeout,
          maxRetries: defaultProviderMaxRetries,
          includeRawChunks: true,
          experimental_include: { requestBody: true },
          onChunk: ({ chunk }) => {
            eventCount += 1;
            lastEventType = resolveProviderChunkType(chunk);
            incrementChunkTypeCount(chunkTypeCounts, lastEventType);

            const reasoningDelta =
              chunk.type === "reasoning-delta"
                ? chunk.text
                : extractDeepSeekReasoningDeltaFromRawChunk(access, chunk);

            if (reasoningDelta) {
              reasoningChars += reasoningDelta.length;
              reasoningText = appendStreamPreviewText(reasoningText, reasoningDelta);

              if (firstReasoningLatencyMs == null) {
                firstReasoningLatencyMs = Math.round(performance.now() - startedAt);
                logger.info("Provider stream received first reasoning delta", {
                  apiMode: access.apiMode,
                  eventCount,
                  firstReasoningLatencyMs,
                  model: access.model,
                  providerLabel: access.providerLabel,
                  reasoningSource: chunk.type,
                  schemaName: request.schemaName,
                });
              }

              request.onTextStream?.({
                eventCount,
                firstReasoningLatencyMs,
                firstTextLatencyMs,
                lastEventType,
                reasoningChars,
                reasoningText,
                receivedChars,
                text: streamedText,
              });
              return;
            }

            if (chunk.type !== "text-delta") {
              request.onTextStream?.({
                eventCount,
                firstReasoningLatencyMs,
                firstTextLatencyMs,
                lastEventType,
                reasoningChars,
                reasoningText,
                receivedChars,
                text: streamedText,
              });
              return;
            }

            receivedChars += chunk.text.length;
            streamedText = appendStreamPreviewText(streamedText, chunk.text);

            if (firstTextLatencyMs == null) {
              firstTextLatencyMs = Math.round(performance.now() - startedAt);
              logger.info("Provider stream received first text delta", {
                apiMode: access.apiMode,
                eventCount,
                firstTextLatencyMs,
                model: access.model,
                providerLabel: access.providerLabel,
                schemaName: request.schemaName,
              });
            }

            request.onTextStream?.({
              eventCount,
              firstReasoningLatencyMs,
              firstTextLatencyMs,
              lastEventType,
              reasoningChars,
              reasoningText,
              receivedChars,
              text: streamedText,
            });
          },
          onError: ({ error }) => {
            logger.warn("Streamed JSON generation emitted an error chunk", {
              apiMode: access.apiMode,
              errorMessage: error instanceof Error ? error.message : String(error),
              errorName: error instanceof Error ? error.name : undefined,
              model: access.model,
              providerLabel: access.providerLabel,
              schemaName: request.schemaName,
            });
          },
        });
        const steps = await Promise.resolve(streamResult.steps);
        const finalStep = steps.at(-1);

        if (!finalStep) {
          throw new Error("Provider stream completed without a final step.");
        }

        const object = await output.parseCompleteOutput(
          { text: finalStep.text },
          {
            finishReason: finalStep.finishReason,
            response: finalStep.response,
            usage: finalStep.usage,
          },
        );

        const metadata = buildProviderCallMetadata({
          access,
          durationMs: performance.now() - startedAt,
          finishReason: finalStep.finishReason,
          inputTokens: finalStep.usage.inputTokens,
          outputTokens: finalStep.usage.outputTokens,
          responseModel: finalStep.response.modelId,
        });

        logger.info("Streamed JSON object generated", {
          ...metadata,
          chunkSummary: summarizeChunkTypes(chunkTypeCounts),
          eventCount,
          firstReasoningLatencyMs,
          firstTextLatencyMs,
          lastEventType,
          promptChars: request.userPrompt.length,
          reasoningChars,
          reasoningPreviewLength: reasoningText.length,
          responseId: finalStep.response.id,
          schemaName: request.schemaName,
          streamedTextLength: receivedChars,
          textPreview: truncateText(finalStep.text, defaultTextPreviewCharLimit),
        });

        return {
          ...metadata,
          object: object as T,
        };
      } catch (error) {
        const normalizedError = normalizeProviderAccessError(error, {
          baseUrl: access.baseUrl,
          model: access.model,
        });
        logger.error("Streamed JSON object generation failed", {
          apiMode: access.apiMode,
          baseUrl: access.baseUrl,
          chunkSummary: summarizeChunkTypes(chunkTypeCounts),
          errorMessage: normalizedError.message,
          errorName: normalizedError.name,
          maxRetries: defaultProviderMaxRetries,
          model: access.model,
          promptChars: request.userPrompt.length,
          providerLabel: access.providerLabel,
          providerError: extractProviderErrorDetails(error),
          schemaName: request.schemaName,
        });
        throw normalizedError;
      }
    },

    async generateText(request: StructuredTextRequest) {
      const startedAt = performance.now();
      const timeoutMs = request.timeoutMs ?? defaultRequestTimeoutMs;

      try {
        logger.info("Starting provider text generation", {
          apiMode: access.apiMode,
          maxRetries: defaultProviderMaxRetries,
          model: access.model,
          promptChars: request.userPrompt.length,
          providerLabel: access.providerLabel,
          timeoutMs,
        });

        const result = await generateText({
          model,
          system: request.systemPrompt,
          prompt: request.userPrompt,
          timeout: timeoutMs,
          maxRetries: defaultProviderMaxRetries,
        });

        const metadata = buildProviderCallMetadata({
          access,
          durationMs: performance.now() - startedAt,
          finishReason: result.finishReason,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          responseModel: result.response.modelId,
        });

        logger.info("Provider text generated", {
          ...metadata,
          promptChars: request.userPrompt.length,
          responseId: result.response.id,
          textPreview: truncateText(result.text, defaultTextPreviewCharLimit),
        });

        return {
          ...metadata,
          text: result.text,
        };
      } catch (error) {
        const normalizedError = normalizeProviderAccessError(error, {
          baseUrl: access.baseUrl,
          model: access.model,
        });
        logger.error("Provider text generation failed", {
          apiMode: access.apiMode,
          baseUrl: access.baseUrl,
          errorMessage: normalizedError.message,
          errorName: normalizedError.name,
          maxRetries: defaultProviderMaxRetries,
          model: access.model,
          promptChars: request.userPrompt.length,
          providerLabel: access.providerLabel,
          providerError: extractProviderErrorDetails(error),
        });
        throw normalizedError;
      }
    },
  };
}

export async function runRuntimeProviderSmokeTest(
  settings: ProviderAccessConfig,
  prompt = testPromptDefault,
) {
  return createAiObjectGenerator(settings).generateText({
    systemPrompt:
      "You are a quick connectivity check for Tino. Respond with one short plain sentence.",
    userPrompt: prompt,
    timeoutMs: 20_000,
  });
}

export function getRuntimeProviderSmokeTestPrompt() {
  return testPromptDefault;
}

function assertProviderConfigured(settings: ProviderAccessConfig) {
  const access = resolveProviderAccessConfig(settings);

  if (!access.baseUrl) {
    throw new Error("Base URL is required.");
  }

  if (!access.apiKey) {
    throw new Error("API key is required.");
  }

  return access;
}

function buildProviderCallMetadata({
  access,
  durationMs,
  finishReason,
  inputTokens,
  outputTokens,
  responseModel,
}: {
  access: ReturnType<typeof assertProviderConfigured>;
  durationMs: number;
  finishReason: FinishReason;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  responseModel: string;
}) {
  return {
    durationMs: Math.round(durationMs),
    finishReason,
    inputTokens,
    model: access.model,
    outputTokens,
    providerLabel: access.providerLabel,
    responseModel,
    apiMode: access.apiMode,
  } satisfies ProviderCallMetadata;
}

function getProviderHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function resolveRuntimeProviderApiMode(settings: ProviderAccessConfig): RuntimeProviderApiMode {
  if (settings.vendor === "deepseek") {
    return "chat";
  }

  const normalizedBaseUrl = normalizeBaseUrl(settings.baseUrl);
  const normalizedModel = settings.model.trim().toLowerCase();

  if (normalizedModel.startsWith("deepseek-")) {
    return "chat";
  }

  const providerHost = getProviderHost(normalizedBaseUrl)?.toLowerCase();
  if (providerHost === "api.deepseek.com") {
    return "chat";
  }

  return "responses";
}

function buildProviderName(providerHost: string | null) {
  if (!providerHost) {
    return "openai";
  }

  return providerHost.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "openai";
}

function normalizeProviderAccessError(
  error: unknown,
  context: {
    baseUrl: string;
    model: string;
  },
) {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const providerHost = getProviderHost(context.baseUrl) ?? "the selected provider";

  if (RetryError.isInstance(error) && isAbortLikeError(error.lastError)) {
    return new Error(
      "Provider stream stalled or exceeded the configured timeout before a complete response arrived.",
    );
  }

  if (RetryError.isInstance(error) && isRelayModelUnavailableError(error.lastError)) {
    return new Error(
      `Model "${context.model}" is not currently available on ${providerHost}. Try another model or provider.`,
    );
  }

  if (isAbortLikeError(normalizedError)) {
    return new Error(
      "Provider stream stalled or exceeded the configured timeout before a complete response arrived.",
    );
  }

  if (normalizedError instanceof TypeError && normalizedError.message === "Load failed") {
    return new Error(
      "Provider request was blocked before a response arrived. This is usually a CORS or relay preflight issue in webview/browser mode.",
    );
  }

  if (isRelayModelUnavailableError(error)) {
    return new Error(
      `Model "${context.model}" is not currently available on ${providerHost}. Try another model or provider.`,
    );
  }

  if (APICallError.isInstance(error) && error.message === "Invalid JSON response") {
    const baseUrlPathname = safePathname(context.baseUrl);
    const pathHint =
      baseUrlPathname === "/" || baseUrlPathname === ""
        ? " Try using a Base URL that ends with /v1 if your relay follows the OpenAI path layout."
        : "";

    return new Error(
      `Provider returned a non-JSON response instead of an OpenAI-compatible API payload.${pathHint}`,
    );
  }

  return normalizedError;
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}...`;
}

function resolveProviderFetch() {
  const browserFetch = globalThis.fetch?.bind(globalThis) as typeof fetch | undefined;

  if (!isTauriRuntime()) {
    if (!browserFetch) {
      throw new Error("Global fetch is unavailable in the current runtime.");
    }

    return {
      fetch: browserFetch,
      transport: "browser_fetch" as const,
    };
  }

  return {
    fetch: tauriFetch as typeof fetch,
    transport: "tauri_plugin_http" as const,
  };
}

function createLoggedProviderFetch(access: ReturnType<typeof assertProviderConfigured>) {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const requestUrl = resolveRequestUrl(input);
    const requestBody = summarizeRequestBodyForLog(init?.body);
    const finalHeaders = withStreamingAcceptHeader(init?.headers, requestBody);
    const { fetch: baseFetch, transport } = resolveProviderFetch();
    const finalInit = {
      ...init,
      headers: finalHeaders,
    };
    const requestHeaders = sanitizeHeadersForLog(finalHeaders);

    logger.info("Dispatching provider HTTP request", {
      body: requestBody,
      headers: requestHeaders,
      method: finalInit.method ?? "GET",
      model: access.model,
      providerLabel: access.providerLabel,
      transport,
      url: requestUrl,
    });

    const response = await baseFetch(input, finalInit);

    logger.info("Received provider HTTP response", {
      contentType: response.headers.get("content-type"),
      headers: pickResponseHeadersForLog(response.headers),
      model: access.model,
      providerLabel: access.providerLabel,
      status: response.status,
      statusText: response.statusText,
      transport,
      url: response.url || requestUrl,
    });

    return response;
  };
}

function extractProviderErrorDetails(error: unknown) {
  if (RetryError.isInstance(error)) {
    return {
      errorCount: error.errors.length,
      lastErrorMessage:
        error.lastError instanceof Error ? error.lastError.message : String(error.lastError),
      lastErrorName: error.lastError instanceof Error ? error.lastError.name : undefined,
      reason: error.reason,
    };
  }

  if (NoObjectGeneratedError.isInstance(error)) {
    return {
      finishReason: error.finishReason,
      responseId: error.response?.id,
      responseModel: error.response?.modelId,
      textPreview: error.text ? truncateText(error.text, 500) : undefined,
    };
  }

  if (!APICallError.isInstance(error)) {
    return undefined;
  }

  return {
    responseBodyPreview:
      typeof error.responseBody === "string"
        ? truncateText(error.responseBody, 240)
        : error.responseBody,
    statusCode: error.statusCode,
    url: error.url,
  };
}

function safePathname(value: string) {
  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}

function resolveRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function sanitizeHeadersForLog(headers: HeadersInit | undefined) {
  if (!headers) {
    return undefined;
  }

  return Object.fromEntries(
    Array.from(new Headers(headers).entries())
      .filter(([key]) =>
        new Set(["accept", "authorization", "content-type", "user-agent", "x-api-key"]).has(
          key.toLowerCase(),
        ),
      )
      .map(([key, value]) => [
        key,
        /authorization|api-key|x-api-key/i.test(key) ? redactSecret(value) : value,
      ]),
  );
}

function summarizeRequestBodyForLog(body: BodyInit | null | undefined) {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    try {
      return summarizeParsedRequestBodyForLog(JSON.parse(body) as unknown);
    } catch {
      return truncateText(body, defaultTextPreviewCharLimit);
    }
  }

  if (body instanceof URLSearchParams) {
    return truncateText(body.toString(), defaultTextPreviewCharLimit);
  }

  if (body instanceof FormData) {
    return {
      entryCount: Array.from(body.keys()).length,
      type: "form_data",
    };
  }

  return summarizeParsedRequestBodyForLog(body);
}

function summarizeParsedRequestBodyForLog(value: unknown) {
  if (typeof value !== "object" || value == null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if (typeof record.model === "string") {
    summary.model = record.model;
  }

  if (typeof record.stream === "boolean") {
    summary.stream = record.stream;
  }

  if (Array.isArray(record.input)) {
    summary.inputCount = record.input.length;
    summary.inputRoles = record.input.map((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "role" in entry &&
      typeof entry.role === "string"
        ? entry.role
        : "unknown",
    );
  }

  if (Array.isArray(record.messages)) {
    summary.messageCount = record.messages.length;
    summary.messageRoles = record.messages.map((entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "role" in entry &&
      typeof entry.role === "string"
        ? entry.role
        : "unknown",
    );
  }

  if (typeof record.stream_options === "object" && record.stream_options !== null) {
    summary.streamOptions = Object.keys(record.stream_options as Record<string, unknown>);
  }

  if (!Object.keys(summary).length) {
    summary.keys = Object.keys(record).slice(0, 12);
  }

  return summary;
}

function redactSecret(value: string) {
  if (value.length <= 12) {
    return "[redacted]";
  }

  return `${value.slice(0, 6)}...[redacted]...${value.slice(-4)}`;
}

function withStreamingAcceptHeader(headers: HeadersInit | undefined, requestBody: unknown) {
  const nextHeaders = new Headers(headers);

  if (isStreamingRequestBody(requestBody) && !nextHeaders.has("accept")) {
    nextHeaders.set("accept", "text/event-stream");
  }

  return nextHeaders;
}

function isStreamingRequestBody(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "stream" in value &&
    value.stream === true
  );
}

function resolveStructuredStreamTimeout(timeoutMs?: number) {
  return {
    totalMs: timeoutMs ?? defaultStructuredObjectTimeoutMs,
  };
}

function incrementChunkTypeCount(
  chunkTypeCounts: Record<string, number>,
  chunkType: string | null,
) {
  if (!chunkType) {
    return;
  }

  chunkTypeCounts[chunkType] = (chunkTypeCounts[chunkType] ?? 0) + 1;
}

function summarizeChunkTypes(chunkTypeCounts: Record<string, number>) {
  return {
    observedTypes: Object.keys(chunkTypeCounts),
    ...chunkTypeCounts,
  };
}

function appendStreamPreviewText(current: string, delta: string) {
  const next = current + delta;
  if (next.length <= defaultStreamPreviewCharLimit) {
    return next;
  }

  return `...${next.slice(-(defaultStreamPreviewCharLimit - 3))}`;
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    /abort|timed out|timeout|cancelled/i.test(error.message)
  );
}

function isRelayModelUnavailableError(error: unknown) {
  return (
    error instanceof Error &&
    /no available providers/i.test(error.message)
  );
}

function resolveProviderChunkType(chunk: unknown) {
  if (
    typeof chunk === "object" &&
    chunk !== null &&
    "type" in chunk &&
    typeof chunk.type === "string"
  ) {
    return chunk.type;
  }

  return null;
}

function extractDeepSeekReasoningDeltaFromRawChunk(
  access: ReturnType<typeof assertProviderConfigured>,
  chunk: unknown,
) {
  if (!isDeepSeekReasoningBridgeTarget(access)) {
    return null;
  }

  if (
    typeof chunk !== "object" ||
    chunk === null ||
    !("type" in chunk) ||
    chunk.type !== "raw" ||
    !("rawValue" in chunk)
  ) {
    return null;
  }

  return extractReasoningContentFromOpenAiCompatibleChunk(chunk.rawValue);
}

function isDeepSeekReasoningBridgeTarget(access: ReturnType<typeof assertProviderConfigured>) {
  const normalizedModel = access.model.trim().toLowerCase();
  const normalizedHost = access.providerHost?.toLowerCase();

  return (
    access.vendor === "deepseek"
    || normalizedModel.startsWith("deepseek-")
    || normalizedHost === "api.deepseek.com"
  );
}

function extractReasoningContentFromOpenAiCompatibleChunk(rawValue: unknown) {
  if (typeof rawValue !== "object" || rawValue === null || !("choices" in rawValue)) {
    return null;
  }

  const choices = rawValue.choices;
  if (!Array.isArray(choices)) {
    return null;
  }

  const firstChoice = choices[0];
  if (typeof firstChoice !== "object" || firstChoice === null || !("delta" in firstChoice)) {
    return null;
  }

  const delta = firstChoice.delta;
  if (
    typeof delta !== "object" ||
    delta === null ||
    !("reasoning_content" in delta) ||
    typeof delta.reasoning_content !== "string" ||
    delta.reasoning_content.length === 0
  ) {
    return null;
  }

  return delta.reasoning_content;
}

function pickResponseHeadersForLog(headers: Headers) {
  const headerNames = [
    "content-type",
    "date",
    "server",
    "x-request-id",
    "x-ds-trace-id",
    "cf-ray",
  ];

  return Object.fromEntries(
    headerNames
      .map((name) => [name, headers.get(name)] as const)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
