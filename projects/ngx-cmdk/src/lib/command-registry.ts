import { Injectable, computed, signal } from '@angular/core';
import type { Command, ResolvedCommand } from './command.model';

@Injectable({ providedIn: 'root' })
export class CommandRegistryService {
  private readonly commandsMap = signal<Map<string, ResolvedCommand>>(new Map());
  private readonly shortcutIndex = new Map<string, string>();

  readonly commands = computed<readonly ResolvedCommand[]>(() =>
    Array.from(this.commandsMap().values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  );

  register(command: Command): () => void {
    const id = command.id ?? crypto.randomUUID();
    if (this.commandsMap().has(id)) {
      throw new Error(`Command with id "${id}" is already registered`);
    }
    if (command.shortcut && this.shortcutIndex.has(command.shortcut)) {
      const existingId = this.shortcutIndex.get(command.shortcut);
      throw new Error(`Shortcut "${command.shortcut}" is already registered by command "${existingId}"`);
    }

    const resolved: ResolvedCommand = { ...command, id };
    this.commandsMap.update((map) => new Map(map).set(id, resolved));
    if (resolved.shortcut) {
      this.shortcutIndex.set(resolved.shortcut, id);
    }

    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.commandsMap.update((map) => {
        const next = new Map(map);
        next.delete(id);
        return next;
      });
      if (resolved.shortcut) {
        this.shortcutIndex.delete(resolved.shortcut);
      }
    };
  }
}
