import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoaderCircle, Search, ShieldAlert } from "lucide-react";

export type ClipboardEmptyStateTone = "default" | "loading" | "error";

export function ClipboardEmptyState({
  title,
  description,
  onRetry,
  tone = "default",
  className,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  tone?: ClipboardEmptyStateTone;
  className?: string;
}) {
  const Icon = tone === "loading" ? LoaderCircle : tone === "error" ? ShieldAlert : Search;

  return (
    <div
      className={cn(
        "relative flex min-h-44 flex-col items-center justify-center overflow-hidden rounded-[28px] border border-dashed border-border/75 bg-background/84 px-6 py-8 text-center shadow-sm backdrop-blur-[2px]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_color-mix(in_oklch,_var(--card)_72%,_transparent)_0,_transparent_58%),linear-gradient(180deg,_color-mix(in_oklch,_var(--card)_94%,_var(--background)_6%),_color-mix(in_oklch,_var(--card)_84%,_var(--background)_16%))]"
      />

      <div className="relative flex max-w-xl flex-col items-center">
        <div className="flex size-[68px] items-center justify-center rounded-[22px] border border-border/55 bg-card/88 text-muted-foreground/78 shadow-sm">
          <Icon className={cn("size-8", tone === "loading" && "animate-spin")} />
        </div>
        <p className="mt-5 text-base font-semibold text-foreground/92">{title}</p>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>

      {onRetry ? (
        <Button type="button" variant="outline" className="relative mt-5" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
