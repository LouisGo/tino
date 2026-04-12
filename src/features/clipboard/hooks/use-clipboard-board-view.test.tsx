import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/app/query-keys";
import { useClipboardBoardView } from "@/features/clipboard/hooks/use-clipboard-board-view";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import {
  createClipboardCapture,
  createClipboardPageResult,
} from "@/test/factories/clipboard";

const mockGetClipboardPage = vi.fn();
const mockGetPinnedClipboardCaptures = vi.fn();

vi.mock("@/features/clipboard/hooks/use-clipboard-capture-events", () => ({
  useClipboardCaptureEvents: () => {},
}));

vi.mock("@/features/clipboard/lib/clipboard-query-bootstrap", () => ({
  getClipboardBoardBootstrapSnapshot: () => null,
  subscribeClipboardBoardBootstrap: () => () => {},
}));

vi.mock("@/i18n", () => ({
  useScopedT: () => (key: string, options?: { defaultValue?: string }) =>
    options?.defaultValue ?? key,
}));

vi.mock("@/lib/tauri", () => ({
  getClipboardPage: (request: unknown) => mockGetClipboardPage(request),
  getPinnedClipboardCaptures: () => mockGetPinnedClipboardCaptures(),
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

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("useClipboardBoardView selection sync", () => {
  beforeEach(() => {
    useClipboardBoardStore.getState().resetState();
    mockGetClipboardPage.mockReset();
    mockGetPinnedClipboardCaptures.mockReset();
    mockGetPinnedClipboardCaptures.mockResolvedValue([]);
  });

  it("keeps reset window selection following the latest default non-pinned capture", async () => {
    const olderCapture = createClipboardCapture({
      id: "cap_older",
      preview: "Older capture",
      rawText: "Older capture",
      capturedAt: "2026-04-12T09:00:00.000Z",
    });
    const newerCapture = createClipboardCapture({
      id: "cap_newer",
      preview: "Newer capture",
      rawText: "Newer capture",
      capturedAt: "2026-04-12T09:01:00.000Z",
    });
    const olderPage = createClipboardPageResult({
      captures: [olderCapture],
      total: 1,
      summary: {
        total: 1,
        text: 1,
        links: 0,
        images: 0,
        videos: 0,
        files: 0,
      },
    });
    const newerPage = createClipboardPageResult({
      captures: [newerCapture, olderCapture],
      total: 2,
      summary: {
        total: 2,
        text: 2,
        links: 0,
        images: 0,
        videos: 0,
        files: 0,
      },
    });
    const queryClient = createQueryClient();

    mockGetClipboardPage.mockResolvedValue(olderPage);
    queryClient.setQueryData(queryKeys.clipboardPage("all", ""), {
      pages: [olderPage],
      pageParams: [0],
    });
    queryClient.setQueryData(queryKeys.clipboardPageSummary(), olderPage);
    queryClient.setQueryData(queryKeys.clipboardPinnedCaptures(), []);

    renderHook(() => useClipboardBoardView(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(useClipboardBoardStore.getState()).toMatchObject({
        selectedCaptureId: olderCapture.id,
        followsDefaultSelection: true,
      });
    });

    act(() => {
      useClipboardBoardStore.getState().resetWindowSession();
    });

    await waitFor(() => {
      expect(useClipboardBoardStore.getState()).toMatchObject({
        selectedCaptureId: olderCapture.id,
        followsDefaultSelection: true,
      });
    });

    act(() => {
      queryClient.setQueryData(queryKeys.clipboardPage("all", ""), {
        pages: [newerPage],
        pageParams: [0],
      });
      queryClient.setQueryData(queryKeys.clipboardPageSummary(), newerPage);
    });

    await waitFor(() => {
      expect(useClipboardBoardStore.getState()).toMatchObject({
        selectedCaptureId: newerCapture.id,
        followsDefaultSelection: true,
      });
    });
  });

  it("preserves a manual selection when newer captures arrive", async () => {
    const firstCapture = createClipboardCapture({
      id: "cap_first",
      preview: "First capture",
      rawText: "First capture",
      capturedAt: "2026-04-12T09:00:00.000Z",
    });
    const secondCapture = createClipboardCapture({
      id: "cap_second",
      preview: "Second capture",
      rawText: "Second capture",
      capturedAt: "2026-04-12T09:01:00.000Z",
    });
    const thirdCapture = createClipboardCapture({
      id: "cap_third",
      preview: "Third capture",
      rawText: "Third capture",
      capturedAt: "2026-04-12T09:02:00.000Z",
    });
    const initialPage = createClipboardPageResult({
      captures: [secondCapture, firstCapture],
      total: 2,
      summary: {
        total: 2,
        text: 2,
        links: 0,
        images: 0,
        videos: 0,
        files: 0,
      },
    });
    const updatedPage = createClipboardPageResult({
      captures: [thirdCapture, secondCapture, firstCapture],
      total: 3,
      summary: {
        total: 3,
        text: 3,
        links: 0,
        images: 0,
        videos: 0,
        files: 0,
      },
    });
    const queryClient = createQueryClient();

    mockGetClipboardPage.mockResolvedValue(initialPage);
    queryClient.setQueryData(queryKeys.clipboardPage("all", ""), {
      pages: [initialPage],
      pageParams: [0],
    });
    queryClient.setQueryData(queryKeys.clipboardPageSummary(), initialPage);
    queryClient.setQueryData(queryKeys.clipboardPinnedCaptures(), []);

    renderHook(() => useClipboardBoardView(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(useClipboardBoardStore.getState().selectedCaptureId).toBe(secondCapture.id);
    });

    act(() => {
      useClipboardBoardStore.getState().setSelectedCaptureId(firstCapture.id);
    });

    act(() => {
      queryClient.setQueryData(queryKeys.clipboardPage("all", ""), {
        pages: [updatedPage],
        pageParams: [0],
      });
      queryClient.setQueryData(queryKeys.clipboardPageSummary(), updatedPage);
    });

    await waitFor(() => {
      expect(useClipboardBoardStore.getState()).toMatchObject({
        selectedCaptureId: firstCapture.id,
        followsDefaultSelection: false,
      });
    });
  });
});
