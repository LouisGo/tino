import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomeChatSearchDialog } from "@/features/chat/components/home-chat-search-dialog";
import type { HomeChatConversationSummary } from "@/types/shell";

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
    messageCount: overrides.messageCount ?? 1,
    createdAt: overrides.createdAt ?? "2026-04-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-25T00:00:00.000Z",
    lastMessageAt: overrides.lastMessageAt ?? "2026-04-25T00:00:00.000Z",
  };
}

describe("HomeChatSearchDialog", () => {
  it("shows a clear button when the search input has a value", async () => {
    const user = userEvent.setup();

    render(
      <HomeChatSearchDialog
        open
        conversations={[createConversationSummary()]}
        activeConversationId={null}
        onClose={vi.fn()}
        onSelectConversation={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Search conversations");
    await user.type(input, "东方美零点");

    const clearButton = screen.getByRole("button", { name: "Clear search" });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);

    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("clears the search on first escape and closes on second escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <HomeChatSearchDialog
        open
        conversations={[createConversationSummary()]}
        activeConversationId={null}
        onClose={onClose}
        onSelectConversation={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Search conversations");
    await user.type(input, "query");

    await user.keyboard("{Escape}");

    expect(input).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
