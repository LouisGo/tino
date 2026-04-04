import { CommandRegistry } from "@/core/commands/registry";
import type { AppCommandId, CommandServices } from "@/core/commands/types";

export class CommandExecutor {
  private readonly registry: CommandRegistry;
  private readonly services: CommandServices;

  constructor(registry: CommandRegistry, services: CommandServices) {
    this.registry = registry;
    this.services = services;
  }

  getDefinition(id: AppCommandId) {
    return this.registry.get(id);
  }

  canExecute<Payload>(id: AppCommandId, payload: Payload) {
    const command = this.registry.get(id);
    if (!command) {
      return false;
    }

    if (!command.isEnabled) {
      return true;
    }

    try {
      return command.isEnabled(payload, this.services);
    } catch (error) {
      console.error(`[commands] failed to evaluate "${id}"`, error);
      return false;
    }
  }

  execute<Payload, Result>(id: AppCommandId, payload: Payload): Result | Promise<Result> {
    const command = this.registry.get(id);
    if (!command) {
      throw new Error(`Command "${id}" is not registered.`);
    }

    if (!this.canExecute(id, payload)) {
      throw new Error(`Command "${id}" is disabled in current context.`);
    }

    return command.run(payload, this.services) as Result | Promise<Result>;
  }
}
