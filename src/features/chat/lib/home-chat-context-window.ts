import type { StructuredTextMessage } from "@/features/ai/lib/provider-access";
import type { HomeChatMessage } from "@/types/shell";

export const HOME_CHAT_CONTEXT_WINDOW_SIZE = 30;

export function buildHomeChatContextWindow(
  messages: HomeChatMessage[],
  options?: {
    dropTrailingAssistant?: boolean;
    limit?: number;
  },
): StructuredTextMessage[] {
  const limit = options?.limit ?? HOME_CHAT_CONTEXT_WINDOW_SIZE;
  const normalizedMessages = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);

  if (options?.dropTrailingAssistant && normalizedMessages.at(-1)?.role === "assistant") {
    normalizedMessages.pop();
  }

  return normalizedMessages.slice(-limit);
}

export function getLatestHomeChatUserMessage(messages: HomeChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user") ?? null;
}

