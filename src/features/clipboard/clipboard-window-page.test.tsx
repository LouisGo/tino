import type { ReactNode } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { ShortcutManagerContext } from "@/core/shortcuts/context";

const hideClipboardWindowForNextOpen = vi.fn();
const startDragging = vi.fn();
const activateScope = vi.fn(() => vi.fn());
const onFocusChanged = vi.fn();

let focusChangedHandler:
  | ((event: { payload: boolean }) => void)
  | null = null;
let latestClipboardBoardFeatureProps: Record<string, unknown> | null = null;

vi.mock("@/features/clipboard/components/clipboard-board-feature", () => ({
  ClipboardBoardFeature: (props: Record<string, unknown>) => {
    latestClipboardBoardFeatureProps = props;

    return (
      <div data-testid="clipboard-board-feature">
        <div data-window-drag-region="true">
          <div data-testid="drag-handle">drag-handle</div>
          <input aria-label="Search Input" />
          <button type="button">filter-button</button>
        </div>
        <div data-testid="content-region">content-region</div>
        <span data-testid="search-focus-request">
          {String(props.searchFocusRequest ?? 0)}
        </span>
      </div>
    );
  },
}));

vi.mock("@/features/clipboard/lib/clipboard-window-session", () => ({
  hideClipboardWindowForNextOpen,
}));

vi.mock("@/lib/tauri", () => ({
  isTauriRuntime: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: onFocusChanged.mockImplementation((handler) => {
      focusChangedHandler = handler;
      return Promise.resolve(vi.fn());
    }),
    startDragging,
  }),
}));

function renderWithShortcutManager(ui: ReactNode) {
  return render(
    <ShortcutManagerContext.Provider
      value={{
        activateScope,
      } as never}
    >
      {ui}
    </ShortcutManagerContext.Provider>,
  );
}

describe("clipboard window page", () => {
  beforeEach(() => {
    focusChangedHandler = null;
    latestClipboardBoardFeatureProps = null;
    hideClipboardWindowForNextOpen.mockReset();
    startDragging.mockReset();
    activateScope.mockClear();
    onFocusChanged.mockClear();
    useClipboardBoardStore.getState().resetState();
  });

  it("mounts the clipboard board in window mode and refreshes search focus on window focus", async () => {
    const { ClipboardWindowPage } = await import("@/features/clipboard/clipboard-window-page");

    renderWithShortcutManager(<ClipboardWindowPage />);

    await waitFor(() => {
      expect(onFocusChanged).toHaveBeenCalledTimes(1);
    });

    expect(latestClipboardBoardFeatureProps).toMatchObject({
      autoFocusSearch: true,
      fillHeight: true,
      showSummary: false,
      windowMode: true,
      searchFocusRequest: 0,
    });

    focusChangedHandler?.({ payload: true });

    await waitFor(() => {
      expect(screen.getByTestId("search-focus-request")).toHaveTextContent("1");
    });
  });

  it("hides the clipboard window on blur and only starts dragging from the header drag region", async () => {
    const { ClipboardWindowPage } = await import("@/features/clipboard/clipboard-window-page");

    renderWithShortcutManager(<ClipboardWindowPage />);

    await waitFor(() => {
      expect(onFocusChanged).toHaveBeenCalledTimes(1);
    });

    focusChangedHandler?.({ payload: false });

    await waitFor(() => {
      expect(hideClipboardWindowForNextOpen).toHaveBeenCalledTimes(1);
    });

    fireEvent.mouseDown(screen.getByTestId("content-region"), { button: 0 });
    fireEvent.mouseDown(screen.getByLabelText("Search Input"), { button: 0 });
    fireEvent.mouseDown(screen.getByRole("button", { name: "filter-button" }), { button: 0 });
    fireEvent.mouseDown(screen.getByTestId("drag-handle"), { button: 0 });

    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it("closes transient clipboard layers immediately on blur", async () => {
    const { ClipboardWindowPage } = await import("@/features/clipboard/clipboard-window-page");

    useClipboardBoardStore.setState({
      isFilterSelectOpen: true,
      isShortcutHelpOpen: true,
      previewingImageId: "cap_image",
    });

    renderWithShortcutManager(<ClipboardWindowPage />);

    await waitFor(() => {
      expect(onFocusChanged).toHaveBeenCalledTimes(1);
    });

    focusChangedHandler?.({ payload: false });

    await waitFor(() => {
      expect(useClipboardBoardStore.getState()).toMatchObject({
        isFilterSelectOpen: false,
        isShortcutHelpOpen: false,
        previewingImageId: null,
      });
    });
  });

  it("restores document layout styles when the clipboard window page unmounts", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    document.documentElement.style.overflow = "auto";
    document.body.style.backgroundColor = "rgb(1, 2, 3)";
    root.style.background = "pink";

    const { ClipboardWindowPage } = await import("@/features/clipboard/clipboard-window-page");
    const view = renderWithShortcutManager(<ClipboardWindowPage />);

    await waitFor(() => {
      expect(document.documentElement.style.overflow).toBe("hidden");
    });

    expect(document.body.style.backgroundColor).toBe("transparent");
    expect(root.style.background).toBe("transparent");

    view.unmount();

    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(root.style.background).toBe("pink");
  });
});
