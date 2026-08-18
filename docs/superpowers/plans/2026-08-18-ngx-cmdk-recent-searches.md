# ngx-cmdk: Recent Searches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, hard-gated "Recent searches" feature to ngx-cmdk — search-provider results a user selects get persisted to `localStorage` (under a host-app-supplied key) and reappear as a "Recent searches" section above Commands when the palette opens with an empty, unscoped query.

**Architecture:** A new `RecentSearchesService` owns tracking/persistence in complete isolation from `SearchRegistryService` — it never knows what a "provider" is, only `RecentSearchEntry` records. `CmdkPaletteComponent` is the coordinator: it calls `RecentSearchesService.record()` after running a search result, filters `RecentSearchesService.recent()` against `SearchRegistryService.providers()` to build a display-only `visibleRecents` list (hide-but-don't-delete for unregistered providers), and implements the resolve-then-execute flow when a recent is selected (using each provider's new optional `resolve(resultId)` capability). The whole feature is gated on a new `CmdkConfig.recentSearchesStorageKey?: () => string | null` callback — with none configured, `RecentSearchesService` tracks nothing, persists nothing, and the UI section never renders.

**Tech Stack:** Angular 22 (standalone, signals, zoneless), Vitest with `vitest/globals` (`describe`/`it`/`expect`/`vi` are globals — never `import` them from `'vitest'`), `ng-packagr` for the library build, no RxJS in library code.

**Spec:** `docs/superpowers/specs/2026-08-18-ngx-cmdk-recent-searches-design.md` (approved) — this plan implements it in full; executors should read both.

## Global Constraints

- No RxJS anywhere in `projects/ngx-cmdk` library code — signals only.
- Standalone components only; no NgModules.
- Test files use Vitest globals (`describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`) with no import from `'vitest'` — they're globally available per this project's Vitest config.
- All new/changed public types and services get exported from `projects/ngx-cmdk/src/public-api.ts`.
- Every new `--cmdk-*`-styleable UI element reuses the library's existing CSS classes — no new classes needed for this feature (confirmed while planning: `.cmdk-group`, `.cmdk-group-label`, `.cmdk-item`, `.cmdk-item-main`, `.cmdk-item-icon`, `.cmdk-item-label`, `.cmdk-item-subtitle` already exist in `cmdk-palette.css` and are structurally sufficient).
- Every caught/handled error path logs via `console.error`/`console.warn` **and** reports through `CmdkIssueService.report()` — dual-channel, matching the existing convention for command/search-provider/search-result failures.
- Before any Angular CLI command: `source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null` (each fresh Bash call is a new shell — this must run in every command block that invokes `npm`/`ng`/`npx`).
- Build the library before touching the demo app: `npx ng build ngx-cmdk` must succeed before any `projects/demo` build/serve/test, since the demo's tsconfig path-maps `ngx-cmdk` imports to `dist/ngx-cmdk`.
- Isolated worktree per this repo's established convention: `.worktrees/ngx-cmdk-recent-searches` (gitignored), branch `ngx-cmdk-recent-searches`, created via `git worktree add .worktrees/ngx-cmdk-recent-searches -b ngx-cmdk-recent-searches`, then `npm install` + baseline `npx ng build ngx-cmdk` + baseline `npx ng test ngx-cmdk` before any implementation work, run from inside the worktree.
- Never add a `Co-Authored-By: Claude` trailer to any commit message.

## Plan-Level Judgment Calls

The spec is authoritative on behavior; it deliberately sketches some internals at a high level. This plan makes the following implementation-level decisions, each consistent with the spec's stated contracts:

1. **`localStorage` parse-failure resilience.** The spec doesn't address malformed/pre-existing non-JSON data at the configured key. Task 4's `RecentSearchesService` wraps `JSON.parse` in try/catch: a parse failure (or a parsed value that isn't an array) is treated as "no persisted recents" (empty array), logged via `console.warn`, and does not throw or crash the palette. No new `CmdkIssue` variant is added for this — it's a data-integrity nit with nothing actionable for a consumer to react to, unlike the four existing/new `CmdkIssue` variants which all represent an app-observable event. `localStorage.setItem` is likewise wrapped in try/catch (quota exceeded / private-browsing restrictions), since persistence failing should never crash the palette.
2. **The reactive gate is implemented via an internal writable signal kept in sync by a constructor `effect()`, not via the spec's illustrative `computed(() => key ? this.entries() : [])` sketch.** That sketch is faithful to the *contract* (recent() must reactively reflect the current key's availability) but two real Angular constraints make a different mechanism the correct implementation:
   - Angular signals throw at runtime if a `computed()` callback writes to a signal (`NG0600`) — so a `computed()` cannot itself reload storage when it detects a key change; only an `effect()` can safely do that.
   - A read-time-only gate (recomputing purely from the *current* key on every read, with no persistent internal cache) would miss the very first synchronous read immediately after construction, before an `effect()` has had its first chance to run — since Angular effects are scheduled, not synchronous.
   
   The implementation: an internal `entriesSignal` is loaded synchronously in the constructor for whatever key is available at that moment, and a constructor `effect()` re-loads it whenever the key changes thereafter (including to/from `null`). `recent` is `entriesSignal.asReadonly()` — no separate gating computed needed, since the effect already collapses `entriesSignal` to `[]` the moment the key becomes unavailable. `record()`/`removeEntry()`/`clear()` independently re-check the current key on every call (via a shared `ensureSyncedTo()` helper) rather than trusting the effect's timing, so correctness never depends on when the effect happens to run — only the UI's reactivity does. This satisfies every behavior the spec's testing-strategy section calls for, including the disabled-after-enabled regression test.
