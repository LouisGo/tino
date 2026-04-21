import { useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, FolderRoot } from "lucide-react";

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
import { getAiSystemSnapshot, getDashboardSnapshot, isTauriRuntime } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { BatchCompileRuntimeStatus, RuntimeProviderProfile } from "@/types/shell";

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

      <div className="app-page-rail flex items-start justify-between gap-4 [--app-page-rail-base:42rem] [--app-page-rail-growth:22vw]">
        <KnowledgeRootMeta knowledgeRoot={knowledgeRoot} />
        <div className="app-home-meta-cluster">
          <AiOpsSummaryDock />
          <VersionMeta version={appVersion} />
        </div>
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

function AiOpsSummaryDock() {
  const tDashboard = useScopedT("dashboard");
  const [isOpen, setIsOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const aiSystemQuery = useQuery({
    queryKey: queryKeys.aiSystemSnapshot(),
    queryFn: getAiSystemSnapshot,
    staleTime: 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!dockRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const runtimeLabel = aiSystemQuery.data
    ? formatAiOpsRuntimeLabel(tDashboard, aiSystemQuery.data.runtime.status)
    : aiSystemQuery.isError
      ? tDashboard("aiOps.status.unavailable")
      : tDashboard("aiOps.status.loading");
  const sourceLabel = aiSystemQuery.data?.capability.backgroundSourceLabel
    ?? aiSystemQuery.data?.capability.activeProviderName
    ?? tDashboard("aiOps.summary.unconfiguredSource");
  const tone = resolveAiOpsTriggerTone(aiSystemQuery.data, aiSystemQuery.isError);

  return (
    <div ref={dockRef} className="app-home-ai-ops-dock">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="home-ai-ops-panel"
        aria-haspopup="dialog"
        className="app-home-ai-ops-trigger"
        data-tone={tone}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        <span className="app-home-ai-ops-trigger-icon">
          <Activity className="size-3.5" />
        </span>
        <span className="app-home-ai-ops-trigger-copy">
          <span className="app-home-ai-ops-trigger-topline">
            <span className="app-home-ai-ops-trigger-label">{tDashboard("aiOps.label")}</span>
            <span aria-hidden className="app-home-ai-ops-trigger-dot" />
            <span className="app-home-ai-ops-trigger-runtime">{runtimeLabel}</span>
          </span>
          <span className="app-home-ai-ops-trigger-status">
            {sourceLabel}
          </span>
        </span>
        <ChevronDown
          className={cn("app-home-ai-ops-trigger-chevron", isOpen && "is-open")}
        />
      </button>

      {isOpen ? (
        <div
          id="home-ai-ops-panel"
          className="app-home-ai-ops-panel"
          role="dialog"
          aria-label={tDashboard("aiOps.label")}
        >
          <AiOpsSummaryCard />
        </div>
      ) : null}
    </div>
  );
}

function formatAiOpsRuntimeLabel(
  tDashboard: ReturnType<typeof useScopedT<"dashboard">>,
  status: BatchCompileRuntimeStatus,
) {
  switch (status) {
    case "not_bootstrapped":
      return tDashboard("aiOps.status.notBootstrapped");
    case "awaiting_capability":
      return tDashboard("aiOps.status.awaitingCapability");
    case "idle":
      return tDashboard("aiOps.status.idle");
    case "running":
      return tDashboard("aiOps.status.running");
    case "retry_backoff":
      return tDashboard("aiOps.status.retryBackoff");
    case "blocked":
      return tDashboard("aiOps.status.blocked");
  }

  return tDashboard("aiOps.status.loading");
}

function resolveAiOpsTriggerTone(
  snapshot: Awaited<ReturnType<typeof getAiSystemSnapshot>> | undefined,
  isError: boolean,
) {
  if (isError || !snapshot) {
    return "secondary";
  }

  if (
    snapshot.runtime.lastError
    || !snapshot.capability.backgroundCompileConfigured
    || snapshot.runtime.status === "awaiting_capability"
    || snapshot.runtime.status === "blocked"
  ) {
    return "warning";
  }

  if (
    snapshot.runtime.status === "not_bootstrapped"
    || snapshot.runtime.status === "retry_backoff"
  ) {
    return "secondary";
  }

  return "success";
}
