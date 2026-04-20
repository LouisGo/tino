import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import {
  resolveProviderAccessConfig,
  type ProviderAccessConfig,
} from "@/features/ai/lib/provider-access";
import {
  buildHomeChatContextWindow,
  getLatestHomeChatUserMessage,
} from "@/features/chat/lib/home-chat-context-window";
import {
  generateHomeChatConversationTitle,
  streamHomeChatConversation,
} from "@/features/chat/lib/home-chat-runtime";
import {
  appendHomeChatUserMessage,
  createHomeChatConversation,
  getHomeChatConversation,
  homeChatConversationsUpdatedEvent,
  isTauriRuntime,
  listHomeChatConversations,
  replaceLatestHomeChatAssistantMessage,
  rewriteLatestHomeChatUserMessage,
  updateHomeChatConversationTitle,
} from "@/lib/tauri";
import type {
  HomeChatConversationDetail,
  HomeChatConversationSummary,
  HomeChatMessageStatus,
} from "@/types/shell";

type ResolvedProviderAccess = ReturnType<typeof resolveProviderAccessConfig>;

type LiveAssistantState = {
  conversationId: string;
  text: string;
  reasoningText: string;
};

type UseHomeChatWorkspaceOptions = {
  providerAccess: ResolvedProviderAccess;
  providerConfig: ProviderAccessConfig;
};

type ClearedComposerUndoState = {
  value: string;
};

