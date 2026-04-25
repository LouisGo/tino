import { create } from "zustand";

export type HomeChatConversationStreamState = {
  abortController: AbortController;
  canceledByUser: boolean;
  conversationId: string;
  isVisible: boolean;
  providerLabel: string | null;
  reasoningText: string;
  replaceMessageId: string | null;
  responseModel: string | null;
  runId: number;
  stopPersisted: boolean;
  text: string;
};

type HomeChatRuntimeStore = {
  conversationWorkspaceErrors: Record<string, string>;
  nextRunId: number;
  streams: Record<string, HomeChatConversationStreamState>;
  clearConversationRuntime: (conversationId: string) => void;
  clearStream: (conversationId: string, runId?: number) => void;
  getStream: (conversationId: string) => HomeChatConversationStreamState | null;
  markStreamCanceledByUser: (conversationId: string, runId: number) => void;
  markStreamStopPersisted: (conversationId: string, runId: number) => void;
  reset: () => void;
  setConversationWorkspaceError: (conversationId: string, value: string | null) => void;
  setStreamProgress: (
    conversationId: string,
    runId: number,
    progress: { reasoningText: string; text: string },
  ) => void;
  startStream: (options: {
    conversationId: string;
    providerLabel: string | null;
    replaceMessageId: string | null;
    responseModel: string | null;
  }) => HomeChatConversationStreamState;
};

const initialState = {
  conversationWorkspaceErrors: {} as Record<string, string>,
  nextRunId: 0,
  streams: {} as Record<string, HomeChatConversationStreamState>,
};

export const useHomeChatRuntimeStore = create<HomeChatRuntimeStore>((set, get) => ({
  ...initialState,
  startStream: ({ conversationId, providerLabel, replaceMessageId, responseModel }) => {
    const abortController = new AbortController();
    const runId = get().nextRunId + 1;
    const nextStream: HomeChatConversationStreamState = {
      abortController,
      canceledByUser: false,
      conversationId,
      isVisible: true,
      providerLabel,
      reasoningText: "",
      replaceMessageId,
      responseModel,
      runId,
      stopPersisted: false,
      text: "",
    };

    set((state) => ({
      nextRunId: runId,
      streams: {
        ...state.streams,
        [conversationId]: nextStream,
      },
    }));

    return nextStream;
  },
  setStreamProgress: (conversationId, runId, progress) =>
    set((state) => {
      const activeStream = state.streams[conversationId];
      if (!activeStream || activeStream.runId !== runId || activeStream.canceledByUser) {
        return state;
      }

      return {
        streams: {
          ...state.streams,
          [conversationId]: {
            ...activeStream,
            reasoningText: progress.reasoningText,
            text: progress.text,
          },
        },
      };
    }),
  markStreamCanceledByUser: (conversationId, runId) =>
    set((state) => {
      const activeStream = state.streams[conversationId];
      if (!activeStream || activeStream.runId !== runId) {
        return state;
      }

      return {
        streams: {
          ...state.streams,
          [conversationId]: {
            ...activeStream,
            canceledByUser: true,
          },
        },
      };
    }),
  markStreamStopPersisted: (conversationId, runId) =>
    set((state) => {
      const activeStream = state.streams[conversationId];
      if (!activeStream || activeStream.runId !== runId) {
        return state;
      }

      return {
        streams: {
          ...state.streams,
          [conversationId]: {
            ...activeStream,
            isVisible: false,
            stopPersisted: true,
          },
        },
      };
    }),
  setConversationWorkspaceError: (conversationId, value) =>
    set((state) => ({
      conversationWorkspaceErrors: setConversationScopedValue(
        state.conversationWorkspaceErrors,
        conversationId,
        value,
      ),
    })),
  clearStream: (conversationId, runId) =>
    set((state) => {
      const activeStream = state.streams[conversationId];
      if (!activeStream) {
        return state;
      }

      if (runId !== undefined && activeStream.runId !== runId) {
        return state;
      }

      return {
        streams: setConversationScopedValue(state.streams, conversationId, null),
      };
    }),
  clearConversationRuntime: (conversationId) =>
    set((state) => {
      state.streams[conversationId]?.abortController.abort();
      return {
        conversationWorkspaceErrors: setConversationScopedValue(
          state.conversationWorkspaceErrors,
          conversationId,
          null,
        ),
        streams: setConversationScopedValue(state.streams, conversationId, null),
      };
    }),
  getStream: (conversationId) => get().streams[conversationId] ?? null,
  reset: () =>
    set((state) => {
      for (const stream of Object.values(state.streams)) {
        stream.abortController.abort();
      }

      return initialState;
    }),
}));

export function resetHomeChatRuntimeStore() {
  useHomeChatRuntimeStore.getState().reset();
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
