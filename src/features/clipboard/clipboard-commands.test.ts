import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import { clipboardCommands } from "@/features/clipboard/clipboard-commands";
import { useClipboardBoardStore } from "@/features/clipboard/stores/clipboard-board-store";
import { createClipboardCapture } from "@/test/factories/clipboard";

const services = {
  queryClient: new QueryClient(),
  router: {} as never,
};

function getCommand(id: string) {
  const command = clipboardCommands.find((entry) => entry.id === id);
  if (!command) {
    throw new Error(`Missing command "${id}"`);
  }

  return command;
}

describe("clipboard commands", () => {
  beforeEach(() => {
    useClipboardBoardStore.getState().resetState();
  });

  it("cycles the selected preview mode for the current capture", () => {
    const capture = createClipboardCapture({
      contentKind: "rich_text",
      rawText: "Launch notes",
      rawRich: "<p>Launch notes</p>",
      rawRichFormat: "html",
    });
    const command = getCommand("clipboard.cyclePreviewMode");

    useClipboardBoardStore.setState({
      selectedCaptureId: capture.id,
      visibleCaptures: [capture],
      previewModeCaptureId: capture.id,
      selectedPreviewMode: "preview",
    });

    expect(command.isEnabled?.({ direction: "next" }, services)).toBe(true);
    command.run({ direction: "next" }, services);

    expect(useClipboardBoardStore.getState()).toMatchObject({
      previewModeCaptureId: capture.id,
      selectedPreviewMode: "raw_text",
    });
  });

  it("focuses search and opens filter through commands", () => {
    const focusSearch = getCommand("clipboard.focusSearch");
    const openFilter = getCommand("clipboard.openFilter");

    focusSearch.run(undefined, services);
    openFilter.run(undefined, services);

    expect(useClipboardBoardStore.getState()).toMatchObject({
      isFilterSelectOpen: true,
      searchInputFocusRequest: 1,
    });
  });
});
