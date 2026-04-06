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
        "pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/12 px-1.5 py-0.5 text-amber-950 shadow-[0_14px_28px_-22px_rgba(217,119,6,0.46)]",
        "dark:text-amber-100",
        className,
      )}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-amber-500/18 text-amber-700 dark:text-amber-200">
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
