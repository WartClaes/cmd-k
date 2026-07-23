# ngx-cmdk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `ngx-cmdk`, an Angular library providing a Cmd/Ctrl+K command
palette that any component/service/guard anywhere in a consuming app can
register commands into via dependency injection, plus a small demo app that
exercises it end to end.

**Architecture:** An Angular CLI workspace with two projects: `ngx-cmdk` (the
publishable library — a signal-based `CommandRegistryService`, a real
keyboard-shortcut binding mechanism, a built-in fuzzy matcher, and a
`CmdkPaletteComponent` overlay) and `demo` (a standalone app that imports the
library and registers sample commands from multiple independent components to
prove decentralized registration works).

**Tech Stack:** Angular 22 (standalone components only, zoneless, signals
throughout, no NgModules, no zone.js), `ng-packagr` for the library build,
Vitest (via the `@angular/build:unit-test` builder) for tests, plain CSS with
custom properties for theming — no Angular Material/CDK.

**Spec:** [docs/superpowers/specs/2026-07-23-ngx-cmdk-design.md](../specs/2026-07-23-ngx-cmdk-design.md)

## Global Constraints

- **Node version: 24.18.0**, pinned via `.nvmrc`. Angular CLI's latest major
  (22.x) requires Node `^22.22.3 || ^24.15.0 || >=26.0.0` — verified empirically;
  none of the Node versions already installed on this machine satisfied that
  range, so 24.18.0 was installed via `nvm install 24`. Every task's shell
  commands assume `nvm use` has been run first in that shell.
- **Angular CLI/framework version: whatever `@angular/cli@latest` resolves to
  at scaffold time** (confirmed 22.0.7 during planning). Do not pin an older
  major — the file-naming conventions and defaults below are specific to this
  generation of the CLI (no `.component.ts`/`.service.ts` suffixes, no
  NgModules, Vitest instead of Karma, no zone.js).
- **Standalone only.** No `NgModule` anywhere in library or demo code.
- **Signals only** for reactive state in the public API and internals — no
  RxJS `Observable`/`Subject` in this library's own code.
- **No Angular Material, no CDK, no other UI/component-library dependency.**
  Styling is plain CSS using `--cmdk-*` custom properties.
- **Test runner is Vitest** (via `@angular/build:unit-test`), with
  `vitest/globals` enabled — `describe`/`it`/`expect`/`vi` are globals, do
  **not** import them from `'vitest'` in spec files (an explicit import
  alongside the global types causes a duplicate-identifier error).
- **jsdom does not implement `HTMLDialogElement.showModal()`.** Never use
  native `<dialog>` in the palette component; use a manually-managed overlay
  `<div>` (see spec's revised UI section).
- **The demo app resolves `import ... from 'ngx-cmdk'` via a TypeScript path
  mapping to `./dist/ngx-cmdk`** (confirmed in the generated root
  `tsconfig.json`), not to the library's source. **The library must be built
  (`npx ng build ngx-cmdk`) before the demo app will compile, serve, or run
  its tests.** Any task that touches the demo app must build the library
  first if it isn't already built.
- All shell commands below assume the working directory is the workspace
  root (`/Users/wart/git/personal/cmd-k`) unless stated otherwise.

---

### Task 1: Scaffold the Angular workspace, library, and demo app

**Files:**
- Create: `.nvmrc`
- Create: entire workspace scaffold (`angular.json`, `package.json`,
  `tsconfig.json`, `.gitignore`, `.editorconfig`, `.prettierrc`, `.vscode/*`)
- Create: `projects/ngx-cmdk/**` (library, with its placeholder
  `src/lib/ngx-cmdk.ts` / `.spec.ts` left in place for this task)
- Create: `projects/demo/**` (demo app)

**Interfaces:**
- Produces: a working workspace where `npx ng build ngx-cmdk`,
  `npx ng build demo`, `npx ng test ngx-cmdk --no-watch`, and
  `npx ng test demo --no-watch` all succeed. Later tasks build on this
  scaffold; none of its generated file contents are relied upon by name
  except `projects/ngx-cmdk/src/public-api.ts` (modified starting Task 2) and
  `projects/demo/src/app/{app.ts,app.html,app.css,app.config.ts,app.spec.ts}`
  (modified starting Task 9).

- [ ] **Step 1: Pin the Node version and switch to it**

```bash
echo "24.18.0" > .nvmrc
nvm install
nvm use
```

Expected: `nvm use` prints `Now using node v24.18.0 (npm v11.16.0)` (npm
version may differ slightly). If `nvm install` needs to download the
version, that's expected on a fresh machine.

- [ ] **Step 2: Scaffold the workspace in place**

```bash
npx -y @angular/cli@latest new cmd-k --directory=. --create-application=false --package-manager=npm --skip-git
```

Expected: a series of `CREATE` lines (`.prettierrc`, `README.md`,
`.editorconfig`, `.gitignore`, `angular.json`, `package.json`,
`tsconfig.json`, `.vscode/*`) followed by `✔ Packages installed
successfully.`. `--skip-git` is required — this directory already has its
own git history (the design spec commit); do not let this command touch git.
It tolerates the existing `docs/` folder and `.git` directory fine (verified
during planning).

- [ ] **Step 3: Generate the library**

```bash
npx ng generate library ngx-cmdk
```

Expected: `CREATE` lines under `projects/ngx-cmdk/...` including
`src/public-api.ts`, `src/lib/ngx-cmdk.ts`, `src/lib/ngx-cmdk.spec.ts`,
`ng-package.json`; `UPDATE` lines for `angular.json`, `package.json`,
`tsconfig.json`; ending with `✔ Packages installed successfully.`.

- [ ] **Step 4: Generate the demo app**

```bash
npx ng generate application demo --routing=false --style=css
```

Expected: `CREATE` lines under `projects/demo/...` including
`src/app/app.ts`, `src/app/app.html`, `src/app/app.css`,
`src/app/app.config.ts`, `src/app/app.spec.ts`, `src/main.ts`,
`src/index.html`; `UPDATE` lines for `angular.json`, `tsconfig.json`.

- [ ] **Step 5: Verify the library builds**

```bash
npx ng build ngx-cmdk
```

Expected: ends with `✔ Built ngx-cmdk` and a summary showing
`dist/ngx-cmdk` as the output path.

- [ ] **Step 6: Verify the demo app builds**

```bash
npx ng build demo
```

Expected: `Application bundle generation complete.` with a bundle size
summary, output location `dist/demo`.

- [ ] **Step 7: Verify the library's placeholder test passes**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  1 passed (1)` / `Tests  1 passed (1)`.

- [ ] **Step 8: Verify the demo app's placeholder tests pass**

```bash
npx ng test demo --no-watch
```

Expected: all tests reported pass, `0 failed`.

- [ ] **Step 9: Commit the scaffold**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Scaffold Angular workspace with ngx-cmdk library and demo app

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Command model and fuzzy matcher

**Files:**
- Create: `projects/ngx-cmdk/src/lib/command.model.ts`
- Create: `projects/ngx-cmdk/src/lib/fuzzy-match.ts`
- Test: `projects/ngx-cmdk/src/lib/fuzzy-match.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`
- Delete: `projects/ngx-cmdk/src/lib/ngx-cmdk.ts`,
  `projects/ngx-cmdk/src/lib/ngx-cmdk.spec.ts` (generated placeholder, no
  longer needed — deleted in the same task that replaces the test suite so
  the project never sits at zero tests between commits)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Command` interface, `ResolvedCommand` type (`Command & { id:
  string }`), `resolveLabel(command: Pick<Command, 'label'>): string`,
  `FuzzyMatch<T>` interface (`{ item: T; score: number }`),
  `fuzzyScore(query: string, text: string): number | null`,
  `fuzzySearch<T extends Pick<Command, 'label' | 'keywords'>>(query: string,
  items: readonly T[]): FuzzyMatch<T>[]`. Tasks 4, 7, and 9 depend on
  `Command`/`ResolvedCommand`; Task 7 depends on `fuzzySearch`/`FuzzyMatch`.

- [ ] **Step 1: Write the failing fuzzy-matcher tests**

Create `projects/ngx-cmdk/src/lib/fuzzy-match.spec.ts`:

```ts
import { fuzzyScore, fuzzySearch } from './fuzzy-match';
import type { Command } from './command.model';

describe('fuzzyScore', () => {
  it('returns 0 for an empty query', () => {
    expect(fuzzyScore('', 'Go to Settings')).toBe(0);
  });

  it('matches characters in order regardless of contiguity', () => {
    expect(fuzzyScore('gts', 'Go to Settings')).not.toBeNull();
  });

  it('returns null when a query character is missing from the text', () => {
    expect(fuzzyScore('xyz', 'Go to Settings')).toBeNull();
  });

  it('scores a contiguous match higher than a scattered match', () => {
    const contiguous = fuzzyScore('settings', 'Go to Settings')!;
    const scattered = fuzzyScore('gtins', 'Go to Settings')!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('SETTINGS', 'Go to Settings')).toBe(fuzzyScore('settings', 'Go to Settings'));
  });
});

