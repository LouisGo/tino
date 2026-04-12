import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hideClipboardWindowForNextOpen,
} from "@/features/clipboard/lib/clipboard-window-session";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";

describe("clipboard window session lifecycle", () => {
  beforeEach(() => {
    useClipboardBoardStore.getState().resetState();
  });

  it("resets the clipboard window session after hiding a visible window", async () => {
    useClipboardBoardStore.setState({
      searchValue: "roadmap",
      filter: "image",
      selectedCaptureId: "cap_selected",
      followsDefaultSelection: false,
      preferredSelectedCaptureId: "cap_preferred",
      listScrollRequest: 4,
    });

    const windowHandle = {
      isVisible: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      hide: vi.fn().mockResolvedValue(undefined),
    };

    await hideClipboardWindowForNextOpen(windowHandle as never);

    const nextState = useClipboardBoardStore.getState();

    expect(windowHandle.hide).toHaveBeenCalledTimes(1);
    expect(nextState.searchValue).toBe("");
    expect(nextState.filter).toBe("all");
    expect(nextState.selectedCaptureId).toBeNull();
    expect(nextState.followsDefaultSelection).toBe(true);
    expect(nextState.preferredSelectedCaptureId).toBeNull();
    expect(nextState.listScrollRequest).toBe(5);
  });

  it("leaves the clipboard window session untouched when the window cannot be hidden", async () => {
    useClipboardBoardStore.setState({
      searchValue: "keep-me",
      filter: "file",
      selectedCaptureId: "cap_keep",
      followsDefaultSelection: false,
      listScrollRequest: 2,
    });

    const windowHandle = {
      isVisible: vi.fn().mockResolvedValue(true),
      hide: vi.fn().mockRejectedValue(new Error("hide failed")),
    };

    await hideClipboardWindowForNextOpen(windowHandle as never);

    const nextState = useClipboardBoardStore.getState();

    expect(nextState.searchValue).toBe("keep-me");
    expect(nextState.filter).toBe("file");
    expect(nextState.selectedCaptureId).toBe("cap_keep");
    expect(nextState.followsDefaultSelection).toBe(false);
    expect(nextState.listScrollRequest).toBe(2);
  });
});
