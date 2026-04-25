import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHomeChatWorkspace } from "@/features/chat/hooks/use-home-chat-workspace";
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

function createConversationSummary(overrides: Partial<HomeChatConversationSummary> = {}): HomeChatConversationSummary {
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

  it("reuses the last user message as a new appended prompt instead of rewriting history", async () => {
    const initialDetail = createConversationDetail();
    const appendedDetail = createConversationDetail({
      messages: [
        ...initialDetail.messages,
        createMessage({
          id: "msg_user_2",
          conversationId: initialDetail.conversation.id,
          ordinal: 3,
          role: "user",
          content: "Reworked question",
        }),
      ],
    });
    const finalDetail = createConversationDetail({
      conversation: {
        messageCount: 4,
        previewText: "Updated answer",
        updatedAt: "2026-04-25T00:01:00.000Z",
        lastMessageAt: "2026-04-25T00:01:00.000Z",
      },
      messages: [
        ...appendedDetail.messages,
        createMessage({
          id: "msg_assistant_2",
          conversationId: initialDetail.conversation.id,
          ordinal: 4,
          role: "assistant",
          content: "Updated answer",
          reasoningText: "Reasoning trail",
          providerLabel: "OpenAI · Test",
          responseModel: "gpt-test",
          createdAt: "2026-04-25T00:01:00.000Z",
          updatedAt: "2026-04-25T00:01:00.000Z",
        }),
      ],
    });

    mockListHomeChatConversations.mockResolvedValue([initialDetail.conversation]);
    mockGetHomeChatConversation.mockResolvedValue(initialDetail);
    mockAppendHomeChatUserMessage.mockResolvedValue(appendedDetail);
    mockStreamHomeChatConversation.mockResolvedValue({
      apiMode: "responses",
      durationMs: 10,
      eventCount: 2,
      finishReason: "stop",
      firstReasoningLatencyMs: 1,
      firstTextLatencyMs: 1,
      inputTokens: 10,
      outputTokens: 10,
      model: "gpt-test",
      providerLabel: "OpenAI · Test",
      reasoningChars: 15,
      reasoningText: "Reasoning trail",
      receivedChars: 14,
      responseModel: "gpt-test",
      text: "Updated answer",
    });
    mockReplaceLatestHomeChatAssistantMessage.mockResolvedValue(finalDetail);

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
      result.current.startEditingLatestUserMessage();
    });

    expect(result.current.isEditingLatestUserMessage).toBe(true);
    expect(result.current.composerValue).toBe("Original question");

    act(() => {
      result.current.setComposerValue("Reworked question");
    });

    await act(async () => {
      await result.current.submitComposer();
    });

    expect(mockAppendHomeChatUserMessage).toHaveBeenCalledWith("conv_1", "Reworked question");
    expect(result.current.isEditingLatestUserMessage).toBe(false);
  });

  it("clears streaming state immediately after stop and persists a stopped assistant message", async () => {
    const initialDetail = createConversationDetail();
    const appendedDetail = createConversationDetail({
      conversation: {
        messageCount: 3,
        previewText: "Follow-up question",
        updatedAt: "2026-04-25T00:01:00.000Z",
        lastMessageAt: "2026-04-25T00:01:00.000Z",
      },
      messages: [
        ...initialDetail.messages,
        createMessage({
          id: "msg_user_2",
          conversationId: initialDetail.conversation.id,
          ordinal: 3,
          role: "user",
          content: "Follow-up question",
          createdAt: "2026-04-25T00:01:00.000Z",
          updatedAt: "2026-04-25T00:01:00.000Z",
        }),
      ],
    });
    const stoppedDetail = createConversationDetail({
      conversation: {
        messageCount: 4,
        previewText: "Partial answer",
        updatedAt: "2026-04-25T00:02:00.000Z",
        lastMessageAt: "2026-04-25T00:02:00.000Z",
      },
      messages: [
        ...appendedDetail.messages,
        createMessage({
          id: "msg_assistant_2",
          conversationId: initialDetail.conversation.id,
          ordinal: 4,
          role: "assistant",
          content: "Partial answer",
          reasoningText: "Streamed reasoning",
          status: "stopped",
          errorMessage: "Generation stopped.",
          providerLabel: "OpenAI · Test",
          responseModel: null,
          createdAt: "2026-04-25T00:02:00.000Z",
          updatedAt: "2026-04-25T00:02:00.000Z",
        }),
      ],
    });

    mockListHomeChatConversations.mockResolvedValue([initialDetail.conversation]);
    mockGetHomeChatConversation.mockResolvedValue(initialDetail);
    mockAppendHomeChatUserMessage.mockResolvedValue(appendedDetail);
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
    mockReplaceLatestHomeChatAssistantMessage.mockResolvedValue(stoppedDetail);

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
      expect(result.current.liveAssistant).toBeNull();
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

    await waitFor(() => {
      expect(result.current.isBusy).toBe(false);
    });
  });
});
