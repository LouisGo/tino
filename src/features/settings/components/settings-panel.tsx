import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SettingsPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[24px] border border-border/70 bg-surface-panel/90 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsPanelBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border/70", className)}>
      {children}
    </div>
  );
}
