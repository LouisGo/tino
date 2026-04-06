import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  BadgeX,
  CheckCircle2,
  MessageSquareMore,
  Scale,
  Sparkles,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type FloatingFeedbackChoice = {
  value: string
  label: string
  description?: string
  sentiment?: "positive" | "neutral" | "negative"
}

export type FloatingFeedbackReason = {
  value: string
  label: string
}

export type FloatingFeedbackStatus = {
  tone: "default" | "success" | "error"
  title?: string
  message: string
  sentiment?: "positive" | "neutral" | "negative"
}

type FloatingFeedbackCardProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  collapsedLabel?: string
  eyebrow?: string
  title: string
  description?: string
  badges?: string[]
  detailMode?: "hidden" | "toggle" | "expanded"
  detailToggleLabel?: string
  options: readonly FloatingFeedbackChoice[]
  selectedValue: string | null
  onSelect: (value: string) => void
  onQuickSelect?: (value: string) => void
  reasonLabel?: string
  reasons?: readonly FloatingFeedbackReason[]
  selectedReasons?: readonly string[]
  onToggleReason?: (value: string) => void
  primaryActionLabel: string
  onPrimaryAction: () => void
  primaryPending?: boolean
  primaryDisabled?: boolean
  secondaryActionLabel?: string
  footerNote?: string
  status?: FloatingFeedbackStatus | null
}

