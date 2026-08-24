# ngx-cmdk: Favourites & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-managed Favourites list (`{ label, path }` entries navigated via a host-supplied `navigate` callback, each with a positional `mod+1`…`mod+9` shortcut) and a Settings panel — a second view inside the same command palette, opened with `,` — where Favourites are added, removed, and reordered, alongside a "Clear recent searches" action.

**Architecture:** A new `FavouritesService` reuses the exact hardened persistence/reactivity design already proven for `RecentSearchesService` (effect-based reactive gate, per-mutator resync, blocked-storage guard, per-element read validation), capped at 9 entries since position determines shortcut. A new, library-internal `CmdkSettingsPanelComponent` renders two independently-gated sections and owns its own `stopPropagation()`-based keydown handling, fully decoupled from the main palette's `onKeydown()`. `CmdkPaletteComponent` gains a `settingsOpen` signal toggled by a query-empty-gated `,`, a Favourites section in the browse view folding into the existing `selectedIndex` mechanism, and `mod+1`…`mod+9` shortcut dispatch reusing the shortcut-matching machinery Commands already use.

**Tech Stack:** Angular 22 (standalone, signals, zoneless), Vitest with `vitest/globals` (`describe`/`it`/`expect`/`vi` are globals — never `import` them from `'vitest'`), `ng-packagr` for the library build, no RxJS in library code.

**Spec:** `docs/superpowers/specs/2026-08-19-ngx-cmdk-favourites-settings-design.md` (approved) — this plan implements it in full; executors should read both.

## Global Constraints

- No RxJS anywhere in `projects/ngx-cmdk` library code — signals only. Component outputs use the signal-based `output()` function, not `@Output() EventEmitter`.
- Standalone components only; no NgModules.
- Test files use Vitest globals (`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`) with no import from `'vitest'`.
- All new public types and services get exported from `projects/ngx-cmdk/src/public-api.ts` — **except** `CmdkSettingsPanelComponent`, which is deliberately library-internal and must NOT be added to `public-api.ts`.
- Every caught/handled error path logs via `console.error`/`console.warn` **and** reports through `CmdkIssueService.report()` — dual-channel, matching the existing convention.
- A favourite's position determines its shortcut (`mod+1` for the 1st, up to `mod+9` for the 9th) — the list is hard-capped at 9 entries for exactly this reason.
- Every new UI element reuses existing `--cmdk-*`-styleable classes where the existing `cmdk-palette.css` classes already fit (`.cmdk-group`, `.cmdk-group-label`, `.cmdk-item`, `.cmdk-item--selected`, `.cmdk-item-main`, `.cmdk-item-label`, `.cmdk-shortcut`) — the Favourites list in the main palette needs **no new CSS**. The Settings panel's own UI (rows, inputs, move/remove buttons, footer) is new and gets its own `cmdk-settings-panel.css`, following the same `--cmdk-*` custom-property convention.
- Before any Angular CLI command: `source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null` (each fresh Bash call is a new shell — this must run in every command block).
- Build the library before touching the demo app: `npx ng build ngx-cmdk` must succeed before any `projects/demo` build/serve/test, since the demo's tsconfig path-maps `ngx-cmdk` imports to `dist/ngx-cmdk`.
- Isolated worktree per this repo's established convention: `.worktrees/ngx-cmdk-favourites-settings` (gitignored), branch `ngx-cmdk-favourites-settings`, created via `git worktree add .worktrees/ngx-cmdk-favourites-settings -b ngx-cmdk-favourites-settings`, then `npm install` + baseline `npx ng build ngx-cmdk` + baseline `npx ng test ngx-cmdk` before any implementation work, run from inside the worktree.
- New library-internal folders follow the existing `lib/<feature>/` convention (`command/`, `search/`, `palette/`, `config/`, `issue/`, `shortcut/`): this plan adds `lib/favourites/` and `lib/settings/`.
- Never add a `Co-Authored-By: Claude` trailer to any commit message.

## Plan-Level Judgment Calls

The spec is authoritative on behavior; some internals are implementation-level decisions this plan makes explicitly, each consistent with the spec's stated contracts:

1. **Digit-shortcut rejection gets its own function and its own clear error message**, rather than just tightening `hasExactlyOneKey`'s regex and reusing its generic "must have exactly one key" message. A developer who writes `shortcut: 'mod+1'` and sees "must have exactly one key" would be confused — `mod+1` unambiguously has exactly one key token. Task 2 adds a new `usesDigitKey(shortcut: string): boolean` function alongside the regex tightening, checked at both call sites (`provideCmdk()`, `CommandRegistryService.register()`) *before* the generic check, with a message that names the actual reason: digits are reserved for favourites.
2. **`CmdkSettingsPanelComponent`'s two sections gate on the *current, live* return value of their governing callback** (`config.favouritesStorageKey?.() != null`), not merely on whether the field was configured at app startup. This matches the reactive hard-gate philosophy `RecentSearchesService.recent()` already established — a section correctly disappears mid-session if its key becomes unavailable (e.g. on logout), not just at first render.
3. **Existing favourite rows are visually styled as bordered inputs (matching the reference mockup) but are functionally read-only** — `FavouritesService` has no `update()`/rename method, and the spec's method surface (`add`/`remove`/`moveUp`/`moveDown`/`clear`) doesn't include one. Editing an existing favourite's label or path means removing it and adding it again. Adding an `update()` method was not asked for and would be scope creep.
4. **The bare `,` that closes Settings (mirroring the footer hint) only fires when the keydown's target isn't a text `<input>`.** The spec establishes that `,` opening Settings from the list view must not conflict with typing a real query that starts with a comma; the same conflict exists symmetrically inside Settings itself — a user typing a path like `/report?ids=1,2` into the Path field must get a literal comma, not have the whole panel close. `Escape` and the footer button remain the two conflict-free ways to close Settings.
5. **`CmdkPaletteComponent.open()` resets `settingsOpen` to `false`.** The spec doesn't call this out explicitly, but it clearly follows from the existing pattern — every other piece of transient view state (`query`, `selectedIndex`, `scopedProviderKey`, `searchResults`) already resets on `open()`, and a palette that reopens into a settings view left over from the previous session would be a visible bug.
6. **Selecting a favourite with no `navigate` configured reports a `favourite-navigate` `CmdkIssue`** (with a synthetic error explaining the missing callback) rather than silently doing nothing. A host app that configures `favouritesStorageKey` without `navigate` has a real misconfiguration worth surfacing through the same escape hatch every other failure mode already uses, rather than a silent no-op that's hard to debug.
7. **The demo's `navigate` wiring uses a small mutable indirection object** (`demoNavigateTarget`, exported from `app.config.ts`, its `.current` field overwritten by the root `App` component's constructor) rather than trying to close over an injected service directly inside the `provideCmdk()` call in `app.config.ts`. `app.config.ts`'s `providers` array is a plain object literal evaluated with no active Angular injection context — `inject(DemoActivityLog)` cannot be called there. The root component's constructor *does* have injection context (it already injects `DemoActivityLog` today), so it's the natural place to wire the real behavior in after the fact. This is also the same technique worth recommending to a real host app that needs `Router` (or any injectable) inside a `navigate` closure.
8. **`FavouritesService.add()`'s id generation duplicates `CommandRegistryService`'s existing `generateId()` helper** (with a different string prefix) rather than extracting a shared utility. Both are ~10-line, single-purpose functions; extracting a shared helper would mean modifying `command-registry.ts` for a purely-cosmetic DRY gain unrelated to this feature's goal, which the "don't propose unrelated refactoring" principle argues against.

---

### Task 1: `CmdkConfig`/`CmdkIssue` additions

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/config/cmdk-config.ts`
- Modify: `projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts`
- Modify: `projects/ngx-cmdk/src/lib/issue/cmdk-issue.ts`
- Modify: `projects/ngx-cmdk/src/lib/issue/cmdk-issue.spec.ts`

**Interfaces:**
- Produces: `CmdkConfig.favouritesStorageKey?: () => string | null`, `CmdkConfig.navigate?: (path: string) => void | Promise<void>`, and the `CmdkIssue` variant `{ source: 'favourite-navigate'; label: string; path: string; error: unknown }` — consumed by Tasks 3, 4, and 5.

- [ ] **Step 1: Write the failing tests**

Add to `projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts`, inside the existing `describe('provideCmdk', ...)` block, alongside the existing `recentSearchesStorageKey` test:

```ts
  it('accepts optional favouritesStorageKey and navigate, and leaves them unset by default', () => {
    const withFavourites = provideCmdk({ favouritesStorageKey: () => 'my-favourites-key', navigate: () => {} });
    const withoutFavourites = provideCmdk();
    expect(withFavourites).toBeTruthy();
    expect(withoutFavourites).toBeTruthy();
  });