3. **`SearchRegistryService` needs a way to recover which provider produced a given merged `SearchResult`, without changing `search()`'s existing `Promise<SearchResult[]>` return type (a breaking change to an already-shipped API).** Task 2 adds a `WeakMap<SearchResult, string>` populated internally as `search()` flattens each provider's results, plus a new public method `providerKeyFor(result: SearchResult): string | undefined`. This is additive and backward compatible — existing callers of `search()` are unaffected.
4. **`RecentSearchesService.record()` is a public method**, not a literally-inaccessible one. The spec's "No public `record()`" is about API *surface intent* (consumers shouldn't need to call it — the palette does it automatically), not literal TypeScript privacy — the service must be exported (consumers use `recent()`/`clear()`), and TypeScript has no "internal to this library, public to this class" visibility modifier. This exactly mirrors the existing precedent of `CommandRegistryService.execute()`, which is public but is understood to be primarily palette-invoked.
5. **`RecentSearchesService.removeEntry(providerKey, resultId)` is a new public method**, needed to implement the spec's stated "remove that entry from the underlying `recent()` data" behavior on a resolve failure — the spec's abbreviated API sketch (`recent`, `clear()`) doesn't spell out this method name, but the behavior it describes requires one.
6. **`CmdkPaletteComponent.runSearchResult()` gains a second parameter, `providerKey: string | undefined`.** A live search result's provider is looked up via `searchRegistry.providerKeyFor(result)` at the call site; a resolved recent's provider is already known (it's `entry.providerKey`) and passed through directly — this avoids needing the resolved `SearchResult` to also flow through the `WeakMap`.
7. **Selecting a recent's resolve-then-execute flow reuses the existing `searchGeneration` counter** (already incremented by `close()`) to discard a stale in-flight `resolve()` if the palette is closed (and possibly reopened) before it settles — the same staleness-guard pattern `scheduleSearch()` already uses, applied to a new async call site.
8. **`visibleRecents` also gates on `scopedProviderKey() !== null`, beyond the spec's illustrative code sample** (which only filters by registered providers). This matters for a real state the sample doesn't account for: clicking a category chip sets `scopedProviderKey` but, with an empty query, `isSearchModeActive()` stays `false` (it requires a non-empty query) — so without this extra check, recents would incorrectly remain visible/selectable while a provider is scoped but nothing has been typed yet, contradicting the spec's stated condition that recents only show when "nothing is scoped."

---

### Task 1: `SearchResult`/`SearchProvider`/`CmdkIssue` type additions

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/search.model.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-issue.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-issue.spec.ts`

**Interfaces:**
- Produces: `SearchResult.resultId?: string`, `SearchProvider.resolve?: (resultId: string) => Promise<SearchResult | null>`, and the `CmdkIssue` variant `{ source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown }` — all consumed by Tasks 2, 4, and 5.

- [ ] **Step 1: Update `search.model.ts` with the new optional fields**

Replace the full contents of `projects/ngx-cmdk/src/lib/search.model.ts` with:

```ts
export interface SearchResult {
  label: string;
  subtitle?: string;
  icon?: string;
  resultId?: string;
  execute: () => void | Promise<void>;
}

export interface SearchProvider {
  key: string;
  label: string;
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
  resolve?: (resultId: string) => Promise<SearchResult | null>;
}
```

- [ ] **Step 2: Write a failing test for the new `CmdkIssue` variant's shape**

Read the current `projects/ngx-cmdk/src/lib/cmdk-issue.spec.ts` first to match its existing style, then add this test (inside the existing `describe('CmdkIssueService', ...)` block, alongside the existing tests):

```ts
  it('reports a recent-resolve issue and delivers it to listeners', () => {
    const received: unknown[] = [];
    service.onIssue((issue) => received.push(issue));

    service.report({ source: 'recent-resolve', providerKey: 'fruits', resultId: 'apple', error: new Error('gone') });

    expect(received).toEqual([
      { source: 'recent-resolve', providerKey: 'fruits', resultId: 'apple', error: new Error('gone') },
    ]);
  });
```

- [ ] **Step 3: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: FAIL (or a TypeScript compile error) — `'recent-resolve'` isn't a valid `CmdkIssue['source']` yet.

- [ ] **Step 4: Add the `'recent-resolve'` variant to `CmdkIssue`**

In `projects/ngx-cmdk/src/lib/cmdk-issue.ts`, change the `CmdkIssue` union from:

```ts
export type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown };
```

to:

```ts
export type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown };
```

Leave the rest of the file (the `@Injectable` class body) unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: PASS, including the new test from Step 2.

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/search.model.ts projects/ngx-cmdk/src/lib/cmdk-issue.ts projects/ngx-cmdk/src/lib/cmdk-issue.spec.ts
git commit -m "Add resultId/resolve to search types and a recent-resolve CmdkIssue variant"
```

---

### Task 2: `SearchRegistryService.providerKeyFor()`

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/search-registry.ts`
- Modify: `projects/ngx-cmdk/src/lib/search-registry.spec.ts`

**Interfaces:**
- Consumes: `SearchProvider`, `SearchResult` from Task 1 (unchanged shape otherwise).
- Produces: `SearchRegistryService.providerKeyFor(result: SearchResult): string | undefined` — consumed by Task 5's `CmdkPaletteComponent.runSearchResult()` call sites.

- [ ] **Step 1: Read the current file for context**

`projects/ngx-cmdk/src/lib/search-registry.ts` currently reads (reproduced here for reference — do not re-fetch, this is the exact current content):

```ts
import { Injectable, computed, inject, signal } from '@angular/core';
import { CMDK_CONFIG } from './cmdk-config';
import { CmdkIssueService } from './cmdk-issue';
import type { SearchProvider, SearchResult } from './search.model';

