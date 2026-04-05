import { defineCommand, type CommandDefinition } from "@/core/commands";
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
    label: "Toggle Main Window Visibility",
    run: async () => toggleMainWindowVisibility(),
  }),
  defineCommand<void, boolean>({
    id: "system.toggleClipboardWindowVisibility",
    label: "Toggle Clipboard Window Visibility",
    run: async () => toggleClipboardWindowVisibility(),
  }),
  defineCommand<void, void>({
    id: "system.toggleThemeMode",
    label: "Toggle Theme Mode",
    run: () => {
      useThemeStore.getState().toggleDarkLight();
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateHome",
    label: "Navigate Home",
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/" });
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateClipboard",
    label: "Navigate Clipboard",
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/clipboard" });
    },
  }),
  defineCommand<void, void>({
    id: "system.navigateSettings",
    label: "Navigate Settings",
    run: async (_payload, { router }) => {
      await router.navigate({ to: "/settings" });
    },
  }),
  defineCommand<RevealPathPayload, void>({
    id: "system.revealPath",
    label: "Reveal In File Manager",
    isEnabled: ({ path }) => Boolean(path.trim()),
    run: async ({ path }: RevealPathPayload) => {
      await revealPath(path);
    },
  }),
  defineCommand<OpenExternalTargetPayload, void>({
    id: "system.openExternalTarget",
    label: "Open Target",
    isEnabled: ({ target }) => Boolean(target.trim()),
    run: async ({ target }: OpenExternalTargetPayload) => {
      await openExternalLink(target);
    },
  }),
  defineCommand<OpenImageInPreviewPayload, void>({
    id: "system.openImageInPreview",
    label: "Open In Preview",
    isEnabled: ({ path }) => Boolean(path.trim()),
    run: async ({ path }: OpenImageInPreviewPayload) => {
      await openImageInPreview(path);
    },
  }),
] satisfies CommandDefinition<unknown, unknown>[];
