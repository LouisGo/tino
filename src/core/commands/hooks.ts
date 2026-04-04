import { useContext } from "react";

import { CommandExecutorContext } from "@/core/commands/context";
import type { AppCommandId } from "@/core/commands/types";

export function useCommandExecutor() {
  const executor = useContext(CommandExecutorContext);
  if (!executor) {
    throw new Error("useCommandExecutor must be used inside AppCommandProvider.");
  }

  return executor;
}

export function useCommand<Payload = void, Result = void>(
  id: AppCommandId,
  payload?: Payload,
) {
  const executor = useCommandExecutor();
  const definition = executor.getDefinition(id);
  const canExecute = payload === undefined ? true : executor.canExecute(id, payload);

  return {
    id,
    label: definition?.label ?? id,
    definition,
    canExecute,
    execute: (nextPayload?: Payload) =>
      executor.execute<Payload, Result>(id, (nextPayload ?? payload) as Payload),
  };
}