export function useHomeChatWorkspace({
  providerAccess,
  providerConfig,
}: UseHomeChatWorkspaceOptions) {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isDraftConversation, setIsDraftConversation] = useState(true);
  const [newConversationDraft, setNewConversationDraft] = useState("");
  const [historyComposerValue, setHistoryComposerValue] = useState("");
  const [clearedComposerUndo, setClearedComposerUndo] = useState<ClearedComposerUndoState | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isPersistingTurn, setIsPersistingTurn] = useState(false);
  const [isEditingLatestUserMessage, setIsEditingLatestUserMessage] = useState(false);
  const [liveAssistant, setLiveAssistant] = useState<LiveAssistantState | null>(null);
  const didInitializeSelection = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const editComposerRestoreRef = useRef<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: queryKeys.homeChatConversations(),
    queryFn: listHomeChatConversations,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });
  const activeConversationQuery = useQuery({
    queryKey: activeConversationId
      ? queryKeys.homeChatConversation(activeConversationId)
      : ["home-chat-conversation", "draft"],
    queryFn: () => getHomeChatConversation(activeConversationId!),
    enabled: Boolean(activeConversationId),
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (didInitializeSelection.current || conversationsQuery.isLoading) {
      return;
    }

    didInitializeSelection.current = true;
    const latestConversation = conversationsQuery.data?.[0];
    if (latestConversation) {
      setActiveConversationId(latestConversation.id);
      setIsDraftConversation(false);
      return;
    }

    setActiveConversationId(null);
    setIsDraftConversation(true);
  }, [conversationsQuery.data, conversationsQuery.isLoading]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let dispose: null | (() => void) = null;
    void homeChatConversationsUpdatedEvent.listen(({ payload }) => {
      if (payload.refreshList) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.homeChatConversations() });
      }

      if (payload.refreshConversation && payload.conversationId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.homeChatConversation(payload.conversationId),
        });
      }
    }).then((nextDispose) => {
      dispose = nextDispose;
    });

    return () => {
      dispose?.();
    };
  }, [queryClient]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) {
      return null;
    }

    return (
      activeConversationQuery.data
      ?? queryClient.getQueryData<HomeChatConversationDetail>(
        queryKeys.homeChatConversation(activeConversationId),
      )
      ?? null
    );
  }, [activeConversationId, activeConversationQuery.data, queryClient]);
  const composerValue = isDraftConversation
    ? newConversationDraft
    : historyComposerValue;

  const isStreaming = liveAssistant !== null;
  const isBusy = isPersistingTurn || isStreaming;
  const latestUserMessage = activeConversation
    ? getLatestHomeChatUserMessage(activeConversation.messages)
    : null;
  const latestAssistantMessage = activeConversation
    ? [...activeConversation.messages].reverse().find((message) => message.role === "assistant") ?? null
    : null;

  const syncConversationDetailCache = useCallback((detail: HomeChatConversationDetail) => {
    queryClient.setQueryData(queryKeys.homeChatConversation(detail.conversation.id), detail);
    queryClient.setQueryData<HomeChatConversationSummary[]>(
      queryKeys.homeChatConversations(),
      (current) => upsertConversationSummary(current ?? [], detail.conversation),
    );
  }, [queryClient]);

  const syncConversationSummaryCache = useCallback((summary: HomeChatConversationSummary) => {
    queryClient.setQueryData<HomeChatConversationSummary[]>(
      queryKeys.homeChatConversations(),
      (current) => upsertConversationSummary(current ?? [], summary),
    );
    queryClient.setQueryData<HomeChatConversationDetail | undefined>(
      queryKeys.homeChatConversation(summary.id),
      (current) => (
        current
          ? {
              ...current,
              conversation: summary,
            }
          : current
      ),
    );
  }, [queryClient]);

  const setComposerValue = useCallback((value: string) => {
    if (isDraftConversation) {
      setNewConversationDraft(value);
    } else {
      setHistoryComposerValue(value);
    }

    if (isDraftConversation && value.length > 0) {
      setClearedComposerUndo(null);
    }
  }, [isDraftConversation]);

  const generateConversationTitle = useCallback(async (
    conversationId: string,
    firstUserMessage: string,
  ) => {
    const title = await generateHomeChatConversationTitle({
      providerConfig,
      firstUserMessage,
    });
    const summary = await updateHomeChatConversationTitle({
      conversationId,
      title: title.title,
      titleStatus: title.titleStatus,
      titleSource: title.titleSource,
    });
    syncConversationSummaryCache(summary);
  }, [providerConfig, syncConversationSummaryCache]);

  const runAssistantStream = useCallback(async (options: {
    conversation: HomeChatConversationDetail;
    dropTrailingAssistant?: boolean;
  }) => {
    if (!providerAccess.isConfigured) {
      throw new Error("AI provider is not configured.");
    }

    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    let latestText = "";
    let latestReasoningText = "";

    setLiveAssistant({
      conversationId: options.conversation.conversation.id,
      text: "",
      reasoningText: "",
    });

    try {
      const result = await streamHomeChatConversation({
        providerConfig,
        messages: buildHomeChatContextWindow(options.conversation.messages, {
          dropTrailingAssistant: options.dropTrailingAssistant,
        }),
        abortSignal: abortController.signal,
        onTextStream: (progress) => {
          latestText = progress.text;
          latestReasoningText = progress.reasoningText;
          setLiveAssistant({
            conversationId: options.conversation.conversation.id,
            text: progress.text,
            reasoningText: progress.reasoningText,
          });
        },
      });
      const detail = await replaceLatestHomeChatAssistantMessage({
        conversationId: options.conversation.conversation.id,
        content: result.text,
        reasoningText: result.reasoningText,
        status: "completed",
        errorMessage: null,
        providerLabel: providerAccess.providerLabel,
        responseModel: result.responseModel,
      });
      syncConversationDetailCache(detail);
      setWorkspaceError(null);
    } catch (error) {
      const normalizedMessage = error instanceof Error ? error.message : "Request failed.";
      const stoppedByUser = abortController.signal.aborted;
      const status: HomeChatMessageStatus = stoppedByUser ? "stopped" : "failed";
      const detail = await replaceLatestHomeChatAssistantMessage({
        conversationId: options.conversation.conversation.id,
        content: latestText,
        reasoningText: latestReasoningText,
        status,
        errorMessage: stoppedByUser ? "Generation stopped." : normalizedMessage,
        providerLabel: providerAccess.providerLabel,
        responseModel: null,
      });
      syncConversationDetailCache(detail);
      setWorkspaceError(stoppedByUser ? null : normalizedMessage);
    } finally {
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
      }
      setLiveAssistant((current) => (
        current?.conversationId === options.conversation.conversation.id ? null : current
      ));
    }
  }, [providerAccess, providerConfig, syncConversationDetailCache]);

  const submitComposer = useCallback(async () => {
    const nextPrompt = composerValue.trim();
    if (!nextPrompt || isBusy) {
      return;
    }
    if (!providerAccess.isConfigured) {
      setWorkspaceError("AI provider is not configured.");
      return;
    }

    setWorkspaceError(null);
    setIsPersistingTurn(true);

    try {
      if (isDraftConversation || !activeConversationId) {
        const detail = await createHomeChatConversation(nextPrompt);
        syncConversationDetailCache(detail);
        setActiveConversationId(detail.conversation.id);
        setIsDraftConversation(false);
        setNewConversationDraft("");
        setHistoryComposerValue("");
        setIsEditingLatestUserMessage(false);
        editComposerRestoreRef.current = null;
        void generateConversationTitle(detail.conversation.id, nextPrompt);
        await runAssistantStream({ conversation: detail });
        return;
      }

      if (isEditingLatestUserMessage) {
        const detail = await rewriteLatestHomeChatUserMessage(activeConversationId, nextPrompt);
        syncConversationDetailCache(detail);
        setHistoryComposerValue("");
        setIsEditingLatestUserMessage(false);
        editComposerRestoreRef.current = null;
        await runAssistantStream({ conversation: detail });
        return;
      }

      const detail = await appendHomeChatUserMessage(activeConversationId, nextPrompt);
      syncConversationDetailCache(detail);
      setHistoryComposerValue("");
      await runAssistantStream({ conversation: detail });
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setIsPersistingTurn(false);
    }
  }, [
    activeConversationId,
    composerValue,
    generateConversationTitle,
    isBusy,
    isDraftConversation,
    isEditingLatestUserMessage,
    providerAccess.isConfigured,
    runAssistantStream,
    syncConversationDetailCache,
  ]);

  const retryLatestAssistant = useCallback(async () => {
    if (!activeConversation || isBusy) {
      return;
    }

    setWorkspaceError(null);
    await runAssistantStream({
      conversation: activeConversation,
      dropTrailingAssistant: true,
    });
  }, [activeConversation, isBusy, runAssistantStream]);

  const startEditingLatestUserMessage = useCallback(() => {
    if (!latestUserMessage || isBusy) {
      return;
    }

    editComposerRestoreRef.current = composerValue;
    setComposerValue(latestUserMessage.content);
    setIsEditingLatestUserMessage(true);
    setWorkspaceError(null);
  }, [composerValue, isBusy, latestUserMessage, setComposerValue]);

  const cancelEditingLatestUserMessage = useCallback(() => {
    setIsEditingLatestUserMessage(false);
    setComposerValue(editComposerRestoreRef.current ?? "");
    editComposerRestoreRef.current = null;
  }, [setComposerValue]);

  const stopStreaming = useCallback(() => {
    activeAbortControllerRef.current?.abort();
  }, []);

  const selectConversation = useCallback((conversationId: string) => {
    if (isBusy) {
      return;
    }

    setActiveConversationId(conversationId);
    setIsDraftConversation(false);
    setIsEditingLatestUserMessage(false);
    editComposerRestoreRef.current = null;
    setWorkspaceError(null);
    setClearedComposerUndo(null);
  }, [isBusy]);

  const startNewConversation = useCallback(() => {
    if (isBusy) {
      return;
    }

    const hasHistoryDraft = !isDraftConversation && historyComposerValue.length > 0;
    if (hasHistoryDraft) {
      setClearedComposerUndo({
        value: historyComposerValue,
      });
      setNewConversationDraft("");
    } else {
      setClearedComposerUndo(null);
    }

    setActiveConversationId(null);
    setIsDraftConversation(true);
    setIsEditingLatestUserMessage(false);
    editComposerRestoreRef.current = null;
    setWorkspaceError(null);
  }, [historyComposerValue, isBusy, isDraftConversation]);

  const undoClearedComposerValue = useCallback(() => {
    if (!clearedComposerUndo || !isDraftConversation) {
      return false;
    }

    setNewConversationDraft(clearedComposerUndo.value);
    setClearedComposerUndo(null);
    return true;
  }, [clearedComposerUndo, isDraftConversation]);

  return {
    activeConversation,
    activeConversationId,
    composerValue,
    conversations: conversationsQuery.data ?? [],
    conversationsLoading: conversationsQuery.isLoading,
    conversationLoading: activeConversationQuery.isLoading,
    isBusy,
    isDraftConversation,
    isEditingLatestUserMessage,
    isStreaming,
    latestAssistantMessage,
    latestUserMessage,
    liveAssistant,
    providerConfigured: providerAccess.isConfigured,
    setComposerValue,
    selectConversation,
    startNewConversation,
    submitComposer,
    retryLatestAssistant,
    startEditingLatestUserMessage,
    cancelEditingLatestUserMessage,
    stopStreaming,
    undoClearedComposerValue,
    workspaceError,
  };
}

function upsertConversationSummary(
  current: HomeChatConversationSummary[],
  summary: HomeChatConversationSummary,
) {
  const next = [
    summary,
    ...current.filter((item) => item.id !== summary.id),
  ];

  return next.sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
}
