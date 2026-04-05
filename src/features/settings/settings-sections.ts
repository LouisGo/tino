import type { LucideIcon } from "lucide-react";
import {
  FolderRoot,
  Keyboard,
  Palette,
  Rocket,
  Sparkles,
} from "lucide-react";

import { tx, type LocalizedText } from "@/i18n";

type SettingsSectionBase = {
  description: LocalizedText;
  eyebrow: LocalizedText;
  icon: LucideIcon;
  id: string;
  label: LocalizedText;
  title: LocalizedText;
};

export const settingsSections = [
  {
    id: "workspace",
    label: tx("settings", "sections.workspace.label"),
    title: tx("settings", "sections.workspace.title"),
    eyebrow: tx("settings", "sections.workspace.eyebrow"),
    description: tx("settings", "sections.workspace.description"),
    icon: FolderRoot,
  },
  {
    id: "ai",
    label: tx("settings", "sections.ai.label"),
    title: tx("settings", "sections.ai.title"),
    eyebrow: tx("settings", "sections.ai.eyebrow"),
    description: tx("settings", "sections.ai.description"),
    icon: Sparkles,
  },
  {
    id: "appearance",
    label: tx("settings", "sections.appearance.label"),
    title: tx("settings", "sections.appearance.title"),
    eyebrow: tx("settings", "sections.appearance.eyebrow"),
    description: tx("settings", "sections.appearance.description"),
    icon: Palette,
  },
  {
    id: "automation",
    label: tx("settings", "sections.automation.label"),
    title: tx("settings", "sections.automation.title"),
    eyebrow: tx("settings", "sections.automation.eyebrow"),
    description: tx("settings", "sections.automation.description"),
    icon: Rocket,
  },
  {
    id: "shortcuts",
    label: tx("settings", "sections.shortcuts.label"),
    title: tx("settings", "sections.shortcuts.title"),
    eyebrow: tx("settings", "sections.shortcuts.eyebrow"),
    description: tx("settings", "sections.shortcuts.description"),
    icon: Keyboard,
  },
] as const satisfies readonly SettingsSectionBase[];

export type SettingsSectionId = (typeof settingsSections)[number]["id"];
export type SettingsSectionDefinition = (typeof settingsSections)[number];

export const settingsSectionIds = settingsSections.map(
  ({ id }) => id,
) as SettingsSectionId[];
