import type { CommandExecutor } from "@/core/commands";
import { resolveText } from "@/i18n";
import { ShortcutRegistry } from "@/core/shortcuts/registry";
import {
  matchesShortcutEvent,
  normalizeShortcutAccelerator,
  resolveDefaultShortcutBinding,
  resolveShortcutOverride,
} from "@/core/shortcuts/utils";
import type {
  AppShortcutId,
  ResolvedShortcutDefinition,
  ShortcutBindingOverride,
  ShortcutExecution,
  ShortcutExecutionOptions,
  ShortcutPlatform,
  ShortcutScopeId,
} from "@/core/shortcuts/types";

export function resolveShortcutCatalog(
  registry: ShortcutRegistry,
  overrides: Record<string, ShortcutBindingOverride>,
  platform: ShortcutPlatform,
  locale?: string,
) {
  return registry
    .getAll()
    .map((definition): ResolvedShortcutDefinition => {
      const defaultAccelerator = resolveDefaultShortcutBinding(definition.defaults, platform);
      const override = resolveShortcutOverride(overrides, definition.id);
      const hasOverride = override !== undefined;
      const accelerator = hasOverride
        ? normalizeShortcutAccelerator(override.accelerator ?? null, platform)
        : defaultAccelerator;

      return {
        ...definition,
        accelerator,
        description: definition.description ? resolveText(definition.description) : undefined,
        defaultAccelerator,
        hasOverride,
        isEnabled: accelerator !== null,
        label: resolveText(definition.label),
        source: hasOverride ? "override" : "default",
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, locale));
}

export function findShortcutConflicts(
  registry: ShortcutRegistry,
  overrides: Record<string, ShortcutBindingOverride>,
  platform: ShortcutPlatform,
  shortcutId: AppShortcutId,
  accelerator: string | null | undefined,
  locale?: string,
) {
  const normalized = normalizeShortcutAccelerator(accelerator, platform);
  if (!normalized) {
    return [];
  }

  const target = registry.get(shortcutId);
  if (!target) {
    return [];
  }

  return resolveShortcutCatalog(registry, overrides, platform, locale).filter((candidate) => {
    if (candidate.id === shortcutId || candidate.accelerator !== normalized) {
      return false;
    }

    if (target.kind === "global" || candidate.kind === "global") {
      return true;
    }

    const targetScopes = target.scopes;
    const candidateScopes = candidate.scopes;
    return targetScopes.some((scope) => candidateScopes.includes(scope));
  });
}

export function findLocalShortcutExecution(
  registry: ShortcutRegistry,
  commands: CommandExecutor,
  overrides: Record<string, ShortcutBindingOverride>,
  platform: ShortcutPlatform,
  scopes: ShortcutScopeId[],
  event: KeyboardEvent,
  locale?: string,
) {
  const resolved = resolveShortcutCatalog(registry, overrides, platform, locale).filter(
    (
      shortcut,
    ): shortcut is ResolvedShortcutDefinition & {
      allowInEditable?: boolean;
      allowRepeat?: boolean;
      kind: "local";
      scopes: ShortcutScopeId[];
    } =>
      shortcut.kind === "local"
      && shortcut.isEnabled
      && shortcut.accelerator !== null
      && (!event.repeat || Boolean(shortcut.allowRepeat))
      && matchesShortcutEvent(event, shortcut.accelerator, platform),
  );

  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scopeId = scopes[index];
    const shortcut = resolved.find((candidate) => candidate.scopes.includes(scopeId));
    if (!shortcut) {
      continue;
    }

    const execution = createShortcutExecution(shortcut, {
      commands,
      platform,
      trigger: {
        event,
        platform,
        scopeId,
        source: "local",
      },
    });

    if (execution) {
      return execution;
    }
  }

  return null;
}

export function createShortcutExecution(
  shortcut: ResolvedShortcutDefinition,
  options: ShortcutExecutionOptions,
): ShortcutExecution | null {
  if (!shortcut.isEnabled) {
    return null;
  }

  const payload = shortcut.command.payload?.(options.trigger);
  if (!options.commands.canExecute(shortcut.command.id, payload)) {
    return null;
  }

  return {
    payload,
    scopeId: options.trigger.scopeId,
    shortcut,
    trigger: options.trigger,
  };
}

export async function executeShortcutExecution(
  commands: CommandExecutor,
  execution: ShortcutExecution,
) {
  await commands.execute(execution.shortcut.command.id, execution.payload);
}
