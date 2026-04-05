import type { SettingsDraft } from "@/types/shell";

export const defaultRuntimeProviderBaseUrl = "https://api.openai.com/v1";
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

export function getRuntimeProviderFormValues(
  settingsDraft: RuntimeProviderFormValues,
): RuntimeProviderFormValues {
  return {
    baseUrl: settingsDraft.baseUrl.trim() || defaultRuntimeProviderBaseUrl,
    model: normalizeRuntimeProviderModel(settingsDraft.model),
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

export function normalizeRuntimeProviderBaseUrl(value: string) {
  return value.trim() || defaultRuntimeProviderBaseUrl;
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
