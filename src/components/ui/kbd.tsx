import { cn } from "@/lib/utils";

const macosSymbolKeys = new Set(["⌃", "⌥", "⇧", "⌘", "↩", "⌫", "⌦", "⎋", "↑", "↓", "←", "→"]);

export type KbdSize = "md" | "lg";

const kbdSizeClasses: Record<
  KbdSize,
  {
    key: string;
    separator: string;
    symbolKey: string;
  }
> = {
  md: {
    key: "min-h-6 min-w-6 rounded-[8px] px-2 text-[11px]",
    separator: "px-1.5 text-[13px]",
    symbolKey: "text-[13px] leading-none",
  },
  lg: {
    key: "min-h-7 min-w-7 rounded-[10px] px-2.5 text-[12px]",
    separator: "px-1.5 text-[14px]",
    symbolKey: "text-[15px] leading-none",
  },
};

export function Kbd({
  className,
  keys,
  size = "md",
}: {
  className?: string;
  keys: string[];
  size?: KbdSize;
}) {
  if (keys.length === 0) {
    return null;
  }

  const showPlusSeparators = keys.some((key) => key.length > 1);
  const sizeClasses = kbdSizeClasses[size];

  return (
    <span className={cn("inline-flex items-center", className)}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center">
          {index > 0 && showPlusSeparators ? (
            <span className={cn("app-kbd-separator font-medium", sizeClasses.separator)}>
              +
            </span>
          ) : null}
          <kbd
            className={cn(
              "app-kbd inline-flex items-center justify-center font-medium",
              sizeClasses.key,
              macosSymbolKeys.has(key) && sizeClasses.symbolKey,
            )}
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
