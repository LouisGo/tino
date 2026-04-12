import { describe, expect, it } from "vitest";

import {
  MARKDOWN_SCROLL_SHELL_CLASS,
  MARKDOWN_TABLE_CLASS,
  MARKDOWN_TABLE_SCROLL_CLASS,
  normalizePreviewHtmlLayout,
} from "@/features/clipboard/lib/clipboard-preview-layout";

describe("normalizePreviewHtmlLayout", () => {
  it("wraps preview tables in the shared horizontal scroll shell", () => {
    const html = [
      "<p>Intro</p>",
      "<table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Value</td></tr></tbody></table>",
      "<p>Outro</p>",
    ].join("");

    const normalizedHtml = normalizePreviewHtmlLayout(html);
    const template = document.createElement("template");
    template.innerHTML = normalizedHtml;

    const wrapper = template.content.querySelector(`.${MARKDOWN_TABLE_SCROLL_CLASS}`);
    const table = wrapper?.querySelector("table");

    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains(MARKDOWN_SCROLL_SHELL_CLASS)).toBe(true);
    expect(table).not.toBeNull();
    expect(table?.classList.contains(MARKDOWN_TABLE_CLASS)).toBe(true);
  });
});
