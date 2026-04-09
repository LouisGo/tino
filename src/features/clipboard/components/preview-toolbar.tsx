import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Tooltip } from "@/components/ui/tooltip";
import { ShortcutKbd } from "@/core/shortcuts";
import { cn } from "@/lib/utils";

export function PreviewToolbar({
  meta,
  controls,
  actions,
}: {
  meta?: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="app-preview-toolbar sticky top-0 z-10 shrink-0">
      <div className="flex min-h-[42px] min-w-0 items-center justify-between gap-2.5 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
          {meta}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          {controls ? <div className="shrink-0">{controls}</div> : null}
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function PreviewToolbarPillButton({
  className,
  shortcutId,
  tooltipLabel,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  shortcutId?: string;
  tooltipLabel?: ReactNode;
}) {
  const button = (
    <button
      type={type}
      className={cn(
        "app-preview-inline-action inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
        className,
      )}
      {...props}
    />
  );

  if (!tooltipLabel) {
    return button;
  }

  return (
    <Tooltip
      content={<PreviewToolbarShortcutTooltipContent label={tooltipLabel} shortcutId={shortcutId} />}
      placement="bottom"
      multiline
      className="px-3 py-2 text-center text-[11px] font-medium leading-4"
    >
      {button}
    </Tooltip>
  );
}

function PreviewToolbarShortcutTooltipContent({
  label,
  shortcutId,
}: {
  label: ReactNode;
  shortcutId?: string;
}) {
  return (
    <span className="flex min-w-[8rem] flex-col items-center gap-1.5">
      <span>{label}</span>
      {shortcutId ? <ShortcutKbd shortcutId={shortcutId} /> : null}
    </span>
  );
}
