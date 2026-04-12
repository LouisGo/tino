import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events";
import { clipboardCapturesUpdatedEvent } from "@/lib/tauri";

describe("useClipboardCaptureEvents", () => {
  it("runs the update callback when the clipboard update event is emitted", async () => {
    const onUpdate = vi.fn();

    renderHook(() => useClipboardCaptureEvents(onUpdate));
    await clipboardCapturesUpdatedEvent.emit({
      reason: "pinsChanged",
      refreshHistory: true,
      refreshPinned: true,
      refreshDashboard: false,
    });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        reason: "pinsChanged",
        refreshHistory: true,
        refreshPinned: true,
        refreshDashboard: false,
      });
    });
  });

  it("stops handling clipboard update events after the hook unmounts", async () => {
    const onUpdate = vi.fn();

    const { unmount } = renderHook(() => useClipboardCaptureEvents(onUpdate));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(0);
    });

    unmount();
    await clipboardCapturesUpdatedEvent.emit({
      reason: "captureDeleted",
      refreshHistory: true,
      refreshPinned: true,
      refreshDashboard: true,
    });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(0);
    });
  });
});
