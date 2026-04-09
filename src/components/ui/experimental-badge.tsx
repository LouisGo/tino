import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { experimentalBadgeClassName } from "@/components/ui/experimental-badge-classes";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";

export function ExperimentalBadge({
  className,
  compact = false,
  ...props
}: ComponentProps<typeof Badge> & {
  compact?: boolean;
}) {
  const tSettings = useScopedT("settings");

  return (
    <Badge
      variant="outline"
      className={cn(experimentalBadgeClassName({ compact }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn("leading-none", compact ? "text-base" : "text-lg")}
      >
        🚧
      </span>
      <span>{tSettings("badges.experimental")}</span>
    </Badge>
  );
}
