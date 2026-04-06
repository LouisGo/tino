import type {
  RuntimeProviderProfile,
  RuntimeProviderVendor,
  SettingsDraft,
} from "@/types/shell";

export const defaultOpenAiRuntimeProviderBaseUrl = "https://api.openai.com/v1";
export const defaultDeepSeekRuntimeProviderBaseUrl = "https://api.deepseek.com/v1";
export const defaultOpenAiRuntimeModel = "gpt-5.4";
export const defaultDeepSeekRuntimeModel = "deepseek-chat";
export const defaultRuntimeProviderVendor = "openai" as const satisfies RuntimeProviderVendor;

export type RuntimeProviderModelOption = {
  description: string;
  label: string;
  value: string;
  vendor: RuntimeProviderVendor;
};

export const runtimeProviderVendors = [
  {
    value: "openai",
    label: "OpenAI",
    description: "GPT-family endpoints and OpenAI-compatible relays.",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    description: "DeepSeek direct endpoints or compatible DeepSeek relays.",
  },
] as const satisfies readonly {
  value: RuntimeProviderVendor;
  label: string;
  description: string;
}[];

const openAiRuntimeProviderModels: RuntimeProviderModelOption[] = [
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    description: "Higher-capability GPT model.",
    vendor: "openai",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    description: "Faster GPT-5.4 variant.",
    vendor: "openai",
  },
] satisfies RuntimeProviderModelOption[];

const deepSeekRuntimeProviderModels: RuntimeProviderModelOption[] = [
  {
    value: "deepseek-chat",
    label: "DeepSeek Chat",
    description: "Default DeepSeek model for general work.",
    vendor: "deepseek",
  },
  {
    value: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    description: "Reasoning-focused DeepSeek model.",
    vendor: "deepseek",
  },
] satisfies RuntimeProviderModelOption[];

const runtimeProviderModelsByVendor = {
  openai: openAiRuntimeProviderModels,
  deepseek: deepSeekRuntimeProviderModels,
} satisfies Record<RuntimeProviderVendor, RuntimeProviderModelOption[]>;

export type RuntimeProviderFormValues = Pick<
  RuntimeProviderProfile,
  "name" | "vendor" | "baseUrl" | "model" | "apiKey"
>;

const runtimeProviderVendorIds = new Set<RuntimeProviderVendor>(
  runtimeProviderVendors.map((option) => option.value),
);

export function isSupportedRuntimeProviderVendor(
  value: string,
): value is RuntimeProviderVendor {
  return runtimeProviderVendorIds.has(value.trim() as RuntimeProviderVendor);
}

export function normalizeRuntimeProviderVendor(value: string): RuntimeProviderVendor {
  const trimmedValue = value.trim();
  return isSupportedRuntimeProviderVendor(trimmedValue)
    ? (trimmedValue as RuntimeProviderVendor)
    : defaultRuntimeProviderVendor;
}

export function getRuntimeProviderVendorLabel(vendor: RuntimeProviderVendor) {
  return runtimeProviderVendors.find((option) => option.value === vendor)?.label ?? "OpenAI";
}

export function getDefaultRuntimeProviderBaseUrlForVendor(vendor: RuntimeProviderVendor) {
  return vendor === "deepseek"
    ? defaultDeepSeekRuntimeProviderBaseUrl
    : defaultOpenAiRuntimeProviderBaseUrl;
}

export function getDefaultRuntimeProviderModelForVendor(vendor: RuntimeProviderVendor) {
  return vendor === "deepseek"
    ? defaultDeepSeekRuntimeModel
    : defaultOpenAiRuntimeModel;
}

export function getRuntimeProviderModelOptions(
  vendor: RuntimeProviderVendor,
  currentModel?: string,
) {
  const options = [...runtimeProviderModelsByVendor[vendor]];
  const trimmedModel = currentModel?.trim() ?? "";

  if (trimmedModel && !options.some((option) => option.value === trimmedModel)) {
    options.push({
      value: trimmedModel,
      label: trimmedModel,
      description: "",
      vendor,
    });
  }

  return options;
}

