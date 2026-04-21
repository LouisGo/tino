import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAiSystemEvents } from "@/features/ai/hooks/use-ai-system-events";
import { aiSystemUpdatedEvent } from "@/lib/tauri";

describe("useAiSystemEvents", () => {
  it("runs the update callback when the AI system event is emitted", async () => {
    const onUpdate = vi.fn();

    renderHook(() => useAiSystemEvents(onUpdate));
    await aiSystemUpdatedEvent.emit({
      reason: "feedbackRecorded",
      refreshSnapshot: true,
    });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith({
        reason: "feedbackRecorded",
        refreshSnapshot: true,
      });
    });
  });

  it("stops handling AI system events after the hook unmounts", async () => {
    const onUpdate = vi.fn();

    const { unmount } = renderHook(() => useAiSystemEvents(onUpdate));
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(0);
    });

    unmount();
    await aiSystemUpdatedEvent.emit({
      reason: "backgroundCompileRan",
      refreshSnapshot: true,
    });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(0);
    });
  });
});
