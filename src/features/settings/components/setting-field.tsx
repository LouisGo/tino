import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

export function SettingField({
  action,
  children,
  description,
  htmlFor,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 px-4 py-4">
      <div className="w-[220px] max-w-full shrink-0 space-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </Label>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {description ? (
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-[260px] flex-1">
        {children}
      </div>
    </div>
  );
}
