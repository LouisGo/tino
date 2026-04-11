import { emit } from "@tauri-apps/api/event";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useClipboardCaptureEvents } from "@/features/clipboard/hooks/use-clipboard-capture-events";
import { clipboardCapturesUpdatedEvent } from "@/lib/tauri";

describe("useClipboardCaptureEvents", () => {
  it("runs the update callback when the clipboard update event is emitted", async () => {
    const onUpdate = vi.fn();

    renderHook(() => useClipboardCaptureEvents(onUpdate));
    await emit(clipboardCapturesUpdatedEvent);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("stops handling clipboard update events after the hook unmounts", async () => {
    const onUpdate = vi.fn();

    const { unmount } = renderHook(() => useClipboardCaptureEvents(onUpdate));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(0);
    });

    unmount();
    await emit(clipboardCapturesUpdatedEvent);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(0);
    });
  });
});
