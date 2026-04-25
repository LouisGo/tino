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
import { useHomeChatRuntimeStore } from "@/features/chat/store/home-chat-runtime-store";
import {
  appendHomeChatUserMessage,
  createHomeChatConversation,
  deleteHomeChatConversation,
  getHomeChatConversation,
  homeChatConversationsUpdatedEvent,
  isTauriRuntime,
  listHomeChatConversations,
  replaceLatestHomeChatAssistantMessage,
  setHomeChatConversationPinned,
  updateHomeChatConversationTitle,
} from "@/lib/tauri";
import type {
  DeleteHomeChatConversationResult,
  HomeChatConversationDetail,
  HomeChatConversationSummary,
  HomeChatMessage,
  HomeChatMessageStatus,
} from "@/types/shell";

type ResolvedProviderAccess = ReturnType<typeof resolveProviderAccessConfig>;

type LiveAssistantState = {
  conversationId: string;
  replaceMessageId: string | null;
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

type AssistantMessageSnapshot = {
  content: string;
  reasoningText: string;
  status: HomeChatMessageStatus;
  errorMessage: string | null;
  providerLabel: string | null;
  responseModel: string | null;
};

export function useHomeChatWorkspace({
  providerAccess,
  providerConfig,
}: UseHomeChatWorkspaceOptions) {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isDraftConversation, setIsDraftConversation] = useState(true);
  const [newConversationDraft, setNewConversationDraft] = useState("");
  const [historyComposerValues, setHistoryComposerValues] = useState<Record<string, string>>({});
  const [clearedComposerUndo, setClearedComposerUndo] = useState<ClearedComposerUndoState | null>(null);
  const [draftWorkspaceError, setDraftWorkspaceError] = useState<string | null>(null);
  const [isPersistingDraftTurn, setIsPersistingDraftTurn] = useState(false);
  const [persistingConversationIds, setPersistingConversationIds] = useState<Record<string, true>>({});
  const [editingConversationIds, setEditingConversationIds] = useState<Record<string, true>>({});
  const didInitializeSelection = useRef(false);
  const conversationMutationQueueRef = useRef(new Map<string, Promise<void>>());
  const editComposerRestoreRef = useRef(new Map<string, string | null>());
  const conversationStreamState = useHomeChatRuntimeStore((state) => (
    activeConversationId ? state.streams[activeConversationId] ?? null : null
  ));
  const conversationWorkspaceError = useHomeChatRuntimeStore((state) => (
    activeConversationId ? state.conversationWorkspaceErrors[activeConversationId] ?? null : null
  ));
  const clearConversationRuntime = useHomeChatRuntimeStore((state) => state.clearConversationRuntime);
  const markStreamCanceledByUser = useHomeChatRuntimeStore((state) => state.markStreamCanceledByUser);
  const markStreamStopPersisted = useHomeChatRuntimeStore((state) => state.markStreamStopPersisted);
  const setConversationWorkspaceError = useHomeChatRuntimeStore((state) => state.setConversationWorkspaceError);
  const setStreamProgress = useHomeChatRuntimeStore((state) => state.setStreamProgress);
  const startStream = useHomeChatRuntimeStore((state) => state.startStream);
  const clearStream = useHomeChatRuntimeStore((state) => state.clearStream);

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

  const activeHistoryComposerValue = activeConversationId
    ? historyComposerValues[activeConversationId] ?? ""
    : "";
  const composerValue = isDraftConversation
    ? newConversationDraft
    : activeHistoryComposerValue;
  const liveAssistant: LiveAssistantState | null = activeConversationId && conversationStreamState?.isVisible
    ? {
        conversationId: activeConversationId,
        replaceMessageId: conversationStreamState.replaceMessageId,
        text: conversationStreamState.text,
        reasoningText: conversationStreamState.reasoningText,
      }
    : null;
  const isStreaming = Boolean(conversationStreamState?.isVisible);
  const isPersistingTurn = isDraftConversation
    ? isPersistingDraftTurn
    : activeConversationId
      ? Boolean(persistingConversationIds[activeConversationId])
      : false;
  const isBusy = isPersistingTurn || isStreaming;
  const isEditingLatestUserMessage = activeConversationId
    ? Boolean(editingConversationIds[activeConversationId])
    : false;
  const workspaceError = isDraftConversation
    ? draftWorkspaceError
    : conversationWorkspaceError;
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

  const removeConversationFromCache = useCallback((conversationId: string) => {
    queryClient.setQueryData<HomeChatConversationSummary[]>(
      queryKeys.homeChatConversations(),
      (current) => (current ?? []).filter((item) => item.id !== conversationId),
    );
    queryClient.removeQueries({
      queryKey: queryKeys.homeChatConversation(conversationId),
      exact: true,
    });
  }, [queryClient]);

  const setConversationHistoryComposerValue = useCallback((conversationId: string, value: string) => {
    setHistoryComposerValues((current) => setConversationScopedValue(current, conversationId, value));
  }, []);

  const setConversationPersisting = useCallback((conversationId: string, value: boolean) => {
    setPersistingConversationIds((current) => setConversationScopedValue(
      current,
      conversationId,
      value ? true : null,
    ));
  }, []);

  const setConversationEditing = useCallback((conversationId: string, value: boolean) => {
    setEditingConversationIds((current) => setConversationScopedValue(
      current,
      conversationId,
      value ? true : null,
    ));
  }, []);

  const runConversationMutation = useCallback(async <T>(
    conversationId: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const previousTail = conversationMutationQueueRef.current.get(conversationId) ?? Promise.resolve();
    let releaseTail: () => void = () => {};
    const nextTail = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });

    conversationMutationQueueRef.current.set(
      conversationId,
      previousTail.then(() => nextTail, () => nextTail),
    );

    await previousTail.catch(() => {});

    try {
      return await task();
    } finally {
      releaseTail();
      if (conversationMutationQueueRef.current.get(conversationId) === nextTail) {
        conversationMutationQueueRef.current.delete(conversationId);
      }
    }
  }, []);

  const clearConversationUiState = useCallback((conversationId: string) => {
    clearConversationRuntime(conversationId);
    conversationMutationQueueRef.current.delete(conversationId);
    editComposerRestoreRef.current.delete(conversationId);
    setHistoryComposerValues((current) => setConversationScopedValue(current, conversationId, null));
    setPersistingConversationIds((current) => setConversationScopedValue(current, conversationId, null));
    setEditingConversationIds((current) => setConversationScopedValue(current, conversationId, null));
  }, [clearConversationRuntime]);

  const setComposerValue = useCallback((value: string) => {
    if (isDraftConversation || !activeConversationId) {
      setNewConversationDraft(value);

      if (value.length > 0) {
        setClearedComposerUndo(null);
      }
      return;
    }

    setConversationHistoryComposerValue(activeConversationId, value);
  }, [activeConversationId, isDraftConversation, setConversationHistoryComposerValue]);

  const enterConversationEditMode = useCallback((options: {
    conversationId: string;
    restoreValue: string;
    userMessage: string;
  }) => {
    editComposerRestoreRef.current.set(options.conversationId, options.restoreValue);
    setConversationHistoryComposerValue(options.conversationId, options.userMessage);
    setConversationEditing(options.conversationId, true);
    setConversationWorkspaceError(options.conversationId, null);
  }, [
    setConversationEditing,
    setConversationHistoryComposerValue,
    setConversationWorkspaceError,
  ]);

  const exitConversationEditMode = useCallback((conversationId: string, options?: {
    restoreComposer?: boolean;
    nextComposerValue?: string;
  }) => {
    const nextComposerValue = options?.restoreComposer
      ? (editComposerRestoreRef.current.get(conversationId) ?? "")
      : (options?.nextComposerValue ?? "");

    editComposerRestoreRef.current.delete(conversationId);
    setConversationEditing(conversationId, false);
    setConversationHistoryComposerValue(conversationId, nextComposerValue);
  }, [setConversationEditing, setConversationHistoryComposerValue]);

  const persistAssistantMessage = useCallback(async (
    conversationId: string,
    snapshot: AssistantMessageSnapshot,
  ) => {
    const detail = await runConversationMutation(conversationId, () => replaceLatestHomeChatAssistantMessage({
      conversationId,
      content: snapshot.content,
      reasoningText: snapshot.reasoningText,
      status: snapshot.status,
      errorMessage: snapshot.errorMessage,
      providerLabel: snapshot.providerLabel,
      responseModel: snapshot.responseModel,
    }));
    syncConversationDetailCache(detail);
    return detail;
  }, [runConversationMutation, syncConversationDetailCache]);

  const generateConversationTitle = useCallback(async (
    conversationId: string,
    firstUserMessage: string,
  ) => {
    try {
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
    } catch {
      // Title generation is best-effort and should not break the chat flow.
    }
  }, [providerConfig, syncConversationSummaryCache]);

  const runAssistantStream = useCallback(async (options: {
    conversation: HomeChatConversationDetail;
    dropTrailingAssistant?: boolean;
  }) => {
    if (!providerAccess.isConfigured) {
      throw new Error("AI provider is not configured.");
    }

    const conversationId = options.conversation.conversation.id;
    const latestMessage = options.conversation.messages.at(-1);
    const streamRecord = startStream({
      conversationId,
      providerLabel: providerAccess.providerLabel,
      replaceMessageId:
        options.dropTrailingAssistant && latestMessage?.role === "assistant"
          ? latestMessage.id
          : null,
      responseModel: providerConfig.model || null,
    });
    const { abortController, runId } = streamRecord;
    let latestText = "";
    let latestReasoningText = "";

    try {
      const result = await streamHomeChatConversation({
        providerConfig,
        messages: buildHomeChatContextWindow(options.conversation.messages, {
          dropTrailingAssistant: options.dropTrailingAssistant,
        }),
        abortSignal: abortController.signal,
        onTextStream: (progress) => {
          const activeStream = useHomeChatRuntimeStore.getState().getStream(conversationId);
          if (
            abortController.signal.aborted
            || !activeStream
            || activeStream.runId !== runId
            || activeStream.canceledByUser
          ) {
            return;
          }

          latestText = progress.text;
          latestReasoningText = progress.reasoningText;
          setStreamProgress(conversationId, runId, {
            text: progress.text,
            reasoningText: progress.reasoningText,
          });
        },
      });

      const activeStream = useHomeChatRuntimeStore.getState().getStream(conversationId);
      if (!activeStream || activeStream.runId !== runId || activeStream.canceledByUser) {
        return;
      }

      await persistAssistantMessage(conversationId, {
        content: result.text,
        reasoningText: result.reasoningText,
        status: "completed",
        errorMessage: null,
        providerLabel: activeStream.providerLabel,
        responseModel: result.responseModel ?? activeStream.responseModel,
      });
      setConversationWorkspaceError(conversationId, null);
    } catch (error) {
      const normalizedMessage = error instanceof Error ? error.message : "Request failed.";
      const activeRecord = useHomeChatRuntimeStore.getState().getStream(conversationId);
      const superseded = Boolean(activeRecord && activeRecord.runId !== runId);
      const disposed = !activeRecord && abortController.signal.aborted;
      if (superseded || disposed) {
        return;
      }

      const stoppedByUser = (
        (activeRecord?.runId === runId && activeRecord.canceledByUser)
        || abortController.signal.aborted
      );

      try {
        if (!stoppedByUser || !(activeRecord?.runId === runId && activeRecord.stopPersisted)) {
          await persistAssistantMessage(conversationId, {
            content: latestText,
            reasoningText: latestReasoningText,
            status: stoppedByUser ? "stopped" : "failed",
            errorMessage: stoppedByUser ? "Generation stopped." : normalizedMessage,
            providerLabel: activeRecord?.providerLabel ?? streamRecord.providerLabel,
            responseModel: activeRecord?.responseModel ?? streamRecord.responseModel,
          });
        }
      } catch (persistError) {
        const persistMessage = persistError instanceof Error
          ? persistError.message
          : "Request failed.";

        if (!stoppedByUser) {
          setConversationWorkspaceError(conversationId, persistMessage);
        }

        return;
      }

      setConversationWorkspaceError(conversationId, stoppedByUser ? null : normalizedMessage);
    } finally {
      clearStream(conversationId, runId);
    }
  }, [
    clearStream,
    persistAssistantMessage,
    providerAccess,
    providerConfig,
    setConversationWorkspaceError,
    setStreamProgress,
    startStream,
  ]);

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
    if (
      conversationsQuery.isLoading
      || isDraftConversation
      || !activeConversationId
      || conversationsQuery.data?.some((conversation) => conversation.id === activeConversationId)
    ) {
      return;
    }

    clearConversationUiState(activeConversationId);
    const nextConversation = conversationsQuery.data?.[0] ?? null;
    if (nextConversation) {
      setActiveConversationId(nextConversation.id);
      setIsDraftConversation(false);
      return;
    }

    setActiveConversationId(null);
    setIsDraftConversation(true);
    setDraftWorkspaceError(null);
  }, [
    activeConversationId,
    clearConversationUiState,
    conversationsQuery.data,
    conversationsQuery.isLoading,
    isDraftConversation,
  ]);

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

  const submitComposer = useCallback(async () => {
    const nextPrompt = composerValue.trim();
    if (!nextPrompt || isBusy) {
      return;
    }
    if (!providerAccess.isConfigured) {
      if (isDraftConversation || !activeConversationId) {
        setDraftWorkspaceError("AI provider is not configured.");
      } else {
        setConversationWorkspaceError(activeConversationId, "AI provider is not configured.");
      }
      return;
    }

    if (isDraftConversation || !activeConversationId) {
      setDraftWorkspaceError(null);
      setIsPersistingDraftTurn(true);

      try {
        const detail = await createHomeChatConversation(nextPrompt);
        syncConversationDetailCache(detail);
        setActiveConversationId(detail.conversation.id);
        setIsDraftConversation(false);
        setNewConversationDraft("");
        setConversationHistoryComposerValue(detail.conversation.id, "");
        setConversationEditing(detail.conversation.id, false);
        editComposerRestoreRef.current.delete(detail.conversation.id);
        void generateConversationTitle(detail.conversation.id, nextPrompt);
        void runAssistantStream({ conversation: detail });
      } catch (error) {
        setDraftWorkspaceError(error instanceof Error ? error.message : "Request failed.");
      } finally {
        setIsPersistingDraftTurn(false);
      }

      return;
    }

    setConversationWorkspaceError(activeConversationId, null);
    setConversationPersisting(activeConversationId, true);

    try {
      const detail = await runConversationMutation(
        activeConversationId,
        () => appendHomeChatUserMessage(activeConversationId, nextPrompt),
      );
      syncConversationDetailCache(detail);
      setConversationHistoryComposerValue(activeConversationId, "");

      if (isEditingLatestUserMessage) {
        exitConversationEditMode(activeConversationId, {
          nextComposerValue: "",
        });
      }

      void runAssistantStream({ conversation: detail });
    } catch (error) {
      setConversationWorkspaceError(
        activeConversationId,
        error instanceof Error ? error.message : "Request failed.",
      );
    } finally {
      setConversationPersisting(activeConversationId, false);
    }
  }, [
    activeConversationId,
    composerValue,
    exitConversationEditMode,
    generateConversationTitle,
    isBusy,
    isDraftConversation,
    isEditingLatestUserMessage,
    providerAccess.isConfigured,
    runConversationMutation,
    runAssistantStream,
    setConversationEditing,
    setConversationHistoryComposerValue,
    setConversationPersisting,
    setConversationWorkspaceError,
    syncConversationDetailCache,
  ]);

  const retryLatestAssistant = useCallback(async () => {
    if (!activeConversation || !activeConversationId || isBusy) {
      return;
    }

    if (isEditingLatestUserMessage) {
      exitConversationEditMode(activeConversationId, {
        restoreComposer: true,
      });
    }

    setConversationWorkspaceError(activeConversationId, null);
    await runAssistantStream({
      conversation: activeConversation,
      dropTrailingAssistant: true,
    });
  }, [
    activeConversation,
    activeConversationId,
    exitConversationEditMode,
    isBusy,
    isEditingLatestUserMessage,
    runAssistantStream,
    setConversationWorkspaceError,
  ]);

  const startEditingLatestUserMessage = useCallback(() => {
    if (!activeConversationId || !latestUserMessage || isBusy) {
      return;
    }

    enterConversationEditMode({
      conversationId: activeConversationId,
      restoreValue: composerValue,
      userMessage: latestUserMessage.content,
    });
  }, [
    activeConversationId,
    composerValue,
    enterConversationEditMode,
    isBusy,
    latestUserMessage,
  ]);

  const cancelEditingLatestUserMessage = useCallback(() => {
    if (!activeConversationId) {
      return;
    }

    exitConversationEditMode(activeConversationId, {
      restoreComposer: true,
    });
  }, [activeConversationId, exitConversationEditMode]);

  const stopStreaming = useCallback(() => {
    if (!activeConversationId || !activeConversation) {
      return;
    }

    const activeStream = useHomeChatRuntimeStore.getState().getStream(activeConversationId);
    if (!activeStream || !activeStream.isVisible) {
      return;
    }

    markStreamCanceledByUser(activeConversationId, activeStream.runId);
    const stoppedSnapshot: AssistantMessageSnapshot = {
      content: activeStream.text,
      reasoningText: activeStream.reasoningText,
      status: "stopped",
      errorMessage: "Generation stopped.",
      providerLabel: activeStream.providerLabel,
      responseModel: activeStream.responseModel,
    };

    syncConversationDetailCache(materializeAssistantMessage(activeConversation, stoppedSnapshot));
    markStreamStopPersisted(activeConversationId, activeStream.runId);
    setConversationWorkspaceError(activeConversationId, null);
    void persistAssistantMessage(activeConversationId, stoppedSnapshot).catch((error) => {
      setConversationWorkspaceError(
        activeConversationId,
        error instanceof Error ? error.message : "Request failed.",
      );
    });
    activeStream.abortController.abort();

    if (latestUserMessage) {
      enterConversationEditMode({
        conversationId: activeConversationId,
        restoreValue: composerValue,
        userMessage: latestUserMessage.content,
      });
    }
  }, [
    activeConversation,
    activeConversationId,
    composerValue,
    enterConversationEditMode,
    latestUserMessage,
    markStreamCanceledByUser,
    markStreamStopPersisted,
    persistAssistantMessage,
    setConversationWorkspaceError,
    syncConversationDetailCache,
  ]);

  const renameConversation = useCallback(async (
    conversationId: string,
    title: string,
  ) => {
    const summary = await updateHomeChatConversationTitle({
      conversationId,
      title,
      titleStatus: "ready",
      titleSource: "manual",
    });
    syncConversationSummaryCache(summary);
    setConversationWorkspaceError(conversationId, null);
    return summary;
  }, [setConversationWorkspaceError, syncConversationSummaryCache]);

  const updateConversationPinned = useCallback(async (
    conversationId: string,
    pinned: boolean,
  ) => {
    const summary = await setHomeChatConversationPinned({
      conversationId,
      pinned,
    });
    syncConversationSummaryCache(summary);
    setConversationWorkspaceError(conversationId, null);
    return summary;
  }, [setConversationWorkspaceError, syncConversationSummaryCache]);

  const removeConversation = useCallback(async (
    conversationId: string,
  ): Promise<DeleteHomeChatConversationResult> => {
    const result = await deleteHomeChatConversation(conversationId);
    if (!result.deleted) {
      return result;
    }

    clearConversationUiState(conversationId);
    removeConversationFromCache(conversationId);
    if (activeConversationId === conversationId) {
      const remainingConversations = (
        queryClient.getQueryData<HomeChatConversationSummary[]>(queryKeys.homeChatConversations())
        ?? []
      ).filter((conversation) => conversation.id !== conversationId);
      const nextConversation = remainingConversations[0] ?? null;

      if (nextConversation) {
        setActiveConversationId(nextConversation.id);
        setIsDraftConversation(false);
      } else {
        setActiveConversationId(null);
        setIsDraftConversation(true);
      }

      setDraftWorkspaceError(null);
    }

    return result;
  }, [
    activeConversationId,
    clearConversationUiState,
    queryClient,
    removeConversationFromCache,
  ]);

  const selectConversation = useCallback((conversationId: string) => {
    if (isPersistingTurn) {
      return;
    }

    setActiveConversationId(conversationId);
    setIsDraftConversation(false);
    setClearedComposerUndo(null);
  }, [isPersistingTurn]);

  const startNewConversation = useCallback(() => {
    if (isPersistingTurn) {
      return;
    }

    const hasHistoryDraft = !isDraftConversation && activeHistoryComposerValue.length > 0;
    if (hasHistoryDraft) {
      setClearedComposerUndo({
        value: activeHistoryComposerValue,
      });
      setNewConversationDraft("");
    } else {
      setClearedComposerUndo(null);
    }

    setActiveConversationId(null);
    setIsDraftConversation(true);
    setDraftWorkspaceError(null);
  }, [activeHistoryComposerValue, isDraftConversation, isPersistingTurn]);

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
    isPersistingTurn,
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
    renameConversation,
    updateConversationPinned,
    removeConversation,
    undoClearedComposerValue,
    workspaceError,
  };
}

