import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { SettingsHelpTooltip } from "@/features/settings/components/settings-help-tooltip";
import type { SettingsSectionDefinition } from "@/features/settings/settings-sections";
import { useText, useTextNode, type LocalizableNode } from "@/i18n";
import { cn } from "@/lib/utils";

export function SettingsSection({
  action,
  badge,
  badgeClassName,
  badgeVariant = "secondary",
  children,
  className,
  section,
}: {
  action?: ReactNode;
  badge?: LocalizableNode;
  badgeClassName?: string;
  badgeVariant?: "default" | "outline" | "secondary" | "success" | "warning";
  children: ReactNode;
  className?: string;
  section: SettingsSectionDefinition;
}) {
  const Icon = section.icon;
  const badgeNode = useTextNode(badge);
  const description = useText(section.description);
  const title = useText(section.title);

  return (
    <section
      id={section.id}
      className={cn("scroll-mt-[var(--settings-nav-offset)] space-y-3", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[16px] border border-primary/15 bg-primary/10 text-primary shadow-sm">
            <Icon className="size-4" />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            {description ? <SettingsHelpTooltip content={description} /> : null}
          </div>
        </div>

        {action || badge ? (
          <div className="flex flex-wrap items-center gap-2">
            {badge ? (
              <Badge variant={badgeVariant} className={cn("w-fit", badgeClassName)}>
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
