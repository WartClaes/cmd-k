import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { Command, ResolvedCommand } from './command.model';
import { isEditableTarget, matchesShortcut, parseShortcut, type ParsedShortcut } from './shortcut';

@Injectable({ providedIn: 'root' })
export class CommandRegistryService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly isMac = /mac/i.test(this.document.defaultView?.navigator.platform ?? '');
  private readonly commandsMap = signal<Map<string, ResolvedCommand>>(new Map());
  private readonly shortcutIndex = new Map<string, string>();
  private readonly parsedShortcuts = new Map<string, ParsedShortcut>();
  private readonly boundHandleKeydown = (event: KeyboardEvent) => this.handleKeydown(event);
  private listenerAttached = false;

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
      this.parsedShortcuts.set(id, parseShortcut(resolved.shortcut, this.isMac));
      this.ensureListener();
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
        this.parsedShortcuts.delete(id);
      }
    };
  }

  execute(command: ResolvedCommand): void {
    try {
      const result = command.execute();
      if (result instanceof Promise) {
        result.catch((error) => console.error(`Command "${command.id}" failed:`, error));
      }
    } catch (error) {
      console.error(`Command "${command.id}" failed:`, error);
    }
  }

  ngOnDestroy(): void {
    if (this.listenerAttached) {
      this.document.removeEventListener('keydown', this.boundHandleKeydown);
    }
  }

  private ensureListener(): void {
    if (this.listenerAttached) {
      return;
    }
    this.listenerAttached = true;
    this.document.addEventListener('keydown', this.boundHandleKeydown);
  }

  private handleKeydown(event: KeyboardEvent): void {
    const editing = isEditableTarget(event.target);
    for (const [id, parsed] of this.parsedShortcuts) {
      if (editing && !parsed.hasModifier) {
        continue;
      }
      if (matchesShortcut(event, parsed)) {
        event.preventDefault();
        const command = this.commandsMap().get(id);
        if (command) {
          this.execute(command);
        }
        return;
      }
    }
  }
}
