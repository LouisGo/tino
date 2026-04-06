import type { SettingsDraft } from "@/types/shell";

export const defaultOpenAiRuntimeProviderBaseUrl = "https://api.openai.com/v1";
export const defaultDeepSeekRuntimeProviderBaseUrl = "https://api.deepseek.com/v1";
export const defaultRuntimeProviderBaseUrl = defaultOpenAiRuntimeProviderBaseUrl;
export const defaultRuntimeProviderModel = "gpt-5.4-mini";

export const runtimeProviderModels = [
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    description: "Higher reasoning depth for heavier review batches.",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    description: "Faster default for everyday batch reviews.",
  },
  {
    value: "deepseek-chat",
    label: "DeepSeek Chat",
    description: "Direct DeepSeek official API control group via chat completions.",
  },
  {
    value: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    description: "Direct DeepSeek reasoning model for comparing long-thinking streams.",
  },
] as const;

export type RuntimeProviderModelId = (typeof runtimeProviderModels)[number]["value"];

export type RuntimeProviderFormValues = Pick<
  SettingsDraft,
  "baseUrl" | "model" | "apiKey"
>;

const runtimeProviderModelIds = new Set<RuntimeProviderModelId>(
  runtimeProviderModels.map((option) => option.value),
);

export function isSupportedRuntimeProviderModel(
  value: string,
): value is RuntimeProviderModelId {
  return runtimeProviderModelIds.has(value.trim() as RuntimeProviderModelId);
}

export function normalizeRuntimeProviderModel(value: string): RuntimeProviderModelId {
  const trimmedValue = value.trim();
  return isSupportedRuntimeProviderModel(trimmedValue)
    ? (trimmedValue as RuntimeProviderModelId)
    : defaultRuntimeProviderModel;
}

export function getDefaultRuntimeProviderBaseUrlForModel(model: string) {
  return isDeepSeekRuntimeProviderModel(model)
    ? defaultDeepSeekRuntimeProviderBaseUrl
    : defaultOpenAiRuntimeProviderBaseUrl;
}

export function isDeepSeekRuntimeProviderModel(value: string) {
  return value.trim().startsWith("deepseek-");
}

export function getRuntimeProviderFormValues(
  settingsDraft: RuntimeProviderFormValues,
): RuntimeProviderFormValues {
  const model = normalizeRuntimeProviderModel(settingsDraft.model);

  return {
    baseUrl:
      settingsDraft.baseUrl.trim() || getDefaultRuntimeProviderBaseUrlForModel(model),
    model,
    apiKey: settingsDraft.apiKey,
  };
}

export function validateRuntimeProviderBaseUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedValue);
  } catch {
    return "Enter a valid URL.";
  }

  if (parsedUrl.protocol !== "https:") {
    return "Use an https:// endpoint.";
  }

  if (parsedUrl.username || parsedUrl.password) {
    return "Do not include credentials in Base URL.";
  }

  return undefined;
}

export function normalizeRuntimeProviderBaseUrl(value: string, model = defaultRuntimeProviderModel) {
  const trimmedValue = value.trim().replace(/\/+$/, "");
  return trimmedValue || getDefaultRuntimeProviderBaseUrlForModel(model);
}

export function validateRuntimeProviderModel(value: string) {
  if (isSupportedRuntimeProviderModel(value)) {
    return undefined;
  }

  return "Choose a supported model.";
}

export function validateRuntimeProviderApiKey(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (/\s/.test(trimmedValue)) {
    return "API key cannot contain spaces or line breaks.";
  }

  if (trimmedValue.length < 12) {
    return "API key looks too short.";
  }

  return undefined;
}

export function normalizeRuntimeProviderApiKey(value: string) {
  return value.trim();
}

export function maskRuntimeProviderApiKey(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  if (trimmedValue.length <= 8) {
    return `${trimmedValue.slice(0, 2)}****`;
  }

  return `${trimmedValue.slice(0, 4)}****${trimmedValue.slice(-4)}`;
}
