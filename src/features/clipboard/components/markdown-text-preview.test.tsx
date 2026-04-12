import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarkdownTextPreview } from "@/features/clipboard/components/markdown-text-preview";

describe("MarkdownTextPreview", () => {
  it("renders fenced code blocks with syntax highlighting and preserves search highlights", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(window.navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(
      <MarkdownTextPreview
        markdown={[
          "```ts",
          "const answer = 42;",
          "console.log(answer);",
          "```",
        ].join("\n")}
        highlightQuery="answer"
      />,
    );

    expect(screen.getByText("TypeScript")).toBeInTheDocument();

    const codeBlock = document.querySelector("code.hljs.language-ts");

    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.querySelector(".hljs-keyword")).not.toBeNull();
    expect(codeBlock?.querySelector(".hljs-number")).not.toBeNull();

    const searchHighlight = codeBlock?.querySelector('mark[data-preview-highlight="true"]');

    expect(searchHighlight).not.toBeNull();
    expect(searchHighlight).toHaveTextContent("answer");

    await user.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("const answer = 42;\nconsole.log(answer);\n");
    });
    expect(screen.getByRole("button", { name: "Copied to clipboard" })).toBeInTheDocument();
  });
});
