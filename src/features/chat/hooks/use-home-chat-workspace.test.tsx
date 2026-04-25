import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHomeChatWorkspace } from "@/features/chat/hooks/use-home-chat-workspace";
import { resetHomeChatRuntimeStore } from "@/features/chat/store/home-chat-runtime-store";
import type {
  HomeChatConversationDetail,
  HomeChatConversationSummary,
  HomeChatMessage,
} from "@/types/shell";

const mockAppendHomeChatUserMessage = vi.fn();
const mockCreateHomeChatConversation = vi.fn();
const mockDeleteHomeChatConversation = vi.fn();
const mockGetHomeChatConversation = vi.fn();
const mockListHomeChatConversations = vi.fn();
const mockReplaceLatestHomeChatAssistantMessage = vi.fn();
const mockSetHomeChatConversationPinned = vi.fn();
const mockUpdateHomeChatConversationTitle = vi.fn();
const mockGenerateHomeChatConversationTitle = vi.fn();
const mockStreamHomeChatConversation = vi.fn();

vi.mock("@/lib/tauri", () => ({
  appendHomeChatUserMessage: (...args: unknown[]) => mockAppendHomeChatUserMessage(...args),
  createHomeChatConversation: (...args: unknown[]) => mockCreateHomeChatConversation(...args),
  deleteHomeChatConversation: (...args: unknown[]) => mockDeleteHomeChatConversation(...args),
  getHomeChatConversation: (...args: unknown[]) => mockGetHomeChatConversation(...args),
  homeChatConversationsUpdatedEvent: {
    listen: vi.fn().mockResolvedValue(() => {}),
  },
  isTauriRuntime: () => false,
  listHomeChatConversations: () => mockListHomeChatConversations(),
  replaceLatestHomeChatAssistantMessage: (...args: unknown[]) =>
    mockReplaceLatestHomeChatAssistantMessage(...args),
  setHomeChatConversationPinned: (...args: unknown[]) => mockSetHomeChatConversationPinned(...args),
  updateHomeChatConversationTitle: (...args: unknown[]) => mockUpdateHomeChatConversationTitle(...args),
}));

