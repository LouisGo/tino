import type { TranslationKey } from "@/i18n";
import type { HomeChatConversationSummary } from "@/types/shell";

export type HomeChatConversationGroup = {
  key: string;
  label: string;
  kind: "pinned" | "recent";
  conversations: HomeChatConversationSummary[];
};

export type HomeChatConversationListRow =
  | {
      key: string;
      type: "group";
      group: HomeChatConversationGroup;
      isFirstGroup: boolean;
    }
  | {
      key: string;
      type: "conversation";
      conversation: HomeChatConversationSummary;
      groupKind: HomeChatConversationGroup["kind"];
      isGroupFirst: boolean;
    };

type HomeChatTranslate = (
  key: TranslationKey<"dashboard">,
  options?: {
    defaultValue?: string;
    values?: Record<string, boolean | Date | null | number | string | undefined>;
  },
) => string;

const FIRST_GROUP_ROW_HEIGHT = 20;
const GROUP_ROW_HEIGHT = 30;
const CONVERSATION_ROW_HEIGHT = 48;

export function resolveHomeChatConversationTitle(
  title: string | null | undefined,
  fallback: string,
) {
  const normalized = title?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function matchesHomeChatConversationSearch(
  conversation: HomeChatConversationSummary,
  normalizedQuery: string,
  fallbackTitle: string,
) {
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    resolveHomeChatConversationTitle(conversation.title, fallbackTitle),
    conversation.previewText ?? "",
  ];

  return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function buildHomeChatConversationGroups({
  conversations,
  normalizedQuery,
  fallbackTitle,
  t,
}: {
  conversations: HomeChatConversationSummary[];
  normalizedQuery: string;
  fallbackTitle: string;
  t: HomeChatTranslate;
}) {
  const pinnedConversations: HomeChatConversationSummary[] = [];
  const recentConversations: HomeChatConversationSummary[] = [];

  for (const conversation of conversations) {
    if (!matchesHomeChatConversationSearch(conversation, normalizedQuery, fallbackTitle)) {
      continue;
    }

    if (conversation.isPinned) {
      pinnedConversations.push(conversation);
      continue;
    }

    recentConversations.push(conversation);
  }

  const groups: HomeChatConversationGroup[] = [];

  if (pinnedConversations.length > 0) {
    groups.push({
      key: "pinned",
      label: t("chat.pinnedConversations"),
      kind: "pinned",
      conversations: pinnedConversations,
    });
  }

  if (recentConversations.length > 0) {
    groups.push({
      key: "recent",
      label: t("chat.recentConversations"),
      kind: "recent",
      conversations: recentConversations,
    });
  }

  return groups;
}

export function flattenHomeChatConversationGroups(
  groups: HomeChatConversationGroup[],
): HomeChatConversationListRow[] {
  const rows: HomeChatConversationListRow[] = [];

  groups.forEach((group, groupIndex) => {
    rows.push({
      key: `group:${group.key}`,
      type: "group",
      group,
      isFirstGroup: groupIndex === 0,
    });

    group.conversations.forEach((conversation, conversationIndex) => {
      rows.push({
        key: `conversation:${conversation.id}`,
        type: "conversation",
        conversation,
        groupKind: group.kind,
        isGroupFirst: conversationIndex === 0,
      });
    });
  });

  return rows;
}

export function estimateHomeChatConversationListRowSize(
  row: HomeChatConversationListRow | undefined,
) {
  switch (row?.type) {
    case "group":
      return row.isFirstGroup ? FIRST_GROUP_ROW_HEIGHT : GROUP_ROW_HEIGHT;
    case "conversation":
      return CONVERSATION_ROW_HEIGHT;
    default:
      return CONVERSATION_ROW_HEIGHT;
  }
}
