# ngx-cmdk: Translatable UI Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-facing string in the palette and Settings panel overridable via a new `labels` field on `provideCmdk()`'s config, with English defaults and live runtime updates if a host app's own locale state changes.

**Architecture:** A new `CmdkLabels` interface (23 flat string keys) and `DEFAULT_CMDK_LABELS` constant live in a new `cmdk-labels.ts` file, alongside a `CmdkLabelsService` (`providedIn: 'root'`) whose single `labels` computed signal shallow-merges `DEFAULT_CMDK_LABELS` with whatever the config's new `labels?: () => Partial<CmdkLabels>` callback currently returns. Because `computed()` transparently tracks any signal read inside that callback, a host app whose callback reads its own locale signal gets live language switching for free — the same mechanism `favouritesStorageKey` already uses for per-user scoping. `CmdkPaletteComponent` and `CmdkSettingsPanelComponent` each inject the service once and swap every hardcoded template string for a `labels().key` read.

**Tech Stack:** Angular 22 (standalone, signals, zoneless), Vitest with `vitest/globals` (`describe`/`it`/`expect`/`vi` are globals — never `import` them from `'vitest'`), `ng-packagr` for the library build, no RxJS in library code.

**Spec:** `docs/superpowers/specs/2026-08-25-ngx-cmdk-i18n-labels-design.md` (approved) — this plan implements it in full; executors should read both.

## Global Constraints

- No RxJS anywhere in `projects/ngx-cmdk` library code — signals only.
- Standalone components only; no NgModules.
- Test files use Vitest globals (`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`) with no import from `'vitest'`.
- **Zero behavior change by default is a hard requirement.** `DEFAULT_CMDK_LABELS` must contain the exact English text hardcoded today — every existing spec assertion on that text (`expect(...).toContain('Navigate')`, `expect(...).toContain('Maximum of 9 favourites reached')`, etc.) must keep passing unchanged. No existing spec file's assertions on hardcoded English text should need editing.
- **Partial overrides fall back to English.** `labels: () => ({ closeSettings: 'FERMER' })` must leave every other key at its English default — the merge is `{ ...DEFAULT_CMDK_LABELS, ...config.labels?.() }`, never a full replacement.
- `CmdkLabels` is a flat interface — no nested groups. `recentSearchesGroup` and `favouritesGroup` are each used in two places (palette group header + settings section label) and must stay single, shared keys, not duplicated per-location.
- `favouritesLimitReached`'s default text contains the literal substring `%max%`, substituted via `.replace('%max%', String(MAX_FAVOURITE_ENTRIES))` — not a function-typed label, and no generic interpolation engine (it's the only label needing a parameter).
- `CmdkLabels`, `DEFAULT_CMDK_LABELS`, and `CmdkLabelsService` are all exported from `public-api.ts` — a host app needs `CmdkLabels` to type-check its own `labels` callback, and may want `DEFAULT_CMDK_LABELS` to build a translation by spreading over it.
- Before any Angular CLI command: `source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null` (each fresh Bash call is a new shell — this must run in every command block).
- Build the library before touching the demo app: `npx ng build ngx-cmdk` must succeed before any `projects/demo` build/serve/test, since the demo's tsconfig path-maps `ngx-cmdk` imports to `dist/ngx-cmdk`.
- Isolated worktree per this repo's established convention: `.worktrees/ngx-cmdk-i18n-labels` (gitignored), branch `ngx-cmdk-i18n-labels`, created via `git worktree add .worktrees/ngx-cmdk-i18n-labels -b ngx-cmdk-i18n-labels`, then `npm install` + baseline `npx ng build ngx-cmdk` + baseline `npx ng test ngx-cmdk --watch=false` before any implementation work, run from inside the worktree.
- New library-internal files follow the existing `lib/<feature>/` convention: this plan adds one new file, `lib/config/cmdk-labels.ts`, alongside the existing `lib/config/cmdk-config.ts`.
- Never add a `Co-Authored-By: Claude` trailer to any commit message.

