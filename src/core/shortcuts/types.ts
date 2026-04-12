import type { AppCommandId, CommandExecutor } from "@/core/commands";
import type { LocalizedText } from "@/i18n";

export type AppShortcutId = string;
export type ShortcutKind = "global" | "local";
export type ShortcutScopeId = string;
export type ShortcutPolicyId = string;
export type ShortcutPlatform = "macos" | "windows" | "linux" | "browser";
export type ShortcutBindingOverride = {
  accelerator?: string | null;
};

export type ShortcutDefaultBinding =
  | string
  | {
      macos?: string | null;
      windows?: string | null;
      linux?: string | null;
      browser?: string | null;
      default?: string | null;
    };

type ShortcutCommandBinding<Payload> = {
  id: AppCommandId;
  payload?: (context: ShortcutTriggerContext) => Payload;
};

type ShortcutDefinitionBase<Payload = void, Result = void> = {
  id: AppShortcutId;
  label: LocalizedText;
  description?: LocalizedText;
  defaults: ShortcutDefaultBinding;
  command: ShortcutCommandBinding<Payload>;
  _result?: Result;
};

export type GlobalShortcutDefinition<Payload = void, Result = void> =
  ShortcutDefinitionBase<Payload, Result> & {
    kind: "global";
  };

export type LocalShortcutDefinition<Payload = void, Result = void> =
  ShortcutDefinitionBase<Payload, Result> & {
    kind: "local";
    scopes: ShortcutScopeId[];
    allowInEditable?: boolean;
    allowRepeat?: boolean;
  };

export type ShortcutDefinition<Payload = void, Result = void> =
  | GlobalShortcutDefinition<Payload, Result>
  | LocalShortcutDefinition<Payload, Result>;

type ResolvedShortcutDefinitionBase = {
  accelerator: string | null;
  description?: string;
  defaultAccelerator: string | null;
  hasOverride: boolean;
  isEnabled: boolean;
  label: string;
  source: "default" | "override";
};

export type ResolvedGlobalShortcutDefinition = Omit<
  GlobalShortcutDefinition<unknown, unknown>,
  "description" | "label"
> & ResolvedShortcutDefinitionBase;

export type ResolvedLocalShortcutDefinition = Omit<
  LocalShortcutDefinition<unknown, unknown>,
  "description" | "label"
> & {
} & ResolvedShortcutDefinitionBase;

export type ResolvedShortcutDefinition =
  | ResolvedGlobalShortcutDefinition
  | ResolvedLocalShortcutDefinition;

export type ShortcutTriggerContext = {
  source: "global" | "local" | "manual";
  event?: KeyboardEvent | null;
  platform: ShortcutPlatform;
  scopeId?: ShortcutScopeId;
};

export type ShortcutExecution = {
  payload: unknown;
  scopeId?: ShortcutScopeId;
  shortcut: ResolvedShortcutDefinition;
  trigger: ShortcutTriggerContext;
};

export type ShortcutScopeActivationOptions = {
  reservedAccelerators?: string[];
};

export type ShortcutPolicyActivationOptions = {
  ownedScopes: ShortcutScopeId[];
  preventDefaultAccelerators?: string[];
  reservedAccelerators?: string[];
};

export type ShortcutManager = {
  activateScope: (
    scopeId: ShortcutScopeId,
    options?: ShortcutScopeActivationOptions,
  ) => () => void;
  activatePolicy: (
    policyId: ShortcutPolicyId,
    options: ShortcutPolicyActivationOptions,
  ) => () => void;
  definitions: ShortcutDefinition<unknown, unknown>[];
  execute: (
    id: AppShortcutId,
    trigger?: Omit<ShortcutTriggerContext, "platform">,
  ) => Promise<boolean>;
  findConflicts: (
    shortcutId: AppShortcutId,
    accelerator: string | null | undefined,
    overrides?: Record<string, ShortcutBindingOverride>,
  ) => ResolvedShortcutDefinition[];
  getShortcut: (id: AppShortcutId) => ResolvedShortcutDefinition | undefined;
  getShortcuts: () => ResolvedShortcutDefinition[];
  platform: ShortcutPlatform;
  resolveShortcuts: (
    overrides?: Record<string, ShortcutBindingOverride>,
  ) => ResolvedShortcutDefinition[];
};

export type ShortcutExecutionOptions = {
  commands: CommandExecutor;
  platform: ShortcutPlatform;
  trigger: ShortcutTriggerContext;
};

export function defineShortcut<Payload, Result>(
  shortcut: ShortcutDefinition<Payload, Result>,
) {
  return shortcut as ShortcutDefinition<unknown, unknown>;
}
