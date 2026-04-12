import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import {
  buildClipboardCaptureGroups,
  captureListSummary,
  getDefaultVisibleClipboardSelection,
  matchesSearch,
} from "@/features/clipboard/lib/clipboard-board";
import { createClipboardCapture } from "@/test/factories/clipboard";

const t = (
  key: string,
  options?: {
    values?: Record<string, boolean | Date | null | number | string | undefined>;
  },
) => {
  switch (key) {
    case "groups.pinned":
      return "Pinned";
    case "groups.today":
      return "Today";
    case "groups.yesterday":
      return "Yesterday";
    case "capture.sourceUnknown":
      return "Unknown source";
    case "capture.detail.linesAndChars":
      return `${options?.values?.lines ?? 0} lines · ${options?.values?.chars ?? 0} chars`;
    default:
      return key;
  }
};

describe("clipboard board search and selection semantics", () => {
  it("matches quoted structured search across source, bundle, type, and date filters", () => {
    const capture = createClipboardCapture({
      id: "cap_image",
      sourceAppName: "Google Chrome",
      sourceAppBundleId: "com.google.Chrome",
      contentKind: "image",
      preview: "Quarterly roadmap",
      rawText: "Q2 launch checklist",
      ocrText: "Roadmap launch",
      capturedAt: dayjs().subtract(2, "day").toISOString(),
      linkUrl: "https://example.com/roadmap",
    });

    expect(
      matchesSearch(
        capture,
        'launch app:"Google Chrome" bundle:com.google type:image date:7d',
        t,
      ),
    ).toBe(true);
  });

  it("keeps pinned captures grouped ahead of day buckets", () => {
    const pinnedCapture = createClipboardCapture({
      id: "cap_pinned",
      preview: "Pinned note",
      rawText: "Pinned note",
    });
    const recentCapture = createClipboardCapture({
      id: "cap_recent",
      preview: "Recent note",
      rawText: "Recent note",
    });

    const groups = buildClipboardCaptureGroups({
      captures: [recentCapture],
      pinnedCaptures: [pinnedCapture],
      t,
    });

    expect(groups.map((group) => group.kind)).toEqual(["pinned", "day"]);
    expect(groups[0]?.captures.map((capture) => capture.id)).toEqual(["cap_pinned"]);
  });

  it("prefers a non-pinned visible capture as the default active selection", () => {
    const pinnedCapture = createClipboardCapture({ id: "cap_pinned" });
    const regularCapture = createClipboardCapture({ id: "cap_regular" });

    const selection = getDefaultVisibleClipboardSelection(
      [pinnedCapture, regularCapture],
      ["cap_pinned"],
    );

    expect(selection?.id).toBe("cap_regular");
  });

  it("matches the backend video alias semantics for Chinese search filters", () => {
    const capture = createClipboardCapture({
      id: "cap_video",
      contentKind: "video",
      preview: "Screen recording",
      rawText: "Weekly product demo",
    });

    expect(matchesSearch(capture, "type:影片", t)).toBe(true);
  });

  it("keeps link rows URL-first even when metadata title is available", () => {
    const capture = createClipboardCapture({
      id: "cap_link",
      contentKind: "link",
      preview: "DeepSeek",
      rawText: "https://chat.deepseek.com/sign_in",
      linkUrl: "https://chat.deepseek.com/sign_in",
    });

    expect(captureListSummary(capture, t)).toBe("https://chat.deepseek.com/sign_in");
  });
});
