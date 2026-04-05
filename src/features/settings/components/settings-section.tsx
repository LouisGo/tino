import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { useText, useTextNode, type LocalizableNode } from "@/i18n";
import { cn } from "@/lib/utils";
import type { SettingsSectionDefinition } from "@/features/settings/settings-sections";

export function SettingsSection({
  action,
  badge,
  children,
  className,
  section,
}: {
  action?: ReactNode;
  badge?: LocalizableNode;
  children: ReactNode;
  className?: string;
  section: SettingsSectionDefinition;
}) {
  const Icon = section.icon;
  const badgeNode = useTextNode(badge);
  const description = useText(section.description);
  const eyebrow = useText(section.eyebrow);
  const title = useText(section.title);

  return (
    <section
      id={section.id}
      className={cn("scroll-mt-[var(--settings-nav-offset)] space-y-4", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[18px] border border-primary/15 bg-primary/10 text-primary shadow-sm">
              <Icon className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            </div>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        {action || badge ? (
          <div className="flex flex-wrap items-center gap-2">
            {badge ? (
              <Badge variant="secondary" className="w-fit">
                {badgeNode}
              </Badge>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>

      {children}
    </section>
  );
}
