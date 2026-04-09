import { cn } from "@/lib/utils";

export function experimentalBadgeClassName({ compact = false }: { compact?: boolean } = {}) {
  return cn(
    "border-2 border-dashed border-amber-500/55 bg-amber-50 text-amber-900 shadow-sm dark:border-amber-300/45 dark:bg-amber-500/12 dark:text-amber-100",
    compact
      ? "gap-1.5 px-1 py-0.5 text-sm font-semibold"
      : "gap-2 px-2 py-0.5 text-sm font-semibold",
  );
}
