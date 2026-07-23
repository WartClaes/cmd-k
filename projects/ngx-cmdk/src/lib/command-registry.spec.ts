import { TestBed } from '@angular/core/testing';
import { CommandRegistryService } from './command-registry';
import type { Command } from './command.model';

function makeCommand(overrides: Partial<Command> = {}): Command {
  return { label: 'Test Command', execute: () => {}, ...overrides };
}

describe('CommandRegistryService', () => {
  let service: CommandRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommandRegistryService);
  });

  it('starts with no registered commands', () => {
    expect(service.commands()).toEqual([]);
  });

  it('registers a command and exposes it via commands()', () => {
    service.register(makeCommand({ id: 'save' }));
    expect(service.commands()).toHaveLength(1);
    expect(service.commands()[0].id).toBe('save');
  });

  it('auto-generates an id when none is provided', () => {
    service.register(makeCommand());
    expect(service.commands()[0].id).toBeTruthy();
  });

  it('throws when registering a duplicate id', () => {
    service.register(makeCommand({ id: 'save' }));
    expect(() => service.register(makeCommand({ id: 'save' }))).toThrow(
      'Command with id "save" is already registered',
    );
  });

  it('throws when registering a duplicate shortcut', () => {
    service.register(makeCommand({ id: 'save', shortcut: 'mod+s' }));
    expect(() => service.register(makeCommand({ id: 'other', shortcut: 'mod+s' }))).toThrow(
      'Shortcut "mod+s" is already registered by command "save"',
    );
  });

  it('removes the command when the returned unregister function is called', () => {
    const unregister = service.register(makeCommand({ id: 'save' }));
    unregister();
    expect(service.commands()).toEqual([]);
  });

  it('allows re-registering a shortcut after the original owner unregisters', () => {
    const unregister = service.register(makeCommand({ id: 'save', shortcut: 'mod+s' }));
    unregister();
    expect(() => service.register(makeCommand({ id: 'other', shortcut: 'mod+s' }))).not.toThrow();
  });

  it('is a no-op when unregister is called more than once', () => {
    const unregister = service.register(makeCommand({ id: 'save' }));
    unregister();
    expect(() => unregister()).not.toThrow();
    expect(service.commands()).toEqual([]);
  });

  it('sorts commands by priority, descending', () => {
    service.register(makeCommand({ id: 'low', priority: 1 }));
    service.register(makeCommand({ id: 'high', priority: 10 }));
    service.register(makeCommand({ id: 'mid', priority: 5 }));
    expect(service.commands().map((c) => c.id)).toEqual(['high', 'mid', 'low']);
  });
});
