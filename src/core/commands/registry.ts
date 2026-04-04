import type { AppCommandId, CommandDefinition } from "@/core/commands/types";

export class CommandRegistry {
  private readonly commands = new Map<AppCommandId, CommandDefinition<unknown, unknown>>();

  register<Payload, Result>(command: CommandDefinition<Payload, Result>) {
    if (this.commands.has(command.id)) {
      console.warn(`[commands] overwriting command "${command.id}"`);
    }

    this.commands.set(command.id, command as CommandDefinition<unknown, unknown>);
    return this;
  }

  registerMany(commands: CommandDefinition<unknown, unknown>[]) {
    commands.forEach((command) => this.register(command));
    return this;
  }

  get(id: AppCommandId) {
    return this.commands.get(id);
  }

  getAll() {
    return Array.from(this.commands.values());
  }
}

