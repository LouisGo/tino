import {
  APICallError,
  generateObject,
  generateText,
  type FinishReason,
  type FlexibleSchema,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { createRendererLogger } from "@/lib/logger";
import { isTauriRuntime } from "@/lib/tauri";
import type { SettingsDraft } from "@/types/shell";

const logger = createRendererLogger("agent.provider");
const defaultRequestTimeoutMs = 30_000;
const testPromptDefault = "Say hello from Tino in one short sentence.";

export type ProviderAccessConfig = Pick<SettingsDraft, "baseUrl" | "apiKey" | "model">;

export type StructuredObjectRequest<SCHEMA extends FlexibleSchema<unknown>> = {
  systemPrompt?: string;
  userPrompt: string;
  schema: SCHEMA;
  schemaDescription?: string;
  schemaName: string;
  timeoutMs?: number;
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
  durationMs: number;
  finishReason: FinishReason;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  model: string;
  providerLabel: string;
  responseModel: string;
};

export interface AiObjectGenerator {
  generateObject<T, SCHEMA extends FlexibleSchema<unknown>>(
    request: StructuredObjectRequest<SCHEMA>,
  ): Promise<StructuredObjectResult<T>>;
  generateText(request: StructuredTextRequest): Promise<StructuredTextResult>;
}

export function resolveProviderAccessConfig(settings: ProviderAccessConfig) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const apiKey = settings.apiKey.trim();
  const model = settings.model.trim();
  const providerHost = getProviderHost(baseUrl);

  return {
    apiKey,
    baseUrl,
    isConfigured: baseUrl.length > 0 && apiKey.length > 0 && model.length > 0,
    model,
    providerHost,
    providerLabel: providerHost ? `${providerHost} · ${model}` : model || "Provider pending",
  };
}

export function createAiObjectGenerator(settings: ProviderAccessConfig): AiObjectGenerator {
  const access = assertProviderConfigured(settings);
  const provider = createOpenAICompatible({
    apiKey: access.apiKey,
    baseURL: access.baseUrl,
    fetch: resolveProviderFetch(),
    name: buildProviderName(access.providerHost),
    supportsStructuredOutputs: true,
  });
  const model = provider.chatModel(access.model);

  return {
    async generateObject<T, SCHEMA extends FlexibleSchema<unknown>>(
      request: StructuredObjectRequest<SCHEMA>,
    ) {
      const startedAt = performance.now();

      try {
        const result = await generateObject({
          model,
          schema: request.schema,
          schemaDescription: request.schemaDescription,
          schemaName: request.schemaName,
          system: request.systemPrompt,
          prompt: request.userPrompt,
          timeout: request.timeoutMs ?? defaultRequestTimeoutMs,
        });

        const metadata = buildProviderCallMetadata({
          access,
          durationMs: performance.now() - startedAt,
          finishReason: result.finishReason,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          responseModel: result.response.modelId,
        });

        logger.info("Structured object generated", metadata);

        return {
          ...metadata,
          object: result.object as T,
        };
      } catch (error) {
        const normalizedError = normalizeProviderAccessError(error, access.baseUrl);
        logger.error("Structured object generation failed", {
          baseUrl: access.baseUrl,
          errorMessage: normalizedError.message,
          errorName: normalizedError.name,
          model: access.model,
          providerError: extractProviderErrorDetails(error),
        });
        throw normalizedError;
      }
    },

    async generateText(request: StructuredTextRequest) {
      const startedAt = performance.now();

      try {
        const result = await generateText({
          model,
          system: request.systemPrompt,
          prompt: request.userPrompt,
          timeout: request.timeoutMs ?? defaultRequestTimeoutMs,
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
          preview: truncateText(result.text, 120),
        });

        return {
          ...metadata,
          text: result.text,
        };
      } catch (error) {
        const normalizedError = normalizeProviderAccessError(error, access.baseUrl);
        logger.error("Provider text generation failed", {
          baseUrl: access.baseUrl,
          errorMessage: normalizedError.message,
          errorName: normalizedError.name,
          model: access.model,
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

  if (!access.model) {
    throw new Error("Model is required.");
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

function buildProviderName(providerHost: string | null) {
  if (!providerHost) {
    return "openai-compatible";
  }

  return providerHost.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "") || "openai-compatible";
}

function normalizeProviderAccessError(error: unknown, baseUrl: string) {
  const normalizedError = error instanceof Error ? error : new Error(String(error));

  if (normalizedError instanceof TypeError && normalizedError.message === "Load failed") {
    return new Error(
      "Provider request was blocked before a response arrived. This is usually a CORS or relay preflight issue in webview/browser mode.",
    );
  }

  if (APICallError.isInstance(error) && error.message === "Invalid JSON response") {
    const baseUrlPathname = safePathname(baseUrl);
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
  if (!isTauriRuntime()) {
    return undefined;
  }

  return tauriFetch;
}

function extractProviderErrorDetails(error: unknown) {
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
