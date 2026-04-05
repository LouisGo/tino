import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";

export type AppCommandId = string;

export type CommandServices = {
  queryClient: QueryClient;
  router: AnyRouter;
};

export type CommandDefinition<Payload = void, Result = void> = {
  id: AppCommandId;
  label: string;
  description?: string;
  isEnabled?: (payload: Payload, services: CommandServices) => boolean;
  run: (payload: Payload, services: CommandServices) => Result | Promise<Result>;
};

export function defineCommand<Payload, Result>(
  command: CommandDefinition<Payload, Result>,
) {
  return command as CommandDefinition<unknown, unknown>;
}
