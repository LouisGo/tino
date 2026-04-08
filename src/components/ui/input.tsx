import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (
    {
      autoCapitalize = "none",
      autoComplete = "off",
      autoCorrect = "off",
      autoSave = "off",
      className,
      spellCheck = false,
      type,
      ...props
    },
    ref,
  ) => {
    return (
      <input
        ref={ref}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        autoSave={autoSave}
        data-1p-ignore="true"
        data-lpignore="true"
        spellCheck={spellCheck}
        type={type}
        data-slot="input"
        className={cn(
          "border-input bg-background/80 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex h-11 w-full rounded-2xl border px-4 py-2 text-sm shadow-xs transition outline-none focus-visible:ring-[3px]",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
