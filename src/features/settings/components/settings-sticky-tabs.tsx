import { forwardRef } from "react";

import {
  AnimatedTabs,
  type AnimatedTabItem,
} from "@/components/ui/animated-tabs";
import { resolveText, useI18nLanguage, useScopedT } from "@/i18n";
import type {
  SettingsSectionDefinition,
  SettingsSectionId,
} from "@/features/settings/settings-sections";

export const SettingsStickyTabs = forwardRef<
  HTMLDivElement,
  {
    activeSectionId: SettingsSectionId | null;
    onSelectSection: (sectionId: SettingsSectionId) => void;
    sections: readonly SettingsSectionDefinition[];
  }
>(function SettingsStickyTabs(
  {
    activeSectionId,
    onSelectSection,
    sections,
  },
  ref,
) {
  useI18nLanguage();
  const t = useScopedT("settings");
  const items: AnimatedTabItem<SettingsSectionId>[] = sections.map((section) => ({
    id: section.id,
    icon: section.icon,
    label: resolveText(section.label),
  }));

  return (
    <AnimatedTabs
      ref={ref}
      items={items}
      activeTabId={activeSectionId}
      onSelectTab={onSelectSection}
      navAriaLabel={t("navigation.sectionsAriaLabel")}
      activeAriaCurrent="location"
    />
  );
});
