import type { LucideIcon } from "lucide-react";
import {
  Clipboard,
  FolderRoot,
  Settings2,
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
    id: "clipboard",
    label: tx("settings", "sections.clipboard.label"),
    title: tx("settings", "sections.clipboard.title"),
    eyebrow: tx("settings", "sections.clipboard.eyebrow"),
    description: tx("settings", "sections.clipboard.description"),
    icon: Clipboard,
  },
  {
    id: "archive",
    label: tx("settings", "sections.archive.label"),
    title: tx("settings", "sections.archive.title"),
    eyebrow: tx("settings", "sections.archive.eyebrow"),
    description: tx("settings", "sections.archive.description"),
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
    id: "app",
    label: tx("settings", "sections.app.label"),
    title: tx("settings", "sections.app.title"),
    eyebrow: tx("settings", "sections.app.eyebrow"),
    description: tx("settings", "sections.app.description"),
    icon: Settings2,
  },
] as const satisfies readonly SettingsSectionBase[];

export type SettingsSectionId = (typeof settingsSections)[number]["id"];
export type SettingsSectionDefinition = (typeof settingsSections)[number];

export const settingsSectionIds = settingsSections.map(
  ({ id }) => id,
) as SettingsSectionId[];