## Plan-Level Judgment Calls

The spec is authoritative on behavior; some internals are implementation-level decisions this plan makes explicitly, each consistent with the spec's stated contracts:

1. **`CmdkLabelsService` lives in `cmdk-labels.ts`, not `cmdk-config.ts`.** `cmdk-config.ts` only grows one line (the new `labels` field on the `CmdkConfig` interface); the 23-key interface, the sizeable default-strings object, and the service all live in their own file, matching this codebase's existing pattern of keeping each concern in its own small file (e.g. `favourites.ts` living apart from `cmdk-config.ts` even though `FavouritesService` reads `CMDK_CONFIG`).
2. **`favouritesLimitMessage` lives on `CmdkSettingsPanelComponent`, not inside `CmdkLabelsService`.** The `%max%` substitution needs `MAX_FAVOURITE_ENTRIES`, a `favourites.ts` concern the labels service has no reason to know about. Keeping the substitution at the one call site that needs it avoids giving the generic labels service a favourites-specific special case.
3. **`MAX_FAVOURITE_ENTRIES` is exported as a plain `const`, not wrapped in a getter or moved onto `FavouritesService`.** It's already file-scoped, immutable, and has exactly one new consumer (`cmdk-settings-panel.ts`) in addition to its existing internal uses — a plain named export is the smallest change that removes the duplication.
4. **The `< 9` cap-check in `cmdk-settings-panel.html` switches to `< MAX_FAVOURITE_ENTRIES`** (imported into the component and exposed as a `protected readonly` field for the template to read), rather than leaving the template's own literal `9` in place next to a newly-parameterized message. Leaving it would defeat the point of removing the hardcoded number from the one place a translator actually sees it.
5. **No new `CmdkIssue` variant, no new error-reporting path.** The spec's "Error handling" section explicitly says a throwing `labels()` callback should propagate like any other computed's error, with no defensive wrapping — this plan adds nothing here.
6. **The demo app is not updated to pass a `labels` override.** The spec's scope is the mechanism itself; the existing demo already exercises the "no labels configured" path implicitly (every current demo screenshot/test already renders `DEFAULT_CMDK_LABELS`' text, since that's what today's hardcoded strings become). Adding a second, translated demo instance is a documentation/demo-app enhancement outside this plan.

---

### Task 1: `CmdkLabels` interface, `DEFAULT_CMDK_LABELS`, and `CmdkLabelsService`

**Files:**
- Create: `projects/ngx-cmdk/src/lib/config/cmdk-labels.ts`
- Create: `projects/ngx-cmdk/src/lib/config/cmdk-labels.spec.ts`
- Modify: `projects/ngx-cmdk/src/lib/config/cmdk-config.ts`
- Modify: `projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: `CMDK_CONFIG` (existing).
- Produces: `interface CmdkLabels { ...23 string keys... }`, `const DEFAULT_CMDK_LABELS: CmdkLabels`, `class CmdkLabelsService { readonly labels: Signal<CmdkLabels>; }` — all exported from `public-api.ts`, consumed by Tasks 2 and 3. `CmdkConfig.labels?: () => Partial<CmdkLabels>` — consumed by `CmdkLabelsService` in this task, and referenced (but not re-declared) by Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/config/cmdk-labels.spec.ts`:

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideCmdk } from './cmdk-config';
import { CmdkLabelsService, DEFAULT_CMDK_LABELS } from './cmdk-labels';