describe('fuzzySearch', () => {
  const commands: Command[] = [
    { label: 'Go to Settings', execute: () => {}, keywords: ['preferences'] },
    { label: 'Create Project', execute: () => {} },
    { label: () => 'Dynamic Label', execute: () => {}, keywords: ['dynamic'] },
  ];

  it('returns all items in original order with score 0 when the query is empty', () => {
    const results = fuzzySearch('', commands);
    expect(results.map((r) => r.item)).toEqual(commands);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  it('matches against keywords even when the label does not match', () => {
    const results = fuzzySearch('preferences', commands);
    expect(results).toHaveLength(1);
    expect(results[0].item.label).toBe('Go to Settings');
  });

  it('resolves function labels before matching', () => {
    const results = fuzzySearch('dynamic', commands);
    expect(results).toHaveLength(1);
  });

  it('excludes items that do not match and sorts by score descending', () => {
    const results = fuzzySearch('create', commands);
    expect(results).toHaveLength(1);
    expect(results[0].item.label).toBe('Create Project');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './fuzzy-match'` (and `./command.model`
via the type-only import), since neither file exists yet.

- [ ] **Step 3: Write the command model**

Create `projects/ngx-cmdk/src/lib/command.model.ts`:

```ts
export interface Command {
  id?: string;
  label: string | (() => string);
  execute: () => void | Promise<void>;
  icon?: string;
  keywords?: string[];
  group?: string;
  shortcut?: string;
  priority?: number;
}

export type ResolvedCommand = Command & { id: string };

export function resolveLabel(command: Pick<Command, 'label'>): string {
  return typeof command.label === 'function' ? command.label() : command.label;
}
```

- [ ] **Step 4: Write the fuzzy matcher**

Create `projects/ngx-cmdk/src/lib/fuzzy-match.ts`:

```ts
import { resolveLabel, type Command } from './command.model';

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) {
    return 0;
  }

  let score = 0;
  let textIndex = 0;
  let consecutive = 0;

  for (const char of q) {
    const foundAt = t.indexOf(char, textIndex);
    if (foundAt === -1) {
      return null;
    }
    consecutive = foundAt === textIndex ? consecutive + 1 : 1;
    score += 1 + consecutive;
    if (foundAt === 0 || t[foundAt - 1] === ' ') {
      score += 2;
    }
    textIndex = foundAt + 1;
  }

  score += Math.max(0, 10 - (t.length - q.length));
  return score;
}

export function fuzzySearch<T extends Pick<Command, 'label' | 'keywords'>>(
  query: string,
  items: readonly T[],
): FuzzyMatch<T>[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return items.map((item) => ({ item, score: 0 }));
  }

  const matches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const label = resolveLabel(item);
    const scores = [fuzzyScore(trimmed, label), ...(item.keywords ?? []).map((k) => fuzzyScore(trimmed, k))].filter(
      (s): s is number => s !== null,
    );
    if (scores.length > 0) {
      matches.push({ item, score: Math.max(...scores) });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  1 passed (1)` / `Tests  9 passed (9)` (5 `fuzzyScore`
cases + 4 `fuzzySearch` cases).

- [ ] **Step 6: Remove the placeholder library files and export `Command`**

```bash
rm projects/ngx-cmdk/src/lib/ngx-cmdk.ts projects/ngx-cmdk/src/lib/ngx-cmdk.spec.ts
```

Replace the contents of `projects/ngx-cmdk/src/public-api.ts` with:

```ts
/*
 * Public API Surface of ngx-cmdk
 */

export type { Command } from './lib/command.model';
```

- [ ] **Step 7: Run the full library suite to confirm nothing broke**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  1 passed (1)` / `Tests  9 passed (9)` (the placeholder
spec is gone; only `fuzzy-match.spec.ts` remains at this point).

- [ ] **Step 8: Commit**

```bash
git add projects/ngx-cmdk/src/lib/command.model.ts \
        projects/ngx-cmdk/src/lib/fuzzy-match.ts \
        projects/ngx-cmdk/src/lib/fuzzy-match.spec.ts \
        projects/ngx-cmdk/src/public-api.ts
git add -u projects/ngx-cmdk/src/lib
git commit -m "$(cat <<'EOF'
Add Command model and built-in fuzzy matcher

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Shortcut parsing and matching

**Files:**
- Create: `projects/ngx-cmdk/src/lib/shortcut.ts`
- Test: `projects/ngx-cmdk/src/lib/shortcut.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ParsedShortcut` interface (`{ key: string; ctrl: boolean; meta:
  boolean; alt: boolean; shift: boolean; hasModifier: boolean }`),
  `parseShortcut(shortcut: string, isMac: boolean): ParsedShortcut`,
  `matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean`,
  `isEditableTarget(target: EventTarget | null): boolean`. Task 5 (registry
  shortcut listener) and Task 7 (palette open-shortcut) depend on all four.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/shortcut.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './shortcut'`.

- [ ] **Step 3: Write the implementation**

Create `projects/ngx-cmdk/src/lib/shortcut.ts`:

```ts
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
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  2 passed (2)` / `Tests  20 passed (20)` (9 from Task 2
+ 11 here: 4 `parseShortcut` + 3 `matchesShortcut` + 4 `isEditableTarget`).

- [ ] **Step 5: Commit**

```bash
git add projects/ngx-cmdk/src/lib/shortcut.ts projects/ngx-cmdk/src/lib/shortcut.spec.ts
git commit -m "$(cat <<'EOF'
Add shortcut string parsing and KeyboardEvent matching

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: CommandRegistryService — register/unregister core

**Files:**
- Create: `projects/ngx-cmdk/src/lib/command-registry.ts`
- Test: `projects/ngx-cmdk/src/lib/command-registry.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: `Command`, `ResolvedCommand` from `./command.model` (Task 2).
- Produces: `CommandRegistryService` (`@Injectable({ providedIn: 'root' })`)
  with `register(command: Command): () => void` and `readonly commands:
  Signal<readonly ResolvedCommand[]>`. Task 5 extends this same class with
  the live shortcut listener; Task 7 injects it and reads `.commands()`;
  Task 9's demo components inject it and call `.register()`.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/command-registry.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './command-registry'`.

- [ ] **Step 3: Write the implementation**

Create `projects/ngx-cmdk/src/lib/command-registry.ts`:

```ts
import { Injectable, computed, signal } from '@angular/core';
import type { Command, ResolvedCommand } from './command.model';

@Injectable({ providedIn: 'root' })
export class CommandRegistryService {
  private readonly commandsMap = signal<Map<string, ResolvedCommand>>(new Map());
  private readonly shortcutIndex = new Map<string, string>();

  readonly commands = computed<readonly ResolvedCommand[]>(() =>
    Array.from(this.commandsMap().values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  );

  register(command: Command): () => void {
    const id = command.id ?? crypto.randomUUID();
    if (this.commandsMap().has(id)) {
      throw new Error(`Command with id "${id}" is already registered`);
    }
    if (command.shortcut && this.shortcutIndex.has(command.shortcut)) {
      const existingId = this.shortcutIndex.get(command.shortcut);
      throw new Error(`Shortcut "${command.shortcut}" is already registered by command "${existingId}"`);
    }

    const resolved: ResolvedCommand = { ...command, id };
    this.commandsMap.update((map) => new Map(map).set(id, resolved));
    if (resolved.shortcut) {
      this.shortcutIndex.set(resolved.shortcut, id);
    }

    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.commandsMap.update((map) => {
        const next = new Map(map);
        next.delete(id);
        return next;
      });
      if (resolved.shortcut) {
        this.shortcutIndex.delete(resolved.shortcut);
      }
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  3 passed (3)` / `Tests  29 passed (29)` (20 from Tasks
2–3 + 9 here).

- [ ] **Step 5: Export the service from the public API**

Append to `projects/ngx-cmdk/src/public-api.ts`:

```ts
export { CommandRegistryService } from './lib/command-registry';
```

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/command-registry.ts \
        projects/ngx-cmdk/src/lib/command-registry.spec.ts \
        projects/ngx-cmdk/src/public-api.ts
git commit -m "$(cat <<'EOF'
Add CommandRegistryService register/unregister core

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Live shortcut execution in CommandRegistryService

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/command-registry.ts`
- Modify: `projects/ngx-cmdk/src/lib/command-registry.spec.ts`

**Interfaces:**
- Consumes: `parseShortcut`, `matchesShortcut`, `isEditableTarget`,
  `ParsedShortcut` from `./shortcut` (Task 3).
- Produces: adds a public `execute(command: ResolvedCommand): void` method to
  `CommandRegistryService` (catches synchronous throws and rejected
  Promises, logs via `console.error`) and live keydown-driven execution of
  registered shortcuts. Task 7/8's palette component calls `.execute()`
  instead of calling `command.execute()` directly, so error handling stays
  in one place.

- [ ] **Step 1: Write the failing tests**

Append to `projects/ngx-cmdk/src/lib/command-registry.spec.ts` (add a new
top-level `describe` block, after the existing one):

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — shortcuts never fire because no keydown listener exists yet
(the "executes the matching command" and related assertions fail).

- [ ] **Step 3: Write the implementation**

Replace `projects/ngx-cmdk/src/lib/command-registry.ts` with:

```ts
import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type { Command, ResolvedCommand } from './command.model';
import { isEditableTarget, matchesShortcut, parseShortcut, type ParsedShortcut } from './shortcut';

@Injectable({ providedIn: 'root' })
export class CommandRegistryService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly isMac = /mac/i.test(this.document.defaultView?.navigator.platform ?? '');
  private readonly commandsMap = signal<Map<string, ResolvedCommand>>(new Map());
  private readonly shortcutIndex = new Map<string, string>();
  private readonly parsedShortcuts = new Map<string, ParsedShortcut>();
  private readonly boundHandleKeydown = (event: KeyboardEvent) => this.handleKeydown(event);
  private listenerAttached = false;

  readonly commands = computed<readonly ResolvedCommand[]>(() =>
    Array.from(this.commandsMap().values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)),
  );

  register(command: Command): () => void {
    const id = command.id ?? crypto.randomUUID();
    if (this.commandsMap().has(id)) {
      throw new Error(`Command with id "${id}" is already registered`);
    }
    if (command.shortcut && this.shortcutIndex.has(command.shortcut)) {
      const existingId = this.shortcutIndex.get(command.shortcut);
      throw new Error(`Shortcut "${command.shortcut}" is already registered by command "${existingId}"`);
    }

    const resolved: ResolvedCommand = { ...command, id };
    this.commandsMap.update((map) => new Map(map).set(id, resolved));
    if (resolved.shortcut) {
      this.shortcutIndex.set(resolved.shortcut, id);
      this.parsedShortcuts.set(id, parseShortcut(resolved.shortcut, this.isMac));
      this.ensureListener();
    }

    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.commandsMap.update((map) => {
        const next = new Map(map);
        next.delete(id);
        return next;
      });
      if (resolved.shortcut) {
        this.shortcutIndex.delete(resolved.shortcut);
        this.parsedShortcuts.delete(id);
      }
    };
  }

  execute(command: ResolvedCommand): void {
    try {
      const result = command.execute();
      if (result instanceof Promise) {
        result.catch((error) => console.error(`Command "${command.id}" failed:`, error));
      }
    } catch (error) {
      console.error(`Command "${command.id}" failed:`, error);
    }
  }

  ngOnDestroy(): void {
    if (this.listenerAttached) {
      this.document.removeEventListener('keydown', this.boundHandleKeydown);
    }
  }

  private ensureListener(): void {
    if (this.listenerAttached) {
      return;
    }
    this.listenerAttached = true;
    this.document.addEventListener('keydown', this.boundHandleKeydown);
  }

  private handleKeydown(event: KeyboardEvent): void {
    const editing = isEditableTarget(event.target);
    for (const [id, parsed] of this.parsedShortcuts) {
      if (editing && !parsed.hasModifier) {
        continue;
      }
      if (matchesShortcut(event, parsed)) {
        event.preventDefault();
        const command = this.commandsMap().get(id);
        if (command) {
          this.execute(command);
        }
        return;
      }
    }
  }
}
```

Note: `ngOnDestroy` removing the listener is what keeps this testable —
Angular's `TestBed` tears down the environment injector (and calls
`ngOnDestroy` on root-provided services) between tests by default, so each
test's `beforeEach` starts from a service instance with no stray listener
left over from the previous test.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  3 passed (3)` / `Tests  34 passed (34)` (29 from
Tasks 2–4 + 5 here).

- [ ] **Step 5: Commit**

```bash
git add projects/ngx-cmdk/src/lib/command-registry.ts projects/ngx-cmdk/src/lib/command-registry.spec.ts
git commit -m "$(cat <<'EOF'
Wire live keyboard-shortcut execution into CommandRegistryService

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `provideCmdk()` configuration

**Files:**
- Create: `projects/ngx-cmdk/src/lib/cmdk-config.ts`
- Test: `projects/ngx-cmdk/src/lib/cmdk-config.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `CmdkConfig` interface (`{ shortcut: string }`),
  `DEFAULT_CMDK_CONFIG: CmdkConfig`, `CMDK_CONFIG: InjectionToken<CmdkConfig>`
  (factory-provided default), `provideCmdk(config?: Partial<CmdkConfig>):
  EnvironmentProviders`. Task 7's `CmdkPaletteComponent` injects `CMDK_CONFIG`
  to read the configured open-shortcut; Task 9's demo app calls
  `provideCmdk()` in `app.config.ts`.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/cmdk-config.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { CMDK_CONFIG, DEFAULT_CMDK_CONFIG, provideCmdk } from './cmdk-config';

describe('provideCmdk', () => {
  it('provides the default config when called with no arguments', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual(DEFAULT_CMDK_CONFIG);
  });

  it('overrides only the provided fields', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ shortcut: 'ctrl+p' })] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual({ shortcut: 'ctrl+p' });
  });
});

