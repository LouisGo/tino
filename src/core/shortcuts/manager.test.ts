import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { CommandExecutor, CommandRegistry, defineCommand } from "@/core/commands";
import { defineShortcut } from "@/core/shortcuts";
import { findLocalShortcutHandling } from "@/core/shortcuts/manager";
import { ShortcutRegistry } from "@/core/shortcuts/registry";

function createCommandExecutor(disabledCommandIds: string[] = []) {
  const registry = new CommandRegistry().registerMany([
    defineCommand<void, void>({
      id: "test.next",
      label: "Next",
      isEnabled: () => !disabledCommandIds.includes("test.next"),
      run: () => {},
    }),
    defineCommand<void, void>({
      id: "test.window",
      label: "Window",
      isEnabled: () => !disabledCommandIds.includes("test.window"),
      run: () => {},
    }),
  ]);

  return new CommandExecutor(registry, {
    queryClient: new QueryClient(),
    router: {} as never,
  });
}

function createShortcutRegistry() {
  return new ShortcutRegistry().registerMany([
    defineShortcut<void, void>({
      id: "test.preview.next",
      kind: "local",
      label: "Preview Next",
      description: "Cycle the preview mode forward.",
      defaults: "Tab",
      scopes: ["clipboard.previewModes"],
      allowInEditable: true,
      command: {
        id: "test.next",
      },
    }),
    defineShortcut<void, void>({
      id: "test.window.confirm",
      kind: "local",
      label: "Confirm Window",
      description: "Confirm the floating window selection.",
      defaults: "Enter",
      scopes: ["clipboard.window"],
      command: {
        id: "test.window",
      },
    }),
  ]);
}

describe("shortcut interaction policies", () => {
  it("blocks default Tab navigation when an owned accelerator has no enabled command", () => {
    const handling = findLocalShortcutHandling(
      createShortcutRegistry(),
      createCommandExecutor(["test.next"]),
      {},
      "browser",
      [
        {
          id: "clipboard.previewModes",
          reservedAccelerators: [],
        },
      ],
      [
        {
          id: "clipboard.surface",
          ownedScopes: ["clipboard.previewModes"],
          preventDefaultAccelerators: ["Tab"],
          reservedAccelerators: [],
        },
      ],
      new KeyboardEvent("keydown", { key: "Tab" }),
    );

    expect(handling).toEqual({
      preventDefault: true,
      scopeId: "clipboard.previewModes",
      type: "blocked",
    });
  });

  it("uses the topmost owned scope order when a policy-managed shortcut is executable", () => {
    const handling = findLocalShortcutHandling(
      createShortcutRegistry(),
      createCommandExecutor(),
      {},
      "browser",
      [
        {
          id: "clipboard.window",
          reservedAccelerators: [],
        },
        {
          id: "clipboard.previewModes",
          reservedAccelerators: [],
        },
      ],
      [
        {
          id: "clipboard.surface",
          ownedScopes: ["clipboard.window", "clipboard.previewModes"],
          preventDefaultAccelerators: ["Tab"],
          reservedAccelerators: [],
        },
      ],
      new KeyboardEvent("keydown", { key: "Tab" }),
    );

    expect(handling?.type).toBe("execution");
    if (handling?.type !== "execution") {
      return;
    }

    expect(handling.execution.shortcut.id).toBe("test.preview.next");
    expect(handling.execution.scopeId).toBe("clipboard.previewModes");
  });
});
