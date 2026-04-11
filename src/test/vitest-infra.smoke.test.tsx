import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { describe, expect, it, vi } from "vitest";

import { appI18n } from "@/i18n";
import { isTauriRuntime } from "@/lib/tauri-core";
import { renderWithProviders, screen } from "@/test/utils";

describe("Vitest infrastructure", () => {
  it("boots the renderer test runtime with tauri event mocks", async () => {
    const handler = vi.fn();
    const unlisten = await listen("tino:test-event", handler);

    await emit("tino:test-event", { ok: true });

    expect(isTauriRuntime()).toBe(true);
    expect(getCurrentWindow().label).toBe("main");
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "tino:test-event",
        payload: { ok: true },
      }),
    );

    await unlisten();
  });

  it("renders components with react-query and i18n providers", () => {
    function Example() {
      return <p>{appI18n.t("settings:sections.app.label")}</p>;
    }

    renderWithProviders(<Example />);

    expect(screen.getByText("App")).toBeInTheDocument();
  });
});
