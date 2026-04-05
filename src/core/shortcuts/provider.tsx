import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  register as registerGlobalShortcut,
  unregisterAll as unregisterAllGlobalShortcuts,
} from "@tauri-apps/plugin-global-shortcut";

import { useCommandExecutor } from "@/core/commands";
import { ShortcutManagerContext } from "@/core/shortcuts/context";
import {
  createShortcutExecution,
  executeShortcutExecution,
  findLocalShortcutExecution,
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
  ShortcutScopeId,
} from "@/core/shortcuts/types";
import { isTauriRuntime } from "@/lib/tauri";

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
  const platform = useMemo(() => getShortcutPlatform(), []);
  const registry = useMemo(() => new ShortcutRegistry().registerMany(shortcuts), [shortcuts]);
  const [scopes, setScopes] = useState<Array<{ id: ShortcutScopeId; key: number }>>([]);
  const scopeSerialRef = useRef(0);
  const overridesRecord = useMemo(() => overrides ?? {}, [overrides]);
  const resolvedShortcuts = useMemo(
    () => resolveShortcutCatalog(registry, overridesRecord, platform),
    [overridesRecord, platform, registry],
  );
  const resolvedShortcutsRef = useRef(resolvedShortcuts);
  const scopesRef = useRef(scopes);

  useEffect(() => {
    resolvedShortcutsRef.current = resolvedShortcuts;
  }, [resolvedShortcuts]);

  useEffect(() => {
    scopesRef.current = scopes;
  }, [scopes]);

  const activateScope = useCallback((scopeId: ShortcutScopeId) => {
    const key = ++scopeSerialRef.current;

    setScopes((current) => [...current, { id: scopeId, key }]);

    return () => {
      setScopes((current) => current.filter((value) => value.key !== key));
    };
  }, []);

  const manager = useMemo<ShortcutManager>(() => ({
    activateScope: (scopeId) => activateScope(scopeId),
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
      ),
    getShortcut: (id) =>
      resolvedShortcutsRef.current.find((shortcut) => shortcut.id === id),
    getShortcuts: () => resolvedShortcutsRef.current,
    platform,
    resolveShortcuts: (nextOverrides) =>
      resolveShortcutCatalog(registry, nextOverrides ?? overridesRecord, platform),
  }), [activateScope, commands, overridesRecord, platform, registry]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    const rawScopes = scopesRef.current.map((scope) => scope.id);
    const execution = findLocalShortcutExecution(
      registry,
      commands,
      overridesRecord,
      platform,
      rawScopes,
      event,
    );

    if (!execution) {
      return;
    }

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

  useEffect(() => {
    if (!isTauriRuntime() || getCurrentWindow().label !== "main") {
      return;
    }

    let disposed = false;

    const sync = async () => {
      await unregisterAllGlobalShortcuts();

      const globalShortcuts = resolvedShortcuts.filter(
        (shortcut) => shortcut.kind === "global" && shortcut.accelerator,
      );

      for (const shortcut of globalShortcuts) {
        try {
          const shortcutId = shortcut.id;
          await registerGlobalShortcut(shortcut.accelerator as string, (event) => {
            if (disposed || event.state !== "Pressed") {
              return;
            }

            const current = resolvedShortcutsRef.current.find(
              (candidate) => candidate.kind === "global" && candidate.id === shortcutId,
            );

            if (!current) {
              return;
            }

            const execution = createShortcutExecution(current, {
              commands,
              platform,
              trigger: {
                event: null,
                platform,
                source: "global",
              },
            });

            if (!execution) {
              return;
            }

            void executeShortcutExecution(commands, execution).catch((error) => {
              console.error(`[shortcuts] failed to execute "${current.id}"`, error);
            });
          });
        } catch (error) {
          console.error(
            `[shortcuts] failed to register global shortcut "${shortcut.id}" (${shortcut.accelerator})`,
            error,
          );
        }
      }
    };

    void sync();

    return () => {
      disposed = true;
      void unregisterAllGlobalShortcuts();
    };
  }, [commands, platform, resolvedShortcuts]);

  return (
    <ShortcutManagerContext.Provider value={manager}>
      {children}
    </ShortcutManagerContext.Provider>
  );
}
