import { useDeferredValue, useMemo } from "react";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { ClipboardBoardPanel } from "@/features/clipboard/components/clipboard-board-panel";
import { ClipboardBoardSummary } from "@/features/clipboard/components/clipboard-board-summary";
import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { getClipboardPage } from "@/lib/tauri";

const CLIPBOARD_PAGE_SIZE = 40;

export function ClipboardPage() {
  const searchValue = useClipboardBoardStore((state) => state.searchValue);
  const filter = useClipboardBoardStore((state) => state.filter);
  const deferredSearch = useDeferredValue(searchValue);
  const queryClient = useQueryClient();
  const listQueryKey = useMemo(
    () => queryKeys.clipboardPage(filter, deferredSearch),
    [filter, deferredSearch],
  );
  const summaryQueryKey = queryKeys.clipboardPageSummary();

  const { data: summaryPage } = useQuery({
    queryKey: summaryQueryKey,
    queryFn: () =>
      getClipboardPage({
        page: 0,
        pageSize: 1,
        filter: "all",
      }),
    staleTime: 2 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useInfiniteQuery({
    queryKey: listQueryKey,
    queryFn: ({ pageParam }) =>
      getClipboardPage({
        page: pageParam,
        pageSize: CLIPBOARD_PAGE_SIZE,
        filter,
        search: deferredSearch,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 2 * 60 * 1_000,
    placeholderData: (previousData) => previousData,
  });

  useClipboardCaptureEvents(() => {
    void queryClient.invalidateQueries({ queryKey: listQueryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: summaryQueryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() });
  });

  const pages = data?.pages ?? [];
  const captures = pages.flatMap((page) => page.captures);
  const firstPage = pages[0];
  const summary = summaryPage?.summary ?? {
    total: 0,
    text: 0,
    links: 0,
    images: 0,
  };
  const historyDays = summaryPage?.historyDays ?? firstPage?.historyDays ?? 3;
  const status =
    !firstPage && isPending ? "loading" : !firstPage && isError ? "error" : "ready";
  const errorMessage =
    error instanceof Error ? error.message : "Clipboard history could not be loaded.";

  return (
    <div className="space-y-3">
      <ClipboardBoardSummary
        summary={summary}
        historyDays={historyDays}
        status={status}
      />
      <ClipboardBoardPanel
        captures={captures}
        hasNextPage={hasNextPage}
        isRefreshingList={isFetching && !isFetchingNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage({ cancelRefetch: false })}
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
        onRetry={status === "error" ? () => void refetch() : undefined}
      />
    </div>
  );
}
