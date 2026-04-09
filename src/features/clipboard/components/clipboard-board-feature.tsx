import { useShortcutScope } from "@/core/shortcuts";
import { ClipboardBoardPanel } from "@/features/clipboard/components/clipboard-board-panel";
import { ClipboardBoardSummary } from "@/features/clipboard/components/clipboard-board-summary";
import type { ClipboardEmptyStateTone } from "@/features/clipboard/components/clipboard-empty-state";
import { useClipboardBoardView } from "@/features/clipboard/hooks/use-clipboard-board-view";
import { useScopedT } from "@/i18n";

export function ClipboardBoardFeature({
  showSummary = true,
  fillHeight = false,
  windowMode = false,
  autoFocusSearch = false,
  searchFocusRequest = 0,
}: {
  showSummary?: boolean;
  fillHeight?: boolean;
  windowMode?: boolean;
  autoFocusSearch?: boolean;
  searchFocusRequest?: number;
}) {
  useShortcutScope("clipboard.panel");
  const t = useScopedT("clipboard");
  const {
    captures,
    errorMessage,
    hasNextPage,
    historyDays,
    isFetchingNextPage,
    isRefreshingList,
    onLoadMore,
    onRetry,
    pinnedCaptures,
    status,
    summary,
  } = useClipboardBoardView();
  const emptyStateTone: ClipboardEmptyStateTone | undefined =
    status === "loading" ? "loading" : status === "error" ? "error" : undefined;

  return (
    <div className={showSummary ? "space-y-3" : ""}>
      {showSummary ? (
        <ClipboardBoardSummary
          summary={summary}
          historyDays={historyDays}
          status={status}
        />
      ) : null}
      <ClipboardBoardPanel
        captures={captures}
        pinnedCaptures={pinnedCaptures}
        hasNextPage={hasNextPage}
        isRefreshingList={isRefreshingList}
        isFetchingNextPage={isFetchingNextPage}
        fillHeight={fillHeight}
        windowMode={windowMode}
        autoFocusSearch={autoFocusSearch}
        searchFocusRequest={searchFocusRequest}
        onLoadMore={onLoadMore}
        emptyStateTitle={
          status === "loading"
            ? t("empty.loadingTitle")
            : status === "error"
              ? t("empty.errorTitle")
              : undefined
        }
        emptyStateDescription={
          status === "loading"
            ? t("empty.loadingDescription")
            : status === "error"
              ? errorMessage
              : undefined
        }
        emptyStateTone={emptyStateTone}
        onRetry={onRetry}
      />
    </div>
  );
}