describe('CMDK_CONFIG default factory', () => {
  it('falls back to the default config when provideCmdk is never called', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(CMDK_CONFIG)).toEqual(DEFAULT_CMDK_CONFIG);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './cmdk-config'`.

- [ ] **Step 3: Write the implementation**

Create `projects/ngx-cmdk/src/lib/cmdk-config.ts`:

```ts
import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

export interface CmdkConfig {
  shortcut: string;
}

export const DEFAULT_CMDK_CONFIG: CmdkConfig = { shortcut: 'mod+k' };

export const CMDK_CONFIG = new InjectionToken<CmdkConfig>('CMDK_CONFIG', {
  factory: () => DEFAULT_CMDK_CONFIG,
});

export function provideCmdk(config: Partial<CmdkConfig> = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: { ...DEFAULT_CMDK_CONFIG, ...config } }]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  4 passed (4)` / `Tests  37 passed (37)` (34 from Tasks
2–5 + 3 here).

- [ ] **Step 5: Export from the public API**

Append to `projects/ngx-cmdk/src/public-api.ts`:

```ts
export { provideCmdk } from './lib/cmdk-config';
export type { CmdkConfig } from './lib/cmdk-config';
```

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-config.ts \
        projects/ngx-cmdk/src/lib/cmdk-config.spec.ts \
        projects/ngx-cmdk/src/public-api.ts
git commit -m "$(cat <<'EOF'
Add provideCmdk() app-level configuration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: CmdkPaletteComponent shell — open/close, filtering, grouping, focus

**Files:**
- Create: `projects/ngx-cmdk/src/lib/group-matches.ts`
- Test: `projects/ngx-cmdk/src/lib/group-matches.spec.ts`
- Create: `projects/ngx-cmdk/src/lib/cmdk-palette.ts`
- Create: `projects/ngx-cmdk/src/lib/cmdk-palette.html`
- Create: `projects/ngx-cmdk/src/lib/cmdk-palette.css`
- Test: `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: `CommandRegistryService` (Task 5), `fuzzySearch`/`FuzzyMatch`
  (Task 2), `CMDK_CONFIG` (Task 6), `parseShortcut`/`matchesShortcut` (Task
  3), `resolveLabel` (Task 2).
- Produces: `groupMatches<T extends Pick<Command, 'group' | 'label'>>(matches:
  readonly FuzzyMatch<T>[]): CommandGroup<T>[]` (`CommandGroup<T> = { name:
  string; matches: FuzzyMatch<T>[] }`); `CmdkPaletteComponent` (selector
  `ngx-cmdk-palette`) with open/close state, filtered+grouped rendering, and
  focus management. Task 8 adds keyboard navigation and full styling on top
  of this same component/template/stylesheet.

- [ ] **Step 1: Write the failing group-matches tests**

Create `projects/ngx-cmdk/src/lib/group-matches.spec.ts`:

```ts
import { groupMatches } from './group-matches';
import type { Command } from './command.model';
import type { FuzzyMatch } from './fuzzy-match';

function match(overrides: Partial<Command> = {}): FuzzyMatch<Command> {
  return { item: { label: 'Cmd', execute: () => {}, ...overrides }, score: 0 };
}

describe('groupMatches', () => {
  it('buckets matches under their declared group, preserving first-seen order', () => {
    const groups = groupMatches([
      match({ group: 'Actions', label: 'A' }),
      match({ group: 'Navigation', label: 'B' }),
      match({ group: 'Actions', label: 'C' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Actions', 'Navigation']);
    expect(groups[0].matches.map((m) => m.item.label)).toEqual(['A', 'C']);
  });

  it('buckets ungrouped matches under "Other"', () => {
    const groups = groupMatches([match({ label: 'A' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Other');
    expect(groups[0].matches[0].item.label).toBe('A');
  });

  it('returns an empty array for no matches', () => {
    expect(groupMatches([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './group-matches'`.

- [ ] **Step 3: Write group-matches.ts**

Create `projects/ngx-cmdk/src/lib/group-matches.ts`:

```ts
import type { Command } from './command.model';
import type { FuzzyMatch } from './fuzzy-match';

export interface CommandGroup<T> {
  name: string;
  matches: FuzzyMatch<T>[];
}

const UNGROUPED = 'Other';

export function groupMatches<T extends Pick<Command, 'group' | 'label'>>(
  matches: readonly FuzzyMatch<T>[],
): CommandGroup<T>[] {
  const groups = new Map<string, FuzzyMatch<T>[]>();
  for (const match of matches) {
    const name = match.item.group ?? UNGROUPED;
    const bucket = groups.get(name);
    if (bucket) {
      bucket.push(match);
    } else {
      groups.set(name, [match]);
    }
  }
  return Array.from(groups.entries()).map(([name, groupedMatches]) => ({ name, matches: groupedMatches }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  5 passed (5)` / `Tests  40 passed (40)` (37 from
Tasks 2–6 + 3 here).

- [ ] **Step 5: Write the failing palette component tests**

Create `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CmdkPaletteComponent } from './cmdk-palette';
import { CommandRegistryService } from './command-registry';
import { provideCmdk } from './cmdk-config';

describe('CmdkPaletteComponent', () => {
  let fixture: ComponentFixture<CmdkPaletteComponent>;
  let registry: CommandRegistryService;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    TestBed.configureTestingModule({
      imports: [CmdkPaletteComponent],
      providers: [provideCmdk({ shortcut: 'mod+k' })],
    });
    fixture = TestBed.createComponent(CmdkPaletteComponent);
    document.body.appendChild(fixture.nativeElement);
    registry = TestBed.inject(CommandRegistryService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function pressOpenShortcut(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    fixture.detectChanges();
  }

  it('is closed by default', () => {
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('opens when the configured shortcut is pressed', () => {
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).not.toBeNull();
  });

  it('moves focus to the search input when opened', () => {
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    expect(document.activeElement).toBe(input);
  });

  it('lists registered commands grouped by their group name', () => {
    registry.register({ id: 'a', label: 'Show Alert', execute: () => {}, group: 'Actions' });
    registry.register({ id: 'b', label: 'Go Home', execute: () => {}, group: 'Navigation' });
    pressOpenShortcut();
    const groupLabels = Array.from(fixture.nativeElement.querySelectorAll('.cmdk-group-label')).map(
      (el: Element) => el.textContent,
    );
    expect(groupLabels).toEqual(['Actions', 'Navigation']);
  });

  it('filters the list as the query changes', () => {
    registry.register({ id: 'a', label: 'Show Alert', execute: () => {} });
    registry.register({ id: 'b', label: 'Go Home', execute: () => {} });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'alert';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.cmdk-item')).map((el: Element) =>
      el.textContent?.trim(),
    );
    expect(items).toEqual(['Show Alert']);
  });

  it('closes and restores focus when the backdrop is clicked', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    pressOpenShortcut();
    const overlay: HTMLElement = fixture.nativeElement.querySelector('.cmdk-overlay');
    overlay.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './cmdk-palette'`.

- [ ] **Step 7: Write the component**

Create `projects/ngx-cmdk/src/lib/cmdk-palette.ts`:

```ts
import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { matchesShortcut, parseShortcut } from './shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = /mac/i.test(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
  protected readonly resolveLabel = resolveLabel;

  constructor() {
    this.document.addEventListener('keydown', (event) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    });

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });
  }

  protected open(): void {
    if (this.isOpen()) {
      return;
    }
    this.previouslyFocused = this.document.activeElement as HTMLElement | null;
    this.query.set('');
    this.isOpen.set(true);
  }

  protected close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
  }
}
```

Create `projects/ngx-cmdk/src/lib/cmdk-palette.html`:

```html
@if (isOpen()) {
  <div class="cmdk-overlay" role="presentation" (click)="close()">
    <div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette" (click)="$event.stopPropagation()">
      <input
        #searchInput
        class="cmdk-input"
        type="text"
        aria-label="Search commands"
        [value]="query()"
        (input)="onQueryChange($any($event.target).value)"
      />
      <div class="cmdk-list" role="listbox">
        @for (group of groups(); track group.name) {
          <div class="cmdk-group">
            <div class="cmdk-group-label">{{ group.name }}</div>
            @for (match of group.matches; track match.item.id) {
              <div class="cmdk-item" role="option">
                <span class="cmdk-item-label">{{ resolveLabel(match.item) }}</span>
                @if (match.item.shortcut) {
                  <span class="cmdk-shortcut">{{ match.item.shortcut }}</span>
                }
              </div>
            }
          </div>
        } @empty {
          <div class="cmdk-empty">No matching commands</div>
        }
      </div>
    </div>
  </div>
}
```

Create `projects/ngx-cmdk/src/lib/cmdk-palette.css`:

```css
:host {
  display: contents;
}
```

(Styling is filled in fully in Task 8 — this is intentionally minimal for now
so this task's tests only depend on structure, not appearance.)

- [ ] **Step 8: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  6 passed (6)` / `Tests  46 passed (46)` (40 from Tasks
2–6/Step 4 + 6 here).

- [ ] **Step 9: Export from the public API**

Append to `projects/ngx-cmdk/src/public-api.ts`:

```ts
export { CmdkPaletteComponent } from './lib/cmdk-palette';
```

- [ ] **Step 10: Commit**

```bash
git add projects/ngx-cmdk/src/lib/group-matches.ts \
        projects/ngx-cmdk/src/lib/group-matches.spec.ts \
        projects/ngx-cmdk/src/lib/cmdk-palette.ts \
        projects/ngx-cmdk/src/lib/cmdk-palette.html \
        projects/ngx-cmdk/src/lib/cmdk-palette.css \
        projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts \
        projects/ngx-cmdk/src/public-api.ts
git commit -m "$(cat <<'EOF'
Add CmdkPaletteComponent shell: open/close, filtering, grouping, focus

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Keyboard navigation, execution, and full styling

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.html`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.css`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`

**Interfaces:**
- Consumes: `CommandRegistryService.execute()` (Task 5), everything from
  Task 7.
- Produces: no new exports — this task completes `CmdkPaletteComponent`'s
  user-facing behavior (arrow-key navigation, Enter to execute, Escape to
  close, click-to-execute, full visual styling with `--cmdk-*` custom
  properties). This is the last change to this component before Task 9 wires
  it into the demo app.

- [ ] **Step 1: Write the failing tests**

Append to `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts` (inside the
existing `describe('CmdkPaletteComponent', ...)` block, after the last
existing `it(...)`):

```ts
  it('selects the first result by default and highlights it', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const selected = fixture.nativeElement.querySelector('.cmdk-item--selected');
    expect(selected?.textContent).toContain('Alpha');
  });

  it('moves the selection down and up with arrow keys', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-item--selected')?.textContent).toContain('Beta');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-item--selected')?.textContent).toContain('Alpha');
  });

  it('executes the selected command and closes on Enter', () => {
    const execute = vi.fn();
    registry.register({ id: 'a', label: 'Alpha', execute });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('closes without executing on Escape', () => {
    const execute = vi.fn();
    registry.register({ id: 'a', label: 'Alpha', execute });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(execute).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('executes a command when it is clicked', () => {
    const execute = vi.fn();
    registry.register({ id: 'a', label: 'Alpha', execute });
    pressOpenShortcut();
    const item: HTMLElement = fixture.nativeElement.querySelector('.cmdk-item');
    item.click();
    fixture.detectChanges();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when no commands match the query', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-empty')).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — no `.cmdk-item--selected` class exists yet, arrow/Enter/
Escape keys do nothing, clicking an item doesn't call `execute`.

- [ ] **Step 3: Update the component**

Replace `projects/ngx-cmdk/src/lib/cmdk-palette.ts` with:

```ts
import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { matchesShortcut, parseShortcut } from './shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = /mac/i.test(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
  protected readonly flatMatches = computed(() => this.groups().flatMap((g) => g.matches));
  protected readonly selectedCommand = computed(() => this.flatMatches()[this.selectedIndex()]?.item);
  protected readonly resolveLabel = resolveLabel;

  constructor() {
    this.document.addEventListener('keydown', (event) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    });

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });
  }

  protected open(): void {
    if (this.isOpen()) {
      return;
    }
    this.previouslyFocused = this.document.activeElement as HTMLElement | null;
    this.query.set('');
    this.selectedIndex.set(0);
    this.isOpen.set(true);
  }

  protected close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.selectedIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        const command = this.selectedCommand();
        if (command) {
          this.runSelected(command);
        }
        break;
      }
    }
  }

  protected runSelected(command: ResolvedCommand): void {
    this.registry.execute(command);
    this.close();
  }

  private moveSelection(delta: number): void {
    const count = this.flatMatches().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
}
```

- [ ] **Step 4: Update the template**

Replace `projects/ngx-cmdk/src/lib/cmdk-palette.html` with:

```html
@if (isOpen()) {
  <div class="cmdk-overlay" role="presentation" (click)="close()">
    <div
      class="cmdk-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      (click)="$event.stopPropagation()"
      (keydown)="onKeydown($event)"
    >
      <input
        #searchInput
        class="cmdk-input"
        type="text"
        aria-label="Search commands"
        [attr.aria-activedescendant]="selectedCommand() ? 'cmdk-item-' + selectedCommand()!.id : null"
        [value]="query()"
        (input)="onQueryChange($any($event.target).value)"
      />
      <div class="cmdk-list" role="listbox">
        @for (group of groups(); track group.name) {
          <div class="cmdk-group">
            <div class="cmdk-group-label">{{ group.name }}</div>
            @for (match of group.matches; track match.item.id) {
              <div
                [id]="'cmdk-item-' + match.item.id"
                class="cmdk-item"
                [class.cmdk-item--selected]="match.item.id === selectedCommand()?.id"
                role="option"
                [attr.aria-selected]="match.item.id === selectedCommand()?.id"
                (click)="runSelected(match.item)"
              >
                <span class="cmdk-item-label">{{ resolveLabel(match.item) }}</span>
                @if (match.item.shortcut) {
                  <span class="cmdk-shortcut">{{ match.item.shortcut }}</span>
                }
              </div>
            }
          </div>
        } @empty {
          <div class="cmdk-empty">No matching commands</div>
        }
      </div>
    </div>
  </div>
}
```

- [ ] **Step 5: Write the full stylesheet**

Replace `projects/ngx-cmdk/src/lib/cmdk-palette.css` with:

```css
:host {
  display: contents;
}

.cmdk-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: var(--cmdk-backdrop, rgba(0, 0, 0, 0.5));
  z-index: var(--cmdk-z-index, 1000);
}

.cmdk-panel {
  width: min(560px, 90vw);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--cmdk-bg, #fff);
  color: var(--cmdk-fg, #111);
  border-radius: var(--cmdk-radius, 8px);
  box-shadow: var(--cmdk-shadow, 0 16px 48px rgba(0, 0, 0, 0.24));
  overflow: hidden;
  font-family: var(--cmdk-font, inherit);
}

.cmdk-input {
  border: none;
  outline: none;
  padding: 16px;
  font-size: 16px;
  background: transparent;
  color: inherit;
  border-bottom: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
}

.cmdk-list {
  overflow-y: auto;
  padding: 8px 0;
}

.cmdk-group-label {
  padding: 8px 16px 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cmdk-muted, #888);
}

.cmdk-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
}

.cmdk-item--selected {
  background: var(--cmdk-accent, #eef2ff);
}

.cmdk-shortcut {
  font-size: 12px;
  color: var(--cmdk-muted, #888);
}

.cmdk-empty {
  padding: 16px;
  color: var(--cmdk-muted, #888);
  text-align: center;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  6 passed (6)` / `Tests  52 passed (52)` (46 from Task
7 + 6 here).

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-palette.ts \
        projects/ngx-cmdk/src/lib/cmdk-palette.html \
        projects/ngx-cmdk/src/lib/cmdk-palette.css \
        projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts
git commit -m "$(cat <<'EOF'
Add keyboard navigation, execution, and full styling to the palette

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire the demo app

**Files:**
- Create: `projects/demo/src/app/demo-activity-log.ts`
- Test: `projects/demo/src/app/demo-activity-log.spec.ts`
- Create: `projects/demo/src/app/demo-actions.ts`
- Create: `projects/demo/src/app/demo-actions.html`
- Create: `projects/demo/src/app/demo-actions.css`
- Test: `projects/demo/src/app/demo-actions.spec.ts`
- Create: `projects/demo/src/app/demo-nav.ts`
- Create: `projects/demo/src/app/demo-nav.html`
- Create: `projects/demo/src/app/demo-nav.css`
- Test: `projects/demo/src/app/demo-nav.spec.ts`
- Modify: `projects/demo/src/app/app.ts`
- Modify: `projects/demo/src/app/app.html`
- Modify: `projects/demo/src/app/app.css`
- Modify: `projects/demo/src/app/app.config.ts`
- Modify: `projects/demo/src/app/app.spec.ts`

**Interfaces:**
- Consumes: `CommandRegistryService`, `CmdkPaletteComponent`, `provideCmdk`
  from `ngx-cmdk` (the built library — see Global Constraints on the
  `./dist/ngx-cmdk` path mapping).
- Produces: a runnable demo proving registration from multiple independent
  components, grouping, a live shortcut, and error handling all work
  end-to-end. Nothing here is consumed by a later task — Task 10 only runs
  and exercises it.

- [ ] **Step 1: Build the library so `ngx-cmdk` resolves for the demo app**

```bash
npx ng build ngx-cmdk
```

Expected: ends with `✔ Built ngx-cmdk`.

- [ ] **Step 2: Write the failing activity log test**

Create `projects/demo/src/app/demo-activity-log.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { DemoActivityLog } from './demo-activity-log';

describe('DemoActivityLog', () => {
  it('prepends new entries and keeps only the most recent 10', () => {
    TestBed.configureTestingModule({});
    const log = TestBed.inject(DemoActivityLog);
    for (let i = 0; i < 12; i++) {
      log.log(`entry ${i}`);
    }
    expect(log.recent()).toHaveLength(10);
    expect(log.recent()[0]).toBe('entry 11');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx ng test demo --no-watch
```

Expected: FAIL — `Cannot find module './demo-activity-log'`.

- [ ] **Step 4: Write the activity log service**

Create `projects/demo/src/app/demo-activity-log.ts`:

```ts
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DemoActivityLog {
  private readonly entries = signal<string[]>([]);

  readonly recent = this.entries;

  log(message: string): void {
    this.entries.update((entries) => [message, ...entries].slice(0, 10));
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx ng test demo --no-watch
```

Expected: this test passes (other demo tests may still be red/absent at
this point — that's expected mid-task; the full suite is verified once all
demo pieces are wired in Step 12).

- [ ] **Step 6: Write the failing demo-actions test**

Create `projects/demo/src/app/demo-actions.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoActions } from './demo-actions';

describe('DemoActions', () => {
  it('registers the demo action commands on creation', () => {
    TestBed.configureTestingModule({ imports: [DemoActions] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoActions);
    fixture.detectChanges();
    const ids = registry.commands().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['demo-show-alert', 'demo-cause-error']));
  });

  it('unregisters its commands when destroyed', () => {
    TestBed.configureTestingModule({ imports: [DemoActions] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoActions);
    fixture.detectChanges();
    fixture.destroy();
    const ids = registry.commands().map((c) => c.id);
    expect(ids).not.toEqual(expect.arrayContaining(['demo-show-alert', 'demo-cause-error']));
  });
});
```

- [ ] **Step 7: Write demo-actions**

Create `projects/demo/src/app/demo-actions.ts`:

```ts
import { Component, DestroyRef, inject } from '@angular/core';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

@Component({
  selector: 'app-demo-actions',
  imports: [],
  templateUrl: './demo-actions.html',
  styleUrl: './demo-actions.css',
})
export class DemoActions {
  private readonly registry = inject(CommandRegistryService);
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const unregisterAlert = this.registry.register({
      id: 'demo-show-alert',
      label: 'Show Alert',
      group: 'Actions',
      shortcut: 'mod+j',
      execute: () => {
        this.log.log('Show Alert executed');
        window.alert('Hello from the command palette!');
      },
    });

    const unregisterError = this.registry.register({
      id: 'demo-cause-error',
      label: 'Cause Error',
      group: 'Actions',
      execute: () => {
        throw new Error('Intentional demo error');
      },
    });

    this.destroyRef.onDestroy(() => {
      unregisterAlert();
      unregisterError();
    });
  }
}
```

Create `projects/demo/src/app/demo-actions.html`:

```html
<section class="demo-panel">
  <h2>Actions panel</h2>
  <p>Registers "Show Alert" (⌘/Ctrl+J) and "Cause Error" into the command palette.</p>
</section>
```

Create `projects/demo/src/app/demo-actions.css`:

```css
.demo-panel {
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
```

- [ ] **Step 8: Run the demo-actions test to verify it passes**

```bash
npx ng test demo --no-watch
```

Expected: `DemoActions` tests pass.

- [ ] **Step 9: Write the failing demo-nav test**

Create `projects/demo/src/app/demo-nav.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoNav } from './demo-nav';

describe('DemoNav', () => {
  it('registers navigation commands and updates activeSection when executed', () => {
    TestBed.configureTestingModule({ imports: [DemoNav] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoNav);
    fixture.detectChanges();
    const commandA = registry.commands().find((c) => c.id === 'demo-go-section-a');
    commandA?.execute();
    expect(fixture.componentInstance['activeSection']()).toBe('A');
  });
});
```

- [ ] **Step 10: Write demo-nav**

Create `projects/demo/src/app/demo-nav.ts`:

```ts
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

@Component({
  selector: 'app-demo-nav',
  imports: [],
  templateUrl: './demo-nav.html',
  styleUrl: './demo-nav.css',
})
export class DemoNav {
  private readonly registry = inject(CommandRegistryService);
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeSection = signal('none');

  constructor() {
    const unregisterA = this.registry.register({
      id: 'demo-go-section-a',
      label: 'Go to Section A',
      group: 'Navigation',
      priority: 1,
      execute: () => {
        this.activeSection.set('A');
        this.log.log('Navigated to Section A');
      },
    });

    const unregisterB = this.registry.register({
      id: 'demo-go-section-b',
      label: 'Go to Section B',
      group: 'Navigation',
      execute: () => {
        this.activeSection.set('B');
        this.log.log('Navigated to Section B');
      },
    });

    this.destroyRef.onDestroy(() => {
      unregisterA();
      unregisterB();
    });
  }
}
```

Create `projects/demo/src/app/demo-nav.html`:

```html
<section class="demo-panel">
  <h2>Navigation panel</h2>
  <p>Active section: {{ activeSection() }}</p>
</section>
```

Create `projects/demo/src/app/demo-nav.css`:

```css
.demo-panel {
  padding: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
```

- [ ] **Step 11: Run the demo-nav test to verify it passes**

```bash
npx ng test demo --no-watch
```

Expected: `DemoNav` tests pass.

- [ ] **Step 12: Wire everything into the root App component**

Replace `projects/demo/src/app/app.config.ts` with:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideCmdk({ shortcut: 'mod+k' })],
};
```

Replace `projects/demo/src/app/app.ts` with:

```ts
import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);
}
```

Replace `projects/demo/src/app/app.html` with:

```html
<main class="demo-app">
  <h1>ngx-cmdk demo</h1>
  <p>Press <kbd>⌘/Ctrl</kbd> + <kbd>K</kbd> to open the command palette.</p>

  <app-demo-actions />
  <app-demo-nav />

  <section class="demo-panel">
    <h2>Activity log</h2>
    <ul>
      @for (entry of log.recent(); track $index) {
        <li>{{ entry }}</li>
      } @empty {
        <li>Nothing yet — try a command.</li>
      }
    </ul>
  </section>

  <ngx-cmdk-palette />
