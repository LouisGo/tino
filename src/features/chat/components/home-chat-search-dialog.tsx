import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CornerDownLeft,
  Pin,
  Search,
  X,
} from "lucide-react";

import { CollectionEmptyState } from "@/components/collection-empty-state";
import { Input } from "@/components/ui/input";
import { DISABLE_TEXT_INPUT_ASSIST_PROPS } from "@/components/ui/text-input-behavior";
import {
  buildHomeChatConversationGroups,
  estimateHomeChatConversationListRowSize,
  flattenHomeChatConversationGroups,
  resolveHomeChatConversationTitle,
} from "@/features/chat/lib/home-chat-conversation-list";
import { formatAppRelativeTime, useScopedT } from "@/i18n";
import { resolvePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";
import type { HomeChatConversationSummary } from "@/types/shell";

export function HomeChatSearchDialog({
  open,
  conversations,
  activeConversationId,
  onClose,
  onSelectConversation,
}: {
  open: boolean;
  conversations: HomeChatConversationSummary[];
  activeConversationId: string | null;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  const tDashboard = useScopedT("dashboard");
  const [searchValue, setSearchValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const wasOpenRef = useRef(false);
  const portalContainer = resolvePortalContainer();
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const fallbackTitle = tDashboard("chat.newConversation");
  const groups = useMemo(
    () =>
      buildHomeChatConversationGroups({
        conversations,
        normalizedQuery: normalizedSearchValue,
        fallbackTitle,
        t: tDashboard,
      }),
    [conversations, fallbackTitle, normalizedSearchValue, tDashboard],
  );
  const visibleConversations = useMemo(
    () => groups.flatMap((group) => group.conversations),
    [groups],
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
  const highlightedIndex = visibleConversations.length > 0
    ? Math.min(selectedIndex, visibleConversations.length - 1)
    : 0;
  const highlightedConversation = visibleConversations[highlightedIndex] ?? null;
  const highlightedRowIndex = highlightedConversation
    ? conversationRowIndexById.get(highlightedConversation.id) ?? null
    : null;
  const highlightedRow = highlightedRowIndex === null ? null : rows[highlightedRowIndex];
  const shouldRevealPinnedGroupHeader =
    highlightedRow?.type === "conversation"
    && highlightedRow.isGroupFirst
    && highlightedRow.groupKind === "pinned";
  const highlightedScrollTargetIndex = highlightedRowIndex === null
    ? null
    : shouldRevealPinnedGroupHeader
      ? Math.max(0, highlightedRowIndex - 1)
      : highlightedRowIndex;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual uses imperative APIs that React Compiler intentionally skips memoizing.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => estimateHomeChatConversationListRowSize(rows[index]),
    getItemKey: (index) => rows[index]?.key ?? index,
    getScrollElement: () => scrollViewport,
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const hasSearchValue = normalizedSearchValue.length > 0;
  const showEmptyState = visibleConversations.length === 0;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSearchValue("");
      setSelectedIndex(Math.max(conversations.findIndex(
        (conversation) => conversation.id === activeConversationId,
      ), 0));
    }

    wasOpenRef.current = open;
  }, [activeConversationId, conversations, open]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!open) {
        return;
      }

      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  useEffect(() => {
    if (!open || visibleConversations.length === 0) {
      return;
    }

    setSelectedIndex((current) => Math.min(current, visibleConversations.length - 1));
  }, [open, visibleConversations.length]);

  useLayoutEffect(() => {
    if (!scrollViewport || highlightedScrollTargetIndex === null) {
      return;
    }

    rowVirtualizer.scrollToIndex(highlightedScrollTargetIndex, {
      align: shouldRevealPinnedGroupHeader ? "start" : "auto",
    });
  }, [
    highlightedScrollTargetIndex,
    rowVirtualizer,
    scrollViewport,
    shouldRevealPinnedGroupHeader,
  ]);

  if (!open || !portalContainer) {
    return null;
  }

  function focusSearchInput() {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }

  function clearSearch() {
    setSearchValue("");
    setSelectedIndex(0);
    focusSearchInput();
  }

  return createPortal(
    <div className="fixed inset-0 z-[145] bg-black/56">
      <div
        className="flex min-h-full items-start justify-center px-4 pb-6 pt-[max(1rem,3.5vh)]"
        onClick={onClose}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label={tDashboard("chat.openSearch")}
          data-window-drag-disabled="true"
          className="flex max-h-[min(32rem,calc(100vh-1.5rem))] w-full max-w-[40rem] flex-col overflow-hidden rounded-[28px] border border-border/72 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--card)_97%,var(--background)_3%),color-mix(in_oklch,var(--card)_92%,var(--background)_8%))] shadow-[0_28px_80px_rgba(0,0,0,0.32),0_0_0_1px_color-mix(in_oklch,white_8%,transparent)]"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (
              event.key !== "Escape"
              || event.defaultPrevented
              || event.nativeEvent.isComposing
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (hasSearchValue) {
              clearSearch();
              return;
            }

            onClose();
          }}
        >
          <div className="shrink-0 border-b border-border/55 px-3.5 py-3 sm:px-4 sm:py-3.5">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground/80" />
              <Input
                ref={searchInputRef}
                value={searchValue}
                onChange={(event) => {
                  setSearchValue(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={(event) => {
                  if (!visibleConversations.length) {
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedIndex((current) => (current + 1) % visibleConversations.length);
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedIndex((current) => (
                      current - 1 + visibleConversations.length
                    ) % visibleConversations.length);
                    return;
                  }

                  if (event.key === "Enter" && highlightedConversation) {
                    event.preventDefault();
                    onSelectConversation(highlightedConversation.id);
                  }
                }}
                placeholder={tDashboard("chat.searchConversations")}
                name="home-chat-search"
                data-home-chat-search-input="true"
                className={cn(
                  "h-10 rounded-[18px] border-border/55 bg-background/70 pl-9 text-[13px] shadow-none placeholder:text-muted-foreground/78 focus-visible:border-border/70 focus-visible:bg-card/88 focus-visible:ring-[2px] focus-visible:ring-ring/18",
                  hasSearchValue ? "pr-10" : "",
                )}
                {...DISABLE_TEXT_INPUT_ASSIST_PROPS}
              />
              {hasSearchValue ? (
                <button
                  type="button"
                  onClick={() => clearSearch()}
                  className="absolute top-1/2 right-2.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/80 transition hover:bg-secondary/70 hover:text-foreground"
                  aria-label={tDashboard("chat.clearSearch")}
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-[18rem] flex-1 flex-col overflow-hidden px-3 pb-3 pt-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-3">
            {showEmptyState ? (
              <CollectionEmptyState
                title={hasSearchValue
                  ? tDashboard("chat.searchFilteredEmptyTitle")
                  : tDashboard("chat.searchDefaultEmptyTitle")}
                description={hasSearchValue
                  ? tDashboard("chat.searchFilteredEmptyDescription")
                  : tDashboard("chat.searchDefaultEmptyDescription")}
                className="h-full min-h-0 flex-1 rounded-[24px] border-0 shadow-none"
              />
            ) : (
              <div
                ref={setScrollViewport}
                className="app-scroll-area min-h-0 flex-1 overflow-y-auto px-1"
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
                            <SearchDialogConversationRow
                              conversation={row.conversation}
                              isActive={row.conversation.id === activeConversationId}
                              isHighlighted={row.conversation.id === highlightedConversation?.id}
                              onMouseEnter={() => {
                                const nextIndex = visibleConversations.findIndex(
                                  (conversation) => conversation.id === row.conversation.id,
                                );

                                if (nextIndex >= 0) {
                                  setSelectedIndex(nextIndex);
                                }
                              }}
                              onClick={() => onSelectConversation(row.conversation.id)}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>,
    portalContainer,
  );
}

function SearchDialogConversationRow({
  conversation,
  isActive,
  isHighlighted,
  onMouseEnter,
  onClick,
}: {
  conversation: HomeChatConversationSummary;
  isActive: boolean;
  isHighlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const tDashboard = useScopedT("dashboard");
  const title = resolveHomeChatConversationTitle(
    conversation.title,
    tDashboard("chat.newConversation"),
  );

  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "group flex h-[44px] w-full items-center gap-3 rounded-[14px] border pl-3 pr-2 text-left transition",
        isHighlighted || isActive
          ? "border-primary/18 bg-primary/[0.08]"
          : "border-transparent bg-transparent hover:border-border/55 hover:bg-secondary/34",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground/92">
          {title}
        </p>
      </div>

      <div className="inline-flex shrink-0 items-center gap-2 text-muted-foreground/72">
        <span className="text-[11px] leading-4">
          {formatAppRelativeTime(conversation.lastMessageAt)}
        </span>
        {isHighlighted ? <CornerDownLeft className="size-3.5" /> : null}
      </div>
    </button>
  );
}
