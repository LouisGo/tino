import { useContext, useEffect } from "react";

import { ShortcutManagerContext } from "@/core/shortcuts/context";
import type {
  AppShortcutId,
  ShortcutPolicyActivationOptions,
  ShortcutPolicyId,
  ShortcutScopeActivationOptions,
  ShortcutScopeId,
} from "@/core/shortcuts/types";

export function useShortcutManager() {
  const manager = useContext(ShortcutManagerContext);
  if (!manager) {
    throw new Error("useShortcutManager must be used inside AppShortcutProvider.");
  }

  return manager;
}

export function useAppShortcut(id: AppShortcutId) {
  return useShortcutManager().getShortcut(id);
}

export function useShortcutScope(
  scopeId: ShortcutScopeId,
  options?: ShortcutScopeActivationOptions & {
    active?: boolean;
  },
) {
  const manager = useShortcutManager();
  const active = options?.active ?? true;
  const reservedAccelerators = options?.reservedAccelerators;

  useEffect(() => {
    if (!active) {
      return;
    }

    return manager.activateScope(scopeId, { reservedAccelerators });
  }, [active, manager, reservedAccelerators, scopeId]);
}

export function useShortcutPolicy(
  policyId: ShortcutPolicyId,
  options: ShortcutPolicyActivationOptions & {
    active?: boolean;
  },
) {
  const manager = useShortcutManager();
  const active = options.active ?? true;
  const {
    ownedScopes,
    preventDefaultAccelerators,
    reservedAccelerators,
  } = options;

  useEffect(() => {
    if (!active) {
      return;
    }

    return manager.activatePolicy(policyId, {
      ownedScopes,
      preventDefaultAccelerators,
      reservedAccelerators,
    });
  }, [
    active,
    manager,
    ownedScopes,
    policyId,
    preventDefaultAccelerators,
    reservedAccelerators,
  ]);
}
