import type {
  ContextMenuItemDefinition,
  ContextMenuResolvedItem,
  ContextMenuRuntime,
} from "@/core/context-menu/types";
import { resolveTextNode } from "@/i18n";

function resolveValue<Context, Value>(
  value: Value | ((context: Context) => Value),
  context: Context,
) {
  return typeof value === "function" ? (value as (context: Context) => Value)(context) : value;
}

export class ContextMenuRegistry<Context> {
  private readonly items: ContextMenuItemDefinition<Context>[];

  constructor(items: ContextMenuItemDefinition<Context>[]) {
    this.items = items;
  }

  resolve(context: Context, runtime: ContextMenuRuntime) {
    const resolvedItems = this.items.flatMap((item): ContextMenuResolvedItem[] => {
      if (item.type === "separator") {
        return [{ key: item.key, type: "separator" }];
      }

      if (item.hidden?.(context, runtime)) {
        return [];
      }

      const payload = item.command?.payload(context);
      const disabled =
        item.disabled?.(context, runtime)
        ?? (item.command ? !runtime.commands.canExecute(item.command.id, payload) : false);

      return [
        {
          key: item.key,
          type: "item",
          label: resolveTextNode(resolveValue(item.label, context)),
          icon: item.icon ? resolveValue(item.icon, context) : undefined,
          danger: typeof item.danger === "function" ? item.danger(context) : item.danger,
          disabled,
          onSelect: async () => {
            if (disabled) {
              return;
            }

            if (item.onSelect) {
              await item.onSelect(context, runtime);
            }

            if (item.command) {
              await runtime.commands.execute(item.command.id, payload);
            }
          },
        },
      ];
    });

    return cleanupSeparators(resolvedItems);
  }
}

function cleanupSeparators(items: ContextMenuResolvedItem[]) {
  const compacted = items.filter((item, index) => {
    if (item.type !== "separator") {
      return true;
    }

    const previous = items[index - 1];
    const next = items[index + 1];
    return previous && previous.type !== "separator" && next && next.type !== "separator";
  });

  return compacted.filter((item, index) => {
    if (item.type !== "separator") {
      return true;
    }

    return index > 0 && index < compacted.length - 1;
  });
}

export function createContextMenuRegistry<Context>(
  items: ContextMenuItemDefinition<Context>[],
) {
  return new ContextMenuRegistry(items);
}

export function contextMenuItem<Context>(
  item: ContextMenuItemDefinition<Context>,
) {
  return item;
}

export function contextMenuSeparator<Context>(key: string): ContextMenuItemDefinition<Context> {
  return {
    key,
    type: "separator",
  };
}
