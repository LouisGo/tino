import { Construction } from "lucide-react"

import { cn } from "@/lib/utils"

export function AiWorkInProgressBadge({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  void compact

  return (
    <div
      role="note"
      aria-label="Work in Progress"
      className={cn(
        "app-tone-warning app-tone-pill pointer-events-none inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5",
        className,
      )}
    >
      <span className="app-tone-icon-shell inline-flex size-8 items-center justify-center rounded-full">
        <Construction className="size-4" />
      </span>

      <span className="flex min-w-0 flex-col leading-none">
        <span className="text-[10px] font-semibold tracking-[0.22em] uppercase">
          还没做完
        </span>
      </span>
    </div>
  )
}
