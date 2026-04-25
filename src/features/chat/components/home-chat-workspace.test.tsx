import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { HomeChatWorkspace } from "@/features/chat/components/home-chat-workspace";
import { resetHomeChatRuntimeStore } from "@/features/chat/store/home-chat-runtime-store";
import type {
  HomeChatConversationDetail,
  HomeChatMessage,
  HomeChatConversationSummary,
} from "@/types/shell";

const mockUseHomeChatWorkspace = vi.fn();
const mockUseHomeAttachments = vi.fn();
const mockUseHomeAttachmentTransfer = vi.fn();
const mockUseContextMenu = vi.fn();

vi.mock("@/features/chat/hooks/use-home-chat-workspace", () => ({
  useHomeChatWorkspace: (...args: unknown[]) => mockUseHomeChatWorkspace(...args),
}));

vi.mock("@/features/dashboard/hooks/use-home-attachments", () => ({
  useHomeAttachments: (...args: unknown[]) => mockUseHomeAttachments(...args),
}));

vi.mock("@/features/dashboard/hooks/use-home-attachment-transfer", () => ({
  useHomeAttachmentTransfer: (...args: unknown[]) => mockUseHomeAttachmentTransfer(...args),
}));

vi.mock("@/core/context-menu", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/core/context-menu")>();
  return {
    ...actual,
    useContextMenu: (...args: unknown[]) => mockUseContextMenu(...args),
  };
});

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
    messageCount: overrides.messageCount ?? 0,
    createdAt: overrides.createdAt ?? "2026-04-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-25T00:00:00.000Z",
    lastMessageAt: overrides.lastMessageAt ?? "2026-04-25T00:00:00.000Z",
  };
}

function createConversationDetail(
  overrides: Partial<HomeChatConversationDetail> = {},
): HomeChatConversationDetail {
  return {
    conversation: createConversationSummary(overrides.conversation),
    messages: overrides.messages ?? [],
  };
}

function createMessage(overrides: Partial<HomeChatMessage> = {}): HomeChatMessage {
  return {
    id: overrides.id ?? "msg_1",
    conversationId: overrides.conversationId ?? "conv_1",
    ordinal: overrides.ordinal ?? 0,
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "Assistant reply",
    reasoningText: overrides.reasoningText ?? null,
    status: overrides.status ?? "completed",
    errorMessage: overrides.errorMessage ?? null,
    providerLabel: overrides.providerLabel ?? null,
    responseModel: overrides.responseModel ?? null,
    createdAt: overrides.createdAt ?? "2026-04-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-25T00:00:00.000Z",
  };
}

function buildWorkspaceState(overrides: Record<string, unknown> = {}) {
  const activeConversation = createConversationDetail();

  return {
    activeConversation,
    activeConversationId: activeConversation.conversation.id,
    composerValue: "Write a poem",
    conversations: [activeConversation.conversation],
    conversationsLoading: false,
    conversationLoading: false,
    isPersistingTurn: false,
    isBusy: false,
    isDraftConversation: false,
    isEditingLatestUserMessage: false,
    isStreaming: false,
    latestAssistantMessage: null,
    latestUserMessage: null,
    liveAssistant: null,
    providerConfigured: true,
    setComposerValue: vi.fn(),
    selectConversation: vi.fn(),
    startNewConversation: vi.fn(),
    submitComposer: vi.fn(),
    retryLatestAssistant: vi.fn(),
    startEditingLatestUserMessage: vi.fn(),
    cancelEditingLatestUserMessage: vi.fn(),
    stopStreaming: vi.fn(),
    renameConversation: vi.fn(),
    updateConversationPinned: vi.fn(),
    removeConversation: vi.fn(),
    undoClearedComposerValue: vi.fn(() => false),
    workspaceError: null,
    ...overrides,
  };
}