async function searchWithTimeout(
  provider: SearchProvider,
  query: string,
  timeoutMs: number,
  issues: CmdkIssueService,
): Promise<SearchResult[]> {
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  try {
    const outcome = await Promise.race([provider.search(query), timeout]);
    if (outcome === 'timeout') {
      console.warn(`Search provider "${provider.key}" timed out after ${timeoutMs}ms`);
      issues.report({ source: 'search-provider', key: provider.key, query, reason: 'timeout' });
      return [];
    }
    return outcome;
  } catch (error) {
    console.warn(`Search provider "${provider.key}" failed:`, error);
    issues.report({ source: 'search-provider', key: provider.key, query, reason: 'error', error });
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class SearchRegistryService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly issues = inject(CmdkIssueService);
  private readonly providersMap = signal<Map<string, SearchProvider>>(new Map());

  readonly providers = computed<readonly SearchProvider[]>(() => Array.from(this.providersMap().values()));
  readonly hasProviders = computed(() => this.providers().length > 0);

  register(provider: SearchProvider): () => void {
    if (this.providersMap().has(provider.key)) {
      throw new Error(`Search provider with key "${provider.key}" is already registered`);
    }
    this.providersMap.update((map) => new Map(map).set(provider.key, provider));

    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.providersMap.update((map) => {
        const next = new Map(map);
        next.delete(provider.key);
        return next;
      });
    };
  }

  async search(query: string, scopeKey?: string): Promise<SearchResult[]> {
    const all = this.providers();
    const targets = scopeKey ? all.filter((provider) => provider.key === scopeKey) : all;
    const resultsPerProvider = await Promise.all(
      targets.map((provider) => searchWithTimeout(provider, query, this.config.searchTimeoutMs, this.issues)),
    );
    return resultsPerProvider.flat();
  }
}
```

- [ ] **Step 2: Write the failing tests**

Read `projects/ngx-cmdk/src/lib/search-registry.spec.ts` first to match its existing `makeProvider()` helper and style, then add this new test (inside the existing `describe('SearchRegistryService', ...)` block):

```ts
  it('tracks which provider produced each result, recoverable via providerKeyFor', async () => {
    const fruitsProvider = makeProvider({
      key: 'fruits',
      search: async () => [{ label: 'Apple', resultId: 'apple', execute: () => {} }],
    });
    const veggiesProvider = makeProvider({
      key: 'veggies',
      search: async () => [{ label: 'Carrot', resultId: 'carrot', execute: () => {} }],
    });
    service.register(fruitsProvider);
    service.register(veggiesProvider);

    const results = await service.search('a');

    const apple = results.find((r) => r.label === 'Apple')!;
    const carrot = results.find((r) => r.label === 'Carrot')!;
    expect(service.providerKeyFor(apple)).toBe('fruits');
    expect(service.providerKeyFor(carrot)).toBe('veggies');
  });

  it('providerKeyFor returns undefined for a result that never went through search()', () => {
    const foreignResult = { label: 'Untracked', execute: () => {} };
    expect(service.providerKeyFor(foreignResult)).toBeUndefined();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: FAIL — `providerKeyFor` doesn't exist yet.

- [ ] **Step 4: Implement `providerKeyFor()`**

Replace the `search()` method and add a new private field and public method, so the full class becomes:

```ts
@Injectable({ providedIn: 'root' })
export class SearchRegistryService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly issues = inject(CmdkIssueService);
  private readonly providersMap = signal<Map<string, SearchProvider>>(new Map());
  private readonly resultProviderKeys = new WeakMap<SearchResult, string>();

  readonly providers = computed<readonly SearchProvider[]>(() => Array.from(this.providersMap().values()));
  readonly hasProviders = computed(() => this.providers().length > 0);

  register(provider: SearchProvider): () => void {
    if (this.providersMap().has(provider.key)) {
      throw new Error(`Search provider with key "${provider.key}" is already registered`);
    }
    this.providersMap.update((map) => new Map(map).set(provider.key, provider));

    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.providersMap.update((map) => {
        const next = new Map(map);
        next.delete(provider.key);
        return next;
      });
    };
  }

  async search(query: string, scopeKey?: string): Promise<SearchResult[]> {
    const all = this.providers();
    const targets = scopeKey ? all.filter((provider) => provider.key === scopeKey) : all;
    const resultsPerProvider = await Promise.all(
      targets.map(async (provider) => {
        const results = await searchWithTimeout(provider, query, this.config.searchTimeoutMs, this.issues);
        for (const result of results) {
          this.resultProviderKeys.set(result, provider.key);
        }
        return results;
      }),
    );
    return resultsPerProvider.flat();
  }

  providerKeyFor(result: SearchResult): string | undefined {
    return this.resultProviderKeys.get(result);
  }
}
```

(The `searchWithTimeout` function above this class, and all imports, are unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/search-registry.ts projects/ngx-cmdk/src/lib/search-registry.spec.ts
git commit -m "Track result-to-provider mapping in SearchRegistryService"
```

---

### Task 3: `CmdkConfig.recentSearchesStorageKey`

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/cmdk-config.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-config.spec.ts`

**Interfaces:**
- Produces: `CmdkConfig.recentSearchesStorageKey?: () => string | null` — consumed by Task 4's `RecentSearchesService`.

- [ ] **Step 1: Write the failing test**

Read `projects/ngx-cmdk/src/lib/cmdk-config.spec.ts` first to match its existing style, then add this test (inside the existing `describe(...)` block covering `provideCmdk`):

```ts
  it('accepts an optional recentSearchesStorageKey callback and leaves it unset by default', () => {
    const withKey = provideCmdk({ recentSearchesStorageKey: () => 'my-key' });
    const withoutKey = provideCmdk();
    expect(withKey).toBeTruthy();
    expect(withoutKey).toBeTruthy();
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: FAIL with a TypeScript error — `recentSearchesStorageKey` isn't a known property of the config object passed to `provideCmdk()`.

- [ ] **Step 3: Add the config field**

In `projects/ngx-cmdk/src/lib/cmdk-config.ts`, change:

```ts
export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
}
```

to:

```ts
export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
}
```

Leave `DEFAULT_CMDK_CONFIG`, `CMDK_CONFIG`, and `provideCmdk()` otherwise unchanged — `{ ...DEFAULT_CMDK_CONFIG, ...config }` already spreads through any extra optional field correctly, and `undefined` naturally means "off," so no default value is needed for the new field.

- [ ] **Step 4: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -60
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-config.ts projects/ngx-cmdk/src/lib/cmdk-config.spec.ts
git commit -m "Add recentSearchesStorageKey to CmdkConfig"
```

---

### Task 4: `RecentSearchesService`

**Files:**
- Create: `projects/ngx-cmdk/src/lib/recent-searches.ts`
- Create: `projects/ngx-cmdk/src/lib/recent-searches.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: `CMDK_CONFIG`/`CmdkConfig.recentSearchesStorageKey` (Task 3), `SearchResult` (Task 1).
- Produces:
  - `interface RecentSearchEntry { providerKey: string; resultId: string; label: string; subtitle?: string; icon?: string; selectedAt: number; }`
  - `class RecentSearchesService { readonly recent: Signal<readonly RecentSearchEntry[]>; record(providerKey: string, result: SearchResult): void; removeEntry(providerKey: string, resultId: string): void; clear(): void; }`
  
  Both exported from `public-api.ts`, consumed by Task 5's `CmdkPaletteComponent`.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/recent-searches.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { RecentSearchesService } from './recent-searches';
import { provideCmdk } from './cmdk-config';
import type { SearchResult } from './search.model';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return { label: 'Result', resultId: 'r1', execute: () => {}, ...overrides };
}

function setup(storageKey: () => string | null): RecentSearchesService {
  TestBed.configureTestingModule({
    providers: [provideCmdk({ recentSearchesStorageKey: storageKey })],
  });
  return TestBed.inject(RecentSearchesService);
}

describe('RecentSearchesService', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('recent() is empty with no storage key configured', () => {
    const service = setup(() => null);
    expect(service.recent()).toEqual([]);
  });

  it('recording is a no-op when there is no storage key', () => {
    const service = setup(() => null);
    service.record('fruits', makeResult());
    expect(service.recent()).toEqual([]);
    expect(localStorage.getItem('recents')).toBeNull();
  });

  it('recording is a no-op when the result has no resultId', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ resultId: undefined }));
    expect(service.recent()).toEqual([]);
  });

  it('records a result with a resultId and round-trips through localStorage', () => {
    const service = setup(() => 'recents');
    service.record(
      'fruits',
      makeResult({ label: 'Apple', subtitle: '/fruits/apple', icon: 'demo-icon-fruit', resultId: 'apple' }),
    );

    expect(service.recent()).toEqual([
      {
        providerKey: 'fruits',
        resultId: 'apple',
        label: 'Apple',
        subtitle: '/fruits/apple',
        icon: 'demo-icon-fruit',
        selectedAt: expect.any(Number),
      },
    ]);
    const stored = JSON.parse(localStorage.getItem('recents')!);
    expect(stored).toEqual(service.recent());
  });

  it('re-recording the same providerKey/resultId pair replaces rather than duplicates', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ label: 'Apple', resultId: 'apple' }));
    service.record('fruits', makeResult({ label: 'Banana', resultId: 'banana' }));
    service.record('fruits', makeResult({ label: 'Apple (renamed)', resultId: 'apple' }));

    expect(service.recent().map((e) => e.label)).toEqual(['Apple (renamed)', 'Banana']);
  });

  it('caps the list at 10 entries, evicting the oldest', () => {
    const service = setup(() => 'recents');
    for (let i = 0; i < 12; i++) {
      service.record('fruits', makeResult({ label: `Item ${i}`, resultId: `id-${i}` }));
    }

    expect(service.recent()).toHaveLength(10);
    expect(service.recent()[0].resultId).toBe('id-11');
    expect(service.recent().at(-1)!.resultId).toBe('id-2');
  });

  it('reactively collapses to [] when the storage key becomes unavailable, and restores it when available again', () => {
    let key: string | null = 'recents';
    const service = setup(() => key);
    service.record('fruits', makeResult({ resultId: 'apple' }));
    expect(service.recent()).toHaveLength(1);

    key = null;
    TestBed.tick();
    expect(service.recent()).toEqual([]);

    key = 'recents';
    TestBed.tick();
    expect(service.recent()).toHaveLength(1);
  });

  it('a different key reads/writes independently of the previous key', () => {
    let key = 'recents-a';
    const service = setup(() => key);
    service.record('fruits', makeResult({ label: 'A-item', resultId: 'a1' }));

    key = 'recents-b';
    TestBed.tick();
    expect(service.recent()).toEqual([]);
    service.record('fruits', makeResult({ label: 'B-item', resultId: 'b1' }));
    expect(service.recent().map((e) => e.label)).toEqual(['B-item']);

    key = 'recents-a';
    TestBed.tick();
    expect(service.recent().map((e) => e.label)).toEqual(['A-item']);
  });

  it('removeEntry removes a single entry and persists the change', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ resultId: 'apple' }));
    service.record('fruits', makeResult({ resultId: 'banana', label: 'Banana' }));

    service.removeEntry('fruits', 'apple');

    expect(service.recent().map((e) => e.resultId)).toEqual(['banana']);
    const stored = JSON.parse(localStorage.getItem('recents')!);
    expect(stored.map((e: { resultId: string }) => e.resultId)).toEqual(['banana']);
  });

  it('clear() empties the in-memory list and the current key storage', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ resultId: 'apple' }));

    service.clear();

    expect(service.recent()).toEqual([]);
    expect(localStorage.getItem('recents')).toBeNull();
  });

  it('reads pre-existing valid JSON from storage on construction', () => {
    localStorage.setItem(
      'recents',
      JSON.stringify([{ providerKey: 'fruits', resultId: 'apple', label: 'Apple', selectedAt: 123 }]),
    );

    const service = setup(() => 'recents');

    expect(service.recent()).toEqual([{ providerKey: 'fruits', resultId: 'apple', label: 'Apple', selectedAt: 123 }]);
  });

  it('treats malformed JSON at the configured key as no persisted recents', () => {
    localStorage.setItem('recents', 'not valid json{{{');

    const service = setup(() => 'recents');

    expect(service.recent()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -80
```

Expected: FAIL — `./recent-searches` module doesn't exist yet.

- [ ] **Step 3: Implement `RecentSearchesService`**

Create `projects/ngx-cmdk/src/lib/recent-searches.ts`:

```ts
import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { CMDK_CONFIG } from './cmdk-config';
import type { SearchResult } from './search.model';

export interface RecentSearchEntry {
  providerKey: string;
  resultId: string;
  label: string;
  subtitle?: string;
  icon?: string;
  selectedAt: number;
}

const MAX_RECENT_ENTRIES = 10;

@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly localStorageRef = inject(DOCUMENT).defaultView?.localStorage;
  private readonly entriesSignal = signal<RecentSearchEntry[]>([]);
  private syncedKey: string | null = null;

  readonly recent = this.entriesSignal.asReadonly();

  constructor() {
    this.ensureSyncedToCurrentKey();

    effect(() => {
      this.config.recentSearchesStorageKey?.();
      this.ensureSyncedToCurrentKey();
    });
  }

  record(providerKey: string, result: SearchResult): void {
    if (!result.resultId) {
      return;
    }
    const key = this.currentKey();
    if (!key) {
      return;
    }
    this.ensureSyncedToCurrentKey();

    const entry: RecentSearchEntry = {
      providerKey,
      resultId: result.resultId,
      label: result.label,
      subtitle: result.subtitle,
      icon: result.icon,
      selectedAt: Date.now(),
    };
    const withoutDuplicate = this.entriesSignal().filter(
      (existing) => !(existing.providerKey === providerKey && existing.resultId === result.resultId),
    );
    const next = [entry, ...withoutDuplicate].slice(0, MAX_RECENT_ENTRIES);
    this.entriesSignal.set(next);
    this.writeToStorage(key, next);
  }

  removeEntry(providerKey: string, resultId: string): void {
    this.ensureSyncedToCurrentKey();
    const next = this.entriesSignal().filter(
      (entry) => !(entry.providerKey === providerKey && entry.resultId === resultId),
    );
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  clear(): void {
    this.entriesSignal.set([]);
    const key = this.currentKey();
    if (key) {
      this.localStorageRef?.removeItem(key);
    }
  }

  private currentKey(): string | null {
    return this.config.recentSearchesStorageKey?.() ?? null;
  }

  private ensureSyncedToCurrentKey(): void {
    const key = this.currentKey();
    if (key === this.syncedKey) {
      return;
    }
    this.syncedKey = key;
    this.entriesSignal.set(key ? this.readFromStorage(key) : []);
  }

  private readFromStorage(key: string): RecentSearchEntry[] {
    const raw = this.localStorageRef?.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as RecentSearchEntry[]) : [];
    } catch (error) {
      console.warn(`Failed to parse recent searches from localStorage key "${key}":`, error);
      return [];
    }
  }

  private writeToStorage(key: string, entries: RecentSearchEntry[]): void {
    try {
      this.localStorageRef?.setItem(key, JSON.stringify(entries));
    } catch (error) {
      console.warn(`Failed to write recent searches to localStorage key "${key}":`, error);
    }
  }
}
```

- [ ] **Step 4: Export the new service and type from `public-api.ts`**

In `projects/ngx-cmdk/src/public-api.ts`, add these two lines (alongside the existing search-related exports):

```ts
export { RecentSearchesService } from './lib/recent-searches';
export type { RecentSearchEntry } from './lib/recent-searches';
```

The full file should now read:

```ts
/*
 * Public API Surface of ngx-cmdk
 */

export type { Command, ResolvedCommand } from './lib/command.model';
export { CommandRegistryService } from './lib/command-registry';
export { provideCmdk } from './lib/cmdk-config';
export type { CmdkConfig } from './lib/cmdk-config';
export { CmdkPaletteComponent } from './lib/cmdk-palette';
export { CmdkIssueService } from './lib/cmdk-issue';
export type { CmdkIssue } from './lib/cmdk-issue';
export type { SearchProvider, SearchResult } from './lib/search.model';
export { SearchRegistryService } from './lib/search-registry';
export { RecentSearchesService } from './lib/recent-searches';
export type { RecentSearchEntry } from './lib/recent-searches';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -80
```

Expected: PASS, all new `recent-searches.spec.ts` tests green.

- [ ] **Step 6: Build the library to verify the public API surface compiles**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/recent-searches.ts projects/ngx-cmdk/src/lib/recent-searches.spec.ts projects/ngx-cmdk/src/public-api.ts
git commit -m "Add RecentSearchesService"
```

---

### Task 5: `CmdkPaletteComponent` integration

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.html`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`

**Interfaces:**
- Consumes: `RecentSearchesService`, `RecentSearchEntry` (Task 4); `SearchRegistryService.providerKeyFor()` (Task 2); `CmdkIssue`'s `'recent-resolve'` variant (Task 1).
- Produces: no new public API — this task wires the feature into the existing component's rendering, keyboard nav, and selection flow.

This is the largest task in the plan. Read `projects/ngx-cmdk/src/lib/cmdk-palette.ts`, `cmdk-palette.html`, and `cmdk-palette.spec.ts` in full before starting (their exact current contents are reproduced below for reference — do not re-fetch, this is the ground truth to diff against).

Current `cmdk-palette.ts` (reproduced in full):

```ts
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CmdkIssueService } from './cmdk-issue';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { SearchRegistryService } from './search-registry';
import type { SearchResult } from './search.model';
import { formatShortcut, isMacPlatform, matchesShortcut, parseShortcut } from './shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  private readonly searchRegistry = inject(SearchRegistryService);
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
  protected readonly selectedCommand = computed(() => this.flatMatches()[this.selectedIndex()]?.item);
  protected readonly resolveLabel = resolveLabel;
  protected readonly formatShortcut = (shortcut: string) => formatShortcut(shortcut, this.isMac);

  protected readonly searchResults = signal<SearchResult[] | null>(null);

  protected readonly isSearchModeActive = computed(
    () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
  );

  protected readonly selectedSearchResult = computed(() => this.searchResults()?.[this.selectedIndex()]);

  protected readonly activeDescendantId = computed(() => {
    if (this.isSearchModeActive()) {
      return this.selectedSearchResult() ? `cmdk-item-search-${this.selectedIndex()}` : null;
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
      const count = this.isSearchModeActive() ? (this.searchResults()?.length ?? 0) : this.flatMatches().length;
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
            this.runSearchResult(result);
          }
        } else {
          const command = this.selectedCommand();
          if (command) {
            this.runSelectedCommand(command);
          }
        }
        break;
      }
      case 'Backspace':
        if (this.scopedProviderKey() !== null && this.query() === '') {
          event.preventDefault();
          this.scopedProviderKey.set(null);
        }
        break;
      case 'Tab':
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

  protected runSearchResult(result: SearchResult): void {
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
    const count = this.isSearchModeActive() ? (this.searchResults()?.length ?? 0) : this.flatMatches().length;
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
                (click)="runSearchResult(result)"
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
            <div class="cmdk-empty">No matching commands</div>
          }
        }
      </div>
    </div>
  </div>
}
```

Note: `.cmdk-item--selected`/`aria-selected` for the Commands branch is computed by comparing `match.item.id === selectedCommand()?.id`, not by index — so once `selectedCommand` is redefined below to account for the recents offset, the Commands template needs **no changes at all** to keep highlighting the right row.

- [ ] **Step 1: Write the failing tests**

Read `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts` in full first (in particular its `pressOpenShortcut()` helper and `beforeEach` setup, reproduced in the summary context above) to match its exact style/helpers, then add a new `describe('recent searches', ...)` block inside the top-level `describe('CmdkPaletteComponent', ...)`, alongside the existing blocks:

```ts
  describe('recent searches', () => {
    let searchRegistry: SearchRegistryService;
    let recentSearches: RecentSearchesService;
    let storedKey: string | null;

    function reconfigure(): void {
      fixture.nativeElement.remove();
      TestBed.resetTestingModule();
      Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
      TestBed.configureTestingModule({
        imports: [CmdkPaletteComponent],
        providers: [provideCmdk({ shortcut: 'mod+k', recentSearchesStorageKey: () => storedKey })],
      });
      fixture = TestBed.createComponent(CmdkPaletteComponent);
      document.body.appendChild(fixture.nativeElement);
      registry = TestBed.inject(CommandRegistryService);
      searchRegistry = TestBed.inject(SearchRegistryService);
      recentSearches = TestBed.inject(RecentSearchesService);
      fixture.detectChanges();
    }

    function makeFruitsProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
      return {
        key: 'fruits',
        label: 'fruits',
        search: async () => [{ label: 'Apple', subtitle: '/fruits/apple', resultId: 'apple', execute: () => {} }],
        resolve: async (resultId) =>
          resultId === 'apple'
            ? { label: 'Apple', subtitle: '/fruits/apple', resultId: 'apple', execute: () => {} }
            : null,
        ...overrides,
      };
    }

    beforeEach(() => {
      storedKey = 'recents';
      localStorage.clear();
      reconfigure();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('does not render a Recent searches section with no recorded entries', () => {
      searchRegistry.register(makeFruitsProvider());
      pressOpenShortcut();
      expect(fixture.nativeElement.textContent).not.toContain('Recent searches');
    });

    it('renders a recorded recent above Commands when unscoped and the query is empty', () => {
      searchRegistry.register(makeFruitsProvider());
      recentSearches.record('fruits', { label: 'Apple', subtitle: '/fruits/apple', resultId: 'apple', execute: () => {} });

      pressOpenShortcut();

      const items = fixture.nativeElement.querySelectorAll('.cmdk-item-label');
      expect(items[0].textContent).toBe('Apple');
    });

    it('hides a recent entry whose provider is not currently registered, without deleting it', () => {
      recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });

      pressOpenShortcut();
      expect(fixture.nativeElement.textContent).not.toContain('Recent searches');
      expect(recentSearches.recent()).toHaveLength(1);

      const unregister = searchRegistry.register(makeFruitsProvider());
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Recent searches');

      unregister();
    });

    it('selecting a recent resolves it, executes it, and bumps it to the top', async () => {
      const executed: string[] = [];
      searchRegistry.register(
        makeFruitsProvider({
          resolve: async (resultId) => ({
            label: 'Apple',
            subtitle: '/fruits/apple',
            resultId,
            execute: () => {
              executed.push(resultId);
            },
          }),
        }),
      );
      recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });

      pressOpenShortcut();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      expect(executed).toEqual(['apple']);
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
      expect(recentSearches.recent()[0].resultId).toBe('apple');
    });

    it('a resolve() that returns null removes the entry and reports a recent-resolve issue', async () => {
      const issues = TestBed.inject(CmdkIssueService);
      const received: unknown[] = [];
      issues.onIssue((issue) => received.push(issue));
      searchRegistry.register(makeFruitsProvider({ resolve: async () => null }));
      recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });

      pressOpenShortcut();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      expect(recentSearches.recent()).toEqual([]);
      expect(received).toEqual([{ source: 'recent-resolve', providerKey: 'fruits', resultId: 'apple', error: undefined }]);
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).not.toBeNull();
    });

    it('a resolve() that rejects removes the entry, reports the issue, and keeps the palette open', async () => {
      const issues = TestBed.inject(CmdkIssueService);
      const received: unknown[] = [];
      issues.onIssue((issue) => received.push(issue));
      const failure = new Error('network down');
      searchRegistry.register(makeFruitsProvider({ resolve: async () => Promise.reject(failure) }));
      recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });

      pressOpenShortcut();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      expect(recentSearches.recent()).toEqual([]);
      expect(received).toEqual([{ source: 'recent-resolve', providerKey: 'fruits', resultId: 'apple', error: failure }]);
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).not.toBeNull();
    });

    it('selecting a live search result records it as a recent', async () => {
      searchRegistry.register(makeFruitsProvider());

      pressOpenShortcut();
      const input = fixture.nativeElement.querySelector('.cmdk-input') as HTMLInputElement;
      input.value = 'apple';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await Promise.resolve();
      fixture.detectChanges();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(recentSearches.recent()).toHaveLength(1);
      expect(recentSearches.recent()[0]).toEqual(
        expect.objectContaining({ providerKey: 'fruits', resultId: 'apple', label: 'Apple' }),
      );
    });

    it('ArrowDown moves selection from a recent into the Commands list', () => {
      searchRegistry.register(makeFruitsProvider());
      recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
      const unregisterCommand = registry.register({ label: 'Only Command', execute: () => {} });

      pressOpenShortcut();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      fixture.detectChanges();

      const selected = fixture.nativeElement.querySelector('.cmdk-item--selected .cmdk-item-label');
      expect(selected.textContent).toBe('Only Command');

      unregisterCommand();
    });
  });
