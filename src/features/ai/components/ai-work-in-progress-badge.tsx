import { ExperimentalBadge } from "@/components/ui/experimental-badge"
import { cn } from "@/lib/utils"

export function AiWorkInProgressBadge({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <ExperimentalBadge
      role="note"
      aria-label="Experimental"
      className={cn(
        "pointer-events-none",
        className,
      )}
      compact={compact}
    />
  )
}
