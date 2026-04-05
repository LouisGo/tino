import { cn } from "@/lib/utils";

export function Kbd({
  className,
  keys,
}: {
  className?: string;
  keys: string[];
}) {
  if (keys.length === 0) {
    return null;
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-md border border-border/80 bg-card px-1.5 font-mono text-[11px] font-medium text-muted-foreground shadow-[0_1px_0_rgba(15,23,42,0.08)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