```

At the top of `cmdk-palette.spec.ts`, add the two new imports needed by this block, alongside the existing ones:

```ts
import { RecentSearchesService } from './recent-searches';
import { CmdkIssueService } from './cmdk-issue';
import type { SearchProvider } from './search.model';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: FAIL — no "Recent searches" rendering, no `runRecentEntry`, etc. yet.

- [ ] **Step 3: Implement the component changes**

Replace the full contents of `projects/ngx-cmdk/src/lib/cmdk-palette.ts` with:

```ts
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CmdkIssueService } from './cmdk-issue';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { RecentSearchesService, type RecentSearchEntry } from './recent-searches';
import { SearchRegistryService } from './search-registry';
import type { SearchResult } from './search.model';
import { formatShortcut, isMacPlatform, matchesShortcut, parseShortcut } from './shortcut';

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
        }
        break;
      case 'Tab':
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

Notable changes from the original:
- New `recentSearches` injection, `visibleRecents`/`selectedRecent` computeds, and `selectedCommand` now subtracts the recents offset (`this.flatMatches()[this.selectedIndex() - offset]?.item` — with zero recents, `offset` is `0` and behavior is byte-for-byte identical to before).
- `visibleRecents` returns `[]` whenever search mode is active or a provider is scoped — recents only ever apply in the empty-query, unscoped state, matching the spec.
- `activeDescendantId` gains a third branch for a selected recent.
- The selection-count `effect()` and `moveSelection()` both now use `visibleRecents().length + flatMatches().length` for the non-search-mode count (previously just `flatMatches().length`) — with zero recents this is identical to the old behavior.
- `runSearchResult()` takes a new `providerKey: string | undefined` parameter and records the entry (only when a key is known) before running `execute()`.
- New `runRecentEntry()`/`reportRecentResolveFailure()` implement the resolve-then-execute flow with the `searchGeneration` staleness guard.
- `Enter` handling in `onKeydown()` gains a `selectedRecent()` branch, checked before falling back to `selectedCommand()`.

- [ ] **Step 4: Implement the template changes**

Replace the full contents of `projects/ngx-cmdk/src/lib/cmdk-palette.html` with:

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
              @for (recent of visibleRecents(); track recent.providerKey + ':' + recent.resultId; let $index = $index) {
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

Notable changes: a new `@if (visibleRecents().length > 0)` block renders a "Recent searches" `.cmdk-group` above the Commands `@for`, reusing the same row markup shape as a live search result. The Commands `@empty` block is now conditioned on `visibleRecents().length === 0` too, so "No matching commands" doesn't render underneath a non-empty Recent searches section when there happen to be zero registered Commands. The live search-result row's click handler now looks up its provider via `searchRegistry.providerKeyFor(result)` directly in the template — this is why `cmdk-palette.ts`'s Step 3 already declares `searchRegistry` as `protected` rather than `private` (it was `private` only because nothing in the template needed it directly before this task).

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
```

