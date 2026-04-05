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

  const showPlusSeparators = keys.some((key) => key.length > 1);

  return (
    <span className={cn("inline-flex items-center", className)}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center">
          {index > 0 && showPlusSeparators ? (
            <span className="px-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              +
            </span>
          ) : null}
          <kbd
            className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-[8px] border border-zinc-950/10 bg-zinc-100 px-2 font-medium text-[10px] text-zinc-700 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(15,23,42,0.05)] dark:border-white/8 dark:bg-zinc-900 dark:text-zinc-200 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.14)]"
          >
            {key}
          </kbd>
          {index < keys.length - 1 && !showPlusSeparators ? (
            <span className="w-1" aria-hidden="true" />
          ) : null}
        </span>
      ))}
    </span>
  );
}
