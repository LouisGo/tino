import { describe, expect, it } from "vitest";

import {
  buildHomeChatConversationGroups,
  matchesHomeChatConversationSearch,
  resolveHomeChatConversationTitle,
} from "@/features/chat/lib/home-chat-conversation-list";
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
    messageCount: overrides.messageCount ?? 0,
    createdAt: overrides.createdAt ?? "2026-04-25T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-25T00:00:00.000Z",
    lastMessageAt: overrides.lastMessageAt ?? "2026-04-25T00:00:00.000Z",
  };
}

function tDashboard(key: string) {
  const dictionary: Record<string, string> = {
    "chat.pinnedConversations": "Pinned",
    "chat.recentConversations": "Recent",
  };

  return dictionary[key] ?? key;
}

describe("home chat conversation list helpers", () => {
  it("resolves a conversation title with a fallback", () => {
    expect(resolveHomeChatConversationTitle("  Focus mode  ", "New chat")).toBe("Focus mode");
    expect(resolveHomeChatConversationTitle("   ", "New chat")).toBe("New chat");
    expect(resolveHomeChatConversationTitle(null, "New chat")).toBe("New chat");
  });

  it("matches conversation search against title and preview", () => {
    const conversation = createConversationSummary({
      title: "Shipping checklist",
      previewText: "Need the last launch notes",
    });

    expect(matchesHomeChatConversationSearch(conversation, "shipping", "New chat")).toBe(true);
    expect(matchesHomeChatConversationSearch(conversation, "launch", "New chat")).toBe(true);
    expect(matchesHomeChatConversationSearch(conversation, "archive", "New chat")).toBe(false);
  });

  it("builds pinned and recent groups in order", () => {
    const conversations = [
      createConversationSummary({
        id: "pinned",
        title: "Pinned thread",
        isPinned: true,
        pinnedAt: "2026-04-26T09:00:00.000Z",
      }),
      createConversationSummary({
        id: "recent-a",
        title: "Recent thread A",
      }),
      createConversationSummary({
        id: "recent-b",
        title: "Recent thread B",
      }),
    ];

    const groups = buildHomeChatConversationGroups({
      conversations,
      normalizedQuery: "",
      fallbackTitle: "New chat",
      t: tDashboard as never,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      key: "pinned",
      label: "Pinned",
      kind: "pinned",
    });
    expect(groups[0]?.conversations.map((conversation) => conversation.id)).toEqual(["pinned"]);
    expect(groups[1]).toMatchObject({
      key: "recent",
      label: "Recent",
      kind: "recent",
    });
    expect(groups[1]?.conversations.map((conversation) => conversation.id)).toEqual([
      "recent-a",
      "recent-b",
    ]);
  });

  it("applies search before grouping", () => {
    const conversations = [
      createConversationSummary({
        id: "pinned-match",
        title: "Pinned roadmap",
        isPinned: true,
        pinnedAt: "2026-04-26T09:00:00.000Z",
      }),
      createConversationSummary({
        id: "recent-match",
        title: "Launch notes",
        previewText: "Pinned roadmap follow-up",
      }),
      createConversationSummary({
        id: "recent-miss",
        title: "Archive",
        previewText: "Nothing relevant",
      }),
    ];

    const groups = buildHomeChatConversationGroups({
      conversations,
      normalizedQuery: "roadmap",
      fallbackTitle: "New chat",
      t: tDashboard as never,
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.conversations.map((conversation) => conversation.id)).toEqual([
      "pinned-match",
    ]);
    expect(groups[1]?.conversations.map((conversation) => conversation.id)).toEqual([
      "recent-match",
    ]);
  });
});
