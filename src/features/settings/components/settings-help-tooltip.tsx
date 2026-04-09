import type { ReactNode } from "react";

import { CircleHelp } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import { useScopedT } from "@/i18n";
import { cn } from "@/lib/utils";

export function SettingsHelpTooltip({
  content,
}: {
  content: ReactNode;
}) {
  const t = useScopedT("common");

  return (
    <Tooltip
      content={content}
      placement="bottom"
      multiline
      className={cn("max-w-[20rem] text-[11px] font-normal leading-5")}
    >
      <button
        type="button"
        aria-label={t("actions.moreInfo")}
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition",
          "hover:border-border hover:text-foreground",
        )}
      >
        <CircleHelp className="size-3.5" />
      </button>
    </Tooltip>
  );
}
