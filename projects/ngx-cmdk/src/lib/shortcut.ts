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
  const tokens = shortcut
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

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

function expectedCodeForKey(key: string): string | null {
  if (/^[a-z]$/.test(key)) {
    return `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`;
  }
  return null;
}

export function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  const expectedCode = expectedCodeForKey(parsed.key);
  const keyMatches = expectedCode ? event.code === expectedCode : event.key.toLowerCase() === parsed.key;
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
  return tokenize(shortcut).filter((token) => !ALL_MODIFIER_TOKENS.has(token)).length === 1;
}
