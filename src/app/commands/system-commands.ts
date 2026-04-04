import { defineCommand, type CommandDefinition } from "@/core/commands";
import { openExternalLink } from "@/lib/external-links";
import {
  openImageInPreview,
  revealPath,
} from "@/lib/tauri";

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
