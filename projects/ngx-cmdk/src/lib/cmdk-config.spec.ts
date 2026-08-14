import { TestBed } from '@angular/core/testing';
import { CMDK_CONFIG, DEFAULT_CMDK_CONFIG, provideCmdk } from './cmdk-config';

describe('provideCmdk', () => {
  it('provides the default config when called with no arguments', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual(DEFAULT_CMDK_CONFIG);
  });

  it('overrides only the provided fields', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ shortcut: 'ctrl+p' })] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual({ shortcut: 'ctrl+p', searchTimeoutMs: 5000 });
  });

  it('defaults searchTimeoutMs to 5000 when not overridden', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    expect(TestBed.inject(CMDK_CONFIG).searchTimeoutMs).toBe(5000);
  });

  it('overrides searchTimeoutMs when provided', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ searchTimeoutMs: 100 })] });
    expect(TestBed.inject(CMDK_CONFIG).searchTimeoutMs).toBe(100);
  });

  it('throws when given a shortcut without a modifier', () => {
    expect(() => provideCmdk({ shortcut: 'k' })).toThrow(
      'Shortcut "k" must include a modifier (mod, ctrl, alt, or cmd)',
    );
  });

  it('throws when given a shift-only shortcut', () => {
    expect(() => provideCmdk({ shortcut: 'shift+k' })).toThrow(
      'Shortcut "shift+k" must include a modifier (mod, ctrl, alt, or cmd)',
    );
  });

  it('throws when given a shortcut with no key', () => {
    expect(() => provideCmdk({ shortcut: 'mod' })).toThrow(
      'Shortcut "mod" must have exactly one key in addition to its modifier(s)',
    );
  });

  it('throws when given a shortcut with more than one key', () => {
    expect(() => provideCmdk({ shortcut: 'mod+k+j' })).toThrow(
      'Shortcut "mod+k+j" must have exactly one key in addition to its modifier(s)',
    );
  });

  it('throws when given a shortcut with a multi-character key (e.g. a missing "+")', () => {
    expect(() => provideCmdk({ shortcut: 'mod+kj' })).toThrow(
      'Shortcut "mod+kj" must have exactly one key in addition to its modifier(s)',
    );
  });
});

describe('CMDK_CONFIG default factory', () => {
  it('falls back to the default config when provideCmdk is never called', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(CMDK_CONFIG)).toEqual(DEFAULT_CMDK_CONFIG);
  });
});
