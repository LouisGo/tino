import { describe, expect, it } from "vitest";

import {
  buildClipboardTextPreviewTabs,
  cycleClipboardTextPreviewMode,
  getClipboardTextPreviewModes,
  preferredClipboardTextPreviewMode,
  resolveClipboardTextPreviewMode,
} from "@/features/clipboard/lib/clipboard-preview-modes";
import { createClipboardCapture } from "@/test/factories/clipboard";

const t = (key: string) => key;

describe("clipboard preview modes", () => {
  it("prefers preview mode for markdown-like captures", () => {
    const capture = createClipboardCapture({
      rawText: "# Weekly review",
    });

    expect(preferredClipboardTextPreviewMode(capture)).toBe("preview");
    expect(getClipboardTextPreviewModes(capture)).toEqual(["preview", "raw_text"]);
  });

  it("adds preview, raw text, and html tabs for rich text captures", () => {
    const capture = createClipboardCapture({
      contentKind: "rich_text",
      rawText: "Launch notes",
      rawRich: "<p><strong>Launch</strong> notes</p>",
      rawRichFormat: "html",
    });

    expect(buildClipboardTextPreviewTabs(capture, t)).toEqual([
      { label: "preview.tabs.richText", mode: "preview" },
      { label: "preview.tabs.text", mode: "raw_text" },
      { label: "preview.tabs.html", mode: "raw_rich" },
    ]);
  });

  it("cycles preview modes in both directions with wraparound", () => {
    const capture = createClipboardCapture({
      contentKind: "rich_text",
      rawText: "Launch notes",
      rawRich: "<p><strong>Launch</strong> notes</p>",
      rawRichFormat: "html",
    });

    expect(cycleClipboardTextPreviewMode(capture, "preview", "next")).toBe("raw_text");
    expect(cycleClipboardTextPreviewMode(capture, "preview", "previous")).toBe("raw_rich");
  });

  it("falls back to the preferred mode when the stored mode is no longer valid", () => {
    const capture = createClipboardCapture({
      rawText: "Plain text only",
      rawRich: null,
      rawRichFormat: null,
    });

    expect(resolveClipboardTextPreviewMode(capture, "raw_rich")).toBe("raw_text");
  });
});
