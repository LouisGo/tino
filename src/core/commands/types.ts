import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";

import type { LocalizedText } from "@/i18n";

export type AppCommandId = string;

export type CommandServices = {
  queryClient: QueryClient;
  router: AnyRouter;
};

export type CommandDefinition<Payload = void, Result = void> = {
  id: AppCommandId;
  label: LocalizedText;
  description?: LocalizedText;
  isEnabled?: (payload: Payload, services: CommandServices) => boolean;
  run: (payload: Payload, services: CommandServices) => Result | Promise<Result>;
};

export function defineCommand<Payload, Result>(
  command: CommandDefinition<Payload, Result>,
) {
  return command as CommandDefinition<unknown, unknown>;
}
