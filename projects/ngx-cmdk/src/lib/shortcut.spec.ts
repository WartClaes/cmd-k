import { isEditableTarget, matchesShortcut, parseShortcut } from './shortcut';

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
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(true);
  });

  it('does not match when an extra modifier is held', () => {
    const parsed = parseShortcut('mod+k', true);
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, shiftKey: true });
    expect(matchesShortcut(event, parsed)).toBe(false);
  });

  it('does not match a different key', () => {
    const parsed = parseShortcut('mod+k', true);
    const event = new KeyboardEvent('keydown', { key: 'j', metaKey: true });
    expect(matchesShortcut(event, parsed)).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it('returns true for an input element', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
  });

  it('returns true for a textarea element', () => {
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
  });

  it('returns false for a div', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEditableTarget(null)).toBe(false);
  });
});
