import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export function SettingsIconButton({
  buttonProps,
  children,
  disabled,
  label,
  onClick,
  variant = "outline",
}: {
  buttonProps?: Omit<ComponentProps<"button">, "aria-label" | "children" | "disabled" | "onClick" | "type"> & Partial<Record<`data-${string}`, string>>;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  variant?: "ghost" | "outline" | "secondary";
}) {
  return (
    <Tooltip content={label} placement="bottom">
      <div className="shrink-0">
        <Button
          type="button"
          variant={variant}
          size="icon"
          className="size-8 rounded-[14px] border-border/70 bg-card/75 shadow-none [&_svg]:size-3.5"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          {...buttonProps}
        >
          {children}
        </Button>
      </div>
    </Tooltip>
  );
}
