import { describe, expect, it } from "vitest";

import { applyTheme, resolveWindowSurfaceMode } from "@/lib/theme";

describe("theme window surface mode", () => {
  it("defaults to opaque windows", () => {
    expect(resolveWindowSurfaceMode()).toBe("opaque");

    applyTheme({
      mode: "dark",
      themeName: "tino",
    });

    expect(document.documentElement.dataset.windowSurface).toBe("opaque");
    expect(document.documentElement.style.backgroundColor).toBe("var(--background)");
    expect(document.body.style.backgroundColor).toBe("var(--background)");
    expect(document.body.style.backgroundImage).toBe("");
  });

  it("keeps transparent panel windows transparent", () => {
    window.__TINO_WINDOW_SURFACE__ = "transparent";

    expect(resolveWindowSurfaceMode()).toBe("transparent");

    applyTheme({
      mode: "dark",
      themeName: "tino",
    });

    expect(document.documentElement.dataset.windowSurface).toBe("transparent");
    expect(document.documentElement.style.backgroundColor).toBe("transparent");
    expect(document.body.style.backgroundColor).toBe("transparent");
    expect(document.body.style.backgroundImage).toBe("none");
  });
});
