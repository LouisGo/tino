import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events";
import {
  getDefaultClipboardSelection,
  matchesFilter,
  matchesSearch,
} from "@/features/clipboard/lib/clipboard-board";
import {
  getClipboardBoardBootstrapSnapshot,
  subscribeClipboardBoardBootstrap,
} from "@/features/clipboard/lib/clipboard-query-bootstrap";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { useScopedT } from "@/i18n";
import { DEFAULT_CLIPBOARD_HISTORY_DAYS } from "@/lib/app-defaults";
import { getClipboardPage, getPinnedClipboardCaptures } from "@/lib/tauri";
import type { ClipboardPageResult, PinnedClipboardCapture } from "@/types/shell";

const CLIPBOARD_PAGE_SIZE = 40;
const CLIPBOARD_QUERY_STALE_TIME = Number.POSITIVE_INFINITY;

export function useClipboardBoardView() {
  const t = useScopedT("clipboard");
  const searchValue = useClipboardBoardStore((state) => state.searchValue);
  const filter = useClipboardBoardStore((state) => state.filter);
  const requestListScrollToTop = useClipboardBoardStore((state) => state.requestListScrollToTop);
  const deferredSearch = useDeferredValue(searchValue);
  const searchInteractionHydratedRef = useRef(false);
  const queryClient = useQueryClient();
  const bootstrap = useSyncExternalStore(
    subscribeClipboardBoardBootstrap,
    getClipboardBoardBootstrapSnapshot,
    getClipboardBoardBootstrapSnapshot,
  );
  const listQueryKey = useMemo(
    () => queryKeys.clipboardPage(filter, deferredSearch),
    [filter, deferredSearch],
  );
  const summaryQueryKey = queryKeys.clipboardPageSummary();
  const pinnedQueryKey = queryKeys.clipboardPinnedCaptures();
  const cachedSummaryPage =
    queryClient.getQueryData<ClipboardPageResult>(summaryQueryKey)
    ?? bootstrap?.page;
  const cachedPinnedCaptures =
    queryClient.getQueryData<PinnedClipboardCapture[]>(pinnedQueryKey)
    ?? bootstrap?.pinnedCaptures;
  const canUseBootstrapList = filter === "all" && deferredSearch.trim().length === 0;
  const bootstrapListPage = canUseBootstrapList && bootstrap
    ? ({
        pages: [bootstrap.page],
        pageParams: [0],
      } satisfies InfiniteData<ClipboardPageResult, number>)
    : undefined;
  const cachedListPage = queryClient.getQueryData<InfiniteData<ClipboardPageResult, number>>(
    listQueryKey,
  ) ?? bootstrapListPage;

  const { data: summaryPage } = useQuery({
    queryKey: summaryQueryKey,
    queryFn: () =>
      getClipboardPage({
        page: 0,
        pageSize: 1,
        filter: "all",
      }),
    staleTime: CLIPBOARD_QUERY_STALE_TIME,
    placeholderData: (previousData) => previousData ?? cachedSummaryPage,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });

  const { data: pinnedCaptures = cachedPinnedCaptures ?? [] } = useQuery({
    queryKey: pinnedQueryKey,
    queryFn: getPinnedClipboardCaptures,
    staleTime: CLIPBOARD_QUERY_STALE_TIME,
    placeholderData: (previousData) => previousData ?? cachedPinnedCaptures,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
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
    staleTime: CLIPBOARD_QUERY_STALE_TIME,
    placeholderData: (previousData) => previousData ?? cachedListPage,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });

  useClipboardCaptureEvents(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.clipboardPageBase() });
    void queryClient.invalidateQueries({ queryKey: summaryQueryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: pinnedQueryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSnapshot() });
  });

  const pages = data?.pages ?? bootstrapListPage?.pages ?? [];
  const captures = pages.flatMap((page) => page.captures);
  const visiblePinnedCaptures = useMemo(
    () =>
      pinnedCaptures
        .filter(({ capture }) => matchesFilter(capture.contentKind, filter))
        .filter(({ capture }) => matchesSearch(capture, searchValue, t))
        .map(({ capture }) => capture),
    [filter, pinnedCaptures, searchValue, t],
  );
  const visibleCaptures = useMemo(
    () => [...visiblePinnedCaptures, ...captures],
    [captures, visiblePinnedCaptures],
  );
  const firstPage = pages[0];
  const summary = summaryPage?.summary ?? {
    total: 0,
    text: 0,
    links: 0,
    images: 0,
    videos: 0,
    files: 0,
  };
  const historyDays =
    summaryPage?.historyDays ?? firstPage?.historyDays ?? DEFAULT_CLIPBOARD_HISTORY_DAYS;
  const status: "loading" | "error" | "ready" =
    !firstPage && isPending ? "loading" : !firstPage && isError ? "error" : "ready";
  const errorMessage =
    error instanceof Error ? error.message : t("errors.historyLoadFailed");

  useLayoutEffect(() => {
    const store = useClipboardBoardStore.getState();
    store.setPinnedCaptures(pinnedCaptures);
    store.setVisibleCaptures(visibleCaptures);
    const preferredSelectedCaptureId = store.preferredSelectedCaptureId;
    const defaultCaptureId =
      getDefaultClipboardSelection(captures, visiblePinnedCaptures)?.id ?? null;

    if (visibleCaptures.length === 0) {
      if (
        store.selectedCaptureId !== null
        && preferredSelectedCaptureId === null
      ) {
        store.setSelectedCaptureId(null);
      }
      return;
    }

    if (preferredSelectedCaptureId) {
      const preferredCapture = visibleCaptures.find(
        (capture) => capture.id === preferredSelectedCaptureId,
      );

      if (preferredCapture) {
        if (store.selectedCaptureId !== preferredCapture.id) {
          store.setSelectedCaptureId(preferredCapture.id);
        }
        store.setPreferredSelectedCaptureId(null);
        return;
      }

      return;
    }

    if (
      !store.selectedCaptureId
      || !visibleCaptures.some((capture) => capture.id === store.selectedCaptureId)
    ) {
      store.setSelectedCaptureId(defaultCaptureId);
    }
  }, [captures, pinnedCaptures, visibleCaptures, visiblePinnedCaptures]);

  useEffect(
    () => () => {
      useClipboardBoardStore.getState().setPinnedCaptures([]);
      useClipboardBoardStore.getState().setVisibleCaptures([]);
    },
    [],
  );

  useEffect(() => {
    if (!searchInteractionHydratedRef.current) {
      searchInteractionHydratedRef.current = true;
      return;
    }

    requestListScrollToTop();
  }, [filter, requestListScrollToTop, searchValue]);

  return {
    captures,
    errorMessage,
    hasNextPage,
    historyDays,
    isFetchingNextPage,
    pinnedCaptures: visiblePinnedCaptures,
    isRefreshingList: isFetching && !isFetchingNextPage,
    onLoadMore: () => void fetchNextPage({ cancelRefetch: false }),
    onRetry: status === "error" ? () => void refetch() : undefined,
    status,
    summary,
  };
}
