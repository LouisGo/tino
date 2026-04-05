import type { AppShortcutId, ShortcutDefinition } from "@/core/shortcuts/types";

export class ShortcutRegistry {
  private readonly shortcuts = new Map<AppShortcutId, ShortcutDefinition<unknown, unknown>>();

  register<Payload, Result>(shortcut: ShortcutDefinition<Payload, Result>) {
    if (this.shortcuts.has(shortcut.id)) {
      console.warn(`[shortcuts] overwriting shortcut "${shortcut.id}"`);
    }

    this.shortcuts.set(shortcut.id, shortcut as ShortcutDefinition<unknown, unknown>);
    return this;
  }

  registerMany(shortcuts: ShortcutDefinition<unknown, unknown>[]) {
    shortcuts.forEach((shortcut) => this.register(shortcut));
    return this;
  }

  get(id: AppShortcutId) {
    return this.shortcuts.get(id);
  }

  getAll() {
    return Array.from(this.shortcuts.values());
  }
}
