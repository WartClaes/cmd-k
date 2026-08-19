export interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  hasModifier: boolean;
}

export function isMacPlatform(platform: string): boolean {
  return /mac/i.test(platform);
}

export function parseShortcut(shortcut: string, isMac: boolean): ParsedShortcut {
  const tokens = tokenize(shortcut);

  let ctrl = false;
  let meta = false;
  let alt = false;
  let shift = false;
  let key = '';

  for (const token of tokens) {
    switch (token) {
      case 'mod':
        if (isMac) {
          meta = true;
        } else {
          ctrl = true;
        }
        break;
      case 'ctrl':
      case 'control':
        ctrl = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
        meta = true;
        break;
      case 'alt':
      case 'option':
        alt = true;
        break;
      case 'shift':
        shift = true;
        break;
      default:
        key = token;
    }
  }

  return { key, ctrl, meta, alt, shift, hasModifier: ctrl || meta || alt };
}

function expectedCodesForKey(key: string): string[] | null {
  if (/^[a-z]$/.test(key)) {
    return [`Key${key.toUpperCase()}`];
  }
  if (/^[0-9]$/.test(key)) {
    // A digit can be pressed on the main row or the numeric keypad.
    return [`Digit${key}`, `Numpad${key}`];
  }
  return null;
}

export function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  const expectedCodes = expectedCodesForKey(parsed.key);
  const keyMatches = expectedCodes ? expectedCodes.includes(event.code) : event.key.toLowerCase() === parsed.key;
  return (
    keyMatches &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
}

const REQUIRED_MODIFIER_TOKENS = new Set(['mod', 'ctrl', 'control', 'meta', 'cmd', 'command', 'alt', 'option']);
const ALL_MODIFIER_TOKENS = new Set([...REQUIRED_MODIFIER_TOKENS, 'shift']);

function tokenize(shortcut: string): string[] {
  return shortcut
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

export function hasRequiredModifier(shortcut: string): boolean {
  return tokenize(shortcut).some((token) => REQUIRED_MODIFIER_TOKENS.has(token));
}

export function hasExactlyOneKey(shortcut: string): boolean {
  const keyTokens = tokenize(shortcut).filter((token) => !ALL_MODIFIER_TOKENS.has(token));
  return keyTokens.length === 1 && /^[a-z0-9]$/.test(keyTokens[0]);
}

export function formatShortcut(shortcut: string, isMac: boolean): string {
  const parsed = parseShortcut(shortcut, isMac);
  const key = parsed.key.toUpperCase();

  if (isMac) {
    // Apple's Human Interface Guidelines order for displaying multiple modifiers: ⌃⌥⇧⌘.
    const symbols = [parsed.ctrl && '⌃', parsed.alt && '⌥', parsed.shift && '⇧', parsed.meta && '⌘'].filter(
      (symbol): symbol is string => !!symbol,
    );
    return [...symbols, key].join('');
  }

  const labels = [parsed.ctrl && 'Ctrl', parsed.alt && 'Alt', parsed.shift && 'Shift', parsed.meta && 'Win'].filter(
    (label): label is string => !!label,
  );
  return [...labels, key].join('+');
}