describe("HomeChatWorkspace", () => {
  beforeEach(() => {
    resetHomeChatRuntimeStore();
    mockUseContextMenu.mockReturnValue({
      openAtElement: vi.fn(),
      onContextMenu: vi.fn(),
    });
    mockUseHomeAttachments.mockReturnValue({
      attachments: [],
      canAddAttachments: true,
      addAttachments: vi.fn(),
      appendAttachments: vi.fn(),
      removeAttachment: vi.fn(),
    });
    mockUseHomeAttachmentTransfer.mockReturnValue({
      isDropTargetActive: false,
      dragHandlers: {},
      onPasteCapture: vi.fn(),
    });
  });

  it("does not submit the composer when clicking stop", async () => {
    const user = userEvent.setup();
    const stopStreaming = vi.fn();
    const submitComposer = vi.fn();

    mockUseHomeChatWorkspace.mockReturnValue(buildWorkspaceState({
      isStreaming: true,
      isBusy: true,
      stopStreaming,
      submitComposer,
      liveAssistant: {
        conversationId: "conv_1",
        text: "Partial answer",
        reasoningText: "",
      },
    }));

    render(
      <HomeChatWorkspace
        providerAccess={{ isConfigured: true } as never}
        providerConfig={{} as never}
        providerControls={null}
        suggestionPrompts={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(stopStreaming).toHaveBeenCalledTimes(1);
    expect(submitComposer).not.toHaveBeenCalled();
  });

  it("submits explicitly when clicking send", async () => {
    const user = userEvent.setup();
    const submitComposer = vi.fn();

    mockUseHomeChatWorkspace.mockReturnValue(buildWorkspaceState({
      submitComposer,
    }));

    render(
      <HomeChatWorkspace
        providerAccess={{ isConfigured: true } as never}
        providerConfig={{} as never}
        providerControls={null}
        suggestionPrompts={[]}
      />,
    );

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toHaveAttribute("type", "button");

    await user.click(sendButton);

    expect(submitComposer).toHaveBeenCalledTimes(1);
  });

  it("renders stopped assistant messages without surfacing them as failures", () => {
    const stoppedMessage = createMessage({
      id: "msg_stopped",
      status: "stopped",
      errorMessage: "Generation stopped.",
      content: "Partial answer",
    });
    const failedMessage = createMessage({
      id: "msg_failed",
      ordinal: 1,
      status: "failed",
      errorMessage: "Network disconnected",
      content: "Another answer",
    });
    const activeConversation = createConversationDetail({
      conversation: createConversationSummary({
        messageCount: 2,
      }),
      messages: [stoppedMessage, failedMessage],
    });

    mockUseHomeChatWorkspace.mockReturnValue(buildWorkspaceState({
      activeConversation,
      latestAssistantMessage: failedMessage,
    }));

    render(
      <HomeChatWorkspace
        providerAccess={{ isConfigured: true } as never}
        providerConfig={{} as never}
        providerControls={null}
        suggestionPrompts={[]}
      />,
    );

    expect(screen.getByText("Generation stopped")).toBeInTheDocument();
    expect(screen.queryByText("Generation stopped.")).not.toBeInTheDocument();
    expect(screen.getByText("Response failed")).toBeInTheDocument();
    expect(screen.getByText("Network disconnected")).toBeInTheDocument();
  });

  it("renders a retrying assistant in place of the latest stopped message", () => {
    const stoppedMessage = createMessage({
      id: "msg_stopped",
      status: "stopped",
      errorMessage: "Generation stopped.",
      content: "Stopped answer",
      reasoningText: "Old reasoning",
      responseModel: "gpt-test",
    });
    const activeConversation = createConversationDetail({
      conversation: createConversationSummary({
        messageCount: 2,
      }),
      messages: [
        createMessage({
          id: "msg_user",
          role: "user",
          ordinal: 1,
          content: "Retry question",
        }),
        stoppedMessage,
      ],
    });

    mockUseHomeChatWorkspace.mockReturnValue(buildWorkspaceState({
      activeConversation,
      latestAssistantMessage: stoppedMessage,
      isStreaming: true,
      isBusy: true,
      liveAssistant: {
        conversationId: activeConversation.conversation.id,
        replaceMessageId: stoppedMessage.id,
        text: "Retrying answer",
        reasoningText: "Fresh reasoning",
      },
    }));

    render(
      <HomeChatWorkspace
        providerAccess={{ isConfigured: true } as never}
        providerConfig={{} as never}
        providerControls={null}
        suggestionPrompts={[]}
      />,
    );

    expect(screen.getByText("Retrying answer")).toBeInTheDocument();
    expect(screen.queryByText("Stopped answer")).not.toBeInTheDocument();
    expect(screen.queryByText("Generation stopped")).not.toBeInTheDocument();
  });
});
