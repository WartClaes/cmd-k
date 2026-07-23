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

describe('CommandRegistryService shortcuts', () => {
  let service: CommandRegistryService;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommandRegistryService);
  });

  it('executes the matching command when its shortcut is pressed', () => {
    const execute = vi.fn();
    service.register(makeCommand({ id: 'save', shortcut: 'mod+s', execute }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true }));
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('prevents the default browser action when a shortcut matches', () => {
    service.register(makeCommand({ id: 'save', shortcut: 'mod+s' }));
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true, bubbles: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores a bare-key shortcut while an editable element is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const execute = vi.fn();
    service.register(makeCommand({ id: 'search', shortcut: 's', execute }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    expect(execute).not.toHaveBeenCalled();
    input.remove();
  });

  it('still fires a modifier shortcut while an editable element is focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const execute = vi.fn();
    service.register(makeCommand({ id: 'save', shortcut: 'mod+s', execute }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true }));
    expect(execute).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('logs and swallows an error thrown by execute()', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.register(
      makeCommand({
        id: 'broken',
        shortcut: 'mod+b',
        execute: () => {
          throw new Error('boom');
        },
      }),
    );
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true })),
    ).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