export function FloatingFeedbackCard({
  open,
  onOpenChange,
  collapsedLabel,
  eyebrow = "Quick Feedback",
  title,
  description,
  badges = [],
  detailMode = "hidden",
  detailToggleLabel = "More feedback",
  options,
  selectedValue,
  onSelect,
  onQuickSelect,
  reasonLabel = "Why?",
  reasons = [],
  selectedReasons = [],
  onToggleReason,
  primaryActionLabel,
  onPrimaryAction,
  primaryPending = false,
  primaryDisabled = false,
  secondaryActionLabel = "Not now",
  footerNote,
  status,
}: FloatingFeedbackCardProps) {
  const [detailExpanded, setDetailExpanded] = useState(false)

  const detailOpen =
    detailMode === "expanded" || (detailMode === "toggle" && detailExpanded)
  const showCompactActions = Boolean(onQuickSelect) && !detailOpen
  const showCompactMode = showCompactActions && !status
  const statusTheme = useMemo(
    () => getFeedbackTheme(status?.sentiment ?? "positive"),
    [status?.sentiment],
  )
  const statusMeta = useMemo(
    () => getFeedbackMeta(status?.sentiment ?? "positive"),
    [status?.sentiment],
  )

  function closePanel() {
    setDetailExpanded(false)
    onOpenChange(false)
  }

  if (typeof document === "undefined") {
    return null
  }

  if (!open) {
    if (!collapsedLabel) {
      return null
    }

    return createPortal(
      <div className="pointer-events-none fixed right-4 bottom-4 z-[180]">
        <Button
          type="button"
          variant="outline"
          className="pointer-events-auto rounded-full border-border/80 bg-surface-panel/95 shadow-lg backdrop-blur"
          onClick={() => {
            setDetailExpanded(false)
            onOpenChange(true)
          }}
        >
          <MessageSquareMore className="size-4" />
          {collapsedLabel}
        </Button>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[180] w-[min(26rem,calc(100vw-1rem))] max-h-[calc(100vh-1rem)]">
      <div className="pointer-events-auto flex max-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-[28px] border border-border/80 bg-surface-panel/96 shadow-[var(--shadow-overlay-floating)] backdrop-blur-xl">
        <div
          className={cn(
            "h-1.5",
            status?.tone === "success"
              ? statusTheme.topBarClass
              : "app-tone-success app-tone-bar",
          )}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {status?.tone === "success" ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
              <div
                className={cn(
                  "relative overflow-hidden rounded-[24px] border px-5 py-6",
                  statusTheme.successPanelClass,
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute -top-8 left-2 size-28 rounded-full blur-3xl",
                    statusTheme.successOrbPrimaryClass,
                  )}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute right-0 bottom-0 size-32 rounded-full blur-3xl",
                    statusTheme.successOrbSecondaryClass,
                  )}
                />

                <div className="relative flex min-h-[260px] flex-col items-center justify-center gap-5 py-4 text-center">
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase",
                      statusTheme.successKickerClass,
                    )}
                  >
                    <statusMeta.icon className="size-3.5" />
                    {statusMeta.statusLabel}
                  </span>

                  <div className="relative flex size-22 items-center justify-center">
                    <span
                      className={cn(
                        "absolute inline-flex size-full rounded-full",
                        statusTheme.outerPulseClass,
                      )}
                    />
                    <span
                      className={cn(
                        "absolute inline-flex size-[78%] rounded-full",
                        statusTheme.innerPulseClass,
                      )}
                    />
                    <span
                      className={cn(
                        "relative inline-flex size-14 items-center justify-center rounded-full",
                        statusTheme.iconShellClass,
                        statusTheme.iconMotionClass,
                      )}
                    >
                      <statusMeta.icon className="size-7" />
                    </span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-2xl font-semibold tracking-tight">
                      {status.title ?? "Thanks for the feedback"}
                    </p>
                    <p
                      className={cn(
                        "mx-auto max-w-[18rem] text-sm leading-6",
                        statusTheme.messageClass,
                      )}
                    >
                      {status.message}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">
                        {eyebrow}
                      </p>
                      <div className="space-y-1">
                        <p className="text-lg font-semibold tracking-tight">{title}</p>
                        {description && !showCompactMode ? (
                          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label="Close feedback card"
                      onClick={closePanel}
                      className="rounded-full border border-border/70 bg-background/80 p-2 text-muted-foreground transition hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {badges.length > 0 && detailOpen ? (
                    <div className="flex flex-wrap gap-2">
                      {badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className={cn("grid gap-2", !detailOpen ? "grid-cols-3" : "")}>
                    {options.map((option) => {
                      const selected = selectedValue === option.value
                      const optionTheme = getFeedbackTheme(option.sentiment ?? "positive")
                      const optionMeta = getFeedbackMeta(option.sentiment ?? "positive")

                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          disabled={primaryPending}
                          onClick={() => {
                            onSelect(option.value)
                            if (!detailOpen) {
                              onQuickSelect?.(option.value)
                            }
                          }}
                          className={cn(
                            "rounded-[20px] border text-left transition",
                            showCompactMode
                              ? "min-h-[82px] px-3 py-3 text-center"
                              : "min-h-[108px] px-4 py-4",
                            primaryPending ? "cursor-wait opacity-70" : "",
                            selected
                              ? optionTheme.selectedOptionClass
                              : optionTheme.idleOptionClass,
                          )}
                        >
                          <div
                            className={cn(
                              showCompactMode
                                ? "flex h-full flex-col items-center justify-center gap-2"
                                : "grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4",
                            )}
                          >
                            {!showCompactMode ? (
                              <span
                                className={cn(
                                  "inline-flex size-11 shrink-0 items-center justify-center rounded-[16px] border",
                                  optionTheme.optionIconShellClass,
                                )}
                              >
                                <optionMeta.icon className="size-5" />
                              </span>
                            ) : null}

                            <div className={cn("space-y-1", !showCompactMode ? "min-w-0" : "")}>
                              <p className="text-sm font-semibold">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full transition",
                                    showCompactMode && selected
                                      ? optionTheme.selectedLabelClass
                                      : "",
                                  )}
                                >
                                  {option.label}
                                </span>
                              </p>
                              {detailOpen && option.description ? (
                                <p className="text-sm leading-6 text-muted-foreground">
                                  {option.description}
                                </p>
                              ) : null}
                            </div>

                            {!showCompactMode ? (
                              <span className="inline-flex size-5 shrink-0 items-center justify-center">
                                <CheckCircle2
                                  className={cn(
                                    "size-4 transition-opacity",
                                    optionTheme.checkClass,
                                    selected ? "opacity-100" : "opacity-0",
                                  )}
                                />
                              </span>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {detailOpen && reasons.length > 0 && onToggleReason ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                        {reasonLabel}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {reasons.map((reason) => {
                          const selected = selectedReasons.includes(reason.value)

                          return (
                            <button
                              key={reason.value}
                              type="button"
                              disabled={primaryPending}
                              className={cn(
                                "min-h-9 rounded-full border px-3.5 py-2 text-sm font-medium transition",
                                primaryPending ? "cursor-wait opacity-70" : "",
                                selected
                                  ? "border-primary/45 bg-primary/12 text-foreground shadow-sm"
                                  : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                              )}
                              onClick={() => onToggleReason(reason.value)}
                            >
                              {reason.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {status ? (
                    <div
                      className={cn(
                        "rounded-[18px] border px-4 py-3 text-sm",
                        status.tone === "error"
                          ? "app-tone-danger app-tone-inline-panel"
                          : "border-border/80 bg-background/80 text-foreground",
                      )}
                    >
                      {status.message}
                    </div>
                  ) : null}

                  {detailMode === "toggle" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
                        onClick={() => setDetailExpanded((current) => !current)}
                      >
                        {detailOpen ? "Simple mode" : detailToggleLabel}
                      </button>
                      {showCompactActions ? (
                        <p className="text-xs text-muted-foreground">Tap one option to send it.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {detailOpen || !onQuickSelect ? (
                <div className="shrink-0 border-t border-border/70 bg-surface-panel/98 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      {footerNote ? (
                        <p className="text-xs leading-5 text-muted-foreground">{footerNote}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={closePanel}
                      >
                        {secondaryActionLabel}
                      </Button>
                      <Button
                        type="button"
                        className="rounded-full"
                        onClick={onPrimaryAction}
                        disabled={primaryDisabled || primaryPending}
                      >
                        <MessageSquareMore className={primaryPending ? "animate-pulse" : ""} />
                        {primaryActionLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function getFeedbackTheme(sentiment: "positive" | "neutral" | "negative") {
  switch (sentiment) {
    case "positive":
      return {
        topBarClass: "app-tone-success app-tone-bar",
        outerPulseClass:
          "app-tone-success app-tone-orb-primary animate-[ping_1.15s_cubic-bezier(0,0,0.2,1)_3]",
        innerPulseClass: "app-tone-success app-tone-orb-secondary",
        iconShellClass:
          "app-tone-success app-tone-icon-shell",
        iconMotionClass: "animate-[bounce_0.9s_ease-in-out_2]",
        messageClass: "app-tone-success app-tone-message",
        optionIconShellClass:
          "app-tone-success app-tone-option-icon",
        selectedLabelClass:
          "app-tone-success app-tone-label px-2.5 py-1",
        idleOptionClass:
          "app-tone-success app-tone-option-idle",
        selectedOptionClass:
          "app-tone-success app-tone-option-selected",
        checkClass: "app-tone-success app-tone-check",
        successPanelClass:
          "app-tone-success app-tone-celebration",
        successOrbPrimaryClass: "app-tone-success app-tone-orb-primary",
        successOrbSecondaryClass: "app-tone-success app-tone-orb-secondary",
        successKickerClass:
          "app-tone-success app-tone-badge",
      }
    case "neutral":
      return {
        topBarClass: "app-tone-warning app-tone-bar",
        outerPulseClass:
          "app-tone-warning app-tone-orb-primary animate-[ping_1.45s_cubic-bezier(0,0,0.2,1)_2]",
        innerPulseClass: "app-tone-warning app-tone-orb-secondary",
        iconShellClass:
          "app-tone-warning app-tone-icon-shell",
        iconMotionClass: "animate-[pulse_1.1s_ease-in-out_2]",
        messageClass: "app-tone-warning app-tone-message",
        optionIconShellClass:
          "app-tone-warning app-tone-option-icon",
        selectedLabelClass:
          "app-tone-warning app-tone-label px-2.5 py-1",
        idleOptionClass:
          "app-tone-warning app-tone-option-idle",
        selectedOptionClass:
          "app-tone-warning app-tone-option-selected",
        checkClass: "app-tone-warning app-tone-check",
        successPanelClass:
          "app-tone-warning app-tone-celebration",
        successOrbPrimaryClass: "app-tone-warning app-tone-orb-primary",
        successOrbSecondaryClass: "app-tone-warning app-tone-orb-secondary",
        successKickerClass:
          "app-tone-warning app-tone-badge",
      }
    case "negative":
      return {
        topBarClass: "app-tone-danger app-tone-bar",
        outerPulseClass:
          "app-tone-danger app-tone-orb-primary animate-[ping_1.65s_cubic-bezier(0,0,0.2,1)_2]",
        innerPulseClass: "app-tone-danger app-tone-orb-secondary",
        iconShellClass:
          "app-tone-danger app-tone-icon-shell",
        iconMotionClass: "animate-[pulse_1.35s_ease-in-out_2]",
        messageClass: "app-tone-danger app-tone-message",
        optionIconShellClass:
          "app-tone-danger app-tone-option-icon",
        selectedLabelClass:
          "app-tone-danger app-tone-label px-2.5 py-1",
        idleOptionClass:
          "app-tone-danger app-tone-option-idle",
        selectedOptionClass:
          "app-tone-danger app-tone-option-selected",
        checkClass: "app-tone-danger app-tone-check",
        successPanelClass:
          "app-tone-danger app-tone-celebration",
        successOrbPrimaryClass: "app-tone-danger app-tone-orb-primary",
        successOrbSecondaryClass: "app-tone-danger app-tone-orb-secondary",
        successKickerClass:
          "app-tone-danger app-tone-badge",
      }
  }
}

function getFeedbackMeta(sentiment: "positive" | "neutral" | "negative") {
  switch (sentiment) {
    case "positive":
      return {
        icon: Sparkles,
        statusLabel: "Strong signal saved",
      }
    case "neutral":
      return {
        icon: Scale,
        statusLabel: "Nuance captured",
      }
    case "negative":
      return {
        icon: BadgeX,
        statusLabel: "Issue captured",
      }
  }
}
