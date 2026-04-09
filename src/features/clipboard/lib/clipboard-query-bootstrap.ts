import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/app/query-keys";
import { getClipboardBoardBootstrap, isTauriRuntime } from "@/lib/tauri";
import type { ClipboardBoardBootstrap, ClipboardPageResult } from "@/types/shell";

type ClipboardBoardBootstrapListener = () => void;

let clipboardBoardBootstrapSnapshot: ClipboardBoardBootstrap | null = null;
let clipboardBoardBootstrapPromise: Promise<ClipboardBoardBootstrap> | null = null;
const clipboardBoardBootstrapListeners = new Set<ClipboardBoardBootstrapListener>();

export function hydrateClipboardBoardQueries(
  queryClient: QueryClient,
  bootstrap: ClipboardBoardBootstrap,
) {
  clipboardBoardBootstrapSnapshot = bootstrap;
  queryClient.setQueryData(queryKeys.clipboardPageSummary(), bootstrap.page);
  queryClient.setQueryData(
    queryKeys.clipboardPinnedCaptures(),
    bootstrap.pinnedCaptures,
  );
  queryClient.setQueryData<InfiniteData<ClipboardPageResult, number>>(
    queryKeys.clipboardPage("all", ""),
    {
      pages: [bootstrap.page],
      pageParams: [0],
    },
  );
}

export async function primeClipboardBoardQueries(queryClient: QueryClient) {
  if (!isTauriRuntime()) {
    return;
  }

  if (!clipboardBoardBootstrapPromise) {
    clipboardBoardBootstrapPromise = getClipboardBoardBootstrap()
      .then((bootstrap) => {
        clipboardBoardBootstrapSnapshot = bootstrap;
        return bootstrap;
      })
      .catch((error) => {
        clipboardBoardBootstrapPromise = null;
        throw error;
      })
      .finally(() => {
        for (const listener of clipboardBoardBootstrapListeners) {
          listener();
        }
      });
  }

  const bootstrap = await clipboardBoardBootstrapPromise;
  hydrateClipboardBoardQueries(queryClient, bootstrap);
}

export function getClipboardBoardBootstrapSnapshot() {
  return clipboardBoardBootstrapSnapshot;
}

export function subscribeClipboardBoardBootstrap(
  listener: ClipboardBoardBootstrapListener,
) {
  clipboardBoardBootstrapListeners.add(listener);
  return () => {
    clipboardBoardBootstrapListeners.delete(listener);
  };
}