```

Add to `projects/ngx-cmdk/src/lib/issue/cmdk-issue.spec.ts`, inside the existing `describe('CmdkIssueService', ...)` block, alongside the existing `recent-resolve` test:

```ts
  it('reports a favourite-navigate issue and delivers it to listeners', () => {
    const received: unknown[] = [];
    service.onIssue((issue) => received.push(issue));

    service.report({
      source: 'favourite-navigate',
      label: 'Production orders',
      path: '/production-orders',
      error: new Error('navigation failed'),
    });

    expect(received).toEqual([
      {
        source: 'favourite-navigate',
        label: 'Production orders',
        path: '/production-orders',
        error: new Error('navigation failed'),
      },
    ]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: FAIL — `favouritesStorageKey`/`navigate` aren't valid `CmdkConfig` properties yet, and `'favourite-navigate'` isn't a valid `CmdkIssue['source']` yet (TypeScript compile errors).

- [ ] **Step 3: Add the config fields**

In `projects/ngx-cmdk/src/lib/config/cmdk-config.ts`, change:

```ts
export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
}
```

to:

```ts
export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;
  navigate?: (path: string) => void | Promise<void>;
}
```

Leave `DEFAULT_CMDK_CONFIG`, `CMDK_CONFIG`, and `provideCmdk()` otherwise unchanged in this task (the digit-shortcut validation change to `provideCmdk()` is Task 2's job) — `{ ...DEFAULT_CMDK_CONFIG, ...config }` already spreads through new optional fields correctly.

- [ ] **Step 4: Add the `'favourite-navigate'` variant to `CmdkIssue`**

In `projects/ngx-cmdk/src/lib/issue/cmdk-issue.ts`, change the `CmdkIssue` union from:

```ts
export type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown };
```

to:

```ts
export type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown }
  | { source: 'favourite-navigate'; label: string; path: string; error: unknown };
```

Leave the rest of the file (the `@Injectable` class body) unchanged.

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: PASS, including both new tests.

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/config/cmdk-config.ts projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts projects/ngx-cmdk/src/lib/issue/cmdk-issue.ts projects/ngx-cmdk/src/lib/issue/cmdk-issue.spec.ts
git commit -m "Add favouritesStorageKey/navigate to CmdkConfig and a favourite-navigate CmdkIssue variant"
```

---

### Task 2: Reserve the digit-shortcut namespace

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/shortcut/shortcut.ts`
- Modify: `projects/ngx-cmdk/src/lib/shortcut/shortcut.spec.ts`
- Modify: `projects/ngx-cmdk/src/lib/config/cmdk-config.ts`
- Modify: `projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts`
- Modify: `projects/ngx-cmdk/src/lib/command/command-registry.ts`
- Modify: `projects/ngx-cmdk/src/lib/command/command-registry.spec.ts`

**Interfaces:**
- Produces: `usesDigitKey(shortcut: string): boolean` from `shortcut.ts` — consumed by `provideCmdk()` and `CommandRegistryService.register()` in this same task. `hasExactlyOneKey(shortcut: string): boolean`'s existing behavior changes (digits no longer count as a valid single key) but its name/signature are unchanged.
- Consumes: nothing new from other tasks.

- [ ] **Step 1: Write the failing tests**

Add to `projects/ngx-cmdk/src/lib/shortcut/shortcut.spec.ts`, inside the existing `describe('hasExactlyOneKey', ...)` block:

```ts
  it('returns false for a digit key', () => {
    expect(hasExactlyOneKey('mod+1')).toBe(false);
  });
```

Add a new top-level `describe` block, after the existing `hasExactlyOneKey` block:

```ts
describe('usesDigitKey', () => {
  it('returns true for a single digit key with modifiers', () => {
    expect(usesDigitKey('mod+1')).toBe(true);
  });

  it('returns false for a letter key', () => {
    expect(usesDigitKey('mod+k')).toBe(false);
  });

  it('returns false when no key token is present', () => {
    expect(usesDigitKey('mod')).toBe(false);
  });

  it('returns false when more than one key token is present', () => {
    expect(usesDigitKey('mod+1+2')).toBe(false);
  });
});
```

Update the file's import line at the top from:

```ts
import { formatShortcut, hasExactlyOneKey, hasRequiredModifier, matchesShortcut, parseShortcut } from './shortcut';
```

to:

```ts
import { formatShortcut, hasExactlyOneKey, hasRequiredModifier, matchesShortcut, parseShortcut, usesDigitKey } from './shortcut';
```

Add to `projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts`, inside the existing `describe('provideCmdk', ...)` block:

```ts
  it('throws when given a shortcut with a digit key', () => {
    expect(() => provideCmdk({ shortcut: 'mod+1' })).toThrow(
      'Shortcut "mod+1" cannot use a digit key — digits are reserved for favourite shortcuts (mod+1 through mod+9)',
    );
  });
```

Add to `projects/ngx-cmdk/src/lib/command/command-registry.spec.ts`, inside the existing top-level `describe('CommandRegistryService', ...)` block (alongside the other shortcut-validation `it`s):

```ts
  it('throws when registering a shortcut with a digit key', () => {
    expect(() => service.register(makeCommand({ id: 'search', shortcut: 'mod+1' }))).toThrow(
      'Shortcut "mod+1" cannot use a digit key — digits are reserved for favourite shortcuts (mod+1 through mod+9)',
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -80
```

Expected: FAIL — `usesDigitKey` doesn't exist yet; `hasExactlyOneKey('mod+1')` currently returns `true`; `provideCmdk({ shortcut: 'mod+1' })` and `service.register(... shortcut: 'mod+1' ...)` currently succeed instead of throwing.

- [ ] **Step 3: Implement `usesDigitKey` and tighten `hasExactlyOneKey`**

In `projects/ngx-cmdk/src/lib/shortcut/shortcut.ts`, change:

```ts
export function hasExactlyOneKey(shortcut: string): boolean {
  const keyTokens = tokenize(shortcut).filter((token) => !ALL_MODIFIER_TOKENS.has(token));
  return keyTokens.length === 1 && /^[a-z0-9]$/.test(keyTokens[0]);
}
```

to:

```ts
export function hasExactlyOneKey(shortcut: string): boolean {
  const keyTokens = tokenize(shortcut).filter((token) => !ALL_MODIFIER_TOKENS.has(token));
  return keyTokens.length === 1 && /^[a-z]$/.test(keyTokens[0]);
}

export function usesDigitKey(shortcut: string): boolean {
  const keyTokens = tokenize(shortcut).filter((token) => !ALL_MODIFIER_TOKENS.has(token));
  return keyTokens.length === 1 && /^[0-9]$/.test(keyTokens[0]);
}
```

Leave every other function in the file — including `expectedCodesForKey`, `matchesShortcut`, `parseShortcut`, and `formatShortcut` — completely unchanged. These stay digit-capable: favourite shortcuts (`mod+1`…`mod+9`) are constructed and matched directly via `parseShortcut`/`matchesShortcut` in Task 5, bypassing `hasExactlyOneKey`/`usesDigitKey` entirely (those two functions gate only *Command*/*palette-open* shortcut registration, not the library's own internal favourite-shortcut computation).

- [ ] **Step 4: Wire the digit check into `provideCmdk()`**

In `projects/ngx-cmdk/src/lib/config/cmdk-config.ts`, change the import line from:

```ts
import { hasExactlyOneKey, hasRequiredModifier } from '../shortcut/shortcut';
```

to:

```ts
import { hasExactlyOneKey, hasRequiredModifier, usesDigitKey } from '../shortcut/shortcut';
```

and change `provideCmdk()` from:

```ts
export function provideCmdk(config: Partial<CmdkConfig> = {}): EnvironmentProviders {
  const merged = { ...DEFAULT_CMDK_CONFIG, ...config };
  if (!hasRequiredModifier(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
  }
  if (!hasExactlyOneKey(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must have exactly one key in addition to its modifier(s)`);
  }
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: merged }]);
}
```

to:

```ts
export function provideCmdk(config: Partial<CmdkConfig> = {}): EnvironmentProviders {
  const merged = { ...DEFAULT_CMDK_CONFIG, ...config };
  if (!hasRequiredModifier(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
  }
  if (usesDigitKey(merged.shortcut)) {
    throw new Error(
      `Shortcut "${merged.shortcut}" cannot use a digit key — digits are reserved for favourite shortcuts (mod+1 through mod+9)`,
    );
  }
  if (!hasExactlyOneKey(merged.shortcut)) {
    throw new Error(`Shortcut "${merged.shortcut}" must have exactly one key in addition to its modifier(s)`);
  }
  return makeEnvironmentProviders([{ provide: CMDK_CONFIG, useValue: merged }]);
}
```

- [ ] **Step 5: Wire the digit check into `CommandRegistryService.register()`**

In `projects/ngx-cmdk/src/lib/command/command-registry.ts`, change the import block from:

```ts
import {
  hasExactlyOneKey,
  hasRequiredModifier,
  isMacPlatform,
  matchesShortcut,
  parseShortcut,
  type ParsedShortcut,
} from '../shortcut/shortcut';
```

to:

```ts
import {
  hasExactlyOneKey,
  hasRequiredModifier,
  isMacPlatform,
  matchesShortcut,
  parseShortcut,
  usesDigitKey,
  type ParsedShortcut,
} from '../shortcut/shortcut';
```

and change the shortcut-validation block inside `register()` from:

```ts
    if (command.shortcut) {
      if (!hasRequiredModifier(command.shortcut)) {
        throw new Error(`Shortcut "${command.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
      }
      if (!hasExactlyOneKey(command.shortcut)) {
        throw new Error(`Shortcut "${command.shortcut}" must have exactly one key in addition to its modifier(s)`);
      }
```

to:

```ts
    if (command.shortcut) {
      if (!hasRequiredModifier(command.shortcut)) {
        throw new Error(`Shortcut "${command.shortcut}" must include a modifier (mod, ctrl, alt, or cmd)`);
      }
      if (usesDigitKey(command.shortcut)) {
        throw new Error(
          `Shortcut "${command.shortcut}" cannot use a digit key — digits are reserved for favourite shortcuts (mod+1 through mod+9)`,
        );
      }
      if (!hasExactlyOneKey(command.shortcut)) {
        throw new Error(`Shortcut "${command.shortcut}" must have exactly one key in addition to its modifier(s)`);
      }
```

The rest of `register()` (everything after this block) is unchanged.

- [ ] **Step 6: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -80
```

Expected: PASS — including every pre-existing shortcut/command-registry/config test (none of them register a digit-only shortcut, so none are affected by the tightened validation).

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/shortcut/shortcut.ts projects/ngx-cmdk/src/lib/shortcut/shortcut.spec.ts projects/ngx-cmdk/src/lib/config/cmdk-config.ts projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts projects/ngx-cmdk/src/lib/command/command-registry.ts projects/ngx-cmdk/src/lib/command/command-registry.spec.ts
git commit -m "Reserve digit-key shortcuts for favourites; reject them from Command/palette shortcuts"
```

---

### Task 3: `FavouritesService`

**Files:**
- Create: `projects/ngx-cmdk/src/lib/favourites/favourites.ts`
- Create: `projects/ngx-cmdk/src/lib/favourites/favourites.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: `CMDK_CONFIG`/`CmdkConfig.favouritesStorageKey` (Task 1).
- Produces:
  - `interface FavouriteEntry { id: string; label: string; path: string; }`
  - `class FavouritesService { readonly favourites: Signal<readonly FavouriteEntry[]>; add(label: string, path: string): void; remove(id: string): void; moveUp(id: string): void; moveDown(id: string): void; clear(): void; }`

  Both exported from `public-api.ts`, consumed by Tasks 4 and 5.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/favourites/favourites.spec.ts`:

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FavouritesService } from './favourites';
import { provideCmdk } from '../config/cmdk-config';

function setup(storageKey: () => string | null): FavouritesService {
  TestBed.configureTestingModule({
    providers: [provideCmdk({ favouritesStorageKey: storageKey })],
  });
  return TestBed.inject(FavouritesService);
}

describe('FavouritesService', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('favourites() is empty with no storage key configured', () => {
    const service = setup(() => null);
    expect(service.favourites()).toEqual([]);
  });

  it('add() is a no-op when there is no storage key', () => {
    const service = setup(() => null);
    service.add('Production orders', '/production-orders');
    expect(service.favourites()).toEqual([]);
    expect(localStorage.getItem('favs')).toBeNull();
  });

  it('add() is a no-op when the label is empty or whitespace-only', () => {
    const service = setup(() => 'favs');
    service.add('   ', '/path');
    expect(service.favourites()).toEqual([]);
  });

  it('add() is a no-op when the path is empty or whitespace-only', () => {
    const service = setup(() => 'favs');
    service.add('Label', '   ');
    expect(service.favourites()).toEqual([]);
  });

  it('adds a favourite with a trimmed label/path and round-trips through localStorage', () => {
    const service = setup(() => 'favs');
    service.add('  Production orders  ', '  /production-orders  ');

    expect(service.favourites()).toEqual([
      { id: expect.any(String), label: 'Production orders', path: '/production-orders' },
    ]);
    const stored = JSON.parse(localStorage.getItem('favs')!);
    expect(stored).toEqual(service.favourites());
  });

  it('appends new favourites after existing ones, preserving order', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    expect(service.favourites().map((f) => f.label)).toEqual(['First', 'Second']);
  });

  it('refuses a 10th favourite once 9 are already present', () => {
    const service = setup(() => 'favs');
    for (let i = 0; i < 9; i++) {
      service.add(`Item ${i}`, `/item-${i}`);
    }
    expect(service.favourites()).toHaveLength(9);

    service.add('Tenth', '/tenth');

    expect(service.favourites()).toHaveLength(9);
    expect(service.favourites().map((f) => f.label)).not.toContain('Tenth');
  });

  it('remove() removes the matching entry by id and persists the change', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const idToRemove = service.favourites()[0].id;

    service.remove(idToRemove);

    expect(service.favourites().map((f) => f.label)).toEqual(['Second']);
    const stored = JSON.parse(localStorage.getItem('favs')!);
    expect(stored.map((f: { label: string }) => f.label)).toEqual(['Second']);
  });

  it('moveUp() swaps an entry with its predecessor', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const secondId = service.favourites()[1].id;

    service.moveUp(secondId);

    expect(service.favourites().map((f) => f.label)).toEqual(['Second', 'First']);
  });

  it('moveUp() on the first entry is a no-op', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const firstId = service.favourites()[0].id;

    service.moveUp(firstId);

    expect(service.favourites().map((f) => f.label)).toEqual(['First', 'Second']);
  });

  it('moveDown() swaps an entry with its successor', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const firstId = service.favourites()[0].id;

    service.moveDown(firstId);

    expect(service.favourites().map((f) => f.label)).toEqual(['Second', 'First']);
  });

  it('moveDown() on the last entry is a no-op', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const secondId = service.favourites()[1].id;

    service.moveDown(secondId);

    expect(service.favourites().map((f) => f.label)).toEqual(['First', 'Second']);
  });

  it('reactively collapses to [] when the storage key becomes unavailable, and restores it when available again', () => {
    const key = signal<string | null>('favs');
    const service = setup(() => key());
    service.add('First', '/first');
    expect(service.favourites()).toHaveLength(1);

    key.set(null);
    TestBed.tick();
    expect(service.favourites()).toEqual([]);

    key.set('favs');
    TestBed.tick();
    expect(service.favourites()).toHaveLength(1);
  });

  it('a different key reads/writes independently of the previous key', () => {
    const key = signal('favs-a');
    const service = setup(() => key());
    service.add('A-item', '/a');

    key.set('favs-b');
    TestBed.tick();
    expect(service.favourites()).toEqual([]);
    service.add('B-item', '/b');
    expect(service.favourites().map((f) => f.label)).toEqual(['B-item']);

    key.set('favs-a');
    TestBed.tick();
    expect(service.favourites().map((f) => f.label)).toEqual(['A-item']);
  });

  it('clear() resyncs to the current key before acting, so a later key switch back does not resurrect stale state', () => {
    const key = signal('favs-a');
    const service = setup(() => key());
    service.add('First', '/first');

    key.set('favs-b');
    service.clear();

    key.set('favs-a');
    TestBed.tick();

    expect(service.favourites()).toHaveLength(1);
  });

  it('treats malformed JSON at the configured key as no persisted favourites', () => {
    localStorage.setItem('favs', 'not valid json{{{');
    const service = setup(() => 'favs');
    expect(service.favourites()).toEqual([]);
  });

  it('filters out malformed elements in an otherwise-valid persisted array', () => {
    localStorage.setItem(
      'favs',
      JSON.stringify([null, { id: 'a', label: 'Valid', path: '/valid' }, { missingFields: true }]),
    );
    const service = setup(() => 'favs');
    expect(service.favourites()).toEqual([{ id: 'a', label: 'Valid', path: '/valid' }]);
  });

  it('caps a persisted array at 9 entries on read', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}`, label: `Item ${i}`, path: `/item-${i}` }));
    localStorage.setItem('favs', JSON.stringify(entries));
    const service = setup(() => 'favs');
    expect(service.favourites()).toHaveLength(9);
  });

  it('degrades gracefully when localStorage access throws', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      const service = setup(() => 'favs');
      expect(service.favourites()).toEqual([]);
      expect(() => service.add('Label', '/path')).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
  });

  it('clear() empties the in-memory list and the current key storage', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');

    service.clear();

    expect(service.favourites()).toEqual([]);
    expect(localStorage.getItem('favs')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: FAIL — `./favourites` module doesn't exist yet.

- [ ] **Step 3: Implement `FavouritesService`**

Create `projects/ngx-cmdk/src/lib/favourites/favourites.ts`:

```ts
import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';

export interface FavouriteEntry {
  id: string;
  label: string;
  path: string;
}

const MAX_FAVOURITE_ENTRIES = 9;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // crypto.randomUUID() is restricted to secure contexts; fall back below.
    }
  }
  return `cmdk-fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class FavouritesService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly localStorageRef = (() => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage;
    } catch {
      return undefined;
    }
  })();
  private readonly entriesSignal = signal<FavouriteEntry[]>([]);
  private syncedKey: string | null = null;

  readonly favourites = this.entriesSignal.asReadonly();

  constructor() {
    this.ensureSyncedToCurrentKey();

    effect(() => {
      this.config.favouritesStorageKey?.();
      this.ensureSyncedToCurrentKey();
    });
  }

  add(label: string, path: string): void {
    const trimmedLabel = label.trim();
    const trimmedPath = path.trim();
    if (!trimmedLabel || !trimmedPath) {
      return;
    }
    const key = this.currentKey();
    if (!key) {
      return;
    }
    this.ensureSyncedToCurrentKey();
    if (this.entriesSignal().length >= MAX_FAVOURITE_ENTRIES) {
      return;
    }

    const next = [...this.entriesSignal(), { id: generateId(), label: trimmedLabel, path: trimmedPath }];
    this.entriesSignal.set(next);
    this.writeToStorage(key, next);
  }

  remove(id: string): void {
    this.ensureSyncedToCurrentKey();
    const next = this.entriesSignal().filter((entry) => entry.id !== id);
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  moveUp(id: string): void {
    this.ensureSyncedToCurrentKey();
    const entries = this.entriesSignal();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index <= 0) {
      return;
    }
    const next = [...entries];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  moveDown(id: string): void {
    this.ensureSyncedToCurrentKey();
    const entries = this.entriesSignal();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index === -1 || index >= entries.length - 1) {
      return;
    }
    const next = [...entries];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  clear(): void {
    this.ensureSyncedToCurrentKey();
    this.entriesSignal.set([]);
    const key = this.currentKey();
    if (key) {
      this.localStorageRef?.removeItem(key);
    }
  }

  private currentKey(): string | null {
    return this.config.favouritesStorageKey?.() ?? null;
  }

  private ensureSyncedToCurrentKey(): void {
    const key = this.currentKey();
    if (key === this.syncedKey) {
      return;
    }
    this.syncedKey = key;
    this.entriesSignal.set(key ? this.readFromStorage(key) : []);
  }

  private readFromStorage(key: string): FavouriteEntry[] {
    const raw = this.localStorageRef?.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is FavouriteEntry =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as FavouriteEntry).id === 'string' &&
            typeof (entry as FavouriteEntry).label === 'string' &&
            typeof (entry as FavouriteEntry).path === 'string',
        )
        .slice(0, MAX_FAVOURITE_ENTRIES);
    } catch (error) {
      console.warn(`Failed to parse favourites from localStorage key "${key}":`, error);
      return [];
    }
  }

  private writeToStorage(key: string, entries: FavouriteEntry[]): void {
    try {
      this.localStorageRef?.setItem(key, JSON.stringify(entries));
    } catch (error) {
      console.warn(`Failed to write favourites to localStorage key "${key}":`, error);
    }
  }
}
```

- [ ] **Step 4: Export the new service and type from `public-api.ts`**

In `projects/ngx-cmdk/src/public-api.ts`, add these two lines (alongside the existing search/recent-searches exports):

```ts
export { FavouritesService } from './lib/favourites/favourites';
export type { FavouriteEntry } from './lib/favourites/favourites';
```

The full file should now read:

```ts
/*
 * Public API Surface of ngx-cmdk
 */

export type { Command, ResolvedCommand } from './lib/command/command.model';
export { CommandRegistryService } from './lib/command/command-registry';
export { provideCmdk } from './lib/config/cmdk-config';
export type { CmdkConfig } from './lib/config/cmdk-config';
export { CmdkPaletteComponent } from './lib/palette/cmdk-palette';
export { CmdkIssueService } from './lib/issue/cmdk-issue';
export type { CmdkIssue } from './lib/issue/cmdk-issue';
export type { SearchProvider, SearchResult } from './lib/search/search.model';
export { SearchRegistryService } from './lib/search/search-registry';
export { RecentSearchesService } from './lib/search/recent-searches';
export type { RecentSearchEntry } from './lib/search/recent-searches';
export { FavouritesService } from './lib/favourites/favourites';
export type { FavouriteEntry } from './lib/favourites/favourites';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: PASS, all new `favourites.spec.ts` tests green.

- [ ] **Step 6: Build the library to verify the public API surface compiles**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/favourites/favourites.ts projects/ngx-cmdk/src/lib/favourites/favourites.spec.ts projects/ngx-cmdk/src/public-api.ts
git commit -m "Add FavouritesService"
```

---

### Task 4: `CmdkSettingsPanelComponent`

**Files:**
- Create: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.ts`
- Create: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html`
- Create: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.css`
- Create: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.spec.ts`

**Interfaces:**
- Consumes: `FavouritesService` (Task 3), `RecentSearchesService` (already shipped), `CMDK_CONFIG` (Task 1's new fields).
- Produces: `CmdkSettingsPanelComponent` with selector `ngx-cmdk-settings-panel` and a single signal-based output `close: OutputEmitterRef<void>` — consumed by Task 5. **Not exported from `public-api.ts`** — it's imported directly by relative path from `cmdk-palette.ts` in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CmdkSettingsPanelComponent } from './cmdk-settings-panel';
import { provideCmdk } from '../config/cmdk-config';
import { FavouritesService } from '../favourites/favourites';
import { RecentSearchesService } from '../search/recent-searches';

describe('CmdkSettingsPanelComponent', () => {
  let fixture: ComponentFixture<CmdkSettingsPanelComponent>;
  let favouritesService: FavouritesService;
  let recentSearches: RecentSearchesService;

  function setup(config: Parameters<typeof provideCmdk>[0]): void {
    TestBed.configureTestingModule({
      imports: [CmdkSettingsPanelComponent],
      providers: [provideCmdk(config)],
    });
    fixture = TestBed.createComponent(CmdkSettingsPanelComponent);
    document.body.appendChild(fixture.nativeElement);
    favouritesService = TestBed.inject(FavouritesService);
    recentSearches = TestBed.inject(RecentSearchesService);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('renders neither section with no storage keys configured', () => {
    setup({});
    expect(fixture.nativeElement.textContent).not.toContain('Favourites');
    expect(fixture.nativeElement.textContent).not.toContain('Recent searches');
  });

  it('renders only the Favourites section when favouritesStorageKey is configured', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    expect(fixture.nativeElement.textContent).toContain('Favourites');
    expect(fixture.nativeElement.textContent).not.toContain('Recent searches');
  });

  it('renders only the Recent searches section when recentSearchesStorageKey is configured', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    expect(fixture.nativeElement.textContent).not.toContain('Favourites');
    expect(fixture.nativeElement.textContent).toContain('Recent searches');
  });

  it('renders both sections when both keys are configured', () => {
    setup({ favouritesStorageKey: () => 'favs', recentSearchesStorageKey: () => 'recents' });
    expect(fixture.nativeElement.textContent).toContain('Favourites');
    expect(fixture.nativeElement.textContent).toContain('Recent searches');
  });

  it('focuses the Label input on creation', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const labelInput = fixture.nativeElement.querySelector('input[placeholder="Label"]');
    expect(document.activeElement).toBe(labelInput);
  });

  it('renders existing favourites as read-only rows', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('Production orders', '/production-orders');
    fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('.cmdk-settings-row .cmdk-settings-input');
    expect(inputs[0].value).toBe('Production orders');
    expect(inputs[1].value).toBe('/production-orders');
    expect(inputs[0].readOnly).toBe(true);
  });

  it('the add button is disabled until both Label and Path are filled in', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-add-button');
    expect(addButton.disabled).toBe(true);

    labelInput.value = 'New favourite';
    labelInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(addButton.disabled).toBe(true);

    pathInput.value = '/new';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(addButton.disabled).toBe(false);
  });

  it('submitting the add form adds a favourite and clears the inputs', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    labelInput.value = 'New favourite';
    labelInput.dispatchEvent(new Event('input'));
    pathInput.value = '/new';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cmdk-settings-add-button').click();
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['New favourite']);
    const [labelAfter, pathAfter] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    expect(labelAfter.value).toBe('');
    expect(pathAfter.value).toBe('');
  });

  it('pressing Enter in the Path input submits the add form', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    labelInput.value = 'New favourite';
    labelInput.dispatchEvent(new Event('input'));
    pathInput.value = '/new';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    pathInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['New favourite']);
  });

  it('replaces the add row with a limit message once 9 favourites exist', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    for (let i = 0; i < 9; i++) {
      favouritesService.add(`Item ${i}`, `/item-${i}`);
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-settings-add-row')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Maximum of 9 favourites reached');
  });

  it('clicking a remove button removes that favourite', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    favouritesService.add('Second', '/second');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cmdk-settings-remove-button').click();
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['Second']);
  });

  it('clicking move-up/move-down reorders favourites', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    favouritesService.add('Second', '/second');
    fixture.detectChanges();

    const moveButtons = fixture.nativeElement.querySelectorAll('.cmdk-settings-move-button');
    // Row order is [row1-up, row1-down, row2-up, row2-down]; index 2 is Second's move-up.
    moveButtons[2].click();
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['Second', 'First']);
  });

  it('clicking "Clear recent searches" clears RecentSearchesService', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    expect(recentSearches.recent()).toHaveLength(1);

    fixture.nativeElement.querySelector('.cmdk-settings-clear-button').click();

    expect(recentSearches.recent()).toEqual([]);
  });

  it('pressing Escape emits close', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    fixture.nativeElement.querySelector('.cmdk-settings').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(closeSpy).toHaveBeenCalled();
  });

  it('pressing "," outside a text input emits close', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    fixture.nativeElement.querySelector('.cmdk-settings-close-button').dispatchEvent(
      new KeyboardEvent('keydown', { key: ',', bubbles: true }),
    );

    expect(closeSpy).toHaveBeenCalled();
  });

  it('pressing "," while focused in the Label input types a comma instead of closing', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    const labelInput = fixture.nativeElement.querySelector('input[placeholder="Label"]');
    labelInput.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('a keydown inside the panel does not bubble to ancestors outside it', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const outerHandler = vi.fn();
    document.body.addEventListener('keydown', outerHandler);
    try {
      fixture.nativeElement.querySelector('.cmdk-settings').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      expect(outerHandler).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('keydown', outerHandler);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: FAIL — `./cmdk-settings-panel` module doesn't exist yet.

- [ ] **Step 3: Implement the component class**

Create `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.ts`:

```ts
import { Component, ElementRef, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { FavouritesService } from '../favourites/favourites';
import { RecentSearchesService } from '../search/recent-searches';

@Component({
  selector: 'ngx-cmdk-settings-panel',
  imports: [],
  templateUrl: './cmdk-settings-panel.html',
  styleUrl: './cmdk-settings-panel.css',
})
export class CmdkSettingsPanelComponent {
  private readonly config = inject(CMDK_CONFIG);
  protected readonly favouritesService = inject(FavouritesService);
  protected readonly recentSearches = inject(RecentSearchesService);

  readonly close = output<void>();

  protected readonly labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');
  protected readonly newLabel = signal('');
  protected readonly newPath = signal('');

  protected readonly showFavouritesSection = computed(() => this.config.favouritesStorageKey?.() != null);
  protected readonly showRecentSearchesSection = computed(() => this.config.recentSearchesStorageKey?.() != null);
  protected readonly canSubmit = computed(() => this.newLabel().trim().length > 0 && this.newPath().trim().length > 0);

  constructor() {
    effect(() => {
      this.labelInput()?.nativeElement.focus();
    });
  }

  protected submitAdd(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.favouritesService.add(this.newLabel(), this.newPath());
    this.newLabel.set('');
    this.newPath.set('');
    this.labelInput()?.nativeElement.focus();
  }

  protected clearRecentSearches(): void {
    this.recentSearches.clear();
  }

  protected onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close.emit();
      return;
    }
    const isTextInput = (event.target as HTMLElement).tagName === 'INPUT';
    if (event.key === ',' && !isTextInput) {
      event.preventDefault();
      this.close.emit();
    }
  }
}
```

- [ ] **Step 4: Implement the template**

Create `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html`:

```html
<div class="cmdk-settings" (keydown)="onKeydown($event)">
  @if (showFavouritesSection()) {
    <div class="cmdk-settings-section">
      <div class="cmdk-settings-section-label">Favourites</div>
      @for (favourite of favouritesService.favourites(); track favourite.id) {
        <div class="cmdk-settings-row">
          <div class="cmdk-settings-move-buttons">
            <button
              type="button"
              class="cmdk-settings-move-button"
              (click)="favouritesService.moveUp(favourite.id)"
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              class="cmdk-settings-move-button"
              (click)="favouritesService.moveDown(favourite.id)"
              aria-label="Move down"
            >
              ↓
            </button>
          </div>
          <input class="cmdk-settings-input" type="text" [value]="favourite.label" readonly />
          <input class="cmdk-settings-input" type="text" [value]="favourite.path" readonly />
          <button
            type="button"
            class="cmdk-settings-remove-button"
            (click)="favouritesService.remove(favourite.id)"
            aria-label="Remove favourite"
          >
            ×
          </button>
        </div>
      }
      @if (favouritesService.favourites().length < 9) {
        <div class="cmdk-settings-add-row">
          <input
            #labelInput
            class="cmdk-settings-input"
            type="text"
            placeholder="Label"
            [value]="newLabel()"
            (input)="newLabel.set($any($event.target).value)"
          />
          <input
            class="cmdk-settings-input"
            type="text"
            placeholder="Path"
            [value]="newPath()"
            (input)="newPath.set($any($event.target).value)"
            (keydown.enter)="submitAdd()"
          />
          <button
            type="button"
            class="cmdk-settings-add-button"
            [disabled]="!canSubmit()"
            (click)="submitAdd()"
            aria-label="Add favourite"
          >
            ↵
          </button>
        </div>
      } @else {
        <p class="cmdk-settings-limit-message">Maximum of 9 favourites reached — remove one to add another.</p>
      }
    </div>
  }
  @if (showRecentSearchesSection()) {
    <div class="cmdk-settings-section">
      <div class="cmdk-settings-section-label">Recent searches</div>
      <button type="button" class="cmdk-settings-clear-button" (click)="clearRecentSearches()">
        Clear recent searches
      </button>
    </div>
  }
  <div class="cmdk-settings-footer">
    <button type="button" class="cmdk-settings-close-button" (click)="close.emit()">
      <span class="cmdk-settings-close-hint">,</span>
      CLOSE SETTINGS
    </button>
  </div>
</div>
```

- [ ] **Step 5: Implement the stylesheet**

Create `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.css`:

```css
:host {
  display: contents;
}

.cmdk-settings {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 8px 16px 16px;
}

.cmdk-settings-section {
  padding: 12px 0;
}

.cmdk-settings-section + .cmdk-settings-section {
  border-top: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
}

.cmdk-settings-section-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cmdk-muted, #888);
  margin-bottom: 8px;
  font-weight: 600;
}

.cmdk-settings-row,
.cmdk-settings-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}

.cmdk-settings-move-buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cmdk-settings-move-button,
.cmdk-settings-remove-button,
.cmdk-settings-add-button {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 4px 6px;
}

.cmdk-settings-add-button {
  background: var(--cmdk-accent, #eef2ff);
  border-radius: 4px;
}

.cmdk-settings-add-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cmdk-settings-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
}

.cmdk-settings-input[readonly] {
  color: var(--cmdk-muted, #888);
}

.cmdk-settings-limit-message {
  font-size: 13px;
  color: var(--cmdk-muted, #888);
  margin: 4px 0;
}

.cmdk-settings-clear-button {
  padding: 6px 12px;
  border: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.cmdk-settings-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
}

.cmdk-settings-close-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  background: var(--cmdk-accent, #eef2ff);
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}

.cmdk-settings-close-hint {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--cmdk-border, rgba(0, 0, 0, 0.1));
  font-size: 11px;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: PASS, all new `cmdk-settings-panel.spec.ts` tests green.

- [ ] **Step 7: Build the library**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: build succeeds. Confirm `CmdkSettingsPanelComponent` is **not** referenced anywhere in `dist/ngx-cmdk`'s public type definitions for the top-level package entry point (it's a normal exported class from its own file, just never re-exported through `public-api.ts` — nothing extra to verify beyond "the build still succeeds and `public-api.ts` wasn't touched by this task").

- [ ] **Step 8: Commit**

```bash
git add projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.ts projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.css projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.spec.ts
git commit -m "Add CmdkSettingsPanelComponent"
```

---

### Task 5: `CmdkPaletteComponent` integration

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts`
- Modify: `projects/ngx-cmdk/src/lib/palette/cmdk-palette.html`
- Modify: `projects/ngx-cmdk/src/lib/palette/cmdk-palette.spec.ts`

**Interfaces:**
- Consumes: `FavouritesService`, `FavouriteEntry` (Task 3); `CmdkSettingsPanelComponent` (Task 4); `CmdkConfig.favouritesStorageKey`/`navigate` (Task 1); `usesDigitKey` is NOT needed here (only `parseShortcut`/`matchesShortcut`, already imported).
- Produces: no new public API — this task wires the feature into the existing component's rendering, keyboard nav, and selection flow.

This is the largest task in the plan. Read `projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts` and `cmdk-palette.html` in full before starting (their exact current contents are reproduced below for reference — do not re-fetch, this is the ground truth to diff against; `cmdk-palette.spec.ts` and `cmdk-palette.css` are not reproduced in full here since this task only *adds* to them, never replaces existing lines wholesale — read the existing `cmdk-palette.spec.ts` to confirm the `pressOpenShortcut()` helper and the existing `describe('recent searches', ...)` block's `reconfigure()` pattern, which the new tests below mirror).

Current `cmdk-palette.ts` (reproduced in full):

```ts
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from '../command/command.model';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { CmdkIssueService } from '../issue/cmdk-issue';
import { CommandRegistryService } from '../command/command-registry';
import { fuzzySearch } from '../command/fuzzy-match';
import { groupMatches } from '../command/group-matches';
import { RecentSearchesService, type RecentSearchEntry } from '../search/recent-searches';
import { SearchRegistryService } from '../search/search-registry';
import type { SearchResult } from '../search/search.model';
import { formatShortcut, isMacPlatform, matchesShortcut, parseShortcut } from '../shortcut/shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  protected readonly searchRegistry = inject(SearchRegistryService);
  private readonly recentSearches = inject(RecentSearchesService);
  private readonly issues = inject(CmdkIssueService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = isMacPlatform(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;
  private searchDebounceTimer?: ReturnType<typeof setTimeout>;
  private searchGeneration = 0;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);
  protected readonly scopedProviderKey = signal<string | null>(null);
  protected readonly searchProviders = computed(() => this.searchRegistry.providers());

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
  protected readonly flatMatches = computed(() => this.groups().flatMap((g) => g.matches));
  protected readonly resolveLabel = resolveLabel;
  protected readonly formatShortcut = (shortcut: string) => formatShortcut(shortcut, this.isMac);

  protected readonly searchResults = signal<SearchResult[] | null>(null);

  protected readonly isSearchModeActive = computed(
    () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
  );

  protected readonly selectedSearchResult = computed(() => this.searchResults()?.[this.selectedIndex()]);

  protected readonly visibleRecents = computed(() => {
    if (this.isSearchModeActive() || this.scopedProviderKey() !== null) {
      return [] as readonly RecentSearchEntry[];
    }
    const registeredKeys = new Set(this.searchRegistry.providers().map((p) => p.key));
    return this.recentSearches.recent().filter((entry) => registeredKeys.has(entry.providerKey));
  });

  protected readonly selectedRecent = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const recents = this.visibleRecents();
    const index = this.selectedIndex();
    return index < recents.length ? recents[index] : undefined;
  });

  protected readonly selectedCommand = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const offset = this.visibleRecents().length;
    return this.flatMatches()[this.selectedIndex() - offset]?.item;
  });

  protected readonly activeDescendantId = computed(() => {
    if (this.isSearchModeActive()) {
      return this.selectedSearchResult() ? `cmdk-item-search-${this.selectedIndex()}` : null;
    }
    const recent = this.selectedRecent();
    if (recent) {
      return `cmdk-item-recent-${recent.providerKey}-${recent.resultId}`;
    }
    return this.selectedCommand() ? `cmdk-item-${this.selectedCommand()!.id}` : null;
  });

  protected readonly searchInputLabel = computed(() =>
    this.isSearchModeActive() ? 'Search' : 'Search commands',
  );

  constructor() {
    const onOpenShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    };
    this.document.addEventListener('keydown', onOpenShortcut);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('keydown', onOpenShortcut));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchDebounceTimer));

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });

    effect(() => {
      const count = this.isSearchModeActive()
        ? (this.searchResults()?.length ?? 0)
        : this.visibleRecents().length + this.flatMatches().length;
      if (this.selectedIndex() >= count) {
        this.selectedIndex.set(Math.max(0, count - 1));
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
    this.scopedProviderKey.set(null);
    this.searchResults.set(null);
    this.isOpen.set(true);
  }

  protected close(): void {
    clearTimeout(this.searchDebounceTimer);
    this.searchGeneration++;
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }

  protected onQueryChange(rawValue: string): void {
    let value = rawValue;
    if (this.scopedProviderKey() === null) {
      const colonIndex = value.indexOf(':');
      if (colonIndex !== -1) {
        const candidateKey = value.slice(0, colonIndex).trim().toLowerCase();
        const matchedProvider = this.searchProviders().find((p) => p.key.toLowerCase() === candidateKey);
        if (matchedProvider) {
          this.scopedProviderKey.set(matchedProvider.key);
          value = value.slice(colonIndex + 1).trimStart();
        }
      }
    }
    this.query.set(value);
    this.selectedIndex.set(0);
    this.searchResults.set(null);
    this.scheduleSearch(value, this.scopedProviderKey());
  }

  protected selectProviderScope(key: string): void {
    this.scopedProviderKey.set(key);
    this.selectedIndex.set(0);
    this.searchResults.set(null);
    this.scheduleSearch(this.query(), key);
    this.searchInput()?.nativeElement.focus();
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
        if (this.isSearchModeActive()) {
          const result = this.selectedSearchResult();
          if (result) {
            this.runSearchResult(result, this.searchRegistry.providerKeyFor(result));
          }
        } else {
          const recent = this.selectedRecent();
          if (recent) {
            this.runRecentEntry(recent);
          } else {
            const command = this.selectedCommand();
            if (command) {
              this.runSelectedCommand(command);
            }
          }
        }
        break;
      }
      case 'Backspace':
        if (this.scopedProviderKey() !== null && this.query() === '') {
          event.preventDefault();
          this.scopedProviderKey.set(null);
          this.selectedIndex.set(0);
        }
        break;
      case 'Tab':
        // Chip-row buttons exist but are intentionally mouse-only (keyboard scoping goes
        // through the typed "key:" prefix instead), so trapping focus back to the search
        // input is still correct — it's the only element meant to hold keyboard focus here.
        event.preventDefault();
        this.searchInput()?.nativeElement.focus();
        break;
      default: {
        const command = this.registry.matchShortcut(event);
        if (command) {
          event.preventDefault();
          this.runSelectedCommand(command);
        }
      }
    }
  }

  protected runSelectedCommand(command: ResolvedCommand): void {
    this.registry.execute(command);
    this.close();
  }

  protected runSearchResult(result: SearchResult, providerKey: string | undefined): void {
    if (providerKey) {
      this.recentSearches.record(providerKey, result);
    }
    try {
      const outcome = result.execute();
      if (outcome instanceof Promise) {
        outcome.catch((error) => {
          console.error(`Search result "${result.label}" failed:`, error);
          this.issues.report({ source: 'search-result', label: result.label, error });
        });
      }
    } catch (error) {
      console.error(`Search result "${result.label}" failed:`, error);
      this.issues.report({ source: 'search-result', label: result.label, error });
    }
    this.close();
  }

  protected runRecentEntry(entry: RecentSearchEntry): void {
    const myGeneration = this.searchGeneration;
    const provider = this.searchRegistry.providers().find((p) => p.key === entry.providerKey);
    if (!provider?.resolve) {
      this.reportRecentResolveFailure(entry);
      return;
    }
    provider.resolve(entry.resultId).then(
      (result) => {
        if (myGeneration !== this.searchGeneration) {
          return;
        }
        if (!result) {
          this.reportRecentResolveFailure(entry);
          return;
        }
        this.runSearchResult(result, entry.providerKey);
      },
      (error) => {
        if (myGeneration !== this.searchGeneration) {
          return;
        }
        this.reportRecentResolveFailure(entry, error);
      },
    );
  }

  private reportRecentResolveFailure(entry: RecentSearchEntry, error?: unknown): void {
    console.error(`Recent search "${entry.label}" could not be resolved:`, error);
    this.issues.report({
      source: 'recent-resolve',
      providerKey: entry.providerKey,
      resultId: entry.resultId,
      error,
    });
    this.recentSearches.removeEntry(entry.providerKey, entry.resultId);
  }

  private scheduleSearch(query: string, scopeKey: string | null): void {
    clearTimeout(this.searchDebounceTimer);
    if (!query.trim() || !this.searchRegistry.hasProviders()) {
      return;
    }
    const myGeneration = ++this.searchGeneration;
    this.searchDebounceTimer = setTimeout(() => {
      this.searchRegistry.search(query, scopeKey ?? undefined).then((results) => {
        if (myGeneration === this.searchGeneration) {
          this.searchResults.set(results);
        }
      });
    }, 200);
  }

  private moveSelection(delta: number): void {
    const count = this.isSearchModeActive()
      ? (this.searchResults()?.length ?? 0)
      : this.visibleRecents().length + this.flatMatches().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
}
```

Current `cmdk-palette.html` (reproduced in full):

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
      <div class="cmdk-input-row">
        @if (scopedProviderKey(); as scopedKey) {
          <span class="cmdk-scope-token">{{ scopedKey }}</span>
        }
        <input
          #searchInput
          class="cmdk-input"
          type="text"
          [attr.aria-label]="searchInputLabel()"
          [attr.aria-activedescendant]="activeDescendantId()"
          [value]="query()"
          (input)="onQueryChange($any($event.target).value)"
        />
      </div>
      @if (scopedProviderKey() === null && searchProviders().length > 0) {
        <div class="cmdk-chip-row">
          @for (provider of searchProviders(); track provider.key) {
            <button type="button" class="cmdk-chip" (click)="selectProviderScope(provider.key)">
              {{ provider.label }}
            </button>
          }
        </div>
      }
      <div class="cmdk-list" role="listbox">
        @if (isSearchModeActive()) {
          @if (searchResults(); as results) {
            @for (result of results; track $index) {
              <div
                [id]="'cmdk-item-search-' + $index"
                class="cmdk-item"
                [class.cmdk-item--selected]="$index === selectedIndex()"
                role="option"
                [attr.aria-selected]="$index === selectedIndex()"
                (click)="runSearchResult(result, searchRegistry.providerKeyFor(result))"
              >
                <span class="cmdk-item-main">
                  @if (result.icon) {
                    <span class="cmdk-item-icon" [class]="result.icon" aria-hidden="true"></span>
                  }
                  <span class="cmdk-item-label">{{ result.label }}</span>
                </span>
                @if (result.subtitle) {
                  <span class="cmdk-item-subtitle">{{ result.subtitle }}</span>
                }
              </div>
            } @empty {
              <div class="cmdk-empty">No results</div>
            }
          } @else {
            <div class="cmdk-empty">Searching…</div>
          }
        } @else {
          @if (visibleRecents().length > 0) {
            <div class="cmdk-group">
              <div class="cmdk-group-label">Recent searches</div>
              @for (recent of visibleRecents(); track recent.providerKey + ':' + recent.resultId) {
                <div
                  [id]="'cmdk-item-recent-' + recent.providerKey + '-' + recent.resultId"
                  class="cmdk-item"
                  [class.cmdk-item--selected]="$index === selectedIndex()"
                  role="option"
                  [attr.aria-selected]="$index === selectedIndex()"
                  (click)="runRecentEntry(recent)"
                >
                  <span class="cmdk-item-main">
                    @if (recent.icon) {
                      <span class="cmdk-item-icon" [class]="recent.icon" aria-hidden="true"></span>
                    }
                    <span class="cmdk-item-label">{{ recent.label }}</span>
                  </span>
                  @if (recent.subtitle) {
                    <span class="cmdk-item-subtitle">{{ recent.subtitle }}</span>
                  }
                </div>
              }
            </div>
          }
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
                  (click)="runSelectedCommand(match.item)"
                >
                  <span class="cmdk-item-main">
                    @if (match.item.icon) {
                      <span class="cmdk-item-icon" [class]="match.item.icon" aria-hidden="true"></span>
                    }
                    <span class="cmdk-item-label">{{ resolveLabel(match.item) }}</span>
                  </span>
                  @if (match.item.shortcut) {
                    <span class="cmdk-shortcut">{{ formatShortcut(match.item.shortcut) }}</span>
                  }
                </div>
              }
            </div>
          } @empty {
            @if (visibleRecents().length === 0) {
              <div class="cmdk-empty">No matching commands</div>
            }
          }
        }
      </div>
    </div>
  </div>
}
```