</main>
```

Replace `projects/demo/src/app/app.css` with:

```css
.demo-app {
  max-width: 640px;
  margin: 40px auto;
  padding: 0 16px;
  font-family: system-ui, sans-serif;
}

.demo-panel + .demo-panel {
  margin-top: 16px;
}
```

Replace `projects/demo/src/app/app.spec.ts` with:

```ts
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the demo heading', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('ngx-cmdk demo');
  });
});
```

- [ ] **Step 13: Run the full demo test suite**

```bash
npx ng test demo --no-watch
```

Expected: all test files pass, 0 failed (`DemoActivityLog`, `DemoActions`,
`DemoNav`, `App`).

- [ ] **Step 14: Commit**

```bash
git add projects/demo/src/app
git commit -m "$(cat <<'EOF'
Wire ngx-cmdk into the demo app across independent components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Final verification

**Files:** none created or modified — this task only runs and reads.

**Interfaces:** none — this is a verification pass over everything built in
Tasks 1–9.

- [ ] **Step 1: Run the full library test suite**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: `Test Files  6 passed (6)` / `Tests  52 passed (52)`.

- [ ] **Step 2: Rebuild the library and run the full demo test suite**

```bash
npx ng build ngx-cmdk
npx ng test demo --no-watch
```

Expected: library build ends with `✔ Built ngx-cmdk`; all demo tests pass,
0 failed.