function setConversationScopedValue<T>(
  current: Record<string, T>,
  conversationId: string,
  value: T | null | undefined,
) {
  if (value === null || value === undefined) {
    if (!(conversationId in current)) {
      return current;
    }

    const next = { ...current };
    delete next[conversationId];
    return next;
  }

  return {
    ...current,
    [conversationId]: value,
  };
}

function buildHomeChatPreviewText(content: string) {
  const collapsed = content.trim().replace(/\s+/g, " ");
  if (!collapsed) {
    return null;
  }

  return collapsed.length > 120 ? `${collapsed.slice(0, 119)}…` : collapsed;
}

function materializeAssistantMessage(
  detail: HomeChatConversationDetail,
  snapshot: AssistantMessageSnapshot,
): HomeChatConversationDetail {
  const now = new Date().toISOString();
  const latestMessage = detail.messages.at(-1);
  const nextAssistantMessage: HomeChatMessage = latestMessage?.role === "assistant"
    ? {
        ...latestMessage,
        content: snapshot.content,
        reasoningText: snapshot.reasoningText || null,
        status: snapshot.status,
        errorMessage: snapshot.errorMessage,
        providerLabel: snapshot.providerLabel,
        responseModel: snapshot.responseModel,
        updatedAt: now,
      }
    : {
        id: `temp-assistant-${detail.conversation.id}`,
        conversationId: detail.conversation.id,
        ordinal: detail.messages.length + 1,
        role: "assistant",
        content: snapshot.content,
        reasoningText: snapshot.reasoningText || null,
        status: snapshot.status,
        errorMessage: snapshot.errorMessage,
        providerLabel: snapshot.providerLabel,
        responseModel: snapshot.responseModel,
        createdAt: now,
        updatedAt: now,
      };

  const messages = latestMessage?.role === "assistant"
    ? [
        ...detail.messages.slice(0, -1),
        nextAssistantMessage,
      ]
    : [
        ...detail.messages,
        nextAssistantMessage,
      ];

  return {
    conversation: {
      ...detail.conversation,
      previewText:
        buildHomeChatPreviewText(snapshot.content)
        ?? buildHomeChatPreviewText(snapshot.errorMessage ?? ""),
      messageCount: messages.length,
      updatedAt: now,
      lastMessageAt: now,
    },
    messages,
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

  return next.sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    const leftPinnedAt = left.pinnedAt ?? "";
    const rightPinnedAt = right.pinnedAt ?? "";
    if (leftPinnedAt !== rightPinnedAt) {
      return rightPinnedAt.localeCompare(leftPinnedAt);
    }

    return right.lastMessageAt.localeCompare(left.lastMessageAt);
  });
}