Expected: PASS — all existing `cmdk-palette.spec.ts` tests still green (recents-related computeds are all zero-length no-ops when no `recentSearchesStorageKey` is configured, matching every existing test's setup), plus every new test from Step 1.

- [ ] **Step 6: Build the library**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -40
```

Expected: build succeeds with no errors or new warnings.

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-palette.ts projects/ngx-cmdk/src/lib/cmdk-palette.html projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts
git commit -m "Integrate Recent searches into CmdkPaletteComponent"
```

---

### Task 6: Demo app wiring

**Files:**
- Modify: `projects/demo/src/app/demo-search.ts`
- Modify: `projects/demo/src/app/demo-search.html`
- Modify: `projects/demo/src/app/demo-search.spec.ts`
- Modify: `projects/demo/src/app/app.config.ts`

**Interfaces:**
- Consumes: `SearchProvider.resolve`, `SearchResult.resultId` (Task 1), `provideCmdk({ recentSearchesStorageKey })` (Task 3), `RecentSearchesService` (Task 4) — all via the public `ngx-cmdk` package path, matching how the demo already consumes `SearchRegistryService`.

- [ ] **Step 1: Read the current demo files for context**

`projects/demo/src/app/demo-search.ts` currently reads:

```ts
import { Component, DestroyRef, inject } from '@angular/core';
import { SearchRegistryService } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew'];

@Component({
  selector: 'app-demo-search',
  imports: [],
  templateUrl: './demo-search.html',
})
export class DemoSearch {
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const registry = inject(SearchRegistryService);
    const unregister = registry.register({
      key: 'fruits',
      label: 'fruits',
      search: async (query) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const lower = query.toLowerCase();
        return FRUITS.filter((fruit) => fruit.toLowerCase().includes(lower)).map((fruit) => ({
          label: fruit,
          subtitle: `/fruits/${fruit.toLowerCase()}`,
          icon: 'demo-icon-fruit',
          execute: () => this.log.log(`Selected "${fruit}" from search`),
        }));
      },
    });

    this.destroyRef.onDestroy(unregister);
  }
}
```

`projects/demo/src/app/app.config.ts` currently reads:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideCmdk({ shortcut: 'mod+k' })],
};
```

- [ ] **Step 2: Read `demo-search.spec.ts` to match its existing test style, then add a failing test for `resolve()`**

Read `projects/demo/src/app/demo-search.spec.ts` first. Add this test alongside its existing ones (adjust the exact provider-lookup mechanics to match whatever pattern the existing tests in that file already use for grabbing the registered provider off `SearchRegistryService.providers()`):

```ts
  it('registers a resolve() that reconstructs a fruit result by id', async () => {
    const registry = TestBed.inject(SearchRegistryService);
    TestBed.createComponent(DemoSearch).detectChanges();

    const provider = registry.providers().find((p) => p.key === 'fruits')!;
    const resolved = await provider.resolve!('apple');

    expect(resolved).toEqual(
      expect.objectContaining({ label: 'Apple', subtitle: '/fruits/apple', resultId: 'apple' }),
    );

    const missing = await provider.resolve!('not-a-fruit');
    expect(missing).toBeNull();
  });
