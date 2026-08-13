import { formatShortcut, hasExactlyOneKey, hasRequiredModifier, matchesShortcut, parseShortcut } from './shortcut';

describe('parseShortcut', () => {
  it('resolves "mod" to meta on Mac', () => {
    expect(parseShortcut('mod+k', true)).toEqual({
      key: 'k', ctrl: false, meta: true, alt: false, shift: false, hasModifier: true,
    });
  });

  it('resolves "mod" to ctrl on non-Mac', () => {
    expect(parseShortcut('mod+k', false)).toEqual({
      key: 'k', ctrl: true, meta: false, alt: false, shift: false, hasModifier: true,
    });
  });

  it('parses multiple modifiers', () => {
    expect(parseShortcut('mod+shift+p', true)).toEqual({
      key: 'p', ctrl: false, meta: true, alt: false, shift: true, hasModifier: true,
    });
  });

  it('marks a bare key as having no modifier', () => {
    expect(parseShortcut('s', true)).toEqual({
      key: 's', ctrl: false, meta: false, alt: false, shift: false, hasModifier: false,
    });
  });
});

describe('matchesShortcut', () => {
  it('matches when the key and all modifier flags line up', () => {
    const parsed = parseShortcut('mod+k', true);
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(true);
  });

  it('does not match when an extra modifier is held', () => {
    const parsed = parseShortcut('mod+k', true);
    const event = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, shiftKey: true });
    expect(matchesShortcut(event, parsed)).toBe(false);
  });

  it('does not match a different key', () => {
    const parsed = parseShortcut('mod+k', true);
    const event = new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(false);
  });

  it('matches a letter shortcut by physical key code, regardless of the composed character', () => {
    // On macOS, Option+C composes "ç" as event.key while event.code stays "KeyC".
    const parsed = parseShortcut('alt+c', true);
    const event = new KeyboardEvent('keydown', { key: 'ç', code: 'KeyC', altKey: true });
    expect(matchesShortcut(event, parsed)).toBe(true);
  });

  it('matches a shifted digit shortcut by physical key code, regardless of the composed character', () => {
    // Shift+1 composes "!" as event.key on a US layout while event.code stays "Digit1".
    const parsed = parseShortcut('mod+shift+1', true);
    const event = new KeyboardEvent('keydown', { key: '!', code: 'Digit1', metaKey: true, shiftKey: true });
    expect(matchesShortcut(event, parsed)).toBe(true);
  });
});

describe('hasRequiredModifier', () => {
  it('returns true for a mod combo', () => {
    expect(hasRequiredModifier('mod+k')).toBe(true);
  });

  it('returns true for an explicit ctrl/alt/cmd combo', () => {
    expect(hasRequiredModifier('ctrl+p')).toBe(true);
    expect(hasRequiredModifier('alt+shift+p')).toBe(true);
    expect(hasRequiredModifier('cmd+k')).toBe(true);
  });

  it('returns false for a bare key', () => {
    expect(hasRequiredModifier('s')).toBe(false);
  });

  it('returns false for a shift-only combo', () => {
    expect(hasRequiredModifier('shift+p')).toBe(false);
  });
});

describe('hasExactlyOneKey', () => {
  it('returns true for a single key with modifiers', () => {
    expect(hasExactlyOneKey('mod+shift+p')).toBe(true);
  });

  it('returns false when no key token is present', () => {
    expect(hasExactlyOneKey('mod')).toBe(false);
  });

  it('returns false when more than one key token is present', () => {
    expect(hasExactlyOneKey('mod+k+j')).toBe(false);
  });
});

describe('formatShortcut', () => {
  it('renders "mod" as the Cmd symbol on Mac', () => {
    expect(formatShortcut('mod+k', true)).toBe('⌘K');
  });

  it('renders "mod" as Ctrl on non-Mac', () => {
    expect(formatShortcut('mod+k', false)).toBe('Ctrl+K');
  });

  it('renders multiple modifiers as concatenated symbols in HIG order on Mac', () => {
    expect(formatShortcut('mod+shift+p', true)).toBe('⇧⌘P');
  });

  it('renders multiple modifiers as plus-joined labels on non-Mac', () => {
    expect(formatShortcut('mod+shift+p', false)).toBe('Ctrl+Shift+P');
  });

  it('renders an explicit ctrl+alt combo with the correct symbols on Mac', () => {
    expect(formatShortcut('ctrl+alt+k', true)).toBe('⌃⌥K');
  });

  it('renders an explicit ctrl+alt combo with the correct labels on non-Mac', () => {
    expect(formatShortcut('ctrl+alt+k', false)).toBe('Ctrl+Alt+K');
  });
});
