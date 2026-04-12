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

type ActiveShortcutScope = {
  id: ShortcutScopeId;
  reservedAccelerators: string[];
};

type ActiveShortcutPolicy = {
  id: string;
  ownedScopes: ShortcutScopeId[];
  preventDefaultAccelerators: string[];
  reservedAccelerators: string[];
};

export type LocalShortcutHandling =
  | {
      execution: ShortcutExecution;
      type: "execution";
    }
  | {
      preventDefault: boolean;
      scopeId: ShortcutScopeId;
      type: "blocked";
    };

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

  return findExecutionForScopeIds(resolved, commands, platform, scopes, event);
}

export function findLocalShortcutHandling(
  registry: ShortcutRegistry,
  commands: CommandExecutor,
  overrides: Record<string, ShortcutBindingOverride>,
  platform: ShortcutPlatform,
  scopes: ActiveShortcutScope[],
  policies: ActiveShortcutPolicy[],
  event: KeyboardEvent,
  locale?: string,
): LocalShortcutHandling | null {
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

  for (let index = policies.length - 1; index >= 0; index -= 1) {
    const policy = policies[index];
    const availableScopeIds = findAvailableScopeIds(scopes, policy.ownedScopes);
    if (availableScopeIds.length === 0) {
      continue;
    }
    const execution = findExecutionForScopeIds(
      resolved,
      commands,
      platform,
      availableScopeIds,
      event,
    );

    if (execution) {
      return {
        execution,
        type: "execution",
      };
    }

    if (
      policy.preventDefaultAccelerators.some((accelerator) =>
        matchesShortcutEvent(event, accelerator, platform))
    ) {
      return {
        preventDefault: true,
        scopeId: availableScopeIds[availableScopeIds.length - 1] ?? policy.ownedScopes[0] ?? policy.id,
        type: "blocked",
      };
    }

    if (
      policy.reservedAccelerators.some((accelerator) =>
        matchesShortcutEvent(event, accelerator, platform))
    ) {
      return {
        preventDefault: false,
        scopeId: availableScopeIds[availableScopeIds.length - 1] ?? policy.ownedScopes[0] ?? policy.id,
        type: "blocked",
      };
    }
  }

  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];
    const execution = findExecutionForScopeIds(
      resolved,
      commands,
      platform,
      [scope.id],
      event,
    );
    if (execution) {
      return {
        execution,
        type: "execution",
      };
    }

    if (
      scope.reservedAccelerators.some((accelerator) =>
        matchesShortcutEvent(event, accelerator, platform))
    ) {
      return {
        preventDefault: false,
        scopeId: scope.id,
        type: "blocked",
      };
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

function findExecutionForScopeIds(
  resolved: Array<
    ResolvedShortcutDefinition & {
      allowInEditable?: boolean;
      allowRepeat?: boolean;
      kind: "local";
      scopes: ShortcutScopeId[];
    }
  >,
  commands: CommandExecutor,
  platform: ShortcutPlatform,
  scopeIds: ShortcutScopeId[],
  event: KeyboardEvent,
) {
  for (let index = scopeIds.length - 1; index >= 0; index -= 1) {
    const scopeId = scopeIds[index];
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

function findAvailableScopeIds(
  activeScopes: ActiveShortcutScope[],
  scopeIds: ShortcutScopeId[],
) {
  const activeScopeIds = new Set(activeScopes.map((scope) => scope.id));
  return scopeIds.filter((scopeId) => activeScopeIds.has(scopeId));
}
