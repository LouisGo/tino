import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  AriaAttributes,
  ComponentType,
  ForwardedRef,
  ReactElement,
  ReactNode,
  RefAttributes,
} from "react";

import { cn } from "@/lib/utils";

export type AnimatedTabItem<T extends string = string> = {
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  id: T;
  label: ReactNode;
  title?: string;
};

export type AnimatedTabsProps<T extends string = string> = {
  activeAriaCurrent?: AriaAttributes["aria-current"];
  activeTabId: T | null;
  className?: string;
  indicatorClassName?: string;
  inactiveTabClassName?: string;
  items: readonly AnimatedTabItem<T>[];
  navAriaLabel: string;
  navClassName?: string;
  onSelectTab: (tabId: T) => void;
  railClassName?: string;
  tabClassName?: string;
  activeTabClassName?: string;
};

function AnimatedTabsInner<T extends string>(
  {
    activeAriaCurrent,
    activeTabClassName,
    activeTabId,
    className,
    indicatorClassName,
    inactiveTabClassName,
    items,
    navAriaLabel,
    navClassName,
    onSelectTab,
    railClassName,
    tabClassName,
  }: AnimatedTabsProps<T>,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const tabsRailRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef(new Map<T, HTMLButtonElement>());
  const [activeIndicator, setActiveIndicator] = useState<null | {
    width: number;
    x: number;
  }>(null);

  const updateActiveIndicator = useCallback(() => {
    const fallbackTabId = items[0]?.id ?? null;
    const resolvedTabId = activeTabId ?? fallbackTabId;

    if (!resolvedTabId || !tabsRailRef.current) {
      setActiveIndicator(null);
      return;
    }

    const activeButton = tabButtonRefs.current.get(resolvedTabId);
    if (!activeButton) {
      setActiveIndicator(null);
      return;
    }

    const nextIndicator = {
      width: activeButton.offsetWidth,
      x: activeButton.offsetLeft,
    };

    setActiveIndicator((current) => {
      if (
        current
        && current.width === nextIndicator.width
        && current.x === nextIndicator.x
      ) {
        return current;
      }

      return nextIndicator;
    });
  }, [activeTabId, items]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      updateActiveIndicator();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [updateActiveIndicator]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tabsRail = tabsRailRef.current;
    if (!tabsRail) {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateActiveIndicator();
    });

    observer.observe(tabsRail);
    for (const button of tabButtonRefs.current.values()) {
      observer.observe(button);
    }

    window.addEventListener("resize", updateActiveIndicator);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateActiveIndicator);
    };
  }, [items, updateActiveIndicator]);

  return (
    <div
      ref={ref}
      className={cn("app-animated-tabs-surface rounded-[24px] px-2.5 py-2.5", className)}
    >
      <nav
        className={cn("-mx-1 overflow-x-auto px-1", navClassName)}
        aria-label={navAriaLabel}
      >
        <div
          ref={tabsRailRef}
          className={cn("relative flex w-max items-center gap-1", railClassName)}
        >
          {activeIndicator ? (
            <div
              className={cn(
                "app-animated-tabs-indicator pointer-events-none absolute inset-y-0 left-0 rounded-full border transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                indicatorClassName,
              )}
              style={{
                transform: `translateX(${activeIndicator.x}px)`,
                width: `${activeIndicator.width}px`,
              }}
              aria-hidden="true"
            />
          ) : null}

          {items.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeTabId;

            return (
              <button
                key={item.id}
                ref={(node) => {
                  if (node) {
                    tabButtonRefs.current.set(item.id, node);
                    return;
                  }

                  tabButtonRefs.current.delete(item.id);
                }}
                type="button"
                title={item.title}
                disabled={item.disabled}
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  "relative z-10 flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-[color,opacity] duration-300 disabled:pointer-events-none disabled:opacity-50",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                  tabClassName,
                  active ? activeTabClassName : inactiveTabClassName,
                )}
                aria-current={active ? activeAriaCurrent : undefined}
              >
                {Icon ? <Icon className="size-4" /> : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export const AnimatedTabs = forwardRef(AnimatedTabsInner) as <
  T extends string = string,
>(
  props: AnimatedTabsProps<T> & RefAttributes<HTMLDivElement>,
) => ReactElement | null;