- [ ] **Step 1: Write the failing tests**

Read `projects/ngx-cmdk/src/lib/palette/cmdk-palette.spec.ts` in full first (confirm the `pressOpenShortcut()` helper and the existing `describe('recent searches', ...)` block's `reconfigure()`/`makeFruitsProvider()` pattern), then add a new `describe('favourites and settings', ...)` block inside the top-level `describe('CmdkPaletteComponent', ...)`, alongside the existing blocks:

```ts
  describe('favourites and settings', () => {
    let favouritesService: FavouritesService;

    function reconfigure(config: Parameters<typeof provideCmdk>[0]): void {
      fixture.nativeElement.remove();
      TestBed.resetTestingModule();
      Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
      TestBed.configureTestingModule({
        imports: [CmdkPaletteComponent],
        providers: [provideCmdk({ shortcut: 'mod+k', ...config })],
      });
      fixture = TestBed.createComponent(CmdkPaletteComponent);
      document.body.appendChild(fixture.nativeElement);
      registry = TestBed.inject(CommandRegistryService);
      favouritesService = TestBed.inject(FavouritesService);
      fixture.detectChanges();
    }

    afterEach(() => {
      localStorage.clear();
    });

    it('"," does nothing when neither favouritesStorageKey nor recentSearchesStorageKey is configured', () => {
      reconfigure({});
      pressOpenShortcut();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('ngx-cmdk-settings-panel')).toBeNull();
    });

    it('"," opens Settings when the query is empty, unscoped, and a storage key is configured', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      pressOpenShortcut();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('ngx-cmdk-settings-panel')).not.toBeNull();
    });

    it('"," types normally into the search query instead of opening Settings', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'a';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('ngx-cmdk-settings-panel')).toBeNull();
    });

    it('closing Settings returns to the list view without closing the palette', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      pressOpenShortcut();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
      fixture.detectChanges();

      fixture.nativeElement
        .querySelector('.cmdk-settings')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('ngx-cmdk-settings-panel')).toBeNull();
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).not.toBeNull();
    });

    it('reopening the palette always starts in the list view, even if Settings was open when it last closed', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      pressOpenShortcut();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));
      fixture.detectChanges();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      pressOpenShortcut();

      expect(fixture.nativeElement.querySelector('ngx-cmdk-settings-panel')).toBeNull();
    });

    it('renders a Favourites section below Commands in the browse view, with mod+N shortcut hints', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      favouritesService.add('Production orders', '/production-orders');
      registry.register({ id: 'a', label: 'Some Command', execute: () => {}, group: 'Actions' });
      pressOpenShortcut();

      const groupLabels = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-group-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(groupLabels).toEqual(['Actions', 'Favourites']);
      expect(fixture.nativeElement.textContent).toContain('⌘1');
    });

    it('does not render a Favourites section while scoped, even with an empty query', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();
      fixture.nativeElement.querySelector('.cmdk-chip').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Favourites');
    });

    it('selecting a favourite by Enter calls navigate() with its path and closes the palette', () => {
      const navigate = vi.fn();
      reconfigure({ favouritesStorageKey: () => 'favs', navigate });
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();
      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(navigate).toHaveBeenCalledWith('/production-orders');
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
    });

    it('clicking a favourite calls navigate() with its path', () => {
      const navigate = vi.fn();
      reconfigure({ favouritesStorageKey: () => 'favs', navigate });
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();

      fixture.nativeElement.querySelector('[id^="cmdk-item-favourite-"]').click();

      expect(navigate).toHaveBeenCalledWith('/production-orders');
    });

    it('mod+1 navigates the first favourite regardless of current query/scope state', () => {
      const navigate = vi.fn();
      reconfigure({ favouritesStorageKey: () => 'favs', navigate });
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();
      // Scope to a provider AND type a query — this collapses visibleFavourites() to [],
      // which is exactly the state that would break a favouriteShortcuts() implementation
      // wrongly derived from visibleFavourites() instead of the raw, always-current list.
      fixture.nativeElement.querySelector('.cmdk-chip').click();
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'unrelated query';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1', metaKey: true, bubbles: true }));

      expect(navigate).toHaveBeenCalledWith('/production-orders');
    });

    it('a rejected navigate() reports a favourite-navigate issue and does not crash', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failure = new Error('network down');
      reconfigure({ favouritesStorageKey: () => 'favs', navigate: () => Promise.reject(failure) });
      const issues = TestBed.inject(CmdkIssueService);
      const onIssue = vi.fn();
      issues.onIssue(onIssue);
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();

      fixture.nativeElement.querySelector('[id^="cmdk-item-favourite-"]').click();
      await Promise.resolve();
      await Promise.resolve();

      expect(onIssue).toHaveBeenCalledWith({
        source: 'favourite-navigate',
        label: 'Production orders',
        path: '/production-orders',
        error: failure,
      });
      consoleError.mockRestore();
    });

    it('selecting a favourite with no navigate configured reports a favourite-navigate issue', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      reconfigure({ favouritesStorageKey: () => 'favs' });
      const issues = TestBed.inject(CmdkIssueService);
      const onIssue = vi.fn();
      issues.onIssue(onIssue);
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();

      fixture.nativeElement.querySelector('[id^="cmdk-item-favourite-"]').click();

      expect(onIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'favourite-navigate',
          label: 'Production orders',
          path: '/production-orders',
        }),
      );
      consoleError.mockRestore();
    });

    it('ArrowDown moves selection from Commands into Favourites', () => {
      reconfigure({ favouritesStorageKey: () => 'favs' });
      registry.register({ id: 'only', label: 'Only Command', execute: () => {} });
      favouritesService.add('Production orders', '/production-orders');
      pressOpenShortcut();

      fixture.nativeElement
        .querySelector('.cmdk-panel')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();

      const selected = fixture.nativeElement.querySelector('.cmdk-item--selected .cmdk-item-label');
      expect(selected.textContent).toBe('Production orders');
    });
  });
```

At the top of `cmdk-palette.spec.ts`, add the new import needed by this block, alongside the existing ones:

```ts
import { FavouritesService } from '../favourites/favourites';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -120
```

Expected: FAIL — no settings mode, no Favourites rendering, no `mod+N` dispatch, `runFavourite` doesn't exist yet.

- [ ] **Step 3: Implement the component changes**

Replace the full contents of `projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts` with:

```ts
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from '../command/command.model';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { CmdkIssueService } from '../issue/cmdk-issue';
import { CommandRegistryService } from '../command/command-registry';
import { FavouritesService, type FavouriteEntry } from '../favourites/favourites';
import { fuzzySearch } from '../command/fuzzy-match';
import { groupMatches } from '../command/group-matches';
import { RecentSearchesService, type RecentSearchEntry } from '../search/recent-searches';
import { SearchRegistryService } from '../search/search-registry';
import type { SearchResult } from '../search/search.model';
import { CmdkSettingsPanelComponent } from '../settings/cmdk-settings-panel';
import { formatShortcut, isMacPlatform, matchesShortcut, parseShortcut } from '../shortcut/shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [CmdkSettingsPanelComponent],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  protected readonly searchRegistry = inject(SearchRegistryService);
  private readonly recentSearches = inject(RecentSearchesService);
  private readonly favourites = inject(FavouritesService);
  private readonly issues = inject(CmdkIssueService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = isMacPlatform(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;
  private searchDebounceTimer?: ReturnType<typeof setTimeout>;
  private searchGeneration = 0;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);
  protected readonly scopedProviderKey = signal<string | null>(null);
  protected readonly settingsOpen = signal(false);
  protected readonly searchProviders = computed(() => this.searchRegistry.providers());

  protected readonly settingsAvailable = computed(
    () => this.config.favouritesStorageKey?.() != null || this.config.recentSearchesStorageKey?.() != null,
  );

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
  protected readonly flatMatches = computed(() => this.groups().flatMap((g) => g.matches));
  protected readonly resolveLabel = resolveLabel;
  protected readonly formatShortcut = (shortcut: string) => formatShortcut(shortcut, this.isMac);

  protected readonly searchResults = signal<SearchResult[] | null>(null);

  protected readonly isSearchModeActive = computed(
    () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
  );

  protected readonly selectedSearchResult = computed(() => this.searchResults()?.[this.selectedIndex()]);

  protected readonly visibleRecents = computed(() => {
    if (this.isSearchModeActive() || this.scopedProviderKey() !== null) {
      return [] as readonly RecentSearchEntry[];
    }
    const registeredKeys = new Set(this.searchRegistry.providers().map((p) => p.key));
    return this.recentSearches.recent().filter((entry) => registeredKeys.has(entry.providerKey));
  });

  protected readonly visibleFavourites = computed(() => {
    if (this.isSearchModeActive() || this.scopedProviderKey() !== null) {
      return [] as readonly FavouriteEntry[];
    }
    return this.favourites.favourites();
  });

  protected readonly favouriteShortcuts = computed(() =>
    this.favourites.favourites().map((favourite, index) => ({
      favourite,
      parsed: parseShortcut(`mod+${index + 1}`, this.isMac),
    })),
  );

  protected readonly selectedRecent = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const recents = this.visibleRecents();
    const index = this.selectedIndex();
    return index < recents.length ? recents[index] : undefined;
  });

  protected readonly selectedCommand = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const offset = this.visibleRecents().length;
    return this.flatMatches()[this.selectedIndex() - offset]?.item;
  });

  protected readonly selectedFavourite = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const offset = this.visibleRecents().length + this.flatMatches().length;
    const favourites = this.visibleFavourites();
    const index = this.selectedIndex() - offset;
    return index >= 0 && index < favourites.length ? favourites[index] : undefined;
  });

  protected readonly activeDescendantId = computed(() => {
    if (this.isSearchModeActive()) {
      return this.selectedSearchResult() ? `cmdk-item-search-${this.selectedIndex()}` : null;
    }
    const recent = this.selectedRecent();
    if (recent) {
      return `cmdk-item-recent-${recent.providerKey}-${recent.resultId}`;
    }
    const favourite = this.selectedFavourite();
    if (favourite) {
      return `cmdk-item-favourite-${favourite.id}`;
    }
    return this.selectedCommand() ? `cmdk-item-${this.selectedCommand()!.id}` : null;
  });

  protected readonly searchInputLabel = computed(() =>
    this.isSearchModeActive() ? 'Search' : 'Search commands',
  );

  constructor() {
    const onOpenShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    };
    this.document.addEventListener('keydown', onOpenShortcut);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('keydown', onOpenShortcut));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchDebounceTimer));

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });

    effect(() => {
      const count = this.isSearchModeActive()
        ? (this.searchResults()?.length ?? 0)
        : this.visibleRecents().length + this.flatMatches().length + this.visibleFavourites().length;
      if (this.selectedIndex() >= count) {
        this.selectedIndex.set(Math.max(0, count - 1));
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
    this.scopedProviderKey.set(null);
    this.searchResults.set(null);
    this.settingsOpen.set(false);
    this.isOpen.set(true);
  }

  protected close(): void {
    clearTimeout(this.searchDebounceTimer);
    this.searchGeneration++;
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }

  protected onQueryChange(rawValue: string): void {
    let value = rawValue;
    if (this.scopedProviderKey() === null) {
      const colonIndex = value.indexOf(':');
      if (colonIndex !== -1) {
        const candidateKey = value.slice(0, colonIndex).trim().toLowerCase();
        const matchedProvider = this.searchProviders().find((p) => p.key.toLowerCase() === candidateKey);
        if (matchedProvider) {
          this.scopedProviderKey.set(matchedProvider.key);
          value = value.slice(colonIndex + 1).trimStart();
        }
      }
    }
    this.query.set(value);
    this.selectedIndex.set(0);
    this.searchResults.set(null);
    this.scheduleSearch(value, this.scopedProviderKey());
  }

  protected selectProviderScope(key: string): void {
    this.scopedProviderKey.set(key);
    this.selectedIndex.set(0);
    this.searchResults.set(null);
    this.scheduleSearch(this.query(), key);
    this.searchInput()?.nativeElement.focus();
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
        if (this.isSearchModeActive()) {
          const result = this.selectedSearchResult();
          if (result) {
            this.runSearchResult(result, this.searchRegistry.providerKeyFor(result));
          }
        } else {
          const recent = this.selectedRecent();
          if (recent) {
            this.runRecentEntry(recent);
          } else {
            const favourite = this.selectedFavourite();
            if (favourite) {
              this.runFavourite(favourite);
            } else {
              const command = this.selectedCommand();
              if (command) {
                this.runSelectedCommand(command);
              }
            }
          }
        }
        break;
      }
      case 'Backspace':
        if (this.scopedProviderKey() !== null && this.query() === '') {
          event.preventDefault();
          this.scopedProviderKey.set(null);
          this.selectedIndex.set(0);
        }
        break;
      case ',':
        if (this.settingsAvailable() && this.query() === '' && this.scopedProviderKey() === null) {
          event.preventDefault();
          this.settingsOpen.set(true);
        }
        break;
      case 'Tab':
        // Chip-row buttons exist but are intentionally mouse-only (keyboard scoping goes
        // through the typed "key:" prefix instead), so trapping focus back to the search
        // input is still correct — it's the only element meant to hold keyboard focus here.
        event.preventDefault();
        this.searchInput()?.nativeElement.focus();
        break;
      default: {
        const command = this.registry.matchShortcut(event);
        const favouriteMatch = this.favouriteShortcuts().find(({ parsed }) => matchesShortcut(event, parsed));
        if (command) {
          event.preventDefault();
          this.runSelectedCommand(command);
        } else if (favouriteMatch) {
          event.preventDefault();
          this.runFavourite(favouriteMatch.favourite);
        }
      }
    }
  }

  protected runSelectedCommand(command: ResolvedCommand): void {
    this.registry.execute(command);
    this.close();
  }

  protected runSearchResult(result: SearchResult, providerKey: string | undefined): void {
    if (providerKey) {
      this.recentSearches.record(providerKey, result);
    }
    try {
      const outcome = result.execute();
      if (outcome instanceof Promise) {
        outcome.catch((error) => {
          console.error(`Search result "${result.label}" failed:`, error);
          this.issues.report({ source: 'search-result', label: result.label, error });
        });
      }
    } catch (error) {
      console.error(`Search result "${result.label}" failed:`, error);
      this.issues.report({ source: 'search-result', label: result.label, error });
    }
    this.close();
  }

  protected runRecentEntry(entry: RecentSearchEntry): void {
    const myGeneration = this.searchGeneration;
    const provider = this.searchRegistry.providers().find((p) => p.key === entry.providerKey);
    if (!provider?.resolve) {
      this.reportRecentResolveFailure(entry);
      return;
    }
    provider.resolve(entry.resultId).then(
      (result) => {
        if (myGeneration !== this.searchGeneration) {
          return;
        }
        if (!result) {
          this.reportRecentResolveFailure(entry);
          return;
        }
        this.runSearchResult(result, entry.providerKey);
      },
      (error) => {
        if (myGeneration !== this.searchGeneration) {
          return;
        }
        this.reportRecentResolveFailure(entry, error);
      },
    );
  }

  protected runFavourite(favourite: FavouriteEntry): void {
    const navigate = this.config.navigate;
    if (!navigate) {
      console.error(
        `Favourite "${favourite.label}" could not navigate: no "navigate" callback configured via provideCmdk()`,
      );
      this.issues.report({
        source: 'favourite-navigate',
        label: favourite.label,
        path: favourite.path,
        error: new Error('No "navigate" callback configured via provideCmdk()'),
      });
      this.close();
      return;
    }
    try {
      const outcome = navigate(favourite.path);
      if (outcome instanceof Promise) {
        outcome.catch((error) => {
          console.error(`Favourite "${favourite.label}" failed to navigate:`, error);
          this.issues.report({ source: 'favourite-navigate', label: favourite.label, path: favourite.path, error });
        });
      }
    } catch (error) {
      console.error(`Favourite "${favourite.label}" failed to navigate:`, error);
      this.issues.report({ source: 'favourite-navigate', label: favourite.label, path: favourite.path, error });
    }
    this.close();
  }

  private reportRecentResolveFailure(entry: RecentSearchEntry, error?: unknown): void {
    console.error(`Recent search "${entry.label}" could not be resolved:`, error);
    this.issues.report({
      source: 'recent-resolve',
      providerKey: entry.providerKey,
      resultId: entry.resultId,
      error,
    });
    this.recentSearches.removeEntry(entry.providerKey, entry.resultId);
  }

  private scheduleSearch(query: string, scopeKey: string | null): void {
    clearTimeout(this.searchDebounceTimer);
    if (!query.trim() || !this.searchRegistry.hasProviders()) {
      return;
    }
    const myGeneration = ++this.searchGeneration;
    this.searchDebounceTimer = setTimeout(() => {
      this.searchRegistry.search(query, scopeKey ?? undefined).then((results) => {
        if (myGeneration === this.searchGeneration) {
          this.searchResults.set(results);
        }
      });
    }, 200);
  }

  private moveSelection(delta: number): void {
    const count = this.isSearchModeActive()
      ? (this.searchResults()?.length ?? 0)
      : this.visibleRecents().length + this.flatMatches().length + this.visibleFavourites().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
}
```

Notable changes from the original:
- New `favourites` injection, `settingsOpen` signal, `settingsAvailable`/`visibleFavourites`/`favouriteShortcuts`/`selectedFavourite` computeds.
- `visibleFavourites` mirrors `visibleRecents`'s gating exactly (empty during search mode or while scoped) — with zero favourites configured/added, it's always `[]`, so every pre-existing test (none of which configures `favouritesStorageKey`) is unaffected.
- The selection-count `effect()` and `moveSelection()` both now add `visibleFavourites().length` to the non-search-mode count — with zero favourites this is `+ 0`, identical to before.
- `selectedFavourite` uses an offset of `visibleRecents().length + flatMatches().length` (favourites are selectable *after* Commands, matching the reference screenshot's Recent → Actions → Favourites ordering) — with zero favourites, `index` is always out of range and `selectedFavourite()` is always `undefined`, so `selectedCommand`'s own behavior (which only depends on the recents offset) is completely unaffected by this addition.
- `activeDescendantId` and the `Enter` case both gain a favourites branch, checked after recents and before falling back to Commands.
- New `,` case opens Settings, gated on `settingsAvailable()` and the same empty-query/unscoped condition already used elsewhere.
- The `default` case now also checks `favouriteShortcuts()` for a `mod+N` match after checking `registry.matchShortcut(event)` — this works from any view/query/scope state, exactly like a Command's own shortcut already does, since it requires a modifier and therefore never conflicts with typing.
- `open()` now also resets `settingsOpen` to `false`.
- New `runFavourite()` method, plus the `imports: [CmdkSettingsPanelComponent]` addition to the `@Component` decorator.

- [ ] **Step 4: Implement the template changes**

Replace the full contents of `projects/ngx-cmdk/src/lib/palette/cmdk-palette.html` with:

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
      @if (settingsOpen()) {
        <ngx-cmdk-settings-panel (close)="settingsOpen.set(false)" />
      } @else {
        <div class="cmdk-input-row">
          @if (scopedProviderKey(); as scopedKey) {
            <span class="cmdk-scope-token">{{ scopedKey }}</span>
          }
          <input
            #searchInput
            class="cmdk-input"
            type="text"
            [attr.aria-label]="searchInputLabel()"
            [attr.aria-activedescendant]="activeDescendantId()"
            [value]="query()"
            (input)="onQueryChange($any($event.target).value)"
          />
        </div>
        @if (scopedProviderKey() === null && searchProviders().length > 0) {
          <div class="cmdk-chip-row">
            @for (provider of searchProviders(); track provider.key) {
              <button type="button" class="cmdk-chip" (click)="selectProviderScope(provider.key)">
                {{ provider.label }}
              </button>
            }
          </div>
        }
        <div class="cmdk-list" role="listbox">
          @if (isSearchModeActive()) {
            @if (searchResults(); as results) {
              @for (result of results; track $index) {
                <div
                  [id]="'cmdk-item-search-' + $index"
                  class="cmdk-item"
                  [class.cmdk-item--selected]="$index === selectedIndex()"
                  role="option"
                  [attr.aria-selected]="$index === selectedIndex()"
                  (click)="runSearchResult(result, searchRegistry.providerKeyFor(result))"
                >
                  <span class="cmdk-item-main">
                    @if (result.icon) {
                      <span class="cmdk-item-icon" [class]="result.icon" aria-hidden="true"></span>
                    }
                    <span class="cmdk-item-label">{{ result.label }}</span>
                  </span>
                  @if (result.subtitle) {
                    <span class="cmdk-item-subtitle">{{ result.subtitle }}</span>
                  }
                </div>
              } @empty {
                <div class="cmdk-empty">No results</div>
              }
            } @else {
              <div class="cmdk-empty">Searching…</div>
            }
          } @else {
            @if (visibleRecents().length > 0) {
              <div class="cmdk-group">
                <div class="cmdk-group-label">Recent searches</div>
                @for (recent of visibleRecents(); track recent.providerKey + ':' + recent.resultId) {
                  <div
                    [id]="'cmdk-item-recent-' + recent.providerKey + '-' + recent.resultId"
                    class="cmdk-item"
                    [class.cmdk-item--selected]="$index === selectedIndex()"
                    role="option"
                    [attr.aria-selected]="$index === selectedIndex()"
                    (click)="runRecentEntry(recent)"
                  >
                    <span class="cmdk-item-main">
                      @if (recent.icon) {
                        <span class="cmdk-item-icon" [class]="recent.icon" aria-hidden="true"></span>
                      }
                      <span class="cmdk-item-label">{{ recent.label }}</span>
                    </span>
                    @if (recent.subtitle) {
                      <span class="cmdk-item-subtitle">{{ recent.subtitle }}</span>
                    }
                  </div>
                }
              </div>
            }
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
                    (click)="runSelectedCommand(match.item)"
                  >
                    <span class="cmdk-item-main">
                      @if (match.item.icon) {
                        <span class="cmdk-item-icon" [class]="match.item.icon" aria-hidden="true"></span>
                      }
                      <span class="cmdk-item-label">{{ resolveLabel(match.item) }}</span>
                    </span>
                    @if (match.item.shortcut) {
                      <span class="cmdk-shortcut">{{ formatShortcut(match.item.shortcut) }}</span>
                    }
                  </div>
                }
              </div>
            } @empty {
              @if (visibleRecents().length === 0 && visibleFavourites().length === 0) {
                <div class="cmdk-empty">No matching commands</div>
              }
            }
            @if (visibleFavourites().length > 0) {
              <div class="cmdk-group">
                <div class="cmdk-group-label">Favourites</div>
                @for (favourite of visibleFavourites(); track favourite.id) {
                  <div
                    [id]="'cmdk-item-favourite-' + favourite.id"
                    class="cmdk-item"
                    [class.cmdk-item--selected]="favourite.id === selectedFavourite()?.id"
                    role="option"
                    [attr.aria-selected]="favourite.id === selectedFavourite()?.id"
                    (click)="runFavourite(favourite)"
                  >
                    <span class="cmdk-item-main">
                      <span class="cmdk-item-label">{{ favourite.label }}</span>
                    </span>
                    <span class="cmdk-shortcut">{{ formatShortcut('mod+' + ($index + 1)) }}</span>
                  </div>
                }
              </div>
            }
          }
        </div>
      }
    </div>
  </div>
}
```

Notable changes: the whole "list mode" content (input row, chip row, list) is now the `@else` branch of a new `@if (settingsOpen())` at the top of `.cmdk-panel` — when `settingsOpen()` is true, `<ngx-cmdk-settings-panel (close)="settingsOpen.set(false)" />` renders instead, and its own `stopPropagation()`-based keydown handler (Task 4) means none of its keystrokes ever reach this outer `(keydown)="onKeydown($event)"`. The Commands `@for`'s `@empty` block now also checks `visibleFavourites().length === 0` so "No matching commands" doesn't render above a non-empty Favourites section when there are zero registered Commands. A new Favourites `@if` block follows the Commands `@for`/`@empty` construct (which must stay adjacent per Angular's control-flow syntax), rendering each favourite's `mod+N` shortcut hint via the implicit `$index` — reusing `.cmdk-group`/`.cmdk-group-label`/`.cmdk-item`/`.cmdk-item-main`/`.cmdk-item-label`/`.cmdk-shortcut`, no new CSS classes.

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -120
```

