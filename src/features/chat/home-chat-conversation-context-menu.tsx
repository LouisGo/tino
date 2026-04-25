import {
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";

import {
  contextMenuItem,
  contextMenuSeparator,
  createContextMenuRegistry,
} from "@/core/context-menu";
import { tx } from "@/i18n";
import type { HomeChatConversationSummary } from "@/types/shell";

export type HomeChatConversationMenuContext = {
  conversation: HomeChatConversationSummary;
  onTogglePinned: () => void | Promise<void>;
  onStartRename: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
};

export const homeChatConversationContextMenu =
  createContextMenuRegistry<HomeChatConversationMenuContext>([
    contextMenuItem({
      key: "toggle-pin",
      label: ({ conversation }) =>
        conversation.isPinned
          ? tx("dashboard", "chat.unpinConversation")
          : tx("dashboard", "chat.pinConversation"),
      icon: ({ conversation }) =>
        conversation.isPinned
          ? <PinOff className="size-4" />
          : <Pin className="size-4" />,
      onSelect: ({ onTogglePinned }) => onTogglePinned(),
    }),
    contextMenuItem({
      key: "rename",
      label: tx("dashboard", "chat.renameConversation"),
      icon: <Pencil className="size-4" />,
      onSelect: ({ onStartRename }) => onStartRename(),
    }),
    contextMenuSeparator("home-chat-divider-danger"),
    contextMenuItem({
      key: "delete",
      label: tx("dashboard", "chat.deleteConversation"),
      icon: <Trash2 className="size-4" />,
      danger: true,
      onSelect: ({ onDelete }) => onDelete(),
    }),
  ]);