describe('CmdkLabelsService', () => {
  it('returns all English defaults when no labels callback is configured', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    const service = TestBed.inject(CmdkLabelsService);
    expect(service.labels()).toEqual(DEFAULT_CMDK_LABELS);
  });

  it('merges a partial override over the defaults, leaving unset keys unchanged', () => {
    TestBed.configureTestingModule({
      providers: [provideCmdk({ labels: () => ({ closeSettings: 'FERMER' }) })],
    });
    const service = TestBed.inject(CmdkLabelsService);
    expect(service.labels().closeSettings).toBe('FERMER');
    expect(service.labels().footerNavigate).toBe(DEFAULT_CMDK_LABELS.footerNavigate);
  });

  it('re-computes live when the labels callback reads a signal that later changes', () => {
    const activeLabel = signal('English close');
    TestBed.configureTestingModule({
      providers: [provideCmdk({ labels: () => ({ closeSettings: activeLabel() }) })],
    });
    const service = TestBed.inject(CmdkLabelsService);
    expect(service.labels().closeSettings).toBe('English close');

    activeLabel.set('French close');
    TestBed.tick();

    expect(service.labels().closeSettings).toBe('French close');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: FAIL — `./cmdk-labels` module doesn't exist yet.

- [ ] **Step 3: Add the `labels` field to `CmdkConfig`**

In `projects/ngx-cmdk/src/lib/config/cmdk-config.ts`, change:

```ts
export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;
  navigate?: (path: string) => void | Promise<void>;
}
```

to (this also inserts a new `import type` line directly above the interface, right after the file's existing `import { hasExactlyOneKey, hasRequiredModifier, usesDigitKey } from '../shortcut/shortcut';` line):

```ts
import type { CmdkLabels } from './cmdk-labels';

export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;
  navigate?: (path: string) => void | Promise<void>;
  labels?: () => Partial<CmdkLabels>;
}
```

Leave `DEFAULT_CMDK_CONFIG`, `CMDK_CONFIG`, and `provideCmdk()` otherwise unchanged — `{ ...DEFAULT_CMDK_CONFIG, ...config }` already spreads through the new optional field correctly, and `DEFAULT_CMDK_CONFIG` needs no `labels` entry (an absent key, not an explicit `undefined`, is what `CmdkLabelsService`'s `?.()` checks against).

- [ ] **Step 4: Implement `cmdk-labels.ts`**

Create `projects/ngx-cmdk/src/lib/config/cmdk-labels.ts`:

```ts
import { Injectable, computed, inject } from '@angular/core';
import { CMDK_CONFIG } from './cmdk-config';

export interface CmdkLabels {
  dialogLabel: string;
  searchPlaceholderDefault: string;
  searchPlaceholderActive: string;
  noResults: string;
  searching: string;
  noMatchingCommands: string;
  recentSearchesGroup: string;
  favouritesGroup: string;
  footerNavigate: string;
  footerSelect: string;
  footerClose: string;
  footerSettings: string;
  moveUp: string;
  moveDown: string;
  removeFavourite: string;
  addFavourite: string;
  labelPlaceholder: string;
  pathPlaceholder: string;
  favouritesLimitReached: string;
  clearRecentSearches: string;
  recentSearchesCleared: string;
  noRecentSearchesFound: string;
  closeSettings: string;
}

export const DEFAULT_CMDK_LABELS: CmdkLabels = {
  dialogLabel: 'Command palette',
  searchPlaceholderDefault: 'Search commands',
  searchPlaceholderActive: 'Search',
  noResults: 'No results',
  searching: 'Searching…',
  noMatchingCommands: 'No matching commands',
  recentSearchesGroup: 'Recent searches',
  favouritesGroup: 'Favourites',
  footerNavigate: 'Navigate',
  footerSelect: 'Select',
  footerClose: 'Close',
  footerSettings: 'Settings',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeFavourite: 'Remove favourite',
  addFavourite: 'Add favourite',
  labelPlaceholder: 'Label',
  pathPlaceholder: 'Path',
  favouritesLimitReached: 'Maximum of %max% favourites reached — remove one to add another.',
  clearRecentSearches: 'Clear recent searches',
  recentSearchesCleared: 'Recent searches cleared.',
  noRecentSearchesFound: 'No recent searches found.',
  closeSettings: 'CLOSE SETTINGS',
};

@Injectable({ providedIn: 'root' })
export class CmdkLabelsService {
  private readonly config = inject(CMDK_CONFIG);

  readonly labels = computed(() => ({ ...DEFAULT_CMDK_LABELS, ...this.config.labels?.() }));
}
```

- [ ] **Step 5: Export the new symbols from `public-api.ts`**

In `projects/ngx-cmdk/src/public-api.ts`, add these two lines (alongside the existing config exports):

```ts
export { CmdkLabelsService, DEFAULT_CMDK_LABELS } from './lib/config/cmdk-labels';
export type { CmdkLabels } from './lib/config/cmdk-labels';
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
export { CmdkLabelsService, DEFAULT_CMDK_LABELS } from './lib/config/cmdk-labels';
export type { CmdkLabels } from './lib/config/cmdk-labels';
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

- [ ] **Step 6: Add a `provideCmdk()` config test for `labels`**

Add to `projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts`, inside the existing `describe('provideCmdk', ...)` block, alongside the existing `favouritesStorageKey`/`navigate` test:

```ts
  it('accepts an optional labels callback and leaves it unset by default', () => {
    const withLabels = provideCmdk({ labels: () => ({ closeSettings: 'FERMER' }) });
    const withoutLabels = provideCmdk();
    expect(withLabels).toBeTruthy();
    expect(withoutLabels).toBeTruthy();
  });
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: PASS, including all three new `cmdk-labels.spec.ts` tests and the new `cmdk-config.spec.ts` test.

- [ ] **Step 8: Build the library to verify the public API surface compiles**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add projects/ngx-cmdk/src/lib/config/cmdk-labels.ts projects/ngx-cmdk/src/lib/config/cmdk-labels.spec.ts projects/ngx-cmdk/src/lib/config/cmdk-config.ts projects/ngx-cmdk/src/lib/config/cmdk-config.spec.ts projects/ngx-cmdk/src/public-api.ts
git commit -m "Add CmdkLabels, DEFAULT_CMDK_LABELS, and CmdkLabelsService"
```

---

### Task 2: Export `MAX_FAVOURITE_ENTRIES` from `favourites.ts`

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/favourites/favourites.ts`

**Interfaces:**
- Produces: `MAX_FAVOURITE_ENTRIES: number`, now exported — consumed by Task 4 (`CmdkSettingsPanelComponent`).
- Consumes: nothing new.

This task has no new behavior to test — it's a visibility change to an existing, already-tested constant (every existing `favourites.spec.ts` test that depends on the cap of 9 keeps passing unchanged, since the constant's value doesn't change). No new spec file; the existing `favourites.spec.ts` suite is the regression check.

- [ ] **Step 1: Export the constant**

In `projects/ngx-cmdk/src/lib/favourites/favourites.ts`, change:

```ts
const MAX_FAVOURITE_ENTRIES = 9;
```

to:

```ts
export const MAX_FAVOURITE_ENTRIES = 9;
```

Nothing else in the file changes — every internal reference to `MAX_FAVOURITE_ENTRIES` already uses the bare identifier, which `export const` doesn't affect.

- [ ] **Step 2: Run tests to verify nothing broke**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: PASS — every existing `favourites.spec.ts` test, unchanged.

- [ ] **Step 3: Commit**

```bash
git add projects/ngx-cmdk/src/lib/favourites/favourites.ts
git commit -m "Export MAX_FAVOURITE_ENTRIES from favourites.ts"
```

---

### Task 3: Wire `CmdkLabelsService` into `CmdkPaletteComponent`

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts`
- Modify: `projects/ngx-cmdk/src/lib/palette/cmdk-palette.html`
- Modify: `projects/ngx-cmdk/src/lib/palette/cmdk-palette.spec.ts`

**Interfaces:**
- Consumes: `CmdkLabelsService` (Task 1).
- Produces: nothing new for other tasks — `CmdkPaletteComponent`'s public shape (selector, inputs/outputs) is unchanged.

- [ ] **Step 1: Write the failing test**

Add to `projects/ngx-cmdk/src/lib/palette/cmdk-palette.spec.ts`, as a new top-level `describe` block (place it after the existing `describe('footer', ...)` block). This follows the exact `reconfigure()` convention the file's `describe('favourites and settings', ...)` block already establishes for tests that need a non-default `provideCmdk()` config — remove the old fixture, `TestBed.resetTestingModule()`, re-set the platform property, reconfigure, recreate the fixture, re-inject `registry`:

```ts
describe('labels', () => {
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
    fixture.detectChanges();
  }

  it('renders an overridden label in place of its English default', () => {
    reconfigure({ labels: () => ({ footerNavigate: 'Naviguer' }) });
    pressOpenShortcut();

    const footer = fixture.nativeElement.querySelector('.cmdk-footer');
    expect(footer.textContent).toContain('Naviguer');
    expect(footer.textContent).not.toContain('Navigate');
  });
});
```

`pressOpenShortcut()` and the shared `fixture`/`registry` variables are this spec file's existing top-of-file declarations — reuse them as-is, do not redeclare.

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: FAIL — `labels` isn't consumed anywhere yet, so the footer still renders "Navigate".

- [ ] **Step 3: Inject the service and replace `searchInputLabel`**

In `projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts`, add to the import block:

```ts
import { CmdkLabelsService } from '../config/cmdk-labels';
```

Change:

```ts
  private readonly issues = inject(CmdkIssueService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
```

to:

```ts
  private readonly issues = inject(CmdkIssueService);
  private readonly config = inject(CMDK_CONFIG);
  protected readonly labels = inject(CmdkLabelsService).labels;
  private readonly document = inject(DOCUMENT);
```

Change:

```ts
  protected readonly searchInputLabel = computed(() =>
    this.isSearchModeActive() ? 'Search' : 'Search commands',
  );
```

to:

```ts
  protected readonly searchInputLabel = computed(() =>
    this.isSearchModeActive() ? this.labels().searchPlaceholderActive : this.labels().searchPlaceholderDefault,
  );
```

- [ ] **Step 4: Replace every remaining hardcoded string in `cmdk-palette.html`**

In `projects/ngx-cmdk/src/lib/palette/cmdk-palette.html`, make the following replacements (each is a literal-text-to-binding swap; surrounding markup, attributes, and structure are unchanged):

Change:

```html
      aria-label="Command palette"
```

to:

```html
      [attr.aria-label]="labels().dialogLabel"
```

Change:

```html
              } @empty {
                <div class="cmdk-empty">No results</div>
              }
            } @else {
              <div class="cmdk-empty">Searching…</div>
            }
```

to:

```html
              } @empty {
                <div class="cmdk-empty">{{ labels().noResults }}</div>
              }
            } @else {
              <div class="cmdk-empty">{{ labels().searching }}</div>
            }
```

Change:

```html
              <div class="cmdk-group">
                <div class="cmdk-group-label">Recent searches</div>
```

to:

```html
              <div class="cmdk-group">
                <div class="cmdk-group-label">{{ labels().recentSearchesGroup }}</div>
```

Change:

```html
            } @empty {
              @if (visibleRecents().length === 0 && visibleFavourites().length === 0) {
                <div class="cmdk-empty">No matching commands</div>
              }
            }