vi.mock("@/features/chat/lib/home-chat-runtime", () => ({
  generateHomeChatConversationTitle: (...args: unknown[]) =>
    mockGenerateHomeChatConversationTitle(...args),
  streamHomeChatConversation: (...args: unknown[]) => mockStreamHomeChatConversation(...args),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function createMessage(overrides: Partial<HomeChatMessage>): HomeChatMessage {
  return {
    id: overrides.id ?? "msg_1",
    conversationId: overrides.conversationId ?? "conv_1",
    ordinal: overrides.ordinal ?? 1,
    role: overrides.role ?? "user",
    content: overrides.content ?? "Default message",
    reasoningText: overrides.reasoningText ?? null,
    status: overrides.status ?? "completed",
    errorMessage: overrides.errorMessage ?? null,
    providerLabel: overrides.providerLabel ?? null,
    responseModel: overrides.responseModel ?? null,
    createdAt: overrides.createdAt ?? "2026-04-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-25T00:00:00.000Z",
  };
}

function createConversationSummary(
  overrides: Partial<HomeChatConversationSummary> = {},
): HomeChatConversationSummary {
  return {
    id: overrides.id ?? "conv_1",
    title: overrides.title ?? "Test chat",
    titleStatus: overrides.titleStatus ?? "ready",
    titleSource: overrides.titleSource ?? "manual",
    isPinned: overrides.isPinned ?? false,
    pinnedAt: overrides.pinnedAt ?? null,
    previewText: overrides.previewText ?? "Initial question",
    messageCount: overrides.messageCount ?? 2,
    createdAt: overrides.createdAt ?? "2026-04-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-25T00:00:00.000Z",
    lastMessageAt: overrides.lastMessageAt ?? "2026-04-25T00:00:00.000Z",
  };
}

function createConversationDetail(options?: {
  conversation?: Partial<HomeChatConversationSummary>;
  messages?: HomeChatMessage[];
}): HomeChatConversationDetail {
  const summary = createConversationSummary(options?.conversation);

  return {
    conversation: {
      ...summary,
      messageCount: options?.messages?.length ?? summary.messageCount,
    },
    messages: options?.messages ?? [
      createMessage({
        id: "msg_user_1",
        conversationId: summary.id,
        role: "user",
        ordinal: 1,
        content: "Original question",
      }),
      createMessage({
        id: "msg_assistant_1",
        conversationId: summary.id,
        role: "assistant",
        ordinal: 2,
        content: "Original answer",
        providerLabel: "OpenAI · Test",
        responseModel: "gpt-test",
      }),
    ],
  };
}

function createStreamResult(options: {
  text: string;
  reasoningText?: string;
  responseModel?: string | null;
}) {
  return {
    apiMode: "responses" as const,
    durationMs: 10,
    eventCount: 2,
    finishReason: "stop",
    firstReasoningLatencyMs: 1,
    firstTextLatencyMs: 1,
    inputTokens: 10,
    outputTokens: 10,
    model: options.responseModel ?? "gpt-test",
    providerLabel: "OpenAI · Test",
    reasoningChars: (options.reasoningText ?? "").length,
    reasoningText: options.reasoningText ?? "",
    receivedChars: options.text.length,
    responseModel: options.responseModel ?? "gpt-test",
    text: options.text,
  };
}

function createInMemoryConversationStore(initialDetails: HomeChatConversationDetail[]) {
  const detailsById = new Map<string, HomeChatConversationDetail>(
    initialDetails.map((detail) => [detail.conversation.id, structuredClone(detail)]),
  );
  let messageCounter = 100;
  let timeCounter = 0;

  const nextId = (prefix: string) => {
    messageCounter += 1;
    return `${prefix}_${messageCounter}`;
  };

  const nextTimestamp = () => {
    timeCounter += 1;
    return `2026-04-25T00:00:${String(timeCounter).padStart(2, "0")}.000Z`;
  };

  const buildPreview = (value: string | null | undefined) => {
    const collapsed = (value ?? "").trim().replace(/\s+/g, " ");
    if (!collapsed) {
      return null;
    }

    return collapsed.length > 120 ? `${collapsed.slice(0, 119)}…` : collapsed;
  };

  const listConversations = () => [...detailsById.values()]
    .map((detail) => structuredClone(detail.conversation))
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));

  const getConversation = (conversationId: string) => {
    const detail = detailsById.get(conversationId);
    if (!detail) {
      throw new Error(`Conversation ${conversationId} not found.`);
    }

    return structuredClone(detail);
  };

  const appendUserMessage = (conversationId: string, userMessage: string) => {
    const detail = detailsById.get(conversationId);
    if (!detail) {
      throw new Error(`Conversation ${conversationId} not found.`);
    }

    const now = nextTimestamp();
    detail.messages.push({
      id: nextId("msg_user"),
      conversationId,
      ordinal: detail.messages.length + 1,
      role: "user",
      content: userMessage.trim(),
      reasoningText: null,
      status: "completed",
      errorMessage: null,
      providerLabel: null,
      responseModel: null,
      createdAt: now,
      updatedAt: now,
    });
    detail.conversation.previewText = buildPreview(userMessage);
    detail.conversation.messageCount = detail.messages.length;
    detail.conversation.updatedAt = now;
    detail.conversation.lastMessageAt = now;

    return structuredClone(detail);
  };

  const replaceLatestAssistantMessage = (options: {
    conversationId: string;
    content: string;
    reasoningText?: string | null;
    status: HomeChatMessage["status"];
    errorMessage?: string | null;
    providerLabel?: string | null;
    responseModel?: string | null;
  }) => {
    const detail = detailsById.get(options.conversationId);
    if (!detail) {
      throw new Error(`Conversation ${options.conversationId} not found.`);
    }

    const now = nextTimestamp();
    const latestMessage = detail.messages.at(-1);
    const nextAssistantMessage: HomeChatMessage = {
      id:
        latestMessage?.role === "assistant"
          ? latestMessage.id
          : nextId("msg_assistant"),
      conversationId: options.conversationId,
      ordinal:
        latestMessage?.role === "assistant"
          ? latestMessage.ordinal
          : detail.messages.length + 1,
      role: "assistant",
      content: options.content,
      reasoningText: options.reasoningText ?? null,
      status: options.status,
      errorMessage: options.errorMessage ?? null,
      providerLabel: options.providerLabel ?? null,
      responseModel: options.responseModel ?? null,
      createdAt:
        latestMessage?.role === "assistant"
          ? latestMessage.createdAt
          : now,
      updatedAt: now,
    };

    if (latestMessage?.role === "assistant") {
      detail.messages[detail.messages.length - 1] = nextAssistantMessage;
    } else {
      detail.messages.push(nextAssistantMessage);
    }

    detail.conversation.previewText =
      buildPreview(options.content)
      ?? buildPreview(options.errorMessage ?? "");
    detail.conversation.messageCount = detail.messages.length;
    detail.conversation.updatedAt = now;
    detail.conversation.lastMessageAt = now;

    return structuredClone(detail);
  };

  return {
    listConversations,
    getConversation,
    appendUserMessage,
    replaceLatestAssistantMessage,
  };
}

const configuredProviderAccess = {
  apiKey: "test-key",
  apiMode: "responses" as const,
  baseUrl: "https://api.openai.com/v1",
  isConfigured: true,
  model: "gpt-test",
  providerHost: "api.openai.com",
  vendor: "openai" as const,
  vendorLabel: "OpenAI" as const,
  providerLabel: "OpenAI · Test",
};

const providerConfig = {
  vendor: "openai" as const,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  model: "gpt-test",
};

describe("useHomeChatWorkspace", () => {
  beforeEach(() => {
    resetHomeChatRuntimeStore();
    mockAppendHomeChatUserMessage.mockReset();
    mockCreateHomeChatConversation.mockReset();
    mockDeleteHomeChatConversation.mockReset();
    mockGetHomeChatConversation.mockReset();
    mockListHomeChatConversations.mockReset();
    mockReplaceLatestHomeChatAssistantMessage.mockReset();
    mockSetHomeChatConversationPinned.mockReset();
    mockUpdateHomeChatConversationTitle.mockReset();
    mockGenerateHomeChatConversationTitle.mockReset();
    mockStreamHomeChatConversation.mockReset();
  });

  it("reconnects to an in-flight conversation stream after the workspace hook remounts", async () => {
    const initialDetail = createConversationDetail();
    const store = createInMemoryConversationStore([initialDetail]);
    const deferredStream = createDeferred<ReturnType<typeof createStreamResult>>();

    mockListHomeChatConversations.mockImplementation(() => Promise.resolve(store.listConversations()));
    mockGetHomeChatConversation.mockImplementation((conversationId: string) =>
      Promise.resolve(store.getConversation(conversationId)));
    mockAppendHomeChatUserMessage.mockImplementation((conversationId: string, userMessage: string) =>
      Promise.resolve(store.appendUserMessage(conversationId, userMessage)));
    mockReplaceLatestHomeChatAssistantMessage.mockImplementation((options: {
      conversationId: string;
      content: string;
      reasoningText?: string | null;
      status: HomeChatMessage["status"];
      errorMessage?: string | null;
      providerLabel?: string | null;
      responseModel?: string | null;
    }) => Promise.resolve(store.replaceLatestAssistantMessage(options)));
    mockStreamHomeChatConversation.mockImplementation(
      ({ abortSignal, onTextStream }: { abortSignal?: AbortSignal; onTextStream?: (progress: {
        eventCount: number;
        firstReasoningLatencyMs: number | null;
        firstTextLatencyMs: number | null;
        lastEventType: string | null;
        reasoningChars: number;
        reasoningText: string;
        receivedChars: number;
        text: string;
      }) => void }) => {
        onTextStream?.({
          eventCount: 1,
          firstReasoningLatencyMs: 1,
          firstTextLatencyMs: 1,
          lastEventType: "text-delta",
          reasoningChars: 17,
          reasoningText: "Streamed reasoning",
          receivedChars: 14,
          text: "Partial answer",
        });

        abortSignal?.addEventListener("abort", () => {
          deferredStream.reject(new Error("Request aborted by user."));
        }, { once: true });

        return deferredStream.promise;
      },
    );

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const firstRender = renderHook(
      () =>
        useHomeChatWorkspace({
          providerAccess: configuredProviderAccess,
          providerConfig,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(firstRender.result.current.activeConversationId).toBe("conv_1");
    });

    act(() => {
      firstRender.result.current.setComposerValue("Follow-up question");
    });

    act(() => {
      void firstRender.result.current.submitComposer();
    });

    await waitFor(() => {
      expect(firstRender.result.current.isStreaming).toBe(true);
      expect(firstRender.result.current.liveAssistant?.text).toBe("Partial answer");
    });

    firstRender.unmount();

    const secondRender = renderHook(
      () =>
        useHomeChatWorkspace({
          providerAccess: configuredProviderAccess,
          providerConfig,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(secondRender.result.current.activeConversationId).toBe("conv_1");
      expect(secondRender.result.current.isStreaming).toBe(true);
      expect(secondRender.result.current.liveAssistant?.text).toBe("Partial answer");
    });

    act(() => {
      secondRender.result.current.stopStreaming();
    });

    await waitFor(() => {
      expect(secondRender.result.current.isStreaming).toBe(false);
      expect(secondRender.result.current.isEditingLatestUserMessage).toBe(true);
      expect(secondRender.result.current.composerValue).toBe("Follow-up question");
      expect(secondRender.result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "Partial answer",
        status: "stopped",
      });
    });
  });

  it("stops a stream without dropping the partial assistant message and re-enters edit mode", async () => {
    const initialDetail = createConversationDetail();
    const store = createInMemoryConversationStore([initialDetail]);

    mockListHomeChatConversations.mockImplementation(() => Promise.resolve(store.listConversations()));
    mockGetHomeChatConversation.mockImplementation((conversationId: string) =>
      Promise.resolve(store.getConversation(conversationId)));
    mockAppendHomeChatUserMessage.mockImplementation((conversationId: string, userMessage: string) =>
      Promise.resolve(store.appendUserMessage(conversationId, userMessage)));
    mockReplaceLatestHomeChatAssistantMessage.mockImplementation((options: {
      conversationId: string;
      content: string;
      reasoningText?: string | null;
      status: HomeChatMessage["status"];
      errorMessage?: string | null;
      providerLabel?: string | null;
      responseModel?: string | null;
    }) => Promise.resolve(store.replaceLatestAssistantMessage(options)));
    mockStreamHomeChatConversation.mockImplementation(
      ({ abortSignal, onTextStream }: { abortSignal?: AbortSignal; onTextStream?: (progress: {
        eventCount: number;
        firstReasoningLatencyMs: number | null;
        firstTextLatencyMs: number | null;
        lastEventType: string | null;
        reasoningChars: number;
        reasoningText: string;
        receivedChars: number;
        text: string;
      }) => void }) =>
        new Promise((_, reject) => {
          onTextStream?.({
            eventCount: 1,
            firstReasoningLatencyMs: 1,
            firstTextLatencyMs: 1,
            lastEventType: "text-delta",
            reasoningChars: 17,
            reasoningText: "Streamed reasoning",
            receivedChars: 14,
            text: "Partial answer",
          });

          abortSignal?.addEventListener("abort", () => {
            reject(new Error("Request aborted by user."));
          }, { once: true });
        }),
    );

    const { result } = renderHook(
      () =>
        useHomeChatWorkspace({
          providerAccess: configuredProviderAccess,
          providerConfig,
        }),
      {
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => {
      expect(result.current.activeConversation?.messages.length).toBe(2);
    });

    act(() => {
      result.current.setComposerValue("Follow-up question");
    });

    act(() => {
      void result.current.submitComposer();
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.liveAssistant?.text).toBe("Partial answer");
    });

    act(() => {
      result.current.stopStreaming();
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.isBusy).toBe(false);
      expect(result.current.liveAssistant).toBeNull();
      expect(result.current.isEditingLatestUserMessage).toBe(true);
      expect(result.current.composerValue).toBe("Follow-up question");
      expect(result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "Partial answer",
        reasoningText: "Streamed reasoning",
        status: "stopped",
        errorMessage: "Generation stopped.",
      });
    });

    await waitFor(() => {
      expect(mockReplaceLatestHomeChatAssistantMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv_1",
          content: "Partial answer",
          reasoningText: "Streamed reasoning",
          status: "stopped",
        }),
      );
    });
  });

  it("keeps a stopped message even if the provider resolves after abort", async () => {
    const initialDetail = createConversationDetail();
    const store = createInMemoryConversationStore([initialDetail]);
    const deferredStream = createDeferred<ReturnType<typeof createStreamResult>>();

    mockListHomeChatConversations.mockImplementation(() => Promise.resolve(store.listConversations()));
    mockGetHomeChatConversation.mockImplementation((conversationId: string) =>
      Promise.resolve(store.getConversation(conversationId)));
    mockAppendHomeChatUserMessage.mockImplementation((conversationId: string, userMessage: string) =>
      Promise.resolve(store.appendUserMessage(conversationId, userMessage)));
    mockReplaceLatestHomeChatAssistantMessage.mockImplementation((options: {
      conversationId: string;
      content: string;
      reasoningText?: string | null;
      status: HomeChatMessage["status"];
      errorMessage?: string | null;
      providerLabel?: string | null;
      responseModel?: string | null;
    }) => Promise.resolve(store.replaceLatestAssistantMessage(options)));
    mockStreamHomeChatConversation.mockImplementation(
      ({ onTextStream }: { onTextStream?: (progress: {
        eventCount: number;
        firstReasoningLatencyMs: number | null;
        firstTextLatencyMs: number | null;
        lastEventType: string | null;
        reasoningChars: number;
        reasoningText: string;
        receivedChars: number;
        text: string;
      }) => void }) => {
        onTextStream?.({
          eventCount: 1,
          firstReasoningLatencyMs: 1,
          firstTextLatencyMs: 1,
          lastEventType: "text-delta",
          reasoningChars: 17,
          reasoningText: "Streamed reasoning",
          receivedChars: 14,
          text: "Partial answer",
        });

        return deferredStream.promise;
      },
    );

    const { result } = renderHook(
      () =>
        useHomeChatWorkspace({
          providerAccess: configuredProviderAccess,
          providerConfig,
        }),
      {
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => {
      expect(result.current.activeConversation?.messages.length).toBe(2);
    });

    act(() => {
      result.current.setComposerValue("Follow-up question");
    });

    act(() => {
      void result.current.submitComposer();
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    act(() => {
      result.current.stopStreaming();
    });

    deferredStream.resolve(createStreamResult({
      text: "Late completed answer",
      reasoningText: "Late reasoning",
    }));

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "Partial answer",
        reasoningText: "Streamed reasoning",
        status: "stopped",
      });
    });

    expect(mockReplaceLatestHomeChatAssistantMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Late completed answer",
        status: "completed",
      }),
    );
  });

  it("keeps streams running per conversation while switching between chats", async () => {
    const conversationA = createConversationDetail({
      conversation: {
        id: "conv_1",
        title: "Chat A",
        lastMessageAt: "2026-04-25T00:00:00.000Z",
      },
      messages: [
        createMessage({
          id: "msg_a_user_1",
          conversationId: "conv_1",
          role: "user",
          ordinal: 1,
          content: "Question A1",
        }),
        createMessage({
          id: "msg_a_assistant_1",
          conversationId: "conv_1",
          role: "assistant",
          ordinal: 2,
          content: "Answer A1",
          providerLabel: "OpenAI · Test",
          responseModel: "gpt-test",
        }),
      ],
    });
    const conversationB = createConversationDetail({
      conversation: {
        id: "conv_2",
        title: "Chat B",
        lastMessageAt: "2026-04-24T23:59:00.000Z",
      },
      messages: [
        createMessage({
          id: "msg_b_user_1",
          conversationId: "conv_2",
          role: "user",
          ordinal: 1,
          content: "Question B1",
        }),
        createMessage({
          id: "msg_b_assistant_1",
          conversationId: "conv_2",
          role: "assistant",
          ordinal: 2,
          content: "Answer B1",
          providerLabel: "OpenAI · Test",
          responseModel: "gpt-test",
        }),
      ],
    });
    const store = createInMemoryConversationStore([conversationA, conversationB]);
    const deferredA = createDeferred<ReturnType<typeof createStreamResult>>();
    const deferredB = createDeferred<ReturnType<typeof createStreamResult>>();

    mockListHomeChatConversations.mockImplementation(() => Promise.resolve(store.listConversations()));
    mockGetHomeChatConversation.mockImplementation((conversationId: string) =>
      Promise.resolve(store.getConversation(conversationId)));
    mockAppendHomeChatUserMessage.mockImplementation((conversationId: string, userMessage: string) =>
      Promise.resolve(store.appendUserMessage(conversationId, userMessage)));
    mockReplaceLatestHomeChatAssistantMessage.mockImplementation((options: {
      conversationId: string;
      content: string;
      reasoningText?: string | null;
      status: HomeChatMessage["status"];
      errorMessage?: string | null;
      providerLabel?: string | null;
      responseModel?: string | null;
    }) => Promise.resolve(store.replaceLatestAssistantMessage(options)));
    mockStreamHomeChatConversation.mockImplementation(({ messages, onTextStream }: {
      messages: Array<{ content: string; role: string }>;
      onTextStream?: (progress: {
        eventCount: number;
        firstReasoningLatencyMs: number | null;
        firstTextLatencyMs: number | null;
        lastEventType: string | null;
        reasoningChars: number;
        reasoningText: string;
        receivedChars: number;
        text: string;
      }) => void;
    }) => {
      const latestPrompt = messages.at(-1)?.content;

      if (latestPrompt === "Question A2") {
        onTextStream?.({
          eventCount: 1,
          firstReasoningLatencyMs: 1,
          firstTextLatencyMs: 1,
          lastEventType: "text-delta",
          reasoningChars: 9,
          reasoningText: "Reason A2",
          receivedChars: 9,
          text: "Partial A",
        });
        return deferredA.promise;
      }

      if (latestPrompt === "Question B2") {
        onTextStream?.({
          eventCount: 1,
          firstReasoningLatencyMs: 1,
          firstTextLatencyMs: 1,
          lastEventType: "text-delta",
          reasoningChars: 9,
          reasoningText: "Reason B2",
          receivedChars: 9,
          text: "Partial B",
        });
        return deferredB.promise;
      }

      throw new Error(`Unexpected stream prompt: ${latestPrompt}`);
    });

    const { result } = renderHook(
      () =>
        useHomeChatWorkspace({
          providerAccess: configuredProviderAccess,
          providerConfig,
        }),
      {
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_1");
      expect(result.current.activeConversation?.messages.at(-1)?.content).toBe("Answer A1");
    });

    act(() => {
      result.current.setComposerValue("Question A2");
    });
    act(() => {
      void result.current.submitComposer();
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_1");
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.liveAssistant?.text).toBe("Partial A");
    });

    act(() => {
      result.current.selectConversation("conv_2");
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_2");
      expect(result.current.isBusy).toBe(false);
      expect(result.current.activeConversation?.messages.at(-1)?.content).toBe("Answer B1");
    });

    act(() => {
      result.current.setComposerValue("Question B2");
    });
    act(() => {
      void result.current.submitComposer();
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_2");
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.liveAssistant?.text).toBe("Partial B");
    });

    act(() => {
      result.current.selectConversation("conv_1");
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_1");
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.liveAssistant?.text).toBe("Partial A");
    });

    deferredA.resolve(createStreamResult({
      text: "Answer A2",
      reasoningText: "Reason A2",
    }));

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_1");
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "Answer A2",
        status: "completed",
      });
    });

    act(() => {
      result.current.selectConversation("conv_2");
    });

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_2");
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.liveAssistant?.text).toBe("Partial B");
    });

    deferredB.resolve(createStreamResult({
      text: "Answer B2",
      reasoningText: "Reason B2",
    }));

    await waitFor(() => {
      expect(result.current.activeConversationId).toBe("conv_2");
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "Answer B2",
        status: "completed",
      });
    });
  });

  it("retries a stopped assistant by overwriting the latest assistant message", async () => {
    const stoppedDetail = createConversationDetail({
      messages: [
        createMessage({
          id: "msg_user_1",
          conversationId: "conv_1",
          role: "user",
          ordinal: 1,
          content: "Retry question",
        }),
        createMessage({
          id: "msg_assistant_1",
          conversationId: "conv_1",
          role: "assistant",
          ordinal: 2,
          content: "Stopped answer",
          reasoningText: "Old reasoning",
          status: "stopped",
          errorMessage: "Generation stopped.",
          providerLabel: "OpenAI · Test",
          responseModel: null,
        }),
      ],
    });
    const store = createInMemoryConversationStore([stoppedDetail]);

    mockListHomeChatConversations.mockImplementation(() => Promise.resolve(store.listConversations()));
    mockGetHomeChatConversation.mockImplementation((conversationId: string) =>
      Promise.resolve(store.getConversation(conversationId)));
    mockAppendHomeChatUserMessage.mockImplementation((conversationId: string, userMessage: string) =>
      Promise.resolve(store.appendUserMessage(conversationId, userMessage)));
    mockReplaceLatestHomeChatAssistantMessage.mockImplementation((options: {
      conversationId: string;
      content: string;
      reasoningText?: string | null;
      status: HomeChatMessage["status"];
      errorMessage?: string | null;
      providerLabel?: string | null;
      responseModel?: string | null;
    }) => Promise.resolve(store.replaceLatestAssistantMessage(options)));
    mockStreamHomeChatConversation.mockResolvedValue(createStreamResult({
      text: "Retried answer",
      reasoningText: "Fresh reasoning",
    }));

    const { result } = renderHook(
      () =>
        useHomeChatWorkspace({
          providerAccess: configuredProviderAccess,
          providerConfig,
        }),
      {
        wrapper: createWrapper(createQueryClient()),
      },
    );

    await waitFor(() => {
      expect(result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        status: "stopped",
      });
    });

    await act(async () => {
      await result.current.retryLatestAssistant();
    });

    expect(mockAppendHomeChatUserMessage).not.toHaveBeenCalled();
    expect(mockStreamHomeChatConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "user",
            content: "Retry question",
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(result.current.activeConversation?.messages).toHaveLength(2);
      expect(result.current.activeConversation?.messages.at(-1)).toMatchObject({
        role: "assistant",
        content: "Retried answer",
        reasoningText: "Fresh reasoning",
        status: "completed",
      });
    });
  });
});
