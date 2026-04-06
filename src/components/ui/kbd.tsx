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
            <span className="app-kbd-separator px-1.5 text-[12px] font-medium">
              +
            </span>
          ) : null}
          <kbd
            className="app-kbd inline-flex min-h-6 min-w-6 items-center justify-center rounded-[8px] px-2 font-medium text-[10px]"
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
