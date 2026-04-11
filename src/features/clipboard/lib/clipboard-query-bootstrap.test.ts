import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/app/query-keys";
import { createClipboardBoardBootstrap, createClipboardCapture, createPinnedClipboardCapture } from "@/test/factories/clipboard";

const mockGetClipboardBoardBootstrap = vi.fn();

vi.mock("@/lib/tauri", () => ({
  getClipboardBoardBootstrap: () => mockGetClipboardBoardBootstrap(),
  isTauriRuntime: () => true,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("clipboard query bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetClipboardBoardBootstrap.mockReset();
  });

  it("dedupes concurrent bootstrap fetches and hydrates page, summary, and pinned caches", async () => {
    let resolveBootstrap: (value: ReturnType<typeof createClipboardBoardBootstrap>) => void;
    const bootstrap = createClipboardBoardBootstrap({
      page: {
        captures: [
          createClipboardCapture({
            id: "cap_bootstrap_page",
            preview: "Bootstrap page capture",
            rawText: "Bootstrap page capture",
          }),
        ],
        page: 0,
        pageSize: 40,
        total: 1,
        hasMore: false,
        historyDays: 7,
        summary: {
          total: 1,
          text: 1,
          links: 0,
          images: 0,
          videos: 0,
          files: 0,
        },
      },
      pinnedCaptures: [
        createPinnedClipboardCapture({
          capture: createClipboardCapture({
            id: "cap_bootstrap_pinned",
            preview: "Pinned bootstrap capture",
            rawText: "Pinned bootstrap capture",
          }),
        }),
      ],
    });

    mockGetClipboardBoardBootstrap.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBootstrap = resolve;
      }),
    );

    const {
      getClipboardBoardBootstrapSnapshot,
      primeClipboardBoardQueries,
    } = await import("@/features/clipboard/lib/clipboard-query-bootstrap");
    const queryClient = createQueryClient();

    const pendingPrimeA = primeClipboardBoardQueries(queryClient);
    const pendingPrimeB = primeClipboardBoardQueries(queryClient);

    expect(mockGetClipboardBoardBootstrap).toHaveBeenCalledTimes(1);

    resolveBootstrap!(bootstrap);
    await Promise.all([pendingPrimeA, pendingPrimeB]);

    expect(getClipboardBoardBootstrapSnapshot()).toEqual(bootstrap);
    expect(queryClient.getQueryData(queryKeys.clipboardPageSummary())).toEqual(bootstrap.page);
    expect(queryClient.getQueryData(queryKeys.clipboardPinnedCaptures())).toEqual(
      bootstrap.pinnedCaptures,
    );
    expect(queryClient.getQueryData(queryKeys.clipboardPage("all", ""))).toEqual({
      pages: [bootstrap.page],
      pageParams: [0],
    });
  });

  it("clears the in-flight bootstrap promise after a failure so the next prime can retry", async () => {
    const bootstrap = createClipboardBoardBootstrap({
      page: {
        captures: [
          createClipboardCapture({
            id: "cap_retry",
            preview: "Retry capture",
            rawText: "Retry capture",
          }),
        ],
        page: 0,
        pageSize: 40,
        total: 1,
        hasMore: false,
        historyDays: 7,
        summary: {
          total: 1,
          text: 1,
          links: 0,
          images: 0,
          videos: 0,
          files: 0,
        },
      },
    });

    mockGetClipboardBoardBootstrap
      .mockRejectedValueOnce(new Error("bootstrap failed"))
      .mockResolvedValueOnce(bootstrap);

    const { primeClipboardBoardQueries } = await import(
      "@/features/clipboard/lib/clipboard-query-bootstrap"
    );
    const queryClient = createQueryClient();

    await expect(primeClipboardBoardQueries(queryClient)).rejects.toThrow("bootstrap failed");
    await expect(primeClipboardBoardQueries(queryClient)).resolves.toBeUndefined();

    expect(mockGetClipboardBoardBootstrap).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(queryKeys.clipboardPageSummary())).toEqual(bootstrap.page);
  });

  it("notifies bootstrap subscribers after both success and failure attempts", async () => {
    const successListener = vi.fn();
    const failureListener = vi.fn();
    const bootstrap = createClipboardBoardBootstrap();

    mockGetClipboardBoardBootstrap
      .mockRejectedValueOnce(new Error("bootstrap failed"))
      .mockResolvedValueOnce(bootstrap);

    const {
      primeClipboardBoardQueries,
      subscribeClipboardBoardBootstrap,
    } = await import("@/features/clipboard/lib/clipboard-query-bootstrap");
    const queryClient = createQueryClient();

    const disposeFailure = subscribeClipboardBoardBootstrap(failureListener);
    await expect(primeClipboardBoardQueries(queryClient)).rejects.toThrow("bootstrap failed");
    expect(failureListener).toHaveBeenCalledTimes(1);
    disposeFailure();

    const disposeSuccess = subscribeClipboardBoardBootstrap(successListener);
    await expect(primeClipboardBoardQueries(queryClient)).resolves.toBeUndefined();
    expect(successListener).toHaveBeenCalledTimes(1);
    disposeSuccess();
  });
});
