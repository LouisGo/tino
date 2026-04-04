import { useMemo, type ReactNode } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { CommandExecutorContext } from "@/core/commands/context";
import { CommandExecutor } from "@/core/commands/executor";
import { CommandRegistry } from "@/core/commands/registry";
import type { CommandDefinition } from "@/core/commands/types";

export function AppCommandProvider({
  children,
  commands,
}: {
  children: ReactNode;
  commands: CommandDefinition<unknown, unknown>[];
}) {
  const queryClient = useQueryClient();
  const registry = useMemo(() => new CommandRegistry().registerMany(commands), [commands]);
  const executor = useMemo(
    () =>
      new CommandExecutor(registry, {
        queryClient,
      }),
    [queryClient, registry],
  );

  return (
    <CommandExecutorContext.Provider value={executor}>
      {children}
    </CommandExecutorContext.Provider>
  );
}
