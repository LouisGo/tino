import { forwardRef } from "react";

import { cn } from "@/lib/utils";
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
  return (
    <div ref={ref} className="rounded-[24px] border border-border/70 bg-card/88 px-2.5 py-2.5 shadow-[0_20px_56px_color-mix(in_oklch,var(--foreground)_8%,transparent)] backdrop-blur-xl">
      <nav
        className="-mx-1 flex items-center gap-1 overflow-x-auto px-1"
        aria-label="Settings sections"
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const active = section.id === activeSectionId;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelectSection(section.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/90 hover:text-foreground",
              )}
              aria-current={active ? "location" : undefined}
            >
              <Icon className="size-4" />
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
});
