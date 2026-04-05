import type { LucideIcon } from "lucide-react";
import {
  FolderRoot,
  Keyboard,
  Palette,
  Rocket,
  Sparkles,
} from "lucide-react";

type SettingsSectionBase = {
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  id: string;
  label: string;
  title: string;
};

export const settingsSections = [
  {
    id: "workspace",
    label: "Workspace",
    title: "Workspace & storage",
    eyebrow: "Core Pathing",
    description:
      "Set the archive path and the clipboard history window.",
    icon: FolderRoot,
  },
  {
    id: "ai",
    label: "AI",
    title: "Provider & model",
    eyebrow: "Runtime Provider",
    description:
      "Keep endpoint, model, and key together.",
    icon: Sparkles,
  },
  {
    id: "appearance",
    label: "Appearance",
    title: "Theme & shell look",
    eyebrow: "Live Preview",
    description:
      "Choose the mode and palette for the shell.",
    icon: Palette,
  },
  {
    id: "automation",
    label: "Automation",
    title: "Automation & diagnostics",
    eyebrow: "Runtime Controls",
    description:
      "Control capture, launch behavior, and logs.",
    icon: Rocket,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    title: "Keyboard shortcuts",
    eyebrow: "Interaction Layer",
    description:
      "Edit global bindings and keep local shortcuts visible.",
    icon: Keyboard,
  },
] as const satisfies readonly SettingsSectionBase[];

export type SettingsSectionId = (typeof settingsSections)[number]["id"];
export type SettingsSectionDefinition = (typeof settingsSections)[number];

export const settingsSectionIds = settingsSections.map(
  ({ id }) => id,
) as SettingsSectionId[];
