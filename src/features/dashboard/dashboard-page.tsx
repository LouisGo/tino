import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { FolderRoot } from "lucide-react";

import { queryKeys } from "@/app/query-keys";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { AiWorkInProgressBadge } from "@/features/ai/components/ai-work-in-progress-badge";
import { AiOpsSummaryCard } from "@/features/dashboard/components/ai-ops-summary-card";
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
import { getDashboardSnapshot, isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { RuntimeProviderProfile } from "@/types/shell";

const emptyRuntimeProviderProfiles: RuntimeProviderProfile[] = [];

export function DashboardPage() {
  const tDashboard = useScopedT("dashboard");
  const snapshotQuery = useQuery({
    queryKey: queryKeys.dashboardSnapshot(),
    queryFn: getDashboardSnapshot,
    staleTime: 2 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });
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
  const knowledgeRoot =
    snapshotQuery.data?.defaultKnowledgeRoot ??
    tDashboard("cards.knowledgeRoot.fallbackValue");
  const appVersion = snapshotQuery.data?.appVersion ?? "0.1.0";
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
      <div className="pointer-events-none fixed top-4.5 right-[100px] z-40 md:top-4.5 md:right-[100px]">
        <AiWorkInProgressBadge compact />
      </div>

      <div className="app-page-rail flex flex-wrap items-start justify-between gap-4 [--app-page-rail-base:42rem] [--app-page-rail-growth:22vw]">
        <KnowledgeRootMeta knowledgeRoot={knowledgeRoot} />
        <AiOpsSummaryCard />
        <VersionMeta version={appVersion} />
      </div>

      <div className="app-page-rail flex min-h-0 flex-1 [--app-page-rail-base:80rem] [--app-page-rail-growth:18vw]">
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

function KnowledgeRootMeta({ knowledgeRoot }: { knowledgeRoot: string }) {
  const tDashboard = useScopedT("dashboard");

  return (
    <div
      className={cn(
        "app-home-meta-link max-w-full min-w-0 flex-1",
        !isTauriRuntime() && "pointer-events-none",
      )}
      title={`${tDashboard("cards.knowledgeRoot.label")}: ${knowledgeRoot}`}
    >
      <span className="app-home-meta-icon">
        <FolderRoot className="size-4" />
      </span>
      <span className="truncate">{knowledgeRoot}</span>
    </div>
  );
}

function VersionMeta({ version }: { version: string }) {
  return <div className="app-home-version-chip">v{version}</div>;
}
