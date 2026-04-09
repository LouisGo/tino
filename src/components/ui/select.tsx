import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { useShortcutScope } from "@/core/shortcuts";
import { resolvePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

const SELECT_SHORTCUT_SCOPE = "ui.select";
const SELECT_RESERVED_ACCELERATORS = [
  "ArrowDown",
  "ArrowUp",
  "Command+K",
  "Control+K",
  "End",
  "Enter",
  "Escape",
  "Home",
  "PageDown",
  "PageUp",
  "Space",
];

function shouldStopReservedSelectShortcutPropagation(
  event: Pick<React.KeyboardEvent, "ctrlKey" | "key" | "metaKey">,
) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    return true;
  }

  return (
    event.key === "ArrowDown"
    || event.key === "ArrowUp"
    || event.key === "End"
    || event.key === "Enter"
    || event.key === "Escape"
    || event.key === "Home"
    || event.key === "PageDown"
    || event.key === "PageUp"
    || event.key === " "
    || event.key === "Spacebar"
  );
}

function focusWrappedSelectOption(
  enabledOptions: HTMLElement[],
  targetOption: HTMLElement,
  viewport: HTMLElement | null,
) {
  window.setTimeout(() => {
    if (targetOption === document.activeElement) {
      return;
    }

    targetOption.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });

    if (viewport) {
      if (targetOption === enabledOptions[0]) {
        viewport.scrollTop = 0;
      } else if (targetOption === enabledOptions[enabledOptions.length - 1]) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }

    targetOption.focus({ preventScroll: true });
  }, 0);
}

function maybeWrapSelectNavigation(event: React.KeyboardEvent<HTMLElement>) {
  if (event.ctrlKey || event.metaKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) {
    return false;
  }

  const contentElement = event.currentTarget;
  const viewport = contentElement.querySelector<HTMLElement>("[data-radix-select-viewport]");
  const enabledOptions = Array.from(
    contentElement.querySelectorAll<HTMLElement>('[role="option"]:not([data-disabled])'),
  );

  if (enabledOptions.length < 2) {
    return false;
  }

  const highlightedOption =
    enabledOptions.find((option) => option.hasAttribute("data-highlighted"))
    ?? (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[role="option"]') : null)
    ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>('[role="option"]')
      : null);

  if (!highlightedOption) {
    return false;
  }

  const highlightedIndex = enabledOptions.indexOf(highlightedOption);
  if (highlightedIndex === -1) {
    return false;
  }

  const targetOption =
    event.key === "ArrowDown"
      ? highlightedIndex === enabledOptions.length - 1
        ? enabledOptions[0]
        : null
      : highlightedIndex === 0
        ? enabledOptions[enabledOptions.length - 1]
        : null;

  if (!targetOption) {
    return false;
  }

  event.preventDefault();
  focusWrappedSelectOption(enabledOptions, targetOption, viewport);
  return true;
}

type SelectInteractionContextValue = {
  open: boolean;
  setOpen: (value: boolean) => void;
  setTriggerFocused: (value: boolean) => void;
};

const SelectInteractionContext = React.createContext<SelectInteractionContextValue | null>(null);

function Select({
  defaultOpen,
  onOpenChange,
  open: openProp,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>) {
  const [open, setOpen] = React.useState(Boolean(openProp ?? defaultOpen));
  const [triggerFocused, setTriggerFocused] = React.useState(false);

  React.useEffect(() => {
    if (openProp === undefined) {
      return;
    }

    setOpen(openProp);
  }, [openProp]);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  useShortcutScope(SELECT_SHORTCUT_SCOPE, {
    active: open || triggerFocused,
    reservedAccelerators: SELECT_RESERVED_ACCELERATORS,
  });

  return (
    <SelectInteractionContext.Provider
      value={{
        open,
        setOpen: handleOpenChange,
        setTriggerFocused,
      }}
    >
      <SelectPrimitive.Root
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        open={openProp}
        {...props}
      />
    </SelectInteractionContext.Provider>
  );
}

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, onBlur, onFocus, onKeyDown, ...props }, ref) => {
  const interaction = React.useContext(SelectInteractionContext);

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "relative flex h-11 w-full min-w-0 items-center gap-2 rounded-2xl border border-border/80 bg-background/80 pl-3 pr-10 text-left text-sm outline-none transition placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate",
        className,
      )}
      onFocus={(event) => {
        interaction?.setTriggerFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        interaction?.setTriggerFocused(false);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (shouldStopReservedSelectShortcutPropagation(event)) {
          event.stopPropagation();
        }
        onKeyDown?.(event);
      }}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-muted-foreground",
      className,
    )}
    {...props}
  >
    <ChevronUp className="size-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1 text-muted-foreground",
      className,
    )}
    {...props}
  >
    <ChevronDown className="size-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, onKeyDown, position = "popper", ...props }, ref) => {
  return (
    <SelectPrimitive.Portal container={resolvePortalContainer() ?? undefined}>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-[20px] border border-border/80 bg-card/92 text-card-foreground shadow-[0_18px_44px_color-mix(in_oklch,var(--foreground)_14%,transparent)] backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        onKeyDown={(event) => {
          maybeWrapSelectNavigation(event);
          if (shouldStopReservedSelectShortcutPropagation(event)) {
            event.stopPropagation();
          }
          onKeyDown?.(event);
        }}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-[5px]",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-8 py-2 text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center gap-3 rounded-[14px] py-2 pr-3 pl-8 text-sm font-medium outline-none transition focus:bg-secondary/70 focus:text-foreground data-[state=checked]:bg-secondary/76 data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="pointer-events-none absolute left-3 flex size-4 items-center justify-center text-primary">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border/70", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