export function isRuntimeProviderModelAvailableForVendor(
  vendor: RuntimeProviderVendor,
  value: string,
) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return false;
  }

  return runtimeProviderModelsByVendor[vendor].some((option) => option.value === trimmedValue);
}

export function getRuntimeProviderModelLabel(
  value: string,
  vendor?: RuntimeProviderVendor,
): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return vendor
      ? getRuntimeProviderModelLabel(getDefaultRuntimeProviderModelForVendor(vendor), vendor)
      : "";
  }

  const options = vendor
    ? getRuntimeProviderModelOptions(vendor, trimmedValue)
    : [...openAiRuntimeProviderModels, ...deepSeekRuntimeProviderModels];

  return options.find((option) => option.value === trimmedValue)?.label ?? trimmedValue;
}

export function resolveRuntimeProviderEffectiveModel(
  provider: Pick<RuntimeProviderProfile, "vendor" | "model">,
) {
  const trimmedModel = provider.model.trim();
  return trimmedModel || getDefaultRuntimeProviderModelForVendor(provider.vendor);
}

export function getRuntimeProviderFormValues(
  profile: RuntimeProviderProfile | null,
): RuntimeProviderFormValues {
  const vendor = normalizeRuntimeProviderVendor(profile?.vendor ?? defaultRuntimeProviderVendor);

  return {
    name: profile?.name ?? "",
    vendor,
    baseUrl:
      profile?.baseUrl.trim() || getDefaultRuntimeProviderBaseUrlForVendor(vendor),
    model: profile?.model ?? "",
    apiKey: profile?.apiKey ?? "",
  };
}

export function resolveActiveRuntimeProvider(
  settingsDraft: Pick<SettingsDraft, "runtimeProviderProfiles" | "activeRuntimeProviderId">,
) {
  if (!settingsDraft.runtimeProviderProfiles.length) {
    return null;
  }

  return (
    settingsDraft.runtimeProviderProfiles.find(
      (profile) => profile.id === settingsDraft.activeRuntimeProviderId,
    ) ?? settingsDraft.runtimeProviderProfiles[0]
  );
}

export function buildDefaultRuntimeProviderName(index: number) {
  return `Provider ${index}`;
}

export function createRuntimeProviderProfileDraft(index: number): RuntimeProviderProfile {
  return {
    id: generateRuntimeProviderProfileId(),
    name: buildDefaultRuntimeProviderName(index),
    vendor: defaultRuntimeProviderVendor,
    baseUrl: getDefaultRuntimeProviderBaseUrlForVendor(defaultRuntimeProviderVendor),
    apiKey: "",
    model: "",
  };
}

export function replaceRuntimeProviderProfile(
  profiles: RuntimeProviderProfile[],
  nextProfile: RuntimeProviderProfile,
) {
  return profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile));
}

export function validateRuntimeProviderName(value: string) {
  if (value.trim().length > 0) {
    return undefined;
  }

  return "Enter a provider name.";
}

export function normalizeRuntimeProviderName(value: string, fallback: string) {
  const trimmedValue = value.trim();
  return trimmedValue || fallback;
}

export function validateRuntimeProviderVendor(value: string) {
  if (isSupportedRuntimeProviderVendor(value)) {
    return undefined;
  }

  return "Choose a supported vendor.";
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

export function normalizeRuntimeProviderBaseUrl(
  value: string,
  vendor: RuntimeProviderVendor = defaultRuntimeProviderVendor,
) {
  const trimmedValue = value.trim().replace(/\/+$/, "");
  return trimmedValue || getDefaultRuntimeProviderBaseUrlForVendor(vendor);
}

export function validateRuntimeProviderModel(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (/\s/.test(trimmedValue)) {
    return "Model id cannot contain spaces or line breaks.";
  }

  return undefined;
}

export function normalizeRuntimeProviderModel(value: string) {
  return value.trim();
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

function generateRuntimeProviderProfileId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `provider_${crypto.randomUUID().replace(/-/g, "")}`;
  }

  return `provider_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
