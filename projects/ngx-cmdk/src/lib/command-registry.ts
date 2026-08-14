import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { Command, ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CmdkIssueService } from './cmdk-issue';
import {
  hasExactlyOneKey,
  hasRequiredModifier,
  isMacPlatform,
  matchesShortcut,
  parseShortcut,
  type ParsedShortcut,
} from './shortcut';

function canonicalShortcutKey(parsed: ParsedShortcut): string {
  return `${parsed.ctrl}|${parsed.meta}|${parsed.alt}|${parsed.shift}|${parsed.key}`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // crypto.randomUUID() is restricted to secure contexts; fall back below.
    }
  }
  return `cmdk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class CommandRegistryService {
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(CMDK_CONFIG);
  private readonly issues = inject(CmdkIssueService);
  private readonly isMac = isMacPlatform(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcutKey = canonicalShortcutKey(parseShortcut(this.config.shortcut, this.isMac));
  private readonly commandsMap = signal<Map<string, ResolvedCommand>>(new Map());
  private readonly shortcutIndex = new Map<string, string>();
  private readonly parsedShortcuts = new Map<string, ParsedShortcut>();

  readonly commands = computed<readonly ResolvedCommand[]>(() =>
    Array.from(this.commandsMap().values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  );

  register(command: Command): () => void {
    const id = command.id ?? generateId();
    if (this.commandsMap().has(id)) {
      throw new Error(`Command with id "${id}" is already registered`);
    }

    let parsedShortcut: ParsedShortcut | undefined;
    let shortcutKey: string | undefined;
    if (command.shortcut) {
      if (!hasRequiredModifier(command.shortcut)) {
        throw new Error(`Shortcut "${command.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
      }
      if (!hasExactlyOneKey(command.shortcut)) {
        throw new Error(`Shortcut "${command.shortcut}" must have exactly one key in addition to its modifier(s)`);
      }
      parsedShortcut = parseShortcut(command.shortcut, this.isMac);
      shortcutKey = canonicalShortcutKey(parsedShortcut);
      if (shortcutKey === this.openShortcutKey) {
        throw new Error(`Shortcut "${command.shortcut}" collides with the configured open-shortcut "${this.config.shortcut}"`);
      }
      if (this.shortcutIndex.has(shortcutKey)) {
        const existingId = this.shortcutIndex.get(shortcutKey);
        throw new Error(`Shortcut "${command.shortcut}" is already registered by command "${existingId}"`);
      }
    }

    const resolved: ResolvedCommand = { ...command, id };
    this.commandsMap.update((map) => new Map(map).set(id, resolved));
    if (parsedShortcut && shortcutKey) {
      this.shortcutIndex.set(shortcutKey, id);
      this.parsedShortcuts.set(id, parsedShortcut);
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
      if (shortcutKey) {
        this.shortcutIndex.delete(shortcutKey);
        this.parsedShortcuts.delete(id);
      }
    };
  }

  execute(command: ResolvedCommand): void {
    try {
      const result = command.execute();
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error(`Command "${command.id}" failed:`, error);
          this.issues.report({ source: 'command', commandId: command.id, error });
        });
      }
    } catch (error) {
      console.error(`Command "${command.id}" failed:`, error);
      this.issues.report({ source: 'command', commandId: command.id, error });
    }
  }

  matchShortcut(event: KeyboardEvent): ResolvedCommand | undefined {
    for (const [id, parsed] of this.parsedShortcuts) {
      if (matchesShortcut(event, parsed)) {
        return this.commandsMap().get(id);
      }
    }
    return undefined;
  }
}
