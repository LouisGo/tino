import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUp, FolderRoot, LoaderCircle, Sparkles } from "lucide-react";

import { queryKeys } from "@/app/query-keys";
import { Button } from "@/components/ui/button";
import { AiWorkInProgressBadge } from "@/features/ai/components/ai-work-in-progress-badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { useCommand } from "@/core/commands";
import {
  createAiObjectGenerator,
  resolveProviderAccessConfig,
} from "@/features/ai/lib/provider-access";
import { HomeComposerDropOverlay } from "@/features/dashboard/components/home-composer-drop-overlay";
import { HomeAttachmentPicker } from "@/features/dashboard/components/home-attachment-picker";
import { HomeAttachmentStrip } from "@/features/dashboard/components/home-attachment-strip";
import { useHomeAttachmentTransfer } from "@/features/dashboard/hooks/use-home-attachment-transfer";
import { useHomeAttachments } from "@/features/dashboard/hooks/use-home-attachments";
import {
  HOME_ATTACHMENT_LIMIT,
  HOME_ATTACHMENT_WARNING_THRESHOLD,
} from "@/features/dashboard/lib/home-attachments";
import {
  getRuntimeProviderModelLabel,
  getRuntimeProviderModelOptions,
  isRuntimeProviderModelAvailableForVendor,
  resolveActiveRuntimeProvider,
  resolveRuntimeProviderEffectiveModel,
} from "@/features/settings/lib/runtime-provider";
import { useScopedT } from "@/i18n";
import {
  getAppSettings,
  getDashboardSnapshot,
  isTauriRuntime,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { RuntimeProviderProfile } from "@/types/shell";

type HomeAssistantTurn = {
  prompt: string;
  responseModel: string;
  text: string;
};

const emptyRuntimeProviderProfiles: RuntimeProviderProfile[] = [];
const MIN_PROMPT_ROWS = 2;
const MAX_PROMPT_ROWS = 8;
const EXPAND_PROMPT_ROWS = 3;
const COLLAPSE_PROMPT_ROWS = 2;

export function DashboardPage() {
  const tCommon = useScopedT("common");
  const tDashboard = useScopedT("dashboard");
  const revealPath = useCommand<{ path: string }>("system.revealPath");
  const snapshotQuery = useQuery({
    queryKey: queryKeys.dashboardSnapshot(),
    queryFn: getDashboardSnapshot,
    staleTime: 2 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });
  const settingsQuery = useQuery({
    queryKey: queryKeys.appSettings(),
    queryFn: getAppSettings,
    staleTime: 2 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });
  const {
    attachments,
    canAddAttachments,
    addAttachments,
    appendAttachments,
    removeAttachment,
  } = useHomeAttachments();
  const { isDropTargetActive, dragHandlers, onPasteCapture } = useHomeAttachmentTransfer({
    onAttachments: appendAttachments,
  });
  const [prompt, setPrompt] = useState("");
  const [lastTurn, setLastTurn] = useState<HomeAssistantTurn | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [selectedHomeProviderId, setSelectedHomeProviderId] = useState<string | null>(null);
  const [homeModelSelections, setHomeModelSelections] = useState<Record<string, string>>({});
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  const trimmedPrompt = prompt.trim();
  const suggestionPrompts = [
    tDashboard("chat.suggestion1"),
    tDashboard("chat.suggestion2"),
    tDashboard("chat.suggestion3"),
    tDashboard("chat.suggestion4"),
  ];
  const chatMutation = useMutation({
    mutationFn: async (nextPrompt: string) => {
      if (!providerAccess.isConfigured) {
        throw new Error(tDashboard("chat.setupHint"));
      }

      return createAiObjectGenerator(providerConfig).generateText({
        systemPrompt:
          "You are Tino, a concise AI assistant inside a personal knowledge workspace. Respond clearly, directly, and with practical next steps when useful.",
        userPrompt: nextPrompt,
        timeoutMs: 30_000,
      });
    },
  });

  const canSend =
    providerAccess.isConfigured &&
    trimmedPrompt.length > 0 &&
    !chatMutation.isPending;
  const hasConversationFeedback =
    chatMutation.isPending || chatMutation.isError || Boolean(lastTurn);
  const showLandingComposer = !hasConversationFeedback;
  const showLandingMock = showLandingComposer && trimmedPrompt.length === 0;
  const showSuggestionPrompts = !hasConversationFeedback;
  const attachmentCountText = attachments.length >= HOME_ATTACHMENT_WARNING_THRESHOLD
    ? tDashboard("chat.attachmentsUsage", {
        values: {
          count: attachments.length,
          limit: HOME_ATTACHMENT_LIMIT,
        },
      })
    : null;
  const attachmentCountTone = attachments.length >= HOME_ATTACHMENT_LIMIT ? "limit" : "default";

  const focusPromptInput = useEffectEvent(() => {
    const scheduleFocus = () => {
      const textarea = promptTextareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus({ preventScroll: true });
      const caretPosition = textarea.value.length;
      textarea.setSelectionRange(caretPosition, caretPosition);
    };

    window.requestAnimationFrame(scheduleFocus);
  });

  const syncPromptMetrics = useCallback((target?: HTMLTextAreaElement | null) => {
    const textarea = target ?? promptTextareaRef.current;
    if (!textarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 30;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const minHeight = lineHeight * MIN_PROMPT_ROWS + paddingTop + paddingBottom;
    const maxAutoGrowHeight = lineHeight * MAX_PROMPT_ROWS + paddingTop + paddingBottom;

    if (textarea.value.length === 0) {
      textarea.style.setProperty("height", `${minHeight}px`);
      textarea.scrollTo({ top: 0 });
      setIsPromptExpanded(false);
      return;
    }

    textarea.style.setProperty("height", "auto");
    const contentHeight = Math.max(textarea.scrollHeight, minHeight);
    const nextHeight = Math.min(contentHeight, maxAutoGrowHeight);
    const contentBoxHeight = Math.max(
      contentHeight - paddingTop - paddingBottom,
      lineHeight * MIN_PROMPT_ROWS,
    );
    const nextRowCount = Math.max(
      MIN_PROMPT_ROWS,
      Math.ceil(contentBoxHeight / lineHeight - 0.04),
    );
    const nextExpanded = isPromptExpanded
      ? nextRowCount > COLLAPSE_PROMPT_ROWS
      : nextRowCount >= EXPAND_PROMPT_ROWS;
    const shouldKeepCaretVisible =
      document.activeElement === textarea &&
      textarea.selectionStart === textarea.selectionEnd &&
      textarea.selectionEnd === textarea.value.length;

    textarea.style.setProperty("height", `${nextExpanded ? nextHeight : minHeight}px`);

    if (isPromptExpanded !== nextExpanded) {
      setIsPromptExpanded(nextExpanded);
    }

    if (shouldKeepCaretVisible) {
      requestAnimationFrame(() => {
        if (document.activeElement === textarea) {
          textarea.scrollTo({ top: textarea.scrollHeight });
        }
      });
    }
  }, [isPromptExpanded]);

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      syncPromptMetrics();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [prompt, showLandingMock, syncPromptMetrics]);

  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncPromptMetrics();
    });

    resizeObserver.observe(textarea);

    const composer = textarea.closest(".app-home-composer");
    if (composer instanceof Element) {
      resizeObserver.observe(composer);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [showLandingMock, syncPromptMetrics]);

  useEffect(() => {
    focusPromptInput();
  }, []);

  useEffect(() => {
    let unlistenWindowFocus = () => {};
    const handleWindowFocus = () => {
      focusPromptInput();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        focusPromptInput();
      }
    };

    window.addEventListener("focus", handleWindowFocus, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (isTauriRuntime()) {
      void getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) {
          focusPromptInput();
        }
      }).then((dispose) => {
        unlistenWindowFocus = dispose;
      });
    }

    return () => {
      window.removeEventListener("focus", handleWindowFocus, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unlistenWindowFocus();
    };
  }, []);

  function handleSubmit() {
    if (!canSend) {
      return;
    }

    chatMutation.mutate(trimmedPrompt, {
      onSuccess: (result, submittedPrompt) => {
        setLastTurn({
          prompt: submittedPrompt,
          responseModel: result.responseModel,
          text: result.text,
        });
        setPrompt("");
      },
    });
  }

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
    <div
      className="app-home-shell app-page-shell relative flex h-full w-full min-h-0 flex-col overflow-hidden"
      {...dragHandlers}
    >
      <div className="pointer-events-none fixed top-4.5 right-[100px] z-40 md:top-4.5 md:right-[100px]">
        <AiWorkInProgressBadge compact />
      </div>

      <div className="app-page-rail flex items-start justify-between gap-4 [--app-page-rail-base:42rem] [--app-page-rail-growth:22vw]">
        <KnowledgeRootMeta
          knowledgeRoot={knowledgeRoot}
          knowledgeRootLabel={tDashboard("cards.knowledgeRoot.label")}
          onReveal={
            snapshotQuery.data?.defaultKnowledgeRoot
              ? () =>
                  void revealPath.execute({
                    path: snapshotQuery.data.defaultKnowledgeRoot,
                  })
              : undefined
          }
        />

        <VersionMeta version={appVersion} />
      </div>

      <div
        className={cn(
          "app-home-stage flex flex-1 min-h-0 flex-col items-center overflow-hidden",
          hasConversationFeedback ? "justify-start pt-6 md:pt-8" : "justify-center pb-6",
        )}
      >
        <div className="app-page-rail min-h-0 [--app-page-rail-base:38rem] [--app-page-rail-growth:18vw]">
          <div className="app-home-stack text-left">
            <div className="app-home-copy">
              <p className="app-home-eyebrow">{tDashboard("chat.eyebrow")}</p>
              <h1 className="app-home-heading max-w-[10ch]">
                {tDashboard("chat.title")}
              </h1>
            </div>

            <form
              className={cn(
                "app-home-composer w-full",
                showLandingMock ? "app-home-composer-empty" : "app-home-composer-compact",
                isPromptExpanded && "app-home-composer-expanded",
                isDropTargetActive && "app-home-composer-drop-active",
              )}
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
              onPasteCapture={onPasteCapture}
            >
              {isDropTargetActive ? (
                <HomeComposerDropOverlay
                  title={tDashboard("chat.dropTitle")}
                  hint={tDashboard("chat.dropHint")}
                />
              ) : null}

              <div className="app-home-composer-body">
                <div className="app-home-composer-track">
                  <HomeAttachmentStrip
                    attachments={attachments}
                    attachmentsLabel={tDashboard("chat.attachmentsLabel")}
                    removeLabel={tDashboard("chat.removeAttachment")}
                    countText={attachmentCountText}
                    countTone={attachmentCountTone}
                    onRemove={removeAttachment}
                  />

                  <textarea
                    ref={promptTextareaRef}
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      syncPromptMetrics(event.currentTarget);
                    }}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) {
                        return;
                      }

                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmit();
                      }
                    }}
                    rows={MIN_PROMPT_ROWS}
                    placeholder={
                      showLandingMock
                        ? `${tDashboard("chat.mockTextLine1")}\n${tDashboard("chat.mockTextLine2")}`
                        : tDashboard("chat.placeholder")
                    }
                    className="app-home-input"
                  />
                </div>
              </div>

              <div className="app-home-composer-toolbar flex flex-wrap items-center justify-between gap-2.5 px-4 pb-3 pt-2.5 md:px-5">
                <HomeAttachmentPicker
                  attachmentsLabel={tDashboard("chat.attachmentsLabel")}
                  imageLabel={tDashboard("chat.attachmentImage")}
                  fileLabel={tDashboard("chat.attachmentFile")}
                  disabled={!canAddAttachments}
                  onPickImages={() => addAttachments("image")}
                  onPickFiles={() => addAttachments("file")}
                />

                <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                  <Select
                    value={selectedHomeRuntimeOptionValue}
                    onValueChange={handleHomeRuntimeChange}
                    disabled={
                      !providerProfiles.length
                      || settingsQuery.isLoading
                    }
                  >
                    <SelectTrigger
                      aria-label={tDashboard("chat.modelLabel")}
                      className="app-home-model-trigger min-h-[3.25rem] w-[220px] rounded-full py-2 md:w-[260px]"
                    >
                      {selectedHomeProvider ? (
                        <div className="flex min-w-0 flex-1 flex-col items-start leading-none">
                          <span className="w-full truncate text-[0.95rem] font-medium text-foreground">
                            {selectedHomeModelLabel}
                          </span>
                          <span className="mt-1 w-full truncate text-[0.72rem] font-medium text-foreground/50">
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

                  <Button
                    type="submit"
                    size="icon"
                    className="app-home-send-button"
                    disabled={!canSend}
                    aria-label={tDashboard("chat.send")}
                  >
                    {chatMutation.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ArrowUp className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>

            {showSuggestionPrompts ? (
              <div className="app-home-suggestion-list flex flex-wrap items-center gap-2.5">
                {suggestionPrompts.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPrompt(item)}
                    className="app-home-suggestion-chip"
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}

            {!providerAccess.isConfigured ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{tDashboard("chat.setupHint")}</span>
                <Button asChild variant="link" size="sm" className="h-auto px-0">
                  <Link to="/settings" hash="ai">{tCommon("navigation.settings")}</Link>
                </Button>
              </div>
            ) : null}

            {hasConversationFeedback ? (
              <HomeAssistantResult
                answer={
                  chatMutation.isPending
                    ? null
                    : chatMutation.isError
                      ? null
                      : lastTurn?.text ?? null
                }
                error={
                  chatMutation.isError
                    ? chatMutation.error instanceof Error
                      ? chatMutation.error.message
                      : tDashboard("chat.errorFallback")
                    : null
                }
                pending={chatMutation.isPending}
                prompt={
                  chatMutation.isPending
                    ? chatMutation.variables ?? trimmedPrompt
                    : lastTurn?.prompt ?? null
                }
                responseModel={lastTurn?.responseModel ?? null}
                resultLabel={tDashboard("chat.resultLabel")}
                thinkingLabel={tDashboard("chat.thinking")}
              />
            ) : null}
          </div>
        </div>
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

function KnowledgeRootMeta({
  knowledgeRoot,
  knowledgeRootLabel,
  onReveal,
}: {
  knowledgeRoot: string;
  knowledgeRootLabel: string;
  onReveal?: () => void;
}) {
  const content = (
    <>
      <span className="app-home-meta-icon">
        <FolderRoot className="size-4" />
      </span>
      <span className="truncate">{knowledgeRoot}</span>
    </>
  );

  if (!onReveal) {
    return (
      <div
        className="app-home-meta-link max-w-full min-w-0 flex-1"
        title={`${knowledgeRootLabel}: ${knowledgeRoot}`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onReveal}
      className="app-home-meta-link max-w-full min-w-0 flex-1 text-left"
      aria-label={knowledgeRootLabel}
      title={`${knowledgeRootLabel}: ${knowledgeRoot}`}
    >
      {content}
    </button>
  );
}

function VersionMeta({ version }: { version: string }) {
  return <div className="app-home-version-chip">v{version}</div>;
}

function HomeAssistantResult({
  answer,
  error,
  pending,
  prompt,
  responseModel,
  resultLabel,
  thinkingLabel,
}: {
  answer: string | null;
  error: string | null;
  pending: boolean;
  prompt: string | null;
  responseModel: string | null;
  resultLabel: string;
  thinkingLabel: string;
}) {
  return (
    <div className="app-page-rail app-home-response w-full overflow-hidden rounded-[24px] [--app-page-rail-base:32rem] [--app-page-rail-growth:10vw]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/65 px-4 py-3">
        <div className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Sparkles className="size-4 text-primary" />
          <span>{resultLabel}</span>
        </div>
        {responseModel ? (
          <span className="text-[11px] text-muted-foreground">{responseModel}</span>
        ) : null}
      </div>

      <div className="space-y-3 px-4 py-4">
        {prompt ? (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              You
            </p>
            <p className="line-clamp-2 text-[13px] leading-5 text-foreground/92">{prompt}</p>
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Tino
          </p>
          {pending ? (
            <div className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              <span>{thinkingLabel}</span>
            </div>
          ) : error ? (
            <p className="line-clamp-4 text-[13px] leading-6 text-destructive">{error}</p>
          ) : (
            <p className="line-clamp-5 whitespace-pre-wrap text-[13px] leading-6 text-foreground">
              {answer}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