```

- [ ] **Step 3: Run it to verify it fails**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: FAIL — `provider.resolve` is `undefined`.

- [ ] **Step 4: Update `demo-search.ts` to add `resultId`/`resolve`, sharing a `toResult()` helper (mirroring the spec's `AssetsSearchProvider` example)**

Replace the full contents of `projects/demo/src/app/demo-search.ts` with:

```ts
import { Component, DestroyRef, inject } from '@angular/core';
import { SearchRegistryService, type SearchResult } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew'];

@Component({
  selector: 'app-demo-search',
  imports: [],
  templateUrl: './demo-search.html',
})
export class DemoSearch {
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const registry = inject(SearchRegistryService);
    const unregister = registry.register({
      key: 'fruits',
      label: 'fruits',
      search: async (query) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const lower = query.toLowerCase();
        return FRUITS.filter((fruit) => fruit.toLowerCase().includes(lower)).map((fruit) => this.toResult(fruit));
      },
      resolve: async (resultId) => {
        const fruit = FRUITS.find((candidate) => candidate.toLowerCase() === resultId);
        return fruit ? this.toResult(fruit) : null;
      },
    });

    this.destroyRef.onDestroy(unregister);
  }

  private toResult(fruit: string): SearchResult {
    return {
      label: fruit,
      subtitle: `/fruits/${fruit.toLowerCase()}`,
      icon: 'demo-icon-fruit',
      resultId: fruit.toLowerCase(),
      execute: () => this.log.log(`Selected "${fruit}" from search`),
    };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: PASS.

- [ ] **Step 6: Wire `recentSearchesStorageKey` into the demo's `app.config.ts`, and add a "Clear recents" affordance to the search panel**

Replace the full contents of `projects/demo/src/app/app.config.ts` with:

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

Update `projects/demo/src/app/demo-search.ts` to inject `RecentSearchesService` and expose a `clearRecents()` method — add these two lines to the imports and the class body:

```ts
import { RecentSearchesService, SearchRegistryService, type SearchResult } from 'ngx-cmdk';
```

(replacing the existing `import { SearchRegistryService, type SearchResult } from 'ngx-cmdk';` line), and inside the class, add:

```ts
  private readonly recentSearches = inject(RecentSearchesService);

  protected clearRecents(): void {
    this.recentSearches.clear();
    this.log.log('Cleared recent searches');
  }
```

Update `projects/demo/src/app/demo-search.html` — replace its full contents with:

```html
<section class="demo-panel">
  <h3>Search panel</h3>
  <p>
    Registers a "fruits" search provider (with a simulated 150ms delay, to
    show the loading state honestly). Type a query in the palette, or
    scope to it first by clicking the "fruits" chip or typing
    <code>fruits:</code>. Selecting a result is remembered as a "Recent
    search" and reappears above Commands next time you open the palette
    with an empty query — even after a page reload.
  </p>
  <button type="button" (click)="clearRecents()">Clear recent searches</button>
</section>
```

- [ ] **Step 7: Read `demo-search.spec.ts` again and add a test confirming `clearRecents()` calls through to the service**

Add this test, following whatever pattern the file already uses to grab a `RecentSearchesService`/component instance:

```ts
  it('clearRecents() clears the underlying RecentSearchesService', () => {
    const recentSearches = TestBed.inject(RecentSearchesService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    expect(recentSearches.recent()).toHaveLength(1);

    (fixture.componentInstance as unknown as { clearRecents(): void }).clearRecents();

    expect(recentSearches.recent()).toEqual([]);
  });
```

Add `RecentSearchesService` to that file's existing `import ... from 'ngx-cmdk'` line.

- [ ] **Step 8: Run demo tests to verify everything passes**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -60
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add projects/demo/src/app/demo-search.ts projects/demo/src/app/demo-search.html projects/demo/src/app/demo-search.spec.ts projects/demo/src/app/app.config.ts
git commit -m "Wire Recent searches into the demo app"
```

---

### Task 7: Docs page update

**Files:**
- Modify: `projects/demo/src/app/api-reference.ts`
- Modify: `projects/demo/src/app/api-reference.html`

**Interfaces:**
- Consumes: nothing programmatic — this task only updates static documentation strings/markup, matching the existing pattern for every previously-documented capability (icons, scoping, `CmdkIssueService`, etc.).

- [ ] **Step 1: Update the existing `searchProviderSnippet`/`searchRegistrySnippet` strings and add new ones**

In `projects/demo/src/app/api-reference.ts`, replace:

```ts
  protected readonly searchProviderSnippet = `interface SearchResult {
  label: string;
  subtitle?: string;      // e.g. "/fruits/apple"
  icon?: string;
  execute: () => void | Promise<void>;
}

interface SearchProvider {
  key: string;             // e.g. "fruits" — also the "key:" prefix in the input
  label: string;           // chip display text
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
}`;

  protected readonly searchRegistrySnippet = `class SearchRegistryService {
  register(provider: SearchProvider): () => void;   // throws on duplicate key
  readonly providers: Signal<readonly SearchProvider[]>;
  search(query: string, scopeKey?: string): Promise<SearchResult[]>;
}`;

  protected readonly cmdkIssueSnippet = `type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown };

class CmdkIssueService {
  onIssue(callback: (issue: CmdkIssue) => void): () => void;
}`;
```

with:

```ts
  protected readonly searchProviderSnippet = `interface SearchResult {
  label: string;
  subtitle?: string;      // e.g. "/fruits/apple"
  icon?: string;
  resultId?: string;      // set this to make the result persistable as a "recent"
  execute: () => void | Promise<void>;
}

interface SearchProvider {
  key: string;             // e.g. "fruits" — also the "key:" prefix in the input
  label: string;           // chip display text
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
  resolve?: (resultId: string) => Promise<SearchResult | null>;  // reconstructs a persisted recent
}`;

  protected readonly searchRegistrySnippet = `class SearchRegistryService {
  register(provider: SearchProvider): () => void;   // throws on duplicate key
  readonly providers: Signal<readonly SearchProvider[]>;
  search(query: string, scopeKey?: string): Promise<SearchResult[]>;
}`;

  protected readonly recentSearchesSnippet = `function provideCmdk(config?: {
  shortcut?: string;
  searchTimeoutMs?: number;
  recentSearchesStorageKey?: () => string | null;   // unset = feature is fully off
}): EnvironmentProviders;

interface RecentSearchEntry {
  providerKey: string;
  resultId: string;
  label: string;
  subtitle?: string;
  icon?: string;
  selectedAt: number;
}

class RecentSearchesService {
  readonly recent: Signal<readonly RecentSearchEntry[]>;   // most-recent-first, capped at 10
  clear(): void;                                            // e.g. call this on logout
}`;

  protected readonly cmdkIssueSnippet = `type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown };

class CmdkIssueService {
  onIssue(callback: (issue: CmdkIssue) => void): () => void;
}`;
```

- [ ] **Step 2: Add a "Recent searches" article to `api-reference.html`**

In `projects/demo/src/app/api-reference.html`, insert a new `<article>` immediately after the existing `<article><h3>Scoping a search</h3>...</article>` block (i.e. between "Scoping a search" and "CmdkIssueService"):

```html
  <article>
    <h3>Recent searches</h3>
    <p>
      Opt-in and fully hard-gated: with no <code>recentSearchesStorageKey</code>
      configured, nothing is tracked, persisted, or rendered — zero behavior
      change. Configure it and every search-result selection (not Commands)
      is remembered to <code>localStorage</code> under the key your callback
      returns, and reappears in a "Recent searches" section above Commands
      the next time the palette opens with an empty, unscoped query — even
      after a reload. The key is a plain callback, not a static string, so a
      host app can scope it per signed-in user (e.g.
      <code>() =&gt; userId() ? 'myapp-recents-' + userId() : null</code>) to
      avoid leaking one account's history to another on a shared device.
    </p>
    <p>
      A result only becomes a persistable recent if its provider sets
      <code>resultId</code>; selecting a persisted recent from a previous
      session calls that provider's <code>resolve(resultId)</code> to
      reconstruct a fresh, live result (never called just to list recents —
      only when one is actually picked). If the provider that produced a
      recent isn't currently registered, that entry is hidden from the list
      but left untouched in storage — it reappears once the provider
      registers again. If <code>resolve()</code> fails or returns
      <code>null</code>, the entry is confirmed gone and removed for real.
    </p>
    <pre class="doc-code"><code>{{ recentSearchesSnippet }}</code></pre>
  </article>
```

- [ ] **Step 3: Serve the demo locally and visually verify the new docs article renders correctly**

```bash
source ~/.nvm/nvm.sh 2>/dev/null; nvm use 24.18.0 >/dev/null
npx ng build ngx-cmdk 2>&1 | tail -20
npx ng test demo --watch=false 2>&1 | tail -40
```

Expected: build and tests pass (the docs page has no dedicated spec asserting snippet content — the existing `app.spec.ts`/smoke tests just need to keep passing). Manual visual confirmation of the rendered docs page happens in Task 8's Playwright smoke test.

- [ ] **Step 4: Commit**

```bash
git add projects/demo/src/app/api-reference.ts projects/demo/src/app/api-reference.html
git commit -m "Document Recent searches in the demo API reference"
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
npx ng test ngx-cmdk --watch=false 2>&1 | tail -100
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
2. Type `apple`, select the "Apple" search result — confirm the activity log records the selection and the palette closes.
3. Reopen the palette with an empty query — confirm a "Recent searches" section appears above "Actions", showing "Apple" with its `/fruits/apple` subtitle.
4. Select "Apple" from Recent searches — confirm it executes (activity log entry appears again) and the entry stays at the top.
5. Reload the page entirely, reopen the palette — confirm "Apple" still appears under Recent searches (proving `localStorage` round-trip survives a reload).
6. Click "Clear recent searches" in the search panel, reopen the palette — confirm the Recent searches section is gone.
7. Use arrow keys to confirm keyboard navigation moves smoothly from a recent entry into the Commands list without skipping or double-selecting a row.

Stop the dev server once verification is complete:

```bash
kill %1 2>/dev/null
```

- [ ] **Step 5: Final commit (if any cleanup was needed) or confirm the branch is ready for review**

If Step 4 surfaced no issues requiring code changes, no commit is needed here — the branch is ready for the final whole-branch review and PR.
