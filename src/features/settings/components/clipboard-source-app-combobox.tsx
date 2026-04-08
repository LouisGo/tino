import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";

import { ChevronDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { ClipboardSourceAppAvatar } from "@/features/settings/components/clipboard-source-app-avatar";
import { matchesClipboardSourceAppSearch } from "@/features/settings/lib/clipboard-filter-settings";
import { cn } from "@/lib/utils";
import type { ClipboardSourceAppOption } from "@/types/shell";

export function ClipboardSourceAppCombobox({
  errorMessage,
  isLoading,
  onActivate,
  onVisibleOptionsChange,
  onSelect,
  options,
  selectedBundleIds,
}: {
  errorMessage: string | null;
  isLoading: boolean;
  onActivate?: () => void;
  onVisibleOptionsChange?: (options: ClipboardSourceAppOption[]) => void;
  onSelect: (option: ClipboardSourceAppOption) => void;
  options: ClipboardSourceAppOption[];
  selectedBundleIds: Set<string>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const listboxId = useId();
  const duplicateAppNames = useMemo(() => {
    const counts = new Map<string, number>();

    for (const option of options) {
      const key = option.appName.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  }, [options]);
  const filteredOptions = useMemo(
    () =>
      options.filter((option) => {
        if (selectedBundleIds.has(option.bundleId.toLowerCase())) {
          return false;
        }

        return matchesClipboardSourceAppSearch(option, deferredQuery);
      }),
    [deferredQuery, options, selectedBundleIds],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isOpen]);

  const dropdownVisible =
    isOpen && (Boolean(errorMessage) || isLoading || filteredOptions.length > 0 || query.trim().length > 0);

  useEffect(() => {
    if (!dropdownVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onVisibleOptionsChange?.(filteredOptions.slice(0, 6));
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dropdownVisible, filteredOptions, onVisibleOptionsChange]);
  const activeIndex =
    filteredOptions.length === 0
      ? 0
      : Math.min(highlightedIndex, filteredOptions.length - 1);
  const activeOption = filteredOptions[activeIndex] ?? null;

  useEffect(() => {
    if (!dropdownVisible || !activeOption) {
      return;
    }

    const activeElement = optionRefs.current.get(activeOption.bundleId);
    if (!activeElement) {
      return;
    }

    activeElement.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeOption, dropdownVisible]);

  const openDropdown = () => {
    setIsOpen((current) => {
      if (!current) {
        onActivate?.();
      }
      return true;
    });
  };

  const commitSelection = (option: ClipboardSourceAppOption) => {
    onSelect(option);
    setQuery("");
    setHighlightedIndex(0);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 z-[1] size-3.5 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          ref={inputRef}
          value={query}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={dropdownVisible ? listboxId : undefined}
          aria-expanded={dropdownVisible}
          onPointerDown={() => {
            openDropdown();
          }}
          onFocus={() => {
            openDropdown();
            setHighlightedIndex(0);
          }}
          onChange={(event) => {
            openDropdown();
            setQuery(event.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={(event) => {
            if (!dropdownVisible) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                openDropdown();
              }
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightedIndex((current) =>
                filteredOptions.length === 0
                  ? 0
                  : Math.min(current + 1, filteredOptions.length - 1),
              );
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightedIndex((current) => Math.max(current - 1, 0));
            }

            if (event.key === "Enter" && activeOption) {
              event.preventDefault();
              commitSelection(activeOption);
            }

            if (event.key === "Escape") {
              event.preventDefault();
              setIsOpen(false);
            }
          }}
          placeholder="Search apps..."
          className="h-10 rounded-[18px] border-border/70 bg-surface-panel pl-9 pr-9 text-[12px] shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
        />
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/65 transition-transform",
            dropdownVisible ? "rotate-180" : "",
          )}
        />
      </div>

      {dropdownVisible ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-30 overflow-hidden rounded-[20px] border border-border/70 bg-[color:color-mix(in_oklch,var(--card)_94%,transparent)] shadow-[0_22px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          <div
            id={listboxId}
            role="listbox"
            className="max-h-[18rem] overflow-y-auto px-2 py-2"
          >
            {errorMessage ? (
              <p className="px-2.5 py-4 text-xs text-destructive">
                {errorMessage}
              </p>
            ) : isLoading ? (
              <p className="px-2.5 py-4 text-xs text-muted-foreground">
                Loading installed apps...
              </p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-2.5 py-4 text-xs text-muted-foreground">
                No apps matched this search.
              </p>
            ) : (
              <div className="space-y-1">
                {filteredOptions.map((option, index) => {
                  const showSecondaryLine =
                    duplicateAppNames.has(option.appName.trim().toLowerCase())
                    || deferredQuery.includes(".");

                  return (
                    <button
                      key={option.bundleId}
                      ref={(element) => {
                        optionRefs.current.set(option.bundleId, element);
                      }}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => commitSelection(option)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-1.5 text-left transition",
                        activeIndex === index
                          ? "bg-secondary/95 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]"
                          : "hover:bg-secondary/70",
                      )}
                    >
                      <ClipboardSourceAppAvatar
                        appName={option.appName}
                        iconPath={option.iconPath}
                        className="size-7 shrink-0 rounded-[8px]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] leading-4 font-medium text-foreground">
                          {option.appName}
                        </span>
                        {showSecondaryLine ? (
                          <span className="block truncate text-[10px] leading-4 text-muted-foreground">
                            {option.bundleId}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
