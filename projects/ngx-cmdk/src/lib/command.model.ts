export interface Command {
  id?: string;
  label: string | (() => string);
  execute: () => void | Promise<void>;
  icon?: string;
  keywords?: string[];
  group?: string;
  shortcut?: string;
  priority?: number;
}

export type ResolvedCommand = Command & { id: string };

export function resolveLabel(command: Pick<Command, 'label'>): string {
  return typeof command.label === 'function' ? command.label() : command.label;
}
