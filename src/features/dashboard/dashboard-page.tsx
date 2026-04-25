import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { resolveProviderAccessConfig } from "@/features/ai/lib/provider-access";
import { HomeChatWorkspace } from "@/features/chat/components/home-chat-workspace";
import {
  getRuntimeProviderModelLabel,
  getRuntimeProviderModelOptions,
  isRuntimeProviderModelAvailableForVendor,
  resolveActiveRuntimeProvider,
  resolveRuntimeProviderEffectiveModel,
} from "@/features/settings/lib/runtime-provider";
import { usePersistedAppSettings } from "@/hooks/use-persisted-app-settings";
import { useScopedT } from "@/i18n";
import type { RuntimeProviderProfile } from "@/types/shell";

const emptyRuntimeProviderProfiles: RuntimeProviderProfile[] = [];

export function DashboardPage() {
  const tDashboard = useScopedT("dashboard");
  const settingsQuery = usePersistedAppSettings();
  const [selectedHomeProviderId, setSelectedHomeProviderId] = useState<string | null>(null);
  const [homeModelSelections, setHomeModelSelections] = useState<Record<string, string>>({});

  const providerProfiles = settingsQuery.data?.runtimeProviderProfiles ?? emptyRuntimeProviderProfiles;
  const defaultProvider = settingsQuery.data
    ? resolveActiveRuntimeProvider(settingsQuery.data)
    : null;
  const selectedHomeProvider =
    resolveSelectedHomeProvider(providerProfiles, defaultProvider, selectedHomeProviderId);
  const selectedHomeModel = selectedHomeProvider
    ? resolveHomeSelectedModel(selectedHomeProvider, homeModelSelections)
    : "";
  const selectedHomeModelLabel = selectedHomeProvider
    ? getRuntimeProviderModelLabel(selectedHomeModel, selectedHomeProvider.vendor)
    : "";
  const providerConfig = resolveHomeProviderConfig(selectedHomeProvider, selectedHomeModel);
  const providerAccess = resolveProviderAccessConfig(providerConfig);
  const selectedHomeRuntimeOptionValue = selectedHomeProvider
    ? buildHomeRuntimeOptionValue(selectedHomeProvider.id, selectedHomeModel)
    : undefined;
  const suggestionPrompts = [
    tDashboard("chat.suggestion1"),
    tDashboard("chat.suggestion2"),
    tDashboard("chat.suggestion3"),
    tDashboard("chat.suggestion4"),
  ];

  function handleHomeRuntimeChange(nextValue: string) {
    const nextSelection = parseHomeRuntimeOptionValue(nextValue);
    if (!nextSelection) {
      return;
    }

    setHomeModelSelections((currentSelections) => ({
      ...currentSelections,
      [nextSelection.providerId]: nextSelection.model,
    }));
    setSelectedHomeProviderId(nextSelection.providerId);
  }

  return (
    <div className="app-home-shell app-page-shell relative flex h-full w-full min-h-0 flex-col overflow-hidden">
      <div className="app-page-rail flex min-h-0 flex-1 [--app-page-rail-base:86rem] [--app-page-rail-growth:18vw]">
        <HomeChatWorkspace
          providerAccess={providerAccess}
          providerConfig={providerConfig}
          providerControls={(
            <Select
              value={selectedHomeRuntimeOptionValue}
              onValueChange={handleHomeRuntimeChange}
              disabled={!providerProfiles.length || settingsQuery.isLoading}
            >
              <SelectTrigger
                aria-label={tDashboard("chat.modelLabel")}
                className="app-home-model-trigger app-home-chat-provider-trigger !h-auto !w-auto !border-0 !bg-transparent !shadow-none focus:!border-transparent"
              >
                {selectedHomeProvider ? (
                  <div className="app-home-chat-provider-trigger-copy">
                    <span className="app-home-chat-provider-trigger-label">
                      {selectedHomeModelLabel}
                    </span>
                    <span className="app-home-chat-provider-trigger-subtitle">
                      {selectedHomeProvider.name}
                    </span>
                  </div>
                ) : (
                  <span className="truncate text-sm text-muted-foreground">
                    {tDashboard("chat.modelLabel")}
                  </span>
                )}
              </SelectTrigger>
              <SelectContent>
                {providerProfiles.map((profile) => {
                  const selectedModelForProfile = resolveHomeSelectedModel(
                    profile,
                    homeModelSelections,
                  );
                  const modelOptions = getRuntimeProviderModelOptions(
                    profile.vendor,
                    selectedModelForProfile,
                  );

                  return (
                    <SelectGroup key={profile.id}>
                      <SelectLabel className="px-4 pb-2 pt-3 text-[0.72rem] font-semibold tracking-[0.08em] text-foreground/42 uppercase first:pt-1">
                        {profile.name}
                      </SelectLabel>
                      {modelOptions.map((option) => (
                        <SelectItem
                          key={buildHomeRuntimeOptionValue(profile.id, option.value)}
                          value={buildHomeRuntimeOptionValue(profile.id, option.value)}
                          textValue={`${profile.name} ${option.label}`}
                        >
                          <span>{option.label}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          suggestionPrompts={suggestionPrompts}
        />
      </div>
    </div>
  );
}

function resolveHomeProviderConfig(
  provider: RuntimeProviderProfile | null,
  selectedModel: string,
) {
  if (provider) {
    return {
      ...provider,
      model: selectedModel,
    };
  }

  return {
    vendor: "openai" as const,
    apiKey: "",
    baseUrl: "",
    model: "",
  };
}

function resolveSelectedHomeProvider(
  providerProfiles: RuntimeProviderProfile[],
  defaultProvider: RuntimeProviderProfile | null,
  selectedProviderId: string | null,
) {
  if (selectedProviderId) {
    const selectedProvider = providerProfiles.find((profile) => profile.id === selectedProviderId);
    if (selectedProvider) {
      return selectedProvider;
    }
  }

  if (defaultProvider) {
    return defaultProvider;
  }

  return providerProfiles[0] ?? null;
}

function resolveHomeSelectedModel(
  provider: RuntimeProviderProfile,
  selections: Record<string, string>,
) {
  const selectedModel = selections[provider.id]?.trim() ?? "";
  if (selectedModel && isRuntimeProviderModelAvailableForVendor(provider.vendor, selectedModel)) {
    return selectedModel;
  }

  return resolveRuntimeProviderEffectiveModel(provider);
}

function buildHomeRuntimeOptionValue(providerId: string, model: string) {
  return `${providerId}::${model}`;
}

function parseHomeRuntimeOptionValue(value: string) {
  const separatorIndex = value.indexOf("::");
  if (separatorIndex < 0) {
    return null;
  }

  const providerId = value.slice(0, separatorIndex);
  const model = value.slice(separatorIndex + 2);
  if (!providerId || !model) {
    return null;
  }

  return {
    providerId,
    model,
  };
}
