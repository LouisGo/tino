export const HOME_CHAT_START_NEW_CONVERSATION_EVENT = "home-chat:start-new-conversation";
export const HOME_CHAT_OPEN_SEARCH_EVENT = "home-chat:open-search";

export function dispatchHomeChatShortcutEvent(eventName: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName));
}
