import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { resolvePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

type TooltipPlacement = "bottom" | "right";

export function Tooltip({
  content,
  placement = "bottom",
  children,
  className,
  multiline = false,
}: {
  content: ReactNode;
  placement?: TooltipPlacement;
  children: ReactNode;
  className?: string;
  multiline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const portalContainer = resolvePortalContainer();

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tooltipRef.current) {
      return;
    }

    const offset = 8;
    const margin = 12;

    const updatePosition = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();
      const tooltipRect = tooltipRef.current?.getBoundingClientRect();

      if (!anchorRect || !tooltipRect) {
        return;
      }

      if (placement === "right") {
        const top = clamp(
          anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2,
          margin,
          window.innerHeight - tooltipRect.height - margin,
        );
        const left = clamp(
          anchorRect.right + offset,
          margin,
          window.innerWidth - tooltipRect.width - margin,
        );

        setPosition({ left, top });
        return;
      }

      const left = clamp(
        anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
        margin,
        window.innerWidth - tooltipRect.width - margin,
      );
      const top = clamp(
        anchorRect.bottom + offset,
        margin,
        window.innerHeight - tooltipRect.height - margin,
      );

      setPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, placement, content]);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && portalContainer
        ? createPortal(
            <span
              ref={tooltipRef}
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[200] border border-border/80 bg-surface-panel px-3 py-1.5 text-xs font-medium text-foreground shadow-sm",
                multiline
                  ? "rounded-2xl whitespace-normal"
                  : "rounded-full whitespace-nowrap",
                className,
              )}
              style={{
                left: position.left,
                top: position.top,
              }}
            >
              {content}
            </span>,
            portalContainer,
          )
        : null}
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