```

to:

```html
            } @empty {
              @if (visibleRecents().length === 0 && visibleFavourites().length === 0) {
                <div class="cmdk-empty">{{ labels().noMatchingCommands }}</div>
              }
            }
```

Change:

```html
            @if (visibleFavourites().length > 0) {
              <div class="cmdk-group">
                <div class="cmdk-group-label">Favourites</div>
```

to:

```html
            @if (visibleFavourites().length > 0) {
              <div class="cmdk-group">
                <div class="cmdk-group-label">{{ labels().favouritesGroup }}</div>
```

Change:

```html
        <div class="cmdk-footer">
          <span class="cmdk-footer-hint"><span class="cmdk-footer-key">↑↓</span> Navigate</span>
          <span class="cmdk-footer-hint"><span class="cmdk-footer-key">↵</span> Select</span>
          <span class="cmdk-footer-hint"><span class="cmdk-footer-key">Esc</span> Close</span>
          @if (canOpenSettings()) {
            <span class="cmdk-footer-hint"><span class="cmdk-footer-key">,</span> Settings</span>
          }
        </div>
```

to:

```html
        <div class="cmdk-footer">
          <span class="cmdk-footer-hint"><span class="cmdk-footer-key">↑↓</span> {{ labels().footerNavigate }}</span>
          <span class="cmdk-footer-hint"><span class="cmdk-footer-key">↵</span> {{ labels().footerSelect }}</span>
          <span class="cmdk-footer-hint"><span class="cmdk-footer-key">Esc</span> {{ labels().footerClose }}</span>
          @if (canOpenSettings()) {
            <span class="cmdk-footer-hint"><span class="cmdk-footer-key">,</span> {{ labels().footerSettings }}</span>
          }
        </div>
```

Every other line in the file (chip labels from `provider.label`, item labels from consumer data, `[attr.aria-label]="searchInputLabel()"` which already reads the now-updated computed) is untouched.

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: PASS — the new `labels` test, and every pre-existing `cmdk-palette.spec.ts` test (including the `describe('footer', ...)` tests asserting `'Navigate'`/`'Select'`/`'Close'`/`'Settings'`, and any test asserting on `'Recent searches'`/`'Favourites'`/`'No results'`/`'Searching…'`/`'No matching commands'`/the dialog's aria-label), unchanged.

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts projects/ngx-cmdk/src/lib/palette/cmdk-palette.html projects/ngx-cmdk/src/lib/palette/cmdk-palette.spec.ts
git commit -m "Wire CmdkLabelsService into CmdkPaletteComponent"
```

---

### Task 4: Wire `CmdkLabelsService` into `CmdkSettingsPanelComponent`

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.ts`
- Modify: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html`
- Modify: `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.spec.ts`

**Interfaces:**
- Consumes: `CmdkLabelsService` (Task 1), `MAX_FAVOURITE_ENTRIES` (Task 2).
- Produces: nothing new for other tasks — `CmdkSettingsPanelComponent`'s public shape (selector, `close` output) is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.spec.ts`, as a new top-level `describe` block placed after the existing top-level tests (e.g. right before the `describe('favourites and settings', ...)` block, or as its own trailing block — match whatever the file's existing block structure is):

```ts
describe('labels', () => {
  it('renders an overridden label in place of its English default', () => {
    setup({ favouritesStorageKey: () => 'favs', labels: () => ({ closeSettings: 'FERMER' }) });

    expect(fixture.nativeElement.textContent).toContain('FERMER');
    expect(fixture.nativeElement.textContent).not.toContain('CLOSE SETTINGS');
  });

  it('substitutes %max% in an overridden favourites-limit message with the actual cap', () => {
    setup({
      favouritesStorageKey: () => 'favs',
      labels: () => ({ favouritesLimitReached: 'Cap of %max% hit.' }),
    });
    for (let i = 0; i < 9; i++) {
      favouritesService.add(`Item ${i}`, `/item-${i}`);
    }
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cap of 9 hit.');
    expect(fixture.nativeElement.textContent).not.toContain('%max%');
  });
});
```

This reuses the file's existing `setup()` helper and `favouritesService`/`fixture` variables, already declared at the top of the file — match their exact names, do not redeclare. The override (rather than asserting on the English default text) is deliberate: before Task 4's wiring exists, the panel renders the hardcoded English text regardless of any `labels` override, so this assertion genuinely fails at RED — asserting on the unmodified default text would trivially pass even before any of this task's code changes.

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: FAIL — `labels` isn't consumed anywhere yet, so `CLOSE SETTINGS` still renders literally instead of `'FERMER'` (first test), and the panel still renders the hardcoded English limit message instead of the overridden `'Cap of 9 hit.'` (second test).

- [ ] **Step 3: Inject the service, add `favouritesLimitMessage`, and switch the cap-check to `MAX_FAVOURITE_ENTRIES`**

In `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.ts`, add to the import block:

```ts
import { CmdkLabelsService } from '../config/cmdk-labels';
import { FavouritesService, MAX_FAVOURITE_ENTRIES } from '../favourites/favourites';
```

(replacing the existing `import { FavouritesService } from '../favourites/favourites';` line with the combined import above).

Change:

```ts
export class CmdkSettingsPanelComponent {
  private readonly config = inject(CMDK_CONFIG);
  protected readonly favouritesService = inject(FavouritesService);
  protected readonly recentSearches = inject(RecentSearchesService);
```

to:

```ts
export class CmdkSettingsPanelComponent {
  private readonly config = inject(CMDK_CONFIG);
  protected readonly favouritesService = inject(FavouritesService);
  protected readonly recentSearches = inject(RecentSearchesService);
  protected readonly labels = inject(CmdkLabelsService).labels;
  protected readonly maxFavourites = MAX_FAVOURITE_ENTRIES;
```

Change:

```ts
  protected readonly canSubmit = computed(() => this.newLabel().trim().length > 0 && this.newPath().trim().length > 0);
```

to:

```ts
  protected readonly canSubmit = computed(() => this.newLabel().trim().length > 0 && this.newPath().trim().length > 0);
  protected readonly favouritesLimitMessage = computed(() =>
    this.labels().favouritesLimitReached.replace('%max%', String(MAX_FAVOURITE_ENTRIES)),
  );
```

- [ ] **Step 4: Replace every hardcoded string in `cmdk-settings-panel.html`**

In `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html`, make the following replacements:

Change:

```html
      <div class="cmdk-settings-section-label">Favourites</div>
```

to:

```html
      <div class="cmdk-settings-section-label">{{ labels().favouritesGroup }}</div>
```

Change:

```html
              (click)="favouritesService.moveUp(favourite.id)"
              aria-label="Move up"
```

to:

```html
              (click)="favouritesService.moveUp(favourite.id)"
              [attr.aria-label]="labels().moveUp"
```

Change:

```html
              (click)="favouritesService.moveDown(favourite.id)"
              aria-label="Move down"
```

to:

```html
              (click)="favouritesService.moveDown(favourite.id)"
              [attr.aria-label]="labels().moveDown"
```

Change:

```html
            (click)="favouritesService.remove(favourite.id)"
            aria-label="Remove favourite"
```

to:

```html
            (click)="favouritesService.remove(favourite.id)"
            [attr.aria-label]="labels().removeFavourite"
```

Change:

```html
      @if (favouritesService.favourites().length < 9) {
        <div class="cmdk-settings-add-row">
          <input
            #labelInput
            class="cmdk-settings-input"
            type="text"
            placeholder="Label"
```

to:

```html
      @if (favouritesService.favourites().length < maxFavourites) {
        <div class="cmdk-settings-add-row">
          <input
            #labelInput
            class="cmdk-settings-input"
            type="text"
            [placeholder]="labels().labelPlaceholder"
```

Change:

```html
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
```

to:

```html
          <input
            class="cmdk-settings-input"
            type="text"
            [placeholder]="labels().pathPlaceholder"
            [value]="newPath()"
            (input)="newPath.set($any($event.target).value)"
            (keydown.enter)="submitAdd()"
          />
          <button
            type="button"
            class="cmdk-settings-add-button"
            [disabled]="!canSubmit()"
            (click)="submitAdd()"
            [attr.aria-label]="labels().addFavourite"
          >
            ↵
          </button>
        </div>
      } @else {
        <p class="cmdk-settings-limit-message">{{ favouritesLimitMessage() }}</p>
      }
```

Change:

```html
      <div class="cmdk-settings-section-label">Recent searches</div>
      @if (recentSearches.recent().length > 0) {
        <button type="button" class="cmdk-settings-clear-button" (click)="clearRecentSearches()">
          Clear recent searches
        </button>
      } @else if (justClearedRecentSearches()) {
        <p class="cmdk-settings-limit-message">Recent searches cleared.</p>
      } @else {
        <p class="cmdk-settings-limit-message">No recent searches found.</p>
      }
```

to:

```html
      <div class="cmdk-settings-section-label">{{ labels().recentSearchesGroup }}</div>
      @if (recentSearches.recent().length > 0) {
        <button type="button" class="cmdk-settings-clear-button" (click)="clearRecentSearches()">
          {{ labels().clearRecentSearches }}
        </button>
      } @else if (justClearedRecentSearches()) {
        <p class="cmdk-settings-limit-message">{{ labels().recentSearchesCleared }}</p>
      } @else {
        <p class="cmdk-settings-limit-message">{{ labels().noRecentSearchesFound }}</p>
      }
```

Change:

```html
    <button type="button" class="cmdk-settings-close-button" (click)="close.emit()">
      <span class="cmdk-settings-close-hint">,</span>
      CLOSE SETTINGS
    </button>
```

to:

```html
    <button type="button" class="cmdk-settings-close-button" (click)="close.emit()">
      <span class="cmdk-settings-close-hint">,</span>
      {{ labels().closeSettings }}
    </button>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: PASS — both new `labels` tests, and every pre-existing `cmdk-settings-panel.spec.ts` test (including the `'Maximum of 9 favourites reached'`, `'Clear recent searches'`, `'Recent searches cleared.'`, `'No recent searches found.'`, `'CLOSE SETTINGS'`, `input[placeholder="Label"]` selector, and `aria-label="Move up"`-style assertions, all of which now come from `DEFAULT_CMDK_LABELS` but render identical text/attributes), unchanged.

- [ ] **Step 6: Build the library and run the demo app's tests**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: library build succeeds; every demo test passes unchanged (the demo app doesn't configure `labels`, so it renders `DEFAULT_CMDK_LABELS`' text — identical to what it renders today).

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.ts projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.spec.ts
git commit -m "Wire CmdkLabelsService into CmdkSettingsPanelComponent"
```

---

### Task 5: Final verification and manual browser check

**Files:** none (no code changes — this task is verification-only).

**Interfaces:** none.

- [ ] **Step 1: Run the full library and demo test suites**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -20
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -20
```

Expected: all green, matching (or exceeding, with the new label tests) the pre-task baseline test count with zero failures.

- [ ] **Step 2: Manually verify in a real browser**

Serve the demo app (`npx ng serve demo`), open the palette, and confirm every string still reads exactly as before this feature (footer hints, group headers, empty states, Settings panel text) — this is the "zero behavior change by default" guarantee made visible, not just asserted in specs. Then, temporarily edit `projects/demo/src/app/app.config.ts`'s `provideCmdk(...)` call to add `labels: () => ({ closeSettings: 'FERMER', footerNavigate: 'Naviguer' })`, rebuild (`npx ng build ngx-cmdk`), restart `ng serve demo`, and confirm both overridden strings render while every other string stays in English (proving the partial-override/fallback behavior end-to-end). Revert the temporary `app.config.ts` edit afterward — it was only for manual verification, not part of this feature's shipped change.

- [ ] **Step 3: Self-review the diff**

```bash
git diff main --stat
```

Confirm the diff touches exactly: `cmdk-config.ts`, `cmdk-config.spec.ts`, `cmdk-labels.ts` (new), `cmdk-labels.spec.ts` (new), `favourites.ts`, `cmdk-palette.ts`, `cmdk-palette.html`, `cmdk-palette.spec.ts`, `cmdk-settings-panel.ts`, `cmdk-settings-panel.html`, `cmdk-settings-panel.spec.ts`, `public-api.ts` — no unrelated files, no leftover temporary demo edits from Step 2.

No commit for this task — it's verification of Tasks 1–4's already-committed work.
