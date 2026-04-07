import { useShortcutScope } from "@/core/shortcuts";
import { ClipboardBoardPanel } from "@/features/clipboard/components/clipboard-board-panel";
import { ClipboardBoardSummary } from "@/features/clipboard/components/clipboard-board-summary";
import { useClipboardBoardView } from "@/features/clipboard/hooks/use-clipboard-board-view";

export function ClipboardBoardFeature({
  showSummary = true,
  fillHeight = false,
  windowMode = false,
  autoFocusSearch = false,
}: {
  showSummary?: boolean;
  fillHeight?: boolean;
  windowMode?: boolean;
  autoFocusSearch?: boolean;
}) {
  useShortcutScope("clipboard.panel");
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
        onLoadMore={onLoadMore}
        emptyStateTitle={
          status === "loading"
            ? "Loading clipboard history"
            : status === "error"
              ? "Clipboard history failed to load"
              : "No matching captures"
        }
        emptyStateDescription={
          status === "loading"
            ? "The clipboard archive is being read from local storage."
            : status === "error"
              ? errorMessage
              : "Try clearing the search term or switching the type filter back to all entries."
        }
        onRetry={onRetry}
      />
    </div>
  );
}
