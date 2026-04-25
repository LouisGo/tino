import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";

import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  EllipsisVertical,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Square,
  X,
} from "lucide-react";

import { useContextMenu } from "@/core/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DISABLE_TEXT_INPUT_ASSIST_PROPS } from "@/components/ui/text-input-behavior";
import { Tooltip } from "@/components/ui/tooltip";
import { resolveProviderAccessConfig, type ProviderAccessConfig } from "@/features/ai/lib/provider-access";
import {
  homeChatConversationContextMenu,
  type HomeChatConversationMenuContext,
} from "@/features/chat/home-chat-conversation-context-menu";
import { useHomeChatWorkspace } from "@/features/chat/hooks/use-home-chat-workspace";
import { MarkdownTextPreview } from "@/features/clipboard/components/markdown-text-preview";
import { HomeComposerDropOverlay } from "@/features/dashboard/components/home-composer-drop-overlay";
import { HomeAttachmentPicker } from "@/features/dashboard/components/home-attachment-picker";
import { HomeAttachmentStrip } from "@/features/dashboard/components/home-attachment-strip";
import { useHomeAttachmentTransfer } from "@/features/dashboard/hooks/use-home-attachment-transfer";
import { useHomeAttachments } from "@/features/dashboard/hooks/use-home-attachments";
import { formatAppRelativeTime, useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type {
  HomeChatConversationSummary,
  HomeChatMessage,
} from "@/types/shell";

const MIN_PROMPT_ROWS = 1;
const MAX_PROMPT_ROWS = 5;

type ResolvedProviderAccess = ReturnType<typeof resolveProviderAccessConfig>;

type HomeChatWorkspaceProps = {
  providerAccess: ResolvedProviderAccess;
  providerConfig: ProviderAccessConfig;
  providerControls: ReactNode;
  suggestionPrompts: string[];
};

export function HomeChatWorkspace({
  providerAccess,
  providerConfig,
  providerControls,
  suggestionPrompts,
}: HomeChatWorkspaceProps) {
  const tCommon = useScopedT("common");
  const tDashboard = useScopedT("dashboard");
  const {
    activeConversation,
    activeConversationId,
    composerValue,
    conversations,
    conversationsLoading,
    conversationLoading,
    isBusy,
    isDraftConversation,
    isEditingLatestUserMessage,
    isStreaming,
    latestAssistantMessage,
    latestUserMessage,
    liveAssistant,
    providerConfigured,
    selectConversation,
    setComposerValue,
    startNewConversation,
    submitComposer,
    retryLatestAssistant,
    startEditingLatestUserMessage,
    cancelEditingLatestUserMessage,
    stopStreaming,
    renameConversation,
    updateConversationPinned,
    removeConversation,
    undoClearedComposerValue,
    workspaceError,
  } = useHomeChatWorkspace({
    providerAccess,
    providerConfig,
  });
  const {
    attachments,
    canAddAttachments,
    addAttachments,
    appendAttachments,
    removeAttachment,
  } = useHomeAttachments();
  const { isDropTargetActive, dragHandlers, onPasteCapture } = useHomeAttachmentTransfer({
    onAttachments: appendAttachments,
  });
  const { openAtElement, onContextMenu } = useContextMenu(homeChatConversationContextMenu);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [renderedSuggestions, setRenderedSuggestions] = useState(suggestionPrompts);
  const [conversationSearchValue, setConversationSearchValue] = useState("");
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraftValue, setRenameDraftValue] = useState("");
  const [conversationActionPendingId, setConversationActionPendingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeChatConversationSummary | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const attachmentHint = attachments.length > 0
    ? tDashboard("chat.attachmentsHint")
    : null;
  const emptyStateVisible = isDraftConversation && !activeConversation;
  const currentMessages = activeConversation?.messages ?? [];
  const normalizedConversationSearch = conversationSearchValue.trim().toLowerCase();

  useEffect(() => {
    setRenderedSuggestions(suggestionPrompts);
  }, [suggestionPrompts]);

  useEffect(() => {
    if (!renamingConversationId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [renamingConversationId]);

  useLayoutEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea) {
      return;
    }

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    const minPromptHeight = lineHeight * MIN_PROMPT_ROWS + paddingTop + paddingBottom;
    const maxPromptHeight = lineHeight * MAX_PROMPT_ROWS + paddingTop + paddingBottom;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minPromptHeight), maxPromptHeight)}px`;
  }, [attachments.length, composerValue]);

  useLayoutEffect(() => {
    const viewport = messageListRef.current;
    if (!viewport || !shouldAutoScrollRef.current) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [activeConversation?.messages, activeConversationId, liveAssistant]);

  useEffect(() => {
    if (workspaceError || isEditingLatestUserMessage) {
      promptTextareaRef.current?.focus({ preventScroll: true });
    }
  }, [isEditingLatestUserMessage, workspaceError]);

  const visibleConversations = useMemo(() => {
    if (!normalizedConversationSearch) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const haystacks = [
        resolveConversationTitle(conversation.title, tDashboard("chat.newConversation")),
        conversation.previewText ?? "",
      ];

      return haystacks.some((value) => value.toLowerCase().includes(normalizedConversationSearch));
    });
  }, [conversations, normalizedConversationSearch, tDashboard]);

  const pinnedConversations = visibleConversations.filter((conversation) => conversation.isPinned);
  const recentConversations = visibleConversations.filter((conversation) => !conversation.isPinned);
  const activeConversationTitle = activeConversation
    ? resolveConversationTitle(activeConversation.conversation.title, tDashboard("chat.newConversation"))
    : tDashboard("chat.newConversation");

  function handleMessageViewportScroll() {
    const viewport = messageListRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
  }

  function handleComposerSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    void submitComposer();
  }

  function focusComposer() {
    window.requestAnimationFrame(() => {
      const textarea = promptTextareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus({ preventScroll: true });
      const caretPosition = textarea.value.length;
      textarea.setSelectionRange(caretPosition, caretPosition);
    });
  }

  function handleStartNewConversation() {
    setSidebarError(null);
    setRenamingConversationId(null);
    startNewConversation();
    focusComposer();
  }

  function handleSelectConversation(conversationId: string) {
    setSidebarError(null);
    setRenamingConversationId(null);
    selectConversation(conversationId);
    focusComposer();
  }

  function handleStartRename(conversation: HomeChatConversationSummary) {
    setSidebarError(null);
    setRenamingConversationId(conversation.id);
    setRenameDraftValue(resolveConversationTitle(
      conversation.title,
      tDashboard("chat.newConversation"),
    ));
  }

  async function handleRenameSubmit() {
    if (!renamingConversationId) {
      return;
    }

    const nextTitle = renameDraftValue.trim();
    if (!nextTitle) {
      return;
    }

    setConversationActionPendingId(renamingConversationId);
    setSidebarError(null);

    try {
      await renameConversation(renamingConversationId, nextTitle);
      setRenamingConversationId(null);
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : tDashboard("chat.errorFallback"));
    } finally {
      setConversationActionPendingId(null);
    }
  }

  async function handleTogglePinned(conversation: HomeChatConversationSummary) {
    setConversationActionPendingId(conversation.id);
    setSidebarError(null);

    try {
      await updateConversationPinned(conversation.id, !conversation.isPinned);
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : tDashboard("chat.errorFallback"));
    } finally {
      setConversationActionPendingId(null);
    }
  }

  async function handleDeleteConversation() {
    if (!deleteTarget) {
      return;
    }

    const conversationId = deleteTarget.id;
    setConversationActionPendingId(conversationId);
    setSidebarError(null);

    try {
      await removeConversation(conversationId);
      if (renamingConversationId === conversationId) {
        setRenamingConversationId(null);
      }
      setDeleteTarget(null);
    } catch (error) {
      setSidebarError(error instanceof Error ? error.message : tDashboard("chat.errorFallback"));
    } finally {
      setConversationActionPendingId(null);
    }
  }

  return (
    <div
      className={cn(
        "app-home-chat-workspace min-h-0 flex-1",
        emptyStateVisible && "is-empty",
      )}
      {...dragHandlers}
    >
      <aside className="app-home-chat-sidebar app-board-surface">
        <div className="app-home-chat-sidebar-header">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleStartNewConversation()}
            disabled={isBusy}
            className={cn(
              "app-home-chat-new-button",
              isDraftConversation && "app-animated-tabs-indicator",
            )}
          >
            <Plus className="size-4" />
            <span>{tDashboard("chat.newChat")}</span>
          </Button>

          <div className="app-home-chat-sidebar-search">
            <Search className="app-home-chat-sidebar-search-icon size-3.5" />
            <Input
              value={conversationSearchValue}
              onChange={(event) => setConversationSearchValue(event.target.value)}
              placeholder={tDashboard("chat.searchConversations")}
              className="app-home-chat-sidebar-search-input"
            />
            {conversationSearchValue ? (
              <button
                type="button"
                className="app-home-chat-sidebar-search-clear"
                aria-label={tDashboard("chat.clearSearch")}
                onClick={() => setConversationSearchValue("")}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="app-home-chat-sidebar-scroll">
          {conversationsLoading ? (
            <div className="app-home-chat-sidebar-state">
              <LoaderCircle className="size-4 animate-spin" />
              <span>{tCommon("actions.refresh")}</span>
            </div>
          ) : (
            <>
              {pinnedConversations.length ? (
                <ConversationSection
                  title={tDashboard("chat.pinnedConversations")}
                  conversations={pinnedConversations}
                  activeConversationId={activeConversationId}
                  renamingConversationId={renamingConversationId}
                  renameDraftValue={renameDraftValue}
                  renameInputRef={renameInputRef}
                  busyConversationId={conversationActionPendingId}
                  isBusy={isBusy}
                  onRenameDraftChange={setRenameDraftValue}
                  onRenameCancel={() => setRenamingConversationId(null)}
                  onRenameSubmit={() => void handleRenameSubmit()}
                  onSelectConversation={handleSelectConversation}
                  onOpenConversationMenu={openAtElement}
                  onConversationContextMenu={onContextMenu}
                  onTogglePinned={(conversation) => void handleTogglePinned(conversation)}
                  onStartRename={handleStartRename}
                  onDeleteConversation={setDeleteTarget}
                />
              ) : null}

              {recentConversations.length ? (
                <ConversationSection
                  title={tDashboard("chat.recentConversations")}
                  conversations={recentConversations}
                  activeConversationId={activeConversationId}
                  renamingConversationId={renamingConversationId}
                  renameDraftValue={renameDraftValue}
                  renameInputRef={renameInputRef}
                  busyConversationId={conversationActionPendingId}
                  isBusy={isBusy}
                  onRenameDraftChange={setRenameDraftValue}
                  onRenameCancel={() => setRenamingConversationId(null)}
                  onRenameSubmit={() => void handleRenameSubmit()}
                  onSelectConversation={handleSelectConversation}
                  onOpenConversationMenu={openAtElement}
                  onConversationContextMenu={onContextMenu}
                  onTogglePinned={(conversation) => void handleTogglePinned(conversation)}
                  onStartRename={handleStartRename}
                  onDeleteConversation={setDeleteTarget}
                />
              ) : null}

              {!visibleConversations.length && conversations.length ? (
                <div className="app-home-chat-sidebar-state is-empty">
                  <span>{tDashboard("chat.searchEmpty")}</span>
                </div>
              ) : null}

              {!conversations.length && !isDraftConversation ? (
                <div className="app-home-chat-sidebar-state is-empty">
                  <span>{tDashboard("chat.emptyConversationHint")}</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {sidebarError ? (
          <p className="app-home-chat-sidebar-error">{sidebarError}</p>
        ) : null}
      </aside>

      <div className="app-home-chat-main">
        <section className={cn("app-home-chat-stage", emptyStateVisible && "is-empty")}>
          <div
            className={cn(
              "app-home-chat-hero",
              !emptyStateVisible && "is-hidden",
            )}
            aria-hidden={!emptyStateVisible}
          >
            <div className="app-home-stack app-home-chat-hero-stack">
              <div className="app-home-copy">
                <p className="app-home-eyebrow">{tDashboard("chat.eyebrow")}</p>
                <h1 className="app-home-heading">{tDashboard("chat.title")}</h1>
                <p className="app-home-chat-empty-copy">{tDashboard("chat.emptyConversationHint")}</p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "app-home-chat-thread-header",
              emptyStateVisible && "is-hidden",
            )}
            aria-hidden={emptyStateVisible}
          >
            <div className="app-home-chat-thread-header-copy">
              <div className="app-home-chat-thread-header-title-row">
                <h2 className="app-home-chat-thread-header-title">{activeConversationTitle}</h2>
                {activeConversation?.conversation.isPinned ? (
                  <Badge variant="secondary" className="app-home-chat-thread-header-badge">
                    {tDashboard("chat.pinnedBadge")}
                  </Badge>
                ) : null}
                {activeConversation?.conversation.titleStatus === "pending" ? (
                  <Badge variant="secondary" className="app-home-chat-thread-header-badge">
                    {tDashboard("chat.generatingTitle")}
                  </Badge>
                ) : null}
              </div>
              {activeConversation ? (
                <p className="app-home-chat-thread-header-meta">
                  {tDashboard("chat.threadMeta", {
                    values: {
                      time: formatAppRelativeTime(activeConversation.conversation.lastMessageAt),
                      count: activeConversation.conversation.messageCount,
                    },
                  })}
                </p>
              ) : null}
            </div>
          </div>

          <div
            ref={messageListRef}
            className={cn(
              "app-home-chat-message-viewport",
              emptyStateVisible && "is-hidden",
            )}
            onScroll={handleMessageViewportScroll}
            aria-hidden={emptyStateVisible}
          >
            {conversationLoading && !activeConversation ? (
              <div className="app-chat-message-loading">
                <LoaderCircle className="size-4 animate-spin" />
              </div>
            ) : null}

            {currentMessages.map((message, index) => (
              <ChatMessageBubble
                key={message.id}
                message={message}
                isLatest={index === currentMessages.length - 1}
                isLatestAssistantMessage={latestAssistantMessage?.id === message.id}
                isLatestUserMessage={latestUserMessage?.id === message.id}
                isBusy={isBusy}
                onRetry={() => void retryLatestAssistant()}
                onEdit={() => startEditingLatestUserMessage()}
              />
            ))}

            {liveAssistant && activeConversation ? (
              <LiveAssistantBubble
                content={liveAssistant.text}
                reasoningText={liveAssistant.reasoningText}
                label={tDashboard("chat.generating")}
              />
            ) : null}
          </div>

          <div className={cn("app-home-chat-composer-region", !emptyStateVisible && "is-docked")}>
            {isEditingLatestUserMessage ? (
              <div className="app-chat-edit-banner">
                <span>{tDashboard("chat.editingPrompt")}</span>
                <button
                  type="button"
                  onClick={() => cancelEditingLatestUserMessage()}
                  className="app-chat-edit-cancel"
                >
                  {tDashboard("chat.cancelEdit")}
                </button>
              </div>
            ) : null}

            <form
              className={cn(
                "app-home-composer w-full app-home-chat-composer",
                isDropTargetActive && "app-home-composer-drop-active",
                emptyStateVisible ? "app-home-chat-composer-empty" : "app-home-chat-composer-docked",
              )}
              onSubmit={handleComposerSubmit}
              onPasteCapture={onPasteCapture}
            >
              {isDropTargetActive ? (
                <HomeComposerDropOverlay
                  title={tDashboard("chat.dropTitle")}
                  hint={tDashboard("chat.dropHint")}
                />
              ) : null}

              <div className="app-home-composer-body">
                <div className="app-home-composer-track">
                  <HomeAttachmentStrip
                    attachments={attachments}
                    attachmentsLabel={tDashboard("chat.attachmentsLabel")}
                    removeLabel={tDashboard("chat.removeAttachment")}
                    countText={null}
                    countTone="default"
                    onRemove={removeAttachment}
                  />

                  <textarea
                    ref={promptTextareaRef}
                    value={composerValue}
                    onChange={(event) => setComposerValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) {
                        return;
                      }

                      if (
                        (event.metaKey || event.ctrlKey)
                        && !event.shiftKey
                        && event.key.toLowerCase() === "z"
                      ) {
                        if (undoClearedComposerValue()) {
                          event.preventDefault();
                          return;
                        }
                      }

                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitComposer();
                      }
                    }}
                    rows={1}
                    placeholder={tDashboard("chat.placeholder")}
                    className="app-home-input app-home-chat-input"
                    {...DISABLE_TEXT_INPUT_ASSIST_PROPS}
                  />
                </div>
              </div>

              <div className="app-home-composer-toolbar app-home-chat-composer-toolbar">
                <HomeAttachmentPicker
                  attachmentsLabel={tDashboard("chat.attachmentsLabel")}
                  imageLabel={tDashboard("chat.attachmentImage")}
                  fileLabel={tDashboard("chat.attachmentFile")}
                  disabled={!canAddAttachments}
                  onPickImages={() => addAttachments("image")}
                  onPickFiles={() => addAttachments("file")}
                />

                <div className="app-home-chat-composer-actions">
                  {providerControls}
                  <Button
                    type={isStreaming ? "button" : "submit"}
                    size="icon"
                    className="app-home-send-button app-home-chat-send-button"
                    disabled={
                      !providerConfigured
                      || (!isStreaming && (isBusy || composerValue.trim().length === 0))
                    }
                    aria-label={isStreaming ? tDashboard("chat.stop") : tDashboard("chat.send")}
                    onClick={isStreaming ? () => stopStreaming() : undefined}
                  >
                    {isStreaming ? (
                      <Square className="size-3.5 fill-current" />
                    ) : isBusy ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <ArrowUp className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </form>

            {attachmentHint ? (
              <p className="app-chat-inline-note">{attachmentHint}</p>
            ) : null}
            {!providerConfigured ? (
              <div className="app-chat-inline-note flex flex-wrap items-center gap-2">
                <span>{tDashboard("chat.setupHint")}</span>
                <Link to="/settings" hash="ai" hashScrollIntoView={false} className="app-chat-settings-link">
                  {tCommon("navigation.settings")}
                </Link>
              </div>
            ) : null}
            {workspaceError ? (
              <p className="app-chat-inline-error">{workspaceError}</p>
            ) : null}
          </div>

          <div
            className={cn(
              "app-home-chat-suggestion-row",
              !emptyStateVisible && "is-hidden",
            )}
            aria-hidden={!emptyStateVisible}
          >
            {renderedSuggestions.map((item) => (
              <button
                key={item}
                type="button"
                className="app-home-suggestion-chip app-home-chat-suggestion-chip"
                onClick={() => setComposerValue(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null);
        }
      }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tDashboard("chat.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tDashboard("chat.deleteDescription", {
                values: {
                  title: deleteTarget
                    ? resolveConversationTitle(deleteTarget.title, tDashboard("chat.newConversation"))
                    : "",
                },
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tDashboard("chat.renameCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeleteConversation()}
            >
              {conversationActionPendingId === deleteTarget?.id
                ? tDashboard("chat.deletePending")
                : tDashboard("chat.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConversationSection({
  title,
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
  title: string;
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
    event: React.MouseEvent,
    context: HomeChatConversationMenuContext,
  ) => void;
  onTogglePinned: (conversation: HomeChatConversationSummary) => void;
  onStartRename: (conversation: HomeChatConversationSummary) => void;
  onDeleteConversation: (conversation: HomeChatConversationSummary) => void;
}) {
  return (
    <section className="app-home-chat-sidebar-group">
      <div className="app-home-chat-sidebar-group-header">
        <p className="app-home-chat-sidebar-label">{title}</p>
      </div>

      <div className="app-home-chat-sidebar-group-list">
        {conversations.map((conversation) => (
          <ConversationSidebarItem
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === activeConversationId}
            renaming={conversation.id === renamingConversationId}
            renameDraftValue={renameDraftValue}
            renameInputRef={renameInputRef}
            busy={isBusy || busyConversationId === conversation.id}
            onRenameDraftChange={onRenameDraftChange}
            onRenameCancel={onRenameCancel}
            onRenameSubmit={onRenameSubmit}
            onSelect={() => onSelectConversation(conversation.id)}
            onOpenMenu={onOpenConversationMenu}
            onConversationContextMenu={onConversationContextMenu}
            onTogglePinned={() => onTogglePinned(conversation)}
            onStartRename={() => onStartRename(conversation)}
            onDelete={() => onDeleteConversation(conversation)}
          />
        ))}
      </div>
    </section>
  );
}

function ConversationSidebarItem({
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
    event: React.MouseEvent,
    context: HomeChatConversationMenuContext,
  ) => void;
  onTogglePinned: () => void;
  onStartRename: () => void;
  onDelete: () => void;
}) {
  const tDashboard = useScopedT("dashboard");
  const title = resolveConversationTitle(conversation.title, tDashboard("chat.newConversation"));
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
        "app-home-chat-sidebar-item",
        active && "is-active app-animated-tabs-indicator",
      )}
    >
      {renaming ? (
        <div className="app-home-chat-sidebar-item-main is-editing">
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
            className="app-home-chat-rename-input"
          />
          <div className="app-home-chat-sidebar-item-actions is-visible">
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
        <div className="app-home-chat-sidebar-item-main">
          <button
            type="button"
            className="app-home-chat-sidebar-item-trigger"
            onClick={onSelect}
            disabled={busy}
          >
            <span className="app-home-chat-sidebar-item-title">{title}</span>
            {conversation.titleStatus === "pending" ? (
              <LoaderCircle className="app-home-chat-sidebar-item-status size-3 animate-spin" />
            ) : null}
          </button>

          <div className={cn("app-home-chat-sidebar-item-actions", active && "is-visible")}>
            <SidebarIconButton
              label={tDashboard("chat.moreActions")}
              ariaHasPopup="menu"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenMenu(event.currentTarget, menuContext);
              }}
              disabled={busy}
              className="app-home-chat-sidebar-item-more"
            >
              <EllipsisVertical className="size-3.5" />
            </SidebarIconButton>
          </div>
        </div>
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
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  className?: string;
  ariaHasPopup?: React.AriaAttributes["aria-haspopup"];
}) {
  return (
    <button
      type="button"
      className={cn(
        "app-home-chat-sidebar-icon-button",
        tone === "danger" && "is-danger",
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

function ChatMessageBubble({
  message,
  isLatest,
  isLatestAssistantMessage,
  isLatestUserMessage,
  isBusy,
  onRetry,
  onEdit,
}: {
  message: HomeChatMessage;
  isLatest: boolean;
  isLatestAssistantMessage: boolean;
  isLatestUserMessage: boolean;
  isBusy: boolean;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const tCommon = useScopedT("common");
  const tDashboard = useScopedT("dashboard");
  const isAssistant = message.role === "assistant";
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [didCopy, setDidCopy] = useState(false);
  const canRetryAssistant =
    isAssistant
    && isLatest
    && isLatestAssistantMessage
    && (message.status === "failed" || message.status === "stopped")
    && !isBusy;
  const canEditUserMessage =
    !isAssistant
    && isLatestUserMessage
    && !isBusy;
  const copyLabel = didCopy
    ? tCommon("clipboardPreview.copiedToClipboard")
    : tDashboard("chat.copyMessage");
  const normalizedMessageContent = message.content.trim();

  useEffect(() => () => {
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  async function handleCopy() {
    if (!normalizedMessageContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
      setDidCopy(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setDidCopy(false);
        copyResetTimeoutRef.current = null;
      }, 1600);
    } catch (error) {
      console.error("[home-chat] failed to copy message", error);
    }
  }

  return (
    <div
      className={cn(
        "app-chat-message-row",
        isAssistant ? "is-assistant" : "is-user",
        isLatest && "is-latest",
      )}
    >
      <div className={cn("app-chat-message-bubble", isAssistant ? "is-assistant" : "is-user")}>
        <div className={cn("app-chat-message-content", isAssistant ? "is-assistant" : "is-user")}>
          {isAssistant ? (
            <div className="app-chat-message-body">
              <div className="app-chat-message-meta">
                {/* <span>{tDashboard("chat.assistantLabel")}</span> */}
                {message.responseModel ? (
                  <span className="app-chat-message-model">{message.responseModel}</span>
                ) : null}
              </div>
              {message.reasoningText ? (
                <ThinkingPanel reasoningText={message.reasoningText} />
              ) : null}
              {message.content ? (
                <MarkdownTextPreview markdown={message.content} highlightQuery="" size="chat" />
              ) : null}
              {message.status !== "completed" ? (
                <p className="app-chat-message-status">
                  {message.status === "failed"
                    ? tDashboard("chat.failed")
                    : tDashboard("chat.stopped")}
                </p>
              ) : null}
              {message.errorMessage && message.status !== "completed" ? (
                <p className="app-chat-message-error">{message.errorMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="app-chat-user-copy app-selectable">{message.content}</div>
          )}
        </div>

        {normalizedMessageContent || canEditUserMessage || canRetryAssistant ? (
          <div className={cn("app-chat-message-actions", isAssistant ? "is-assistant" : "is-user")}>
            {normalizedMessageContent ? (
              <MessageActionButton
                label={copyLabel}
                onClick={() => void handleCopy()}
              >
                {didCopy ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </MessageActionButton>
            ) : null}

            {canEditUserMessage ? (
              <MessageActionButton
                label={tDashboard("chat.editPrompt")}
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
              </MessageActionButton>
            ) : null}

            {canRetryAssistant ? (
              <MessageActionButton
                label={tDashboard("chat.retry")}
                onClick={onRetry}
              >
                <RotateCcw className="size-3.5" />
              </MessageActionButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip
      content={label}
      placement="bottom"
      className="app-preview-action-tooltip rounded-full px-3 py-1.5 text-[11px] font-medium"
    >
      <div className="shrink-0">
        <button
          type="button"
          className="app-chat-message-action-button"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      </div>
    </Tooltip>
  );
}

function LiveAssistantBubble({
  content,
  reasoningText,
  label,
}: {
  content: string;
  reasoningText: string;
  label: string;
}) {
  return (
    <div className="app-chat-message-row is-assistant is-live">
      <div className="app-chat-message-bubble is-assistant is-live">
        <div className="app-chat-message-content is-assistant is-live">
          <div className="app-chat-message-meta">
            <span>{label}</span>
            <LoaderCircle className="size-3.5 animate-spin" />
          </div>
          {reasoningText ? <ThinkingPanel reasoningText={reasoningText} defaultExpanded /> : null}
          {content ? (
            <MarkdownTextPreview markdown={content} highlightQuery="" size="chat" />
          ) : (
            <p className="app-chat-message-status">{label}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingPanel({
  reasoningText,
  defaultExpanded = false,
}: {
  reasoningText: string;
  defaultExpanded?: boolean;
}) {
  const tDashboard = useScopedT("dashboard");
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="app-chat-thinking-panel">
      <button
        type="button"
        className="app-chat-thinking-toggle"
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{expanded ? tDashboard("chat.hideThinking") : tDashboard("chat.showThinking")}</span>
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded ? (
        <div className="app-chat-thinking-copy app-selectable">{reasoningText}</div>
      ) : null}
    </div>
  );
}

function resolveConversationTitle(title: string | null | undefined, fallback: string) {
  const normalizedTitle = title?.trim();
  return normalizedTitle || fallback;
}