Expected: PASS — every pre-existing `cmdk-palette.spec.ts` test still green (favourites/settings are all zero-length/inert no-ops when no `favouritesStorageKey`/`recentSearchesStorageKey` is configured, matching every existing test's setup), plus every new test from Step 1.

- [ ] **Step 6: Build the library**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: build succeeds with no errors or new warnings.

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts projects/ngx-cmdk/src/lib/palette/cmdk-palette.html projects/ngx-cmdk/src/lib/palette/cmdk-palette.spec.ts
git commit -m "Integrate Favourites and Settings into CmdkPaletteComponent"
```

---

### Task 6: Demo app wiring

**Files:**
- Modify: `projects/demo/src/app/app.config.ts`
- Modify: `projects/demo/src/app/app.ts`
- Modify: `projects/demo/src/app/app.spec.ts`
- Modify: `projects/demo/src/app/app.html`

**Interfaces:**
- Consumes: `provideCmdk({ favouritesStorageKey, navigate })` (Task 1) — all via the public `ngx-cmdk` package path.

- [ ] **Step 1: Read the current demo files for context**

`projects/demo/src/app/app.config.ts` currently reads:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCmdk({ shortcut: 'mod+k', recentSearchesStorageKey: () => 'ngx-cmdk-demo-recents' }),
  ],
};
```

`projects/demo/src/app/app.ts` currently reads:

```ts
import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { ApiReference } from './api-reference';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';
import { DemoSearch } from './demo-search';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav, DemoSearch, ApiReference],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);

  protected readonly installSnippet = 'npm install ngx-cmdk';

  protected readonly providerSnippet = `providers: [provideCmdk()]`;

  protected readonly templateSnippet = '<ngx-cmdk-palette />';

  protected readonly registerSnippet = `constructor() {
  const registry = inject(CommandRegistryService);
  registry.register({
    label: 'Go to Settings',
    shortcut: 'mod+s',
    execute: () => { this.router.navigate(['/settings']); },
  });
}`;
}
```

- [ ] **Step 2: Write the failing test**

Read `projects/demo/src/app/app.spec.ts` first (reproduced above's shape is simple — two `it`s, no `beforeEach` config beyond `imports: [App]`). Add this test to it, alongside the existing two:

```ts
  it('wires demoNavigateTarget.current to log a navigation to the activity log', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const activityLog = TestBed.inject(DemoActivityLog);

    demoNavigateTarget.current('/production-orders');

    expect(activityLog.recent()[0]).toBe('Navigated to "/production-orders"');
  });
```

Add these two imports to the top of `app.spec.ts`, alongside the existing ones:

```ts
import { demoNavigateTarget } from './app.config';
import { DemoActivityLog } from './demo-activity-log';
```

- [ ] **Step 3: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: FAIL — `demoNavigateTarget` doesn't exist yet in `app.config.ts`, and `App`'s constructor doesn't set it.

- [ ] **Step 4: Add `favouritesStorageKey`/`navigate` to `app.config.ts` via a mutable indirection object**

Replace the full contents of `projects/demo/src/app/app.config.ts` with:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

export const demoNavigateTarget = {
  current: (path: string) => console.log('[ngx-cmdk demo] navigate:', path),
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCmdk({
      shortcut: 'mod+k',
      recentSearchesStorageKey: () => 'ngx-cmdk-demo-recents',
      favouritesStorageKey: () => 'ngx-cmdk-demo-favourites',
      navigate: (path) => demoNavigateTarget.current(path),
    }),
  ],
};
```

- [ ] **Step 5: Wire the real behavior into `App`'s constructor**

Replace the full contents of `projects/demo/src/app/app.ts` with:

```ts
import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { ApiReference } from './api-reference';
import { demoNavigateTarget } from './app.config';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';
import { DemoSearch } from './demo-search';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav, DemoSearch, ApiReference],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);

  protected readonly installSnippet = 'npm install ngx-cmdk';

  protected readonly providerSnippet = `providers: [provideCmdk()]`;

  protected readonly templateSnippet = '<ngx-cmdk-palette />';

  protected readonly registerSnippet = `constructor() {
  const registry = inject(CommandRegistryService);
  registry.register({
    label: 'Go to Settings',
    shortcut: 'mod+s',
    execute: () => { this.router.navigate(['/settings']); },
  });
}`;

  constructor() {
    demoNavigateTarget.current = (path) => this.log.log(`Navigated to "${path}"`);
  }
}
```

The `app.config.ts`/`App` pairing is exactly the pattern to recommend to a real host app that needs an injectable (like `Router`) inside a `navigate` closure: `provideCmdk()`'s call site in `app.config.ts` has no active injection context, but the root component's constructor does — so the config holds a stable indirection function, and the root component overwrites what it actually does once DI is available.

- [ ] **Step 6: Update the demo's copy to mention Favourites/Settings**

In `projects/demo/src/app/app.html`, change:

```html
    <p>
      These panels register real commands and a real search provider from
      independent components, exactly as a consuming app would. Open the
      palette and try "Go to Section A", "Show Alert", "Cause Error", or
      type a fruit name to search.
    </p>
