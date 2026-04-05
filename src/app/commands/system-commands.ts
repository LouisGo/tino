import { defineCommand, type CommandDefinition } from "@/core/commands";
import { tx } from "@/i18n";
import { openExternalLink } from "@/lib/external-links";
import {
  openImageInPreview,
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
] satisfies CommandDefinition<unknown, unknown>[];
