import {
  useLayoutEffect,
  useMemo,
  useState,
  type AriaAttributes,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, EllipsisVertical, LoaderCircle, Pin, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  buildHomeChatConversationGroups,
  estimateHomeChatConversationListRowSize,
  flattenHomeChatConversationGroups,
  resolveHomeChatConversationTitle,
} from "@/features/chat/lib/home-chat-conversation-list";
import type { HomeChatConversationMenuContext } from "@/features/chat/home-chat-conversation-context-menu";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { HomeChatConversationSummary } from "@/types/shell";

export function HomeChatSidebarList({
  conversations,
  activeConversationId,
  renamingConversationId,
  renameDraftValue,
  renameInputRef,
  busyConversationId,
  isBusy,
  onRenameDraftChange,
  onRenameCancel,
  onRenameSubmit,
  onSelectConversation,
  onOpenConversationMenu,
  onConversationContextMenu,
  onTogglePinned,
  onStartRename,
  onDeleteConversation,
}: {
  conversations: HomeChatConversationSummary[];
  activeConversationId: string | null;
  renamingConversationId: string | null;
  renameDraftValue: string;
  renameInputRef: RefObject<HTMLInputElement | null>;
  busyConversationId: string | null;
  isBusy: boolean;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameSubmit: () => void;
  onSelectConversation: (conversationId: string) => void;
  onOpenConversationMenu: (
    element: Element | null,
    context: HomeChatConversationMenuContext,
  ) => boolean;
  onConversationContextMenu: (
    event: MouseEvent,
    context: HomeChatConversationMenuContext,
  ) => void;
  onTogglePinned: (conversation: HomeChatConversationSummary) => void;
  onStartRename: (conversation: HomeChatConversationSummary) => void;
  onDeleteConversation: (conversation: HomeChatConversationSummary) => void;
}) {
  const tDashboard = useScopedT("dashboard");
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const fallbackTitle = tDashboard("chat.newConversation");
  const groups = useMemo(
    () =>
      buildHomeChatConversationGroups({
        conversations,
        normalizedQuery: "",
        fallbackTitle,
        t: tDashboard,
      }),
    [conversations, fallbackTitle, tDashboard],
  );
  const rows = useMemo(() => flattenHomeChatConversationGroups(groups), [groups]);
  const conversationRowIndexById = useMemo(() => {
    const nextIndexMap = new Map<string, number>();

    rows.forEach((row, rowIndex) => {
      if (row.type === "conversation") {
        nextIndexMap.set(row.conversation.id, rowIndex);
      }
    });

    return nextIndexMap;
  }, [rows]);
  const activeRowIndex = activeConversationId
    ? conversationRowIndexById.get(activeConversationId) ?? null
    : null;
  const activeRow = activeRowIndex === null ? null : rows[activeRowIndex];
  const shouldRevealPinnedGroupHeader =
    activeRow?.type === "conversation"
    && activeRow.isGroupFirst
    && activeRow.groupKind === "pinned";
  const activeScrollTargetIndex = activeRowIndex === null
    ? null
    : shouldRevealPinnedGroupHeader
      ? Math.max(0, activeRowIndex - 1)
      : activeRowIndex;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual uses imperative APIs that React Compiler intentionally skips memoizing.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => estimateHomeChatConversationListRowSize(rows[index]),
    getItemKey: (index) => rows[index]?.key ?? index,
    getScrollElement: () => scrollViewport,
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useLayoutEffect(() => {
    if (!scrollViewport || activeScrollTargetIndex === null) {
      return;
    }

    rowVirtualizer.scrollToIndex(activeScrollTargetIndex, {
      align: shouldRevealPinnedGroupHeader ? "start" : "auto",
    });
  }, [
    activeScrollTargetIndex,
    rowVirtualizer,
    scrollViewport,
    shouldRevealPinnedGroupHeader,
  ]);

  return (
    <div
      ref={setScrollViewport}
      className="app-scroll-area min-h-0 flex-1 overflow-y-auto pr-1"
      style={{ overflowAnchor: "none" }}
    >
      <div
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (!row) {
            return null;
          }

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.type === "group" ? (
                <div
                  className={cn(
                    "flex items-end px-1 pb-1.5",
                    row.isFirstGroup ? "h-5" : "h-[30px] pt-2.5",
                  )}
                >
                  <p
                    className={cn(
                      "text-[9px]/[14px] font-semibold tracking-[0.18em] uppercase",
                      row.group.kind === "pinned"
                        ? "inline-flex items-center gap-1.5 text-foreground/72"
                        : "text-muted-foreground/78",
                    )}
                  >
                    {row.group.kind === "pinned" ? <Pin className="size-3" /> : null}
                    <span>{row.group.label}</span>
                  </p>
                </div>
              ) : null}

              {row.type === "conversation" ? (
                <div className="pb-0.5">
                  <SidebarConversationRow
                    conversation={row.conversation}
                    active={row.conversation.id === activeConversationId}
                    renaming={row.conversation.id === renamingConversationId}
                    renameDraftValue={renameDraftValue}
                    renameInputRef={renameInputRef}
                    busy={isBusy || busyConversationId === row.conversation.id}
                    onRenameDraftChange={onRenameDraftChange}
                    onRenameCancel={onRenameCancel}
                    onRenameSubmit={onRenameSubmit}
                    onSelect={() => onSelectConversation(row.conversation.id)}
                    onOpenMenu={onOpenConversationMenu}
                    onConversationContextMenu={onConversationContextMenu}
                    onTogglePinned={() => onTogglePinned(row.conversation)}
                    onStartRename={() => onStartRename(row.conversation)}
                    onDelete={() => onDeleteConversation(row.conversation)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SidebarConversationRow({
  conversation,
  active,
  renaming,
  renameDraftValue,
  renameInputRef,
  busy,
  onRenameDraftChange,
  onRenameCancel,
  onRenameSubmit,
  onSelect,
  onOpenMenu,
  onConversationContextMenu,
  onTogglePinned,
  onStartRename,
  onDelete,
}: {
  conversation: HomeChatConversationSummary;
  active: boolean;
  renaming: boolean;
  renameDraftValue: string;
  renameInputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  onRenameDraftChange: (value: string) => void;
  onRenameCancel: () => void;
  onRenameSubmit: () => void;
  onSelect: () => void;
  onOpenMenu: (
    element: Element | null,
    context: HomeChatConversationMenuContext,
  ) => boolean;
  onConversationContextMenu: (
    event: MouseEvent,
    context: HomeChatConversationMenuContext,
  ) => void;
  onTogglePinned: () => void;
  onStartRename: () => void;
  onDelete: () => void;
}) {
  const tDashboard = useScopedT("dashboard");
  const title = resolveHomeChatConversationTitle(
    conversation.title,
    tDashboard("chat.newConversation"),
  );
  const menuContext: HomeChatConversationMenuContext = {
    conversation,
    onTogglePinned,
    onStartRename,
    onDelete,
  };

  return (
    <div
      data-conversation-id={conversation.id}
      onContextMenu={(event) => {
        if (renaming) {
          return;
        }

        onConversationContextMenu(event, menuContext);
      }}
      className={cn(
        "group flex min-h-[44px] w-full items-center rounded-[14px] border pl-2.5 pr-1 transition",
        active
          ? "border-primary/18 bg-primary/[0.08]"
          : "border-transparent bg-transparent hover:border-border/55 hover:bg-secondary/34",
      )}
    >
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
          <Input
            ref={renameInputRef}
            value={renameDraftValue}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRenameSubmit();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                onRenameCancel();
              }
            }}
            placeholder={tDashboard("chat.renamePlaceholder")}
            className="h-8 rounded-[10px] border-border/55 bg-background/78 px-3 text-[13px] shadow-none focus-visible:border-border/70 focus-visible:ring-[2px] focus-visible:ring-ring/18"
          />

          <div className="flex items-center gap-1">
            <SidebarIconButton
              label={tDashboard("chat.renameSave")}
              onClick={() => onRenameSubmit()}
              disabled={busy || !renameDraftValue.trim()}
            >
              <Check className="size-3.5" />
            </SidebarIconButton>
            <SidebarIconButton
              label={tDashboard("chat.renameCancel")}
              onClick={() => onRenameCancel()}
              disabled={busy}
            >
              <X className="size-3.5" />
            </SidebarIconButton>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left"
            onClick={onSelect}
            disabled={busy}
          >
            <span className="truncate text-[13px] font-medium text-foreground/92">
              {title}
            </span>
            {conversation.titleStatus === "pending" ? (
              <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground/72" />
            ) : null}
          </button>

          <div
            className={cn(
              "flex items-center gap-1 transition-opacity",
              active
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            )}
          >
            <SidebarIconButton
              label={tDashboard("chat.moreActions")}
              ariaHasPopup="menu"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenMenu(event.currentTarget, menuContext);
              }}
              disabled={busy}
              className="h-7 w-4"
            >
              <EllipsisVertical className="size-3.5" />
            </SidebarIconButton>
          </div>
        </>
      )}
    </div>
  );
}

function SidebarIconButton({
  children,
  label,
  onClick,
  disabled = false,
  tone = "default",
  className,
  ariaHasPopup,
}: {
  children: ReactNode;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  className?: string;
  ariaHasPopup?: AriaAttributes["aria-haspopup"];
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-[10px] text-muted-foreground/72 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        tone === "danger" && "hover:text-destructive",
        className,
      )}
      aria-label={label}
      aria-haspopup={ariaHasPopup}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