```

to:

```html
    <p>
      These panels register real commands and a real search provider from
      independent components, exactly as a consuming app would. Open the
      palette and try "Go to Section A", "Show Alert", "Cause Error", or
      type a fruit name to search. Press <kbd>,</kbd> with an empty query to
      open Settings and add your own Favourites — each gets a
      <kbd>⌘1</kbd>–<kbd>⌘9</kbd> shortcut based on its position.
    </p>
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add projects/demo/src/app/app.config.ts projects/demo/src/app/app.ts projects/demo/src/app/app.spec.ts projects/demo/src/app/app.html
git commit -m "Wire Favourites and Settings into the demo app"
```

---

### Task 7: Docs page update

**Files:**
- Modify: `projects/demo/src/app/api-reference.ts`
- Modify: `projects/demo/src/app/api-reference.html`

**Interfaces:**
- Consumes: nothing programmatic — this task only updates static documentation strings/markup, matching the existing pattern for every previously-documented capability.

- [ ] **Step 1: Add a `favouritesSnippet` and update `cmdkIssueSnippet`**

In `projects/demo/src/app/api-reference.ts`, replace:

```ts
  protected readonly cmdkIssueSnippet = `type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown };

class CmdkIssueService {
  onIssue(callback: (issue: CmdkIssue) => void): () => void;
}`;
}
```

with:

```ts
  protected readonly favouritesSnippet = `function provideCmdk(config?: {
  shortcut?: string;
  searchTimeoutMs?: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;   // unset = feature is fully off
  navigate?: (path: string) => void | Promise<void>;
}): EnvironmentProviders;

class FavouritesService {
  readonly favourites: Signal<readonly { id: string; label: string; path: string }[]>; // capped at 9
  add(label: string, path: string): void;
  remove(id: string): void;
  moveUp(id: string): void;
  moveDown(id: string): void;
  clear(): void;
}`;

  protected readonly cmdkIssueSnippet = `type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown }
  | { source: 'favourite-navigate'; label: string; path: string; error: unknown };

class CmdkIssueService {
  onIssue(callback: (issue: CmdkIssue) => void): () => void;
}`;
}
```

- [ ] **Step 2: Add a "Favourites & Settings" article and correct the stale digit-shortcut claim**

In `projects/demo/src/app/api-reference.html`, insert a new `<article>` immediately after the existing `<article><h3>Recent searches</h3>...</article>` block (i.e. between "Recent searches" and "CmdkIssueService"):

```html
  <article>
    <h3>Favourites &amp; Settings</h3>
    <p>
      Opt-in and hard-gated like Recent Searches: with no
      <code>favouritesStorageKey</code> configured, Favourites track
      nothing and never render. A favourite is a plain
      <code>{ label, path }</code> pair the end user types in
      themselves — not a registered <code>Command</code> — persisted to
      <code>localStorage</code> and selected via a
      <code>navigate: (path) =&gt; void | Promise&lt;void&gt;</code>
      callback you supply, so this library never imports
      <code>@angular/router</code> itself.
    </p>
    <p>
      Favourites appear below Actions in the same empty-query, unscoped
      browse view Recent Searches uses. Each favourite's position assigns
      its shortcut — the 1st is <code>mod+1</code>, up to the 9th at
      <code>mod+9</code> — which is why the list is capped at 9 and why
      Command shortcuts can no longer use a digit key at all, with or
      without a modifier: the digit namespace is reserved for favourites
      everywhere in this library.
    </p>
    <p>
      Press <code>,</code> with an empty, unscoped query to open
      Settings — a second view inside the same palette, not a separate
      component to mount — where favourites are added, removed, and
      reordered, and where a "Clear recent searches" action lives if
      <code>recentSearchesStorageKey</code> is configured. Settings
      itself is reachable only when at least one of those two keys is
      set; with neither configured, <code>,</code> does nothing.
    </p>
    <pre class="doc-code"><code>{{ favouritesSnippet }}</code></pre>
  </article>
