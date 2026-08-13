import { TestBed } from '@angular/core/testing';
import { CommandRegistryService } from './command-registry';
import type { Command } from './command.model';
import { provideCmdk } from './cmdk-config';

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

  it('throws when registering a shortcut without a modifier', () => {
    expect(() => service.register(makeCommand({ id: 'search', shortcut: 's' }))).toThrow(
      'Shortcut "s" must include a modifier (mod, ctrl, alt, or cmd)',
    );
  });

  it('throws when registering a shift-only shortcut', () => {
    expect(() => service.register(makeCommand({ id: 'search', shortcut: 'shift+p' }))).toThrow(
      'Shortcut "shift+p" must include a modifier (mod, ctrl, alt, or cmd)',
    );
  });

  it('throws when registering a shortcut with no key', () => {
    expect(() => service.register(makeCommand({ id: 'search', shortcut: 'mod' }))).toThrow(
      'Shortcut "mod" must have exactly one key in addition to its modifier(s)',
    );
  });

  it('throws when registering a shortcut with more than one key', () => {
    expect(() => service.register(makeCommand({ id: 'search', shortcut: 'mod+k+j' }))).toThrow(
      'Shortcut "mod+k+j" must have exactly one key in addition to its modifier(s)',
    );
  });

  it('throws when registering a shortcut that collides with the default open-shortcut', () => {
    expect(() => service.register(makeCommand({ id: 'x', shortcut: 'mod+k' }))).toThrow(
      'Shortcut "mod+k" collides with the configured open-shortcut "mod+k"',
    );
  });

  it('generates an id even when crypto.randomUUID is unavailable (e.g. an insecure context)', () => {
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('randomUUID is not available in this context');
    });
    try {
      service.register(makeCommand());
      expect(service.commands()[0].id).toBeTruthy();
    } finally {
      randomUUIDSpy.mockRestore();
    }
  });
});

describe('CommandRegistryService open-shortcut collision with a custom config', () => {
  it('collides against a non-default configured open-shortcut', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ shortcut: 'ctrl+p' })] });
    const service = TestBed.inject(CommandRegistryService);
    expect(() => service.register(makeCommand({ id: 'x', shortcut: 'ctrl+p' }))).toThrow(
      'Shortcut "ctrl+p" collides with the configured open-shortcut "ctrl+p"',
    );
  });
});

describe('CommandRegistryService.execute()', () => {
  let service: CommandRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommandRegistryService);
  });

  it('logs and swallows an error thrown by execute()', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const command = { ...makeCommand({ id: 'broken' }), id: 'broken', execute: () => {
      throw new Error('boom');
    } };
    expect(() => service.execute(command)).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logs and swallows a rejected promise returned by execute()', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const command = { ...makeCommand({ id: 'broken' }), id: 'broken', execute: () => Promise.reject(new Error('boom')) };
    service.execute(command);
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('CommandRegistryService.matchShortcut()', () => {
  let service: CommandRegistryService;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommandRegistryService);
  });

  it('returns the resolved command matching a keyboard event', () => {
    service.register(makeCommand({ id: 'save', shortcut: 'mod+s' }));
    const event = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true });
    expect(service.matchShortcut(event)?.id).toBe('save');
  });

  it('returns undefined when no registered shortcut matches', () => {
    service.register(makeCommand({ id: 'save', shortcut: 'mod+s' }));
    const event = new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', metaKey: true });
    expect(service.matchShortcut(event)).toBeUndefined();
  });

  it('treats equivalent modifier orderings as the same shortcut for collision detection', () => {
    service.register(makeCommand({ id: 'save', shortcut: 'mod+shift+p' }));
    expect(() => service.register(makeCommand({ id: 'other', shortcut: 'shift+mod+p' }))).toThrow(
      'Shortcut "shift+mod+p" is already registered by command "save"',
    );
  });
});
