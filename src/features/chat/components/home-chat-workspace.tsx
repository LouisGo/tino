import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Link } from "@tanstack/react-router";
import {
  ArrowUp,
  ChevronDown,
  LoaderCircle,
  Pencil,
  Plus,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DISABLE_TEXT_INPUT_ASSIST_PROPS } from "@/components/ui/text-input-behavior";
import { resolveProviderAccessConfig, type ProviderAccessConfig } from "@/features/ai/lib/provider-access";
import { MarkdownTextPreview } from "@/features/clipboard/components/markdown-text-preview";
import { HomeComposerDropOverlay } from "@/features/dashboard/components/home-composer-drop-overlay";
import { HomeAttachmentPicker } from "@/features/dashboard/components/home-attachment-picker";
import { HomeAttachmentStrip } from "@/features/dashboard/components/home-attachment-strip";
import { useHomeAttachmentTransfer } from "@/features/dashboard/hooks/use-home-attachment-transfer";
import { useHomeAttachments } from "@/features/dashboard/hooks/use-home-attachments";
import { useHomeChatWorkspace } from "@/features/chat/hooks/use-home-chat-workspace";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { HomeChatMessage } from "@/types/shell";

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
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [renderedSuggestions, setRenderedSuggestions] = useState(suggestionPrompts);
  const attachmentHint = attachments.length > 0
    ? tDashboard("chat.attachmentsHint")
    : null;
  const emptyStateVisible = isDraftConversation && !activeConversation;
  const currentMessages = activeConversation?.messages ?? [];

  useEffect(() => {
    setRenderedSuggestions(suggestionPrompts);
  }, [suggestionPrompts]);

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
    startNewConversation();
    focusComposer();
  }

  function handleSelectConversation(conversationId: string) {
    selectConversation(conversationId);
    focusComposer();
  }

  return (
    <div
      className={cn(
        "app-home-chat-workspace min-h-0 flex-1",
        emptyStateVisible && "is-empty",
      )}
      {...dragHandlers}
    >
      <aside className="app-home-chat-sidebar">
        <div className="app-home-chat-sidebar-header">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleStartNewConversation()}
            disabled={isBusy}
            className="app-home-chat-new-button app-animated-tabs-indicator"
          >
            <Plus className="size-4" />
            <span>{tDashboard("chat.newChat")}</span>
          </Button>
          <p className="app-home-chat-sidebar-label">{tDashboard("chat.conversationHistory")}</p>
        </div>

        <div className="app-home-chat-sidebar-scroll">
          {isDraftConversation ? (
            <ConversationSidebarItem
              active
              title={tDashboard("chat.newConversation")}
              onSelect={() => handleStartNewConversation()}
            />
          ) : null}

          {conversationsLoading ? (
            <div className="app-home-chat-sidebar-state">
              <LoaderCircle className="size-4 animate-spin" />
              <span>{tCommon("actions.refresh")}</span>
            </div>
          ) : conversations.length ? (
            conversations.map((conversation) => (
              <ConversationSidebarItem
                key={conversation.id}
                active={conversation.id === activeConversationId && !isDraftConversation}
                title={resolveConversationTitle(conversation.title, tDashboard("chat.newConversation"))}
                onSelect={() => handleSelectConversation(conversation.id)}
              />
            ))
          ) : !isDraftConversation ? (
            <div className="app-home-chat-sidebar-state is-empty">
              <span>{tDashboard("chat.emptyConversationHint")}</span>
            </div>
          ) : null}
        </div>
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
                showActions={
                  latestAssistantMessage?.id === message.id
                  && message.role === "assistant"
                  && message.status !== "completed"
                  && !isBusy
                }
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
                    disabled={!providerConfigured || (!isStreaming && composerValue.trim().length === 0)}
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
    </div>
  );
}

function ConversationSidebarItem({
  active,
  title,
  onSelect,
}: {
  active: boolean;
  title: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "app-home-chat-sidebar-item",
        active && "is-active app-animated-tabs-indicator",
      )}
      onClick={onSelect}
    >
      <span className="app-home-chat-sidebar-item-title">{title}</span>
    </button>
  );
}

function ChatMessageBubble({
  message,
  isLatest,
  showActions,
  onRetry,
  onEdit,
}: {
  message: HomeChatMessage;
  isLatest: boolean;
  showActions: boolean;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const tDashboard = useScopedT("dashboard");
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "app-chat-message-row",
        isAssistant ? "is-assistant" : "is-user",
        isLatest && "is-latest",
      )}
    >
      <div className={cn("app-chat-message-bubble", isAssistant ? "is-assistant" : "is-user")}>
        {isAssistant ? (
          <div className="app-chat-message-body">
            <div className="app-chat-message-meta">
              <span>{tDashboard("chat.assistantLabel")}</span>
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
          <p className="app-chat-user-copy">{message.content}</p>
        )}

        {showActions ? (
          <div className="app-chat-message-actions">
            <button type="button" onClick={onRetry} className="app-chat-message-action">
              {tDashboard("chat.retry")}
            </button>
            <button type="button" onClick={onEdit} className="app-chat-message-action">
              <Pencil className="size-3.5" />
              <span>{tDashboard("chat.editPrompt")}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
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
        <div className="app-chat-message-meta">
          <span>{label}</span>
          <LoaderCircle className="size-3.5 animate-spin" />
        </div>
        {reasoningText ? <ThinkingPanel reasoningText={reasoningText} defaultExpanded={false} /> : null}
        {content ? (
          <MarkdownTextPreview markdown={content} highlightQuery="" size="chat" />
        ) : (
          <p className="app-chat-message-status">{label}</p>
        )}
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
        <pre className="app-chat-thinking-copy">{reasoningText}</pre>
      ) : null}
    </div>
  );
}

function resolveConversationTitle(title: string | null | undefined, fallback: string) {
  const normalizedTitle = title?.trim();
  return normalizedTitle || fallback;
}
