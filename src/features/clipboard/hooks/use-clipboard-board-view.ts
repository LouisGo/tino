import { useDeferredValue, useEffect, useMemo } from "react"

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"

import { queryKeys } from "@/app/query-keys"
import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events"
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store"
import { getClipboardPage } from "@/lib/tauri"

const CLIPBOARD_PAGE_SIZE = 40

export function useClipboardBoardView() {
  const searchValue = useClipboardBoardStore((state) => state.searchValue)
  const filter = useClipboardBoardStore((state) => state.filter)
  const deferredSearch = useDeferredValue(searchValue)
  const queryClient = useQueryClient()
  const listQueryKey = useMemo(
    () => queryKeys.clipboardPage(filter, deferredSearch),
    [filter, deferredSearch],
  )
  const summaryQueryKey = queryKeys.clipboardPageSummary()

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
  })

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
  })

  useClipboardCaptureEvents(() => {
    void queryClient.invalidateQueries({ queryKey: listQueryKey, exact: true })
    void queryClient.invalidateQueries({ queryKey: summaryQueryKey, exact: true })
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() })
  })

  const pages = data?.pages ?? []
  const captures = pages.flatMap((page) => page.captures)
  const firstPage = pages[0]
  const summary = summaryPage?.summary ?? {
    total: 0,
    text: 0,
    links: 0,
    images: 0,
  }
  const historyDays = summaryPage?.historyDays ?? firstPage?.historyDays ?? 3
  const status: "loading" | "error" | "ready" =
    !firstPage && isPending ? "loading" : !firstPage && isError ? "error" : "ready"
  const errorMessage =
    error instanceof Error ? error.message : "Clipboard history could not be loaded."

  useEffect(() => {
    const store = useClipboardBoardStore.getState()
    store.setVisibleCaptures(captures)

    if (captures.length === 0) {
      if (store.selectedCaptureId !== null) {
        store.setSelectedCaptureId(null)
      }
      return
    }

    if (!store.selectedCaptureId || !captures.some((capture) => capture.id === store.selectedCaptureId)) {
      store.setSelectedCaptureId(captures[0].id)
    }
  }, [captures])

  useEffect(
    () => () => {
      useClipboardBoardStore.getState().setVisibleCaptures([])
    },
    [],
  )

  return {
    captures,
    errorMessage,
    hasNextPage,
    historyDays,
    isFetchingNextPage,
    isRefreshingList: isFetching && !isFetchingNextPage,
    onLoadMore: () => void fetchNextPage({ cancelRefetch: false }),
    onRetry: status === "error" ? () => void refetch() : undefined,
    status,
    summary,
  }
}