```

Then, in the existing "Shortcut rules" article, replace:

```html
      <li>
        Every shortcut needs a real modifier (<code>mod</code>,
        <code>ctrl</code>, <code>alt</code>, or <code>cmd</code>/
        <code>meta</code>) plus exactly one key — a single letter or digit
        (a-z or 0-9), e.g. <code>"mod+s"</code> or <code>"mod+shift+p"</code>.
        A bare key, a shift-only combo, or a key that isn't a single
        letter/digit is rejected at registration time.
      </li>
```

with:

```html
      <li>
        Every shortcut needs a real modifier (<code>mod</code>,
        <code>ctrl</code>, <code>alt</code>, or <code>cmd</code>/
        <code>meta</code>) plus exactly one key — a single letter (a-z),
        e.g. <code>"mod+s"</code> or <code>"mod+shift+p"</code>. A bare
        key, a shift-only combo, a digit key, or a key that isn't a
        single letter is rejected at registration time — digits are
        reserved for favourite shortcuts (<code>mod+1</code> through
        <code>mod+9</code>).
      </li>
```

- [ ] **Step 3: Verify the demo still builds and tests pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -40
```

Expected: build and tests pass (the docs page has no dedicated spec asserting snippet content — manual visual confirmation happens in Task 8's smoke test).

- [ ] **Step 4: Commit**

```bash
git add projects/demo/src/app/api-reference.ts projects/demo/src/app/api-reference.html
git commit -m "Document Favourites and Settings in the demo API reference"
```

---

### Task 8: Final verification

**Files:** none modified — this task only runs checks.

- [ ] **Step 1: Full library build**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: succeeds with no errors or warnings.

- [ ] **Step 2: Full library test suite**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -120
```

Expected: all tests pass, including every test added across Tasks 1–5.

- [ ] **Step 3: Full demo build and test suite**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build demo 2>&1 | tail -40
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: both succeed.

- [ ] **Step 4: Manual browser smoke test**

Serve the demo locally and drive it with Playwright (or manually, if Playwright tooling isn't available in this environment):

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng serve demo --port 4300 2>&1 &
sleep 5
```

Then, in the browser:
1. Open the served demo, press the palette's open shortcut.
2. Press `,` with the query empty — confirm the Settings panel opens, showing both a "Favourites" section and a "Recent searches" section (both keys are configured in the demo).
3. Type a Label ("Production orders") and Path ("/production-orders") in the add row, submit — confirm it appears in the list above, with move-up/move-down and a remove (×) button.
4. Add a second favourite, use its move-up button to reorder it above the first — confirm the order changes.
5. Click "CLOSE SETTINGS" — confirm it returns to the list view (palette stays open).
6. With an empty, unscoped query, confirm a "Favourites" section renders below "Actions", each row showing a `⌘1`/`⌘2`-style shortcut hint matching its position.
7. Press `⌘1` (or `Ctrl+1`) — confirm the activity log records "Navigated to ..." for the first favourite, and the palette closes.
8. Reopen the palette, press `,`, remove a favourite via its × button — confirm it disappears and the remaining favourite's shortcut hint updates to `⌘1`.
9. Reload the page entirely, reopen the palette, press `,` — confirm the remaining favourite is still listed (proving `localStorage` round-trip survives a reload).
10. In Settings, click "Clear recent searches" (after first performing a search from the search panel to populate it) — confirm the Recent Searches section in the main browse view disappears.
11. Try typing a query starting with a digit (e.g. "1 item") in the main search input — confirm the digit types normally into the query rather than triggering a favourite navigation.
12. Add 9 favourites total — confirm the add row in Settings is replaced with the "Maximum of 9 favourites reached" message.

Stop the dev server once verification is complete:

```bash
kill %1 2>/dev/null
```

- [ ] **Step 5: Final commit (if any cleanup was needed) or confirm the branch is ready for review**

If Step 4 surfaced no issues requiring code changes, no commit is needed here — the branch is ready for the final whole-branch review and PR.
