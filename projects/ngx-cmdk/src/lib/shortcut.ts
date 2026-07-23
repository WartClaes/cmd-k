export interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  hasModifier: boolean;
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

export function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  return (
    event.key.toLowerCase() === parsed.key &&
    event.ctrlKey === parsed.ctrl &&
    event.metaKey === parsed.meta &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!target.isContentEditable;
}