- [ ] **Step 3: Verify the production builds succeed**

```bash
npx ng build ngx-cmdk --configuration production
npx ng build demo --configuration production
```

Expected: both end with success messages (`✔ Built ngx-cmdk`;
`Application bundle generation complete.`).

- [ ] **Step 4: Verify the public API surface**

Read `projects/ngx-cmdk/src/public-api.ts` and confirm it exports exactly:
`Command` (type), `CommandRegistryService`, `provideCmdk`, `CmdkConfig`
(type), `CmdkPaletteComponent` — and nothing from `fuzzy-match.ts`,
`shortcut.ts`, or `group-matches.ts` (those stay internal implementation
details).

- [ ] **Step 5: Manual smoke test in the browser**

In one terminal:

```bash
npx ng build ngx-cmdk --watch
```

In a second terminal:

```bash
npx ng serve demo
```

Open `http://localhost:4200` and walk through:
1. Press Cmd/Ctrl+K — palette opens, focus lands in the search input.
2. Type "alert" — only "Show Alert" (under "Actions") remains in the list.
3. Press Enter — a browser alert appears; after dismissing it, the palette
   is closed and the activity log shows "Show Alert executed".
4. Press Cmd/Ctrl+K, arrow down to "Cause Error", press Enter — palette
   closes, browser devtools console shows `Command "demo-cause-error"
   failed: Error: Intentional demo error`, and the activity log is
   unchanged (the command throws before logging anything).
5. Without opening the palette, press Cmd/Ctrl+J — "Show Alert" fires
   directly.
6. Press Cmd/Ctrl+K, then Escape — palette closes without executing
   anything.
7. Click the backdrop while the palette is open — palette closes.

- [ ] **Step 6: Commit (only if any of the above steps required a fix)**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Fix issues found during final verification

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

If nothing needed fixing, skip this step — there's nothing to commit.
