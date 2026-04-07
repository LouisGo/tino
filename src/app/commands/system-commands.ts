import { defineCommand, type CommandDefinition } from "@/core/commands";
import { message } from "@tauri-apps/plugin-dialog";

import { resolveText, tx } from "@/i18n";
import { openExternalLink } from "@/lib/external-links";
import { createRendererLogger } from "@/lib/logger";
import {
  isTauriRuntime,
  openImageInPreview,
  openPathInDefaultApp,
  revealPath,
  toggleClipboardWindowVisibility,
  toggleMainWindowVisibility,
} from "@/lib/tauri";
import { useThemeStore } from "@/stores/theme-store";

type RevealPathPayload = {
  path: string;
};

type OpenExternalTargetPayload = {
  target: string;
};

type OpenImageInPreviewPayload = {
  path: string;
};

type OpenPathInDefaultAppPayload = {
  path: string;
};

const logger = createRendererLogger("system.commands");

function formatCommandError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return resolveText(
    tx("commands", "system.openPathInDefaultApp.errorReasonFallback"),
  );
}

async function showOpenPathFailureDialog(path: string, error: unknown) {
  const body = resolveText(
    tx("commands", "system.openPathInDefaultApp.errorBody", {
      values: {
        path,
        reason: formatCommandError(error),
      },
    }),
  );

  if (!isTauriRuntime()) {
    window.alert(body);
    return;
  }

  await message(body, {
    kind: "error",
    title: resolveText(
      tx("commands", "system.openPathInDefaultApp.errorTitle"),
    ),
  });
}

export const systemCommands = [
  defineCommand<void, boolean>({
    id: "system.toggleMainWindowVisibility",
    label: tx("commands", "system.toggleMainWindowVisibility.label"),
    run: async () => toggleMainWindowVisibility(),
  }),
  defineCommand<void, boolean>({
    id: "system.toggleClipboardWindowVisibility",
    label: tx("commands", "system.toggleClipboardWindowVisibility.label"),
    run: async () => toggleClipboardWindowVisibility(),
  }),
  defineCommand<void, void>({
    id: "system.toggleThemeMode",
    label: tx("commands", "system.toggleThemeMode.label"),
    run: () => {
      useThemeStore.getState().toggleDarkLight();
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateHome",
    label: tx("commands", "system.navigateHome.label"),
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/" });
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateAi",
    label: tx("commands", "system.navigateAi.label"),
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/ai" });
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateClipboard",
    label: tx("commands", "system.navigateClipboard.label"),
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/clipboard" });
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateSettings",
    label: tx("commands", "system.navigateSettings.label"),
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/settings" });
    },
  }),
  defineCommand<RevealPathPayload, void>({
    id: "system.revealPath",
    label: tx("commands", "system.revealPath.label"),
    isEnabled: ({ path }) => Boolean(path.trim()),
    run: async ({ path }: RevealPathPayload) => {
      await revealPath(path);
    },
  }),
  defineCommand<OpenExternalTargetPayload, void>({
    id: "system.openExternalTarget",
    label: tx("commands", "system.openExternalTarget.label"),
    isEnabled: ({ target }) => Boolean(target.trim()),
    run: async ({ target }: OpenExternalTargetPayload) => {
      await openExternalLink(target);
    },
  }),
  defineCommand<OpenImageInPreviewPayload, void>({
    id: "system.openImageInPreview",
    label: tx("commands", "system.openImageInPreview.label"),
    isEnabled: ({ path }) => Boolean(path.trim()),
    run: async ({ path }: OpenImageInPreviewPayload) => {
      await openImageInPreview(path);
    },
  }),
  defineCommand<OpenPathInDefaultAppPayload, void>({
    id: "system.openPathInDefaultApp",
    label: tx("commands", "system.openPathInDefaultApp.label"),
    isEnabled: ({ path }) => Boolean(path.trim()),
    run: async ({ path }: OpenPathInDefaultAppPayload) => {
      try {
        await openPathInDefaultApp(path);
      } catch (error) {
        logger.error("Failed to open path in default app", {
          error: formatCommandError(error),
          path,
        });
        await showOpenPathFailureDialog(path, error);
      }
    },
  }),
] satisfies CommandDefinition<unknown, unknown>[];
