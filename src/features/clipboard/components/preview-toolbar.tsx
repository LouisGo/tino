import type { ReactNode } from "react";

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
