import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { SettingsHelpTooltip } from "@/features/settings/components/settings-help-tooltip";

export function SettingField({
  action,
  children,
  description,
  htmlFor,
  info,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  info?: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="w-[190px] max-w-full shrink-0 space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </Label>
          {info ? <SettingsHelpTooltip content={info} /> : null}
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {description ? (
          <p className="max-w-sm text-[13px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-[240px] flex-1">
        {children}
      </div>
    </div>
  );
}
