import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useCommandExecutor } from "@/core/commands";
import { useI18nLanguage } from "@/i18n";
import { ShortcutManagerContext } from "@/core/shortcuts/context";
import {
  createShortcutExecution,
  executeShortcutExecution,
  findLocalShortcutHandling,
  findShortcutConflicts,
  resolveShortcutCatalog,
} from "@/core/shortcuts/manager";
import { ShortcutRegistry } from "@/core/shortcuts/registry";
import {
  getShortcutPlatform,
  isEditableShortcutTarget,
} from "@/core/shortcuts/utils";
import type {
  ShortcutBindingOverride,
  ShortcutDefinition,
  ShortcutManager,
  ShortcutScopeActivationOptions,
  ShortcutScopeId,
} from "@/core/shortcuts/types";

export function AppShortcutProvider({
  children,
  overrides,
  shortcuts,
}: {
  children: ReactNode;
  overrides?: Record<string, ShortcutBindingOverride>;
  shortcuts: ShortcutDefinition<unknown, unknown>[];
}) {
  const commands = useCommandExecutor();
  const language = useI18nLanguage();
  const platform = useMemo(() => getShortcutPlatform(), []);
  const registry = useMemo(() => new ShortcutRegistry().registerMany(shortcuts), [shortcuts]);
  const [scopes, setScopes] = useState<
    Array<{ id: ShortcutScopeId; key: number; reservedAccelerators: string[] }>
  >([]);
  const scopeSerialRef = useRef(0);
  const overridesRecord = useMemo(() => overrides ?? {}, [overrides]);
  const resolvedShortcuts = useMemo(
    () => resolveShortcutCatalog(registry, overridesRecord, platform, language),
    [language, overridesRecord, platform, registry],
  );
  const resolvedShortcutsRef = useRef(resolvedShortcuts);
  const scopesRef = useRef(scopes);

  useEffect(() => {
    resolvedShortcutsRef.current = resolvedShortcuts;
  }, [resolvedShortcuts]);

  useEffect(() => {
    scopesRef.current = scopes;
  }, [scopes]);

  const activateScope = useCallback((
    scopeId: ShortcutScopeId,
    options?: ShortcutScopeActivationOptions,
  ) => {
    const key = ++scopeSerialRef.current;
    const reservedAccelerators = options?.reservedAccelerators ?? [];

    setScopes((current) => [...current, { id: scopeId, key, reservedAccelerators }]);

    return () => {
      setScopes((current) => current.filter((value) => value.key !== key));
    };
  }, []);

  const manager = useMemo<ShortcutManager>(() => ({
    activateScope: (scopeId, options) => activateScope(scopeId, options),
    definitions: registry.getAll(),
    execute: async (id, trigger) => {
      const shortcut = resolvedShortcutsRef.current.find((candidate) => candidate.id === id);
      if (!shortcut) {
        return false;
      }

      const execution = createShortcutExecution(shortcut, {
        commands,
        platform,
        trigger: {
          event: trigger?.event,
          platform,
          scopeId: trigger?.scopeId,
          source: trigger?.source ?? "manual",
        },
      });

      if (!execution) {
        return false;
      }

      await executeShortcutExecution(commands, execution);
      return true;
    },
    findConflicts: (shortcutId, accelerator, nextOverrides) =>
      findShortcutConflicts(
        registry,
        nextOverrides ?? overridesRecord,
        platform,
        shortcutId,
        accelerator,
        language,
      ),
    getShortcut: (id) =>
      resolvedShortcutsRef.current.find((shortcut) => shortcut.id === id),
    getShortcuts: () => resolvedShortcutsRef.current,
    platform,
    resolveShortcuts: (nextOverrides) =>
      resolveShortcutCatalog(
        registry,
        nextOverrides ?? overridesRecord,
        platform,
        language,
      ),
  }), [activateScope, commands, language, overridesRecord, platform, registry]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    const handling = findLocalShortcutHandling(
      registry,
      commands,
      overridesRecord,
      platform,
      scopesRef.current,
      event,
      language,
    );

    if (!handling) {
      return;
    }

    if (handling.type === "blocked") {
      event.stopPropagation();
      return;
    }

    const execution = handling.execution;
    if (isEditableShortcutTarget(event.target) && execution.shortcut.kind === "local") {
      if (!execution.shortcut.allowInEditable) {
        return;
      }
    }

    event.preventDefault();
    event.stopPropagation();
    void executeShortcutExecution(commands, execution).catch((error) => {
      console.error(`[shortcuts] failed to execute "${execution.shortcut.id}"`, error);
    });
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <ShortcutManagerContext.Provider value={manager}>
      {children}
    </ShortcutManagerContext.Provider>
  );
}
