import { describe, expect, it } from "vitest";

import {
  buildHomeChatContextWindow,
  HOME_CHAT_CONTEXT_WINDOW_SIZE,
} from "@/features/chat/lib/home-chat-context-window";
import type { HomeChatMessage } from "@/types/shell";

function createMessage(index: number, role: HomeChatMessage["role"]): HomeChatMessage {
  return {
    id: `msg_${index}`,
    conversationId: "conv_1",
    ordinal: index + 1,
    role,
    content: `${role} ${index + 1}`,
    reasoningText: null,
    status: "completed",
    errorMessage: null,
    providerLabel: null,
    responseModel: null,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };
}

describe("buildHomeChatContextWindow", () => {
  it("keeps only the latest messages within the configured window", () => {
    const messages = Array.from({ length: HOME_CHAT_CONTEXT_WINDOW_SIZE + 4 }, (_, index) =>
      createMessage(index, index % 2 === 0 ? "user" : "assistant"));

    const result = buildHomeChatContextWindow(messages);

    expect(result).toHaveLength(HOME_CHAT_CONTEXT_WINDOW_SIZE);
    expect(result[0]?.content).toBe("user 5");
    expect(result.at(-1)?.content).toBe("assistant 34");
  });

  it("drops the trailing assistant when retrying", () => {
    const result = buildHomeChatContextWindow([
      createMessage(0, "user"),
      createMessage(1, "assistant"),
      createMessage(2, "user"),
      createMessage(3, "assistant"),
    ], {
      dropTrailingAssistant: true,
    });

    expect(result.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
  });
});

