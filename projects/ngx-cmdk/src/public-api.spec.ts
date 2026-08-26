import {
  CMDK_CONFIG,
  DEFAULT_CMDK_CONFIG,
  formatShortcut,
  isMacPlatform,
  MAX_FAVOURITE_ENTRIES,
  resolveLabel,
  type ParsedShortcut,
} from './public-api';

describe('public-api', () => {
  it('exports formatShortcut, usable to render a shortcut hint outside the library-internal components', () => {
    expect(formatShortcut('mod+k', true)).toBe('⌘K');
    expect(formatShortcut('mod+k', false)).toBe('Ctrl+K');
  });

  it('exports isMacPlatform, usable to decide which shortcut symbol set to render', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
  });

  it('exports resolveLabel, usable to safely read a possibly-function Command.label', () => {
    expect(resolveLabel({ label: 'Static' })).toBe('Static');
    expect(resolveLabel({ label: () => 'Dynamic' })).toBe('Dynamic');
  });

  it('exports MAX_FAVOURITE_ENTRIES, the favourites cap', () => {
    expect(MAX_FAVOURITE_ENTRIES).toBe(9);
  });

  it('exports the ParsedShortcut type, usable to type a value produced elsewhere', () => {
    const parsed: ParsedShortcut = { key: 'k', ctrl: false, meta: true, alt: false, shift: false, hasModifier: true };
    expect(parsed.key).toBe('k');
  });

  it('exports DEFAULT_CMDK_CONFIG, the config used when provideCmdk() is omitted', () => {
    expect(DEFAULT_CMDK_CONFIG).toEqual({ shortcut: 'mod+k', searchTimeoutMs: 5000 });
  });

  it('exports CMDK_CONFIG, the injection token consumers can use to read the resolved config', () => {
    expect(CMDK_CONFIG).toBeTruthy();
  });
});
