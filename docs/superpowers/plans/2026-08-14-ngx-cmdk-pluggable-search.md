# ngx-cmdk Pluggable Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second registration surface to `ngx-cmdk` — pluggable
async search providers, fanned out on a shared query, merged into the
palette, with category-scoped search via a `key:` prefix or a clickable
chip — plus a generalized `CmdkIssueService` error-reporting escape hatch,
wired into the demo app and its deployed docs page.

**Architecture:** Two new root-provided services (`CmdkIssueService`,
`SearchRegistryService`) alongside the existing `CommandRegistryService`,
following the same registration/fail-fast/signal-based conventions already
established in this library. `CmdkPaletteComponent` gains new state for
scoping and search results, branching its rendering and keyboard handling
between "Commands mode" (unchanged) and "search mode" (new), gated
entirely on whether any search provider is registered — a consuming app
that registers none sees zero behavior change.

**Tech Stack:** Angular 22 (standalone components, signals throughout, no
RxJS in this library's own code), Vitest with `vitest/globals` (no
`import` from `'vitest'` in spec files), plain `setTimeout` for debounce
and per-provider timeouts.

**Spec:** [docs/superpowers/specs/2026-08-14-ngx-cmdk-pluggable-search-design.md](../specs/2026-08-14-ngx-cmdk-pluggable-search-design.md)

## Global Constraints

- **Node version: 24.18.0**, pinned via the repo's existing `.nvmrc`. Run
  `nvm use` in every shell before `npm`/`ng` commands.
- **The library must be built before the demo app.** `projects/demo`'s
  `tsconfig` path-maps `ngx-cmdk` imports to `dist/ngx-cmdk`. Run
  `npx ng build ngx-cmdk` before any `ng build demo`/`ng serve demo`/
  `ng test demo` in a task that touches the demo app.
- **No RxJS anywhere in this library's own code.** Debounce and per-provider
  timeouts use plain `setTimeout`/`Promise.race`, never `Observable`/
  `Subject`/`EventEmitter`.
- **Vitest globals**: `describe`/`it`/`expect`/`vi` are globals via
  `vitest/globals` — never `import` them from `'vitest'` in spec files (a
  duplicate-identifier error results).
- **Backward compatibility is load-bearing**: with zero search providers
  registered, `CmdkPaletteComponent` must behave identically to before this
  plan — typing fuzzy-matches Commands exactly as today. This is gated by
  `SearchRegistryService.hasProviders()`; every task touching the palette
  must preserve this gate.
- **No per-provider grouping in the results list.** Search results from
  every queried provider merge into one flat list, in provider-registration
  order — provenance is carried by each result's own `icon`, not a section
  header.
- **Dual-channel error reporting**: every error this library catches
  continues to log via `console.error`/`console.warn` exactly as it does
  today, and *additionally* reports through `CmdkIssueService` — this is
  purely additive; no existing logging behavior changes.
- **`CmdkConfig` gains `searchTimeoutMs: number`** (default `5000`),
  configured once via `provideCmdk()`, same precedent as `shortcut`.

---

### Task 1: `CmdkIssueService` — the generalized error-reporting escape hatch

**Files:**
- Create: `projects/ngx-cmdk/src/lib/cmdk-issue.ts`
- Test: `projects/ngx-cmdk/src/lib/cmdk-issue.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `CmdkIssue` (discriminated union type) and `CmdkIssueService`
  (`@Injectable({ providedIn: 'root' })`) with `report(issue: CmdkIssue): void`
  and `onIssue(callback: (issue: CmdkIssue) => void): () => void`. Task 3
  (`SearchRegistryService`), Task 4 (`CommandRegistryService`), and Task 6
  (palette search-result execution) all inject this service and call
  `report()`.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/cmdk-issue.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { CmdkIssueService } from './cmdk-issue';

describe('CmdkIssueService', () => {
  let service: CmdkIssueService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CmdkIssueService);
  });

  it('does nothing when there are no listeners', () => {
    expect(() =>
      service.report({ source: 'command', commandId: 'x', error: new Error('boom') }),
    ).not.toThrow();
  });

  it('invokes a registered listener with the reported issue', () => {
    const listener = vi.fn();
    service.onIssue(listener);
    const issue = { source: 'command' as const, commandId: 'x', error: new Error('boom') };
    service.report(issue);
    expect(listener).toHaveBeenCalledWith(issue);
  });

  it('invokes multiple registered listeners', () => {
    const first = vi.fn();
    const second = vi.fn();
    service.onIssue(first);
    service.onIssue(second);
    const issue = { source: 'search-result' as const, label: 'x', error: new Error('boom') };
    service.report(issue);
    expect(first).toHaveBeenCalledWith(issue);
    expect(second).toHaveBeenCalledWith(issue);
  });

  it('stops invoking a listener after it unregisters', () => {
    const listener = vi.fn();
    const unregister = service.onIssue(listener);
    unregister();
    service.report({ source: 'command', commandId: 'x', error: new Error('boom') });
    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op when unregister is called more than once', () => {
    const listener = vi.fn();
    const unregister = service.onIssue(listener);
    unregister();
    expect(() => unregister()).not.toThrow();
  });

  it('does not let a throwing listener prevent other listeners from running', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing = vi.fn(() => {
      throw new Error('listener boom');
    });
    const other = vi.fn();
    service.onIssue(throwing);
    service.onIssue(other);
    const issue = { source: 'search-provider' as const, key: 'x', query: 'q', reason: 'error' as const };
    expect(() => service.report(issue)).not.toThrow();
    expect(other).toHaveBeenCalledWith(issue);
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './cmdk-issue'`.

- [ ] **Step 3: Write the implementation**

Create `projects/ngx-cmdk/src/lib/cmdk-issue.ts`:

```ts
import { Injectable } from '@angular/core';

export type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown };

@Injectable({ providedIn: 'root' })
export class CmdkIssueService {
  private readonly listeners = new Set<(issue: CmdkIssue) => void>();

  report(issue: CmdkIssue): void {
    for (const listener of this.listeners) {
      try {
        listener(issue);
      } catch (error) {
        console.error('A CmdkIssueService listener threw:', error);
      }
    }
  }

  onIssue(callback: (issue: CmdkIssue) => void): () => void {
    this.listeners.add(callback);
    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.listeners.delete(callback);
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: all tests pass, including the 7 new ones in `cmdk-issue.spec.ts`.

- [ ] **Step 5: Export from the public API**

Append to `projects/ngx-cmdk/src/public-api.ts`:

```ts
export { CmdkIssueService } from './lib/cmdk-issue';
export type { CmdkIssue } from './lib/cmdk-issue';
```

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-issue.ts \
        projects/ngx-cmdk/src/lib/cmdk-issue.spec.ts \
        projects/ngx-cmdk/src/public-api.ts
git commit -m "Add CmdkIssueService: a generalized escape hatch for library-caught errors"
```

---

### Task 2: `searchTimeoutMs` config

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/cmdk-config.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-config.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `CmdkConfig.searchTimeoutMs: number` (default `5000`), read by
  Task 3's `SearchRegistryService` via the existing `CMDK_CONFIG` injection
  token.

- [ ] **Step 1: Update the existing test that will break**

The existing test `'overrides only the provided fields'` in
`projects/ngx-cmdk/src/lib/cmdk-config.spec.ts` currently asserts:

```ts
  it('overrides only the provided fields', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ shortcut: 'ctrl+p' })] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual({ shortcut: 'ctrl+p' });
  });
```

Once `searchTimeoutMs` is added to `DEFAULT_CMDK_CONFIG`, the merged config
will include it even when not overridden — this test's expectation must
change first, in the same commit as the implementation (not before,
since it would fail against the *current* implementation too — this step
and Step 3 land together). Update it to:

```ts
  it('overrides only the provided fields', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ shortcut: 'ctrl+p' })] });
    expect(TestBed.inject(CMDK_CONFIG)).toEqual({ shortcut: 'ctrl+p', searchTimeoutMs: 5000 });
  });
```

- [ ] **Step 2: Write the new failing tests**

Append to the same `describe('provideCmdk', ...)` block:

```ts
  it('defaults searchTimeoutMs to 5000 when not overridden', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk()] });
    expect(TestBed.inject(CMDK_CONFIG).searchTimeoutMs).toBe(5000);
  });

  it('overrides searchTimeoutMs when provided', () => {
    TestBed.configureTestingModule({ providers: [provideCmdk({ searchTimeoutMs: 100 })] });
    expect(TestBed.inject(CMDK_CONFIG).searchTimeoutMs).toBe(100);
  });
```

- [ ] **Step 3: Run the tests to verify the new ones fail and note the updated one also fails**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `searchTimeoutMs` is `undefined` (2 new tests), and the
updated `'overrides only the provided fields'` test also fails against the
current implementation, since `DEFAULT_CMDK_CONFIG` doesn't have
`searchTimeoutMs` yet.

- [ ] **Step 4: Update `CmdkConfig`**

In `projects/ngx-cmdk/src/lib/cmdk-config.ts`, change:

```ts
export interface CmdkConfig {
  shortcut: string;
}

export const DEFAULT_CMDK_CONFIG: CmdkConfig = { shortcut: 'mod+k' };
```

to:

```ts
export interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
}

export const DEFAULT_CMDK_CONFIG: CmdkConfig = { shortcut: 'mod+k', searchTimeoutMs: 5000 };
```

The rest of `provideCmdk()`'s merge logic (`{ ...DEFAULT_CMDK_CONFIG,
...config }`) already handles the new field correctly — no other changes
needed in this file.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: all tests pass, including the updated and 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-config.ts projects/ngx-cmdk/src/lib/cmdk-config.spec.ts
git commit -m "Add searchTimeoutMs to CmdkConfig"
```

---

### Task 3: `SearchResult`/`SearchProvider` types and `SearchRegistryService`

**Files:**
- Create: `projects/ngx-cmdk/src/lib/search.model.ts`
- Create: `projects/ngx-cmdk/src/lib/search-registry.ts`
- Test: `projects/ngx-cmdk/src/lib/search-registry.spec.ts`
- Modify: `projects/ngx-cmdk/src/public-api.ts`

**Interfaces:**
- Consumes: `CmdkIssueService` (Task 1), `CMDK_CONFIG`/`searchTimeoutMs`
  (Task 2).
- Produces: `SearchResult` (`{ label, subtitle?, icon?, execute }`),
  `SearchProvider` (`{ key, label, icon?, search }`), and
  `SearchRegistryService` (`@Injectable({ providedIn: 'root' })`) with:
  - `register(provider: SearchProvider): () => void` — throws on duplicate
    `key`.
  - `readonly providers: Signal<readonly SearchProvider[]>` — every
    registered provider, insertion order. (Not in the spec's abbreviated
    API sketch, but required for Task 5's chip row to render provider
    labels/icons — the same pattern `CommandRegistryService.commands`
    already establishes.)
  - `readonly hasProviders: Signal<boolean>` — `providers().length > 0`.
  - `search(query: string, scopeKey?: string): Promise<SearchResult[]>` —
    fans out to every provider (or only the one matching `scopeKey`),
    each wrapped with a timeout, merges results in provider-registration
    order. Never rejects. Task 5 and 6 call `providers()`/`hasProviders()`;
    Task 6 calls `search()`.

- [ ] **Step 1: Write the failing tests**

Create `projects/ngx-cmdk/src/lib/search-registry.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SearchRegistryService } from './search-registry';
import { CmdkIssueService } from './cmdk-issue';
import { provideCmdk } from './cmdk-config';
import type { SearchProvider } from './search.model';

function makeProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return { key: 'test', label: 'Test', search: async () => [], ...overrides };
}

describe('SearchRegistryService', () => {
  let service: SearchRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SearchRegistryService);
  });

  it('starts with no providers', () => {
    expect(service.hasProviders()).toBe(false);
    expect(service.providers()).toEqual([]);
  });

  it('registers a provider and exposes it via providers()/hasProviders()', () => {
    service.register(makeProvider({ key: 'assets', label: 'assets' }));
    expect(service.hasProviders()).toBe(true);
    expect(service.providers().map((p) => p.key)).toEqual(['assets']);
  });

  it('throws when registering a duplicate key', () => {
    service.register(makeProvider({ key: 'assets' }));
    expect(() => service.register(makeProvider({ key: 'assets' }))).toThrow(
      'Search provider with key "assets" is already registered',
    );
  });

  it('removes the provider when the returned unregister function is called', () => {
    const unregister = service.register(makeProvider());
    unregister();
    expect(service.hasProviders()).toBe(false);
  });

  it('excludes an unregistered provider from subsequent searches', async () => {
    const search = vi.fn(async () => [{ label: 'Result', execute: () => {} }]);
    const unregister = service.register(makeProvider({ key: 'a', search }));
    unregister();
    const results = await service.search('query');
    expect(results).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('is a no-op when unregister is called more than once', () => {
    const unregister = service.register(makeProvider());
    unregister();
    expect(() => unregister()).not.toThrow();
  });

  it('merges results from multiple providers in registration order', async () => {
    service.register(
      makeProvider({ key: 'a', search: async () => [{ label: 'A result', execute: () => {} }] }),
    );
    service.register(
      makeProvider({ key: 'b', search: async () => [{ label: 'B result', execute: () => {} }] }),
    );
    const results = await service.search('query');
    expect(results.map((r) => r.label)).toEqual(['A result', 'B result']);
  });

  it('queries only the scoped provider when scopeKey is given', async () => {
    const aSearch = vi.fn(async () => [{ label: 'A result', execute: () => {} }]);
    const bSearch = vi.fn(async () => [{ label: 'B result', execute: () => {} }]);
    service.register(makeProvider({ key: 'a', search: aSearch }));
    service.register(makeProvider({ key: 'b', search: bSearch }));
    const results = await service.search('query', 'b');
    expect(results.map((r) => r.label)).toEqual(['B result']);
    expect(bSearch).toHaveBeenCalledWith('query');
    expect(aSearch).not.toHaveBeenCalled();
  });
});

describe('SearchRegistryService timeout/error handling', () => {
  let service: SearchRegistryService;
  let issues: CmdkIssueService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideCmdk({ searchTimeoutMs: 100 })] });
    service = TestBed.inject(SearchRegistryService);
    issues = TestBed.inject(CmdkIssueService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('contributes no results and reports a timeout issue for a provider that never resolves', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onIssue = vi.fn();
    issues.onIssue(onIssue);
    service.register(makeProvider({ key: 'slow', search: () => new Promise(() => {}) }));

    const resultsPromise = service.search('query');
    await vi.advanceTimersByTimeAsync(100);
    const results = await resultsPromise;

    expect(results).toEqual([]);
    expect(consoleWarn).toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith({
      source: 'search-provider',
      key: 'slow',
      query: 'query',
      reason: 'timeout',
    });
    consoleWarn.mockRestore();
  });

  it('contributes no results and reports an error issue for a provider that rejects', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onIssue = vi.fn();
    issues.onIssue(onIssue);
    const error = new Error('boom');
    service.register(
      makeProvider({
        key: 'broken',
        search: async () => {
          throw error;
        },
      }),
    );

    const results = await service.search('query');

    expect(results).toEqual([]);
    expect(consoleWarn).toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith({
      source: 'search-provider',
      key: 'broken',
      query: 'query',
      reason: 'error',
      error,
    });
    consoleWarn.mockRestore();
  });

  it('still includes results from a fast provider alongside a timed-out one', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.register(
      makeProvider({ key: 'fast', search: async () => [{ label: 'Fast result', execute: () => {} }] }),
    );
    service.register(makeProvider({ key: 'slow', search: () => new Promise(() => {}) }));

    const resultsPromise = service.search('query');
    await vi.advanceTimersByTimeAsync(100);
    const results = await resultsPromise;

    expect(results.map((r) => r.label)).toEqual(['Fast result']);
    consoleWarn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `Cannot find module './search-registry'` (and
`./search.model` via the type-only import).

- [ ] **Step 3: Write the types**

Create `projects/ngx-cmdk/src/lib/search.model.ts`:

```ts
export interface SearchResult {
  label: string;
  subtitle?: string;
  icon?: string;
  execute: () => void | Promise<void>;
}

export interface SearchProvider {
  key: string;
  label: string;
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
}
```

- [ ] **Step 4: Write the service**

Create `projects/ngx-cmdk/src/lib/search-registry.ts`:

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

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: all tests pass, including the 9 new ones in
`search-registry.spec.ts`.

- [ ] **Step 6: Export from the public API**

Append to `projects/ngx-cmdk/src/public-api.ts`:

```ts
export type { SearchProvider, SearchResult } from './lib/search.model';
export { SearchRegistryService } from './lib/search-registry';
```

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/search.model.ts \
        projects/ngx-cmdk/src/lib/search-registry.ts \
        projects/ngx-cmdk/src/lib/search-registry.spec.ts \
        projects/ngx-cmdk/src/public-api.ts
git commit -m "Add SearchRegistryService: pluggable, timeout-bounded search providers"
```

---

### Task 4: Report command-execution failures through `CmdkIssueService`

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/command-registry.ts`
- Modify: `projects/ngx-cmdk/src/lib/command-registry.spec.ts`

**Interfaces:**
- Consumes: `CmdkIssueService` (Task 1).
- Produces: no new exports. `CommandRegistryService.execute()`'s existing
  signature and `console.error` behavior are unchanged; this only adds a
  second, additive reporting channel.

- [ ] **Step 1: Update the existing failing-execute tests**

In `projects/ngx-cmdk/src/lib/command-registry.spec.ts`, the
`describe('CommandRegistryService.execute()', ...)` block currently has:

```ts
  it('logs and swallows an error thrown by execute()', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const command = { ...makeCommand({ id: 'broken' }), id: 'broken', execute: () => {
      throw new Error('boom');
    } };
    expect(() => service.execute(command)).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logs and swallows a rejected promise returned by execute()', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const command = { ...makeCommand({ id: 'broken' }), id: 'broken', execute: () => Promise.reject(new Error('boom')) };
    service.execute(command);
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
```

Add the `CmdkIssueService` import at the top of the file:

```ts
import { CmdkIssueService } from './cmdk-issue';
```

Replace both tests with versions that also assert the issue was reported:

```ts
  it('logs and swallows an error thrown by execute()', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const issues = TestBed.inject(CmdkIssueService);
    const onIssue = vi.fn();
    issues.onIssue(onIssue);
    const command = { ...makeCommand({ id: 'broken' }), id: 'broken', execute: () => {
      throw new Error('boom');
    } };
    expect(() => service.execute(command)).not.toThrow();
    expect(consoleError).toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith({ source: 'command', commandId: 'broken', error: expect.any(Error) });
    consoleError.mockRestore();
  });

  it('logs and swallows a rejected promise returned by execute()', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const issues = TestBed.inject(CmdkIssueService);
    const onIssue = vi.fn();
    issues.onIssue(onIssue);
    const command = { ...makeCommand({ id: 'broken' }), id: 'broken', execute: () => Promise.reject(new Error('boom')) };
    service.execute(command);
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith({ source: 'command', commandId: 'broken', error: expect.any(Error) });
    consoleError.mockRestore();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — both updated tests fail on the `onIssue` assertion, since
`CommandRegistryService.execute()` doesn't report through
`CmdkIssueService` yet.

- [ ] **Step 3: Wire in the reporting**

In `projects/ngx-cmdk/src/lib/command-registry.ts`, add the import:

```ts
import { CmdkIssueService } from './cmdk-issue';
```

Add a new field alongside the existing injected fields (e.g. after
`private readonly config = inject(CMDK_CONFIG);`):

```ts
  private readonly issues = inject(CmdkIssueService);
```

Replace the `execute()` method:

```ts
  execute(command: ResolvedCommand): void {
    try {
      const result = command.execute();
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error(`Command "${command.id}" failed:`, error);
          this.issues.report({ source: 'command', commandId: command.id, error });
        });
      }
    } catch (error) {
      console.error(`Command "${command.id}" failed:`, error);
      this.issues.report({ source: 'command', commandId: command.id, error });
    }
  }
```

- [ ] **Step 4: Run the full library test suite to confirm nothing else broke**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: all tests pass — the two updated tests, plus every other
existing `CommandRegistryService` test unaffected (this change only adds
a call inside the two `execute()` catch paths).

- [ ] **Step 5: Commit**

```bash
git add projects/ngx-cmdk/src/lib/command-registry.ts projects/ngx-cmdk/src/lib/command-registry.spec.ts
git commit -m "Report command-execution failures through CmdkIssueService"
```

---

### Task 5: Palette scoping mechanism — chip row, scope token, `key:` prefix parsing

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.html`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.css`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`

**Interfaces:**
- Consumes: `SearchRegistryService.providers()`/`hasProviders()` (Task 3).
- Produces: `scopedProviderKey: Signal<string | null>` and
  `searchProviders: Signal<readonly SearchProvider[]>` on
  `CmdkPaletteComponent`, plus the chip-click/prefix-parse/backspace
  behavior. Task 6 depends on `scopedProviderKey` to pass as `search()`'s
  `scopeKey` argument, and reads `query()`'s already-stripped value (the
  part after any `key:` prefix) as the text to search on.

This task does **not** yet wire up actual searching — `scheduleSearch`,
`searchResults`, and the search-mode rendering branch all land in Task 6.
After this task, scoping a query visually converts to a token and the chip
row appears/disappears correctly, but the results list still shows
Commands underneath regardless of scope state — that's expected and
completed by Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`, inside the
existing `describe('CmdkPaletteComponent', ...)` block (it already
imports `CommandRegistryService`, `provideCmdk`, and sets up `fixture`/
`registry` in `beforeEach`). Add the import at the top of the file:

```ts
import { SearchRegistryService } from './search-registry';
```

Add these tests after the existing ones, before the final closing `});`
of the `describe` block:

```ts
  it('does not show a chip row when no search providers are registered', () => {
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).toBeNull();
  });

  it('shows a chip row with a button per registered search provider', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    searchRegistry.register({ key: 'colors', label: 'colors', search: async () => [] });
    pressOpenShortcut();
    const chipLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.cmdk-chip') as NodeListOf<Element>,
    ).map((el) => el.textContent?.trim());
    expect(chipLabels).toEqual(['fruits', 'colors']);
  });

  it('clicking a chip converts it into a scope token and hides the chip row', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')?.textContent).toContain('fruits');
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).toBeNull();
  });

  it('typing "key:" converts the matching provider into a scope token', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'fruits:app';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')?.textContent).toContain('fruits');
    expect(input.value).toBe('app');
  });

  it('does not convert a prefix that matches no registered provider', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'nope:app';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).toBeNull();
  });

  it('Backspace with an empty query and an active token removes the token and restores the chip row', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).not.toBeNull();
  });

  it('Backspace does not remove the token when the query is non-empty', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'app';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).not.toBeNull();
  });

  it('resets scope on reopen', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — no `.cmdk-chip-row`/`.cmdk-chip`/`.cmdk-scope-token`
elements exist yet, and prefix-parsing/Backspace-removal aren't wired up.

- [ ] **Step 3: Add the new state and methods to the component**

In `projects/ngx-cmdk/src/lib/cmdk-palette.ts`, add the import:

```ts
import { SearchRegistryService } from './search-registry';
```

Add a new injected field alongside `private readonly registry = inject(CommandRegistryService);`:

```ts
  private readonly searchRegistry = inject(SearchRegistryService);
```

Add new signals/computed alongside the existing `selectedIndex` signal:

```ts
  protected readonly scopedProviderKey = signal<string | null>(null);
  protected readonly searchProviders = computed(() => this.searchRegistry.providers());
```

Replace `open()` to also reset scope:

```ts
  protected open(): void {
    if (this.isOpen()) {
      return;
    }
    this.previouslyFocused = this.document.activeElement as HTMLElement | null;
    this.query.set('');
    this.selectedIndex.set(0);
    this.scopedProviderKey.set(null);
    this.isOpen.set(true);
  }
```

Replace `onQueryChange()` to parse a `key:` prefix before setting the
query:

```ts
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
  }
```

Add a new `selectProviderScope()` method (called by the chip row's click
handler, added to the template in Step 4):

```ts
  protected selectProviderScope(key: string): void {
    this.scopedProviderKey.set(key);
    this.searchInput()?.nativeElement.focus();
  }
```

In `onKeydown()`, add a new `case 'Backspace':` **before** the existing
`case 'Tab':` (order among cases doesn't matter functionally, but keep the
switch readable by grouping it near the other single-key cases):

```ts
      case 'Backspace':
        if (this.scopedProviderKey() !== null && this.query() === '') {
          event.preventDefault();
          this.scopedProviderKey.set(null);
        }
        break;
```

(When the condition is false, this case does nothing and does **not**
call `preventDefault()`, so the browser's native Backspace text-editing
behavior proceeds unaffected.)

- [ ] **Step 4: Update the template**

In `projects/ngx-cmdk/src/lib/cmdk-palette.html`, replace the `<input>`
element and add the chip row immediately after it (inside `.cmdk-panel`,
before `.cmdk-list`):

```html
      <div class="cmdk-input-row">
        @if (scopedProviderKey(); as scopedKey) {
          <span class="cmdk-scope-token">{{ scopedKey }}</span>
        }
        <input
          #searchInput
          class="cmdk-input"
          type="text"
          aria-label="Search commands"
          [attr.aria-activedescendant]="selectedCommand() ? 'cmdk-item-' + selectedCommand()!.id : null"
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
```

(The old bare `<input ...>` that was a direct child of `.cmdk-panel` is
now wrapped in `.cmdk-input-row` alongside the scope token — same
attributes and bindings as before, unchanged.)

- [ ] **Step 5: Add styles**

Append to `projects/ngx-cmdk/src/lib/cmdk-palette.css`:

```css
.cmdk-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
}

.cmdk-input-row .cmdk-input {
  flex: 1;
  border-bottom: none;
  padding: 16px 0;
}

.cmdk-scope-token {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--cmdk-accent, #eef2ff);
  font-size: 13px;
}

.cmdk-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
}

.cmdk-chip {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--cmdk-border, rgba(0, 0, 0, 0.1));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.cmdk-chip:hover {
  background: var(--cmdk-accent, #eef2ff);
}
```

- [ ] **Step 6: Build the library, then run the tests**

```bash
npx ng build ngx-cmdk
npx ng test ngx-cmdk --no-watch
```

Expected: all tests pass, including the 8 new ones in this task.

- [ ] **Step 7: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-palette.ts \
        projects/ngx-cmdk/src/lib/cmdk-palette.html \
        projects/ngx-cmdk/src/lib/cmdk-palette.css \
        projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts
git commit -m "Add search-provider scoping: chip row, scope token, key: prefix parsing"
```

---

### Task 6: Debounced search, staleness handling, results rendering, and selection

**Files:**
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.ts`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.html`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.css`
- Modify: `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`

**Interfaces:**
- Consumes: `SearchRegistryService.search()`/`hasProviders()` (Task 3),
  `CmdkIssueService` (Task 1), `scopedProviderKey`/`searchProviders`
  (Task 5).
- Produces: no new exports. This completes `CmdkPaletteComponent`'s
  search-mode behavior — the last task touching this component in this
  plan.

- [ ] **Step 1: Write the failing tests**

Append to `projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts`. Add `beforeEach`/
`afterEach` fake-timer setup is done per-test below (not globally, so the
existing non-search tests keep using real timers unaffected). Add these
tests after the ones from Task 5:

```ts
  it('backward compatibility: with zero search providers, typing still fuzzy-matches Commands', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.cmdk-item') as NodeListOf<Element>,
    ).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Alpha']);
  });

  it('shows a loading placeholder, then results, for a query with providers registered', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async (q) => [{ label: `Apple (${q})`, subtitle: '/fruits/apple', execute: () => {} }],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cmdk-empty')?.textContent).toContain('Searching');

      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const items = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-item-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(items).toEqual(['Apple (app)']);
      expect(fixture.nativeElement.querySelector('.cmdk-item-subtitle')?.textContent).toBe('/fruits/apple');
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces rapid keystrokes into a single search() call', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const search = vi.fn(async () => []);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      for (const value of ['a', 'ap', 'app']) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(200);
      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith('app');
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a stale response when a newer query has already resolved', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const search = vi.fn(async (q: string) => {
        if (q === 'slow') {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return [{ label: 'Slow result', execute: () => {} }];
        }
        return [{ label: 'Fast result', execute: () => {} }];
      });
      searchRegistry.register({ key: 'fruits', label: 'fruits', search });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');

      input.value = 'slow';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200); // debounce fires, "slow" search begins

      input.value = 'fast';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200); // debounce fires, "fast" search begins and resolves quickly

      await vi.advanceTimersByTimeAsync(500); // "slow" search's internal delay now elapses too
      fixture.detectChanges();

      const items = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-item-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(items).toEqual(['Fast result']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a generic empty state when a search resolves with no results', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cmdk-empty')?.textContent).toContain('No results');
    } finally {
      vi.useRealTimers();
    }
  });

  it('executes a selected search result and closes the palette', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const execute = vi.fn();
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [{ label: 'Apple', execute }],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a throwing search result does not crash and still closes the palette', async () => {
    vi.useFakeTimers();
    try {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [
          {
            label: 'Apple',
            execute: () => {
              throw new Error('boom');
            },
          },
        ],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
      expect(() =>
        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      ).not.toThrow();
      fixture.detectChanges();

      expect(consoleError).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
      consoleError.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('scoping to one provider via a chip only queries that provider', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const fruitsSearch = vi.fn(async () => []);
      const colorsSearch = vi.fn(async () => []);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search: fruitsSearch });
      searchRegistry.register({ key: 'colors', label: 'colors', search: colorsSearch });
      pressOpenShortcut();
      const chips = fixture.nativeElement.querySelectorAll('.cmdk-chip') as NodeListOf<HTMLElement>;
      chips[0].click(); // "fruits"
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);

      expect(fruitsSearch).toHaveBeenCalledWith('app');
      expect(colorsSearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng test ngx-cmdk --no-watch
```

Expected: FAIL — `isSearchModeActive`/`searchResults`/debounce/rendering
don't exist yet; the backward-compatibility test should already pass
(nothing about Commands-mode changes in this task), confirming it's a
true regression guard, not a tautology.

- [ ] **Step 3: Add search-mode state and the debounce/staleness logic**

In `projects/ngx-cmdk/src/lib/cmdk-palette.ts`, add the imports:

```ts
import { CmdkIssueService } from './cmdk-issue';
import type { SearchResult } from './search.model';
```

Add a new injected field:

```ts
  private readonly issues = inject(CmdkIssueService);
```

Add new signals/computed alongside `scopedProviderKey`:

```ts
  protected readonly searchResults = signal<SearchResult[] | null>(null);

  protected readonly isSearchModeActive = computed(
    () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
  );

  protected readonly selectedSearchResult = computed(() => this.searchResults()?.[this.selectedIndex()]);
```

Add two private fields for debounce/staleness bookkeeping, near
`private previouslyFocused`:

```ts
  private searchDebounceTimer?: ReturnType<typeof setTimeout>;
  private searchGeneration = 0;
```

Add a private `scheduleSearch` method:

```ts
  private scheduleSearch(query: string, scopeKey: string | null): void {
    clearTimeout(this.searchDebounceTimer);
    if (!query.trim() || !this.searchRegistry.hasProviders()) {
      return;
    }
    this.searchDebounceTimer = setTimeout(() => {
      const myGeneration = ++this.searchGeneration;
      this.searchRegistry.search(query, scopeKey ?? undefined).then((results) => {
        if (myGeneration === this.searchGeneration) {
          this.searchResults.set(results);
        }
      });
    }, 200);
  }
```

Update `onQueryChange()` to reset `searchResults` and call
`scheduleSearch` (add these two lines at the end of the existing method,
after `this.selectedIndex.set(0);`):

```ts
    this.searchResults.set(null);
    this.scheduleSearch(value, this.scopedProviderKey());
```

Update `selectProviderScope()` (from Task 5) to also trigger a fresh
search under the new scope, using whatever query is already typed:

```ts
  protected selectProviderScope(key: string): void {
    this.scopedProviderKey.set(key);
    this.searchResults.set(null);
    this.scheduleSearch(this.query(), key);
    this.searchInput()?.nativeElement.focus();
  }
```

Update `close()` to also cancel any pending debounce timer (add as the
first line inside the method, before the existing `if (!this.isOpen())`
guard, so it runs even if `close()` is called defensively):

```ts
  protected close(): void {
    clearTimeout(this.searchDebounceTimer);
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }
```

Add cleanup in the constructor, alongside the existing
`inject(DestroyRef).onDestroy(...)` call for the open-shortcut listener:

```ts
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchDebounceTimer));
```

Update the existing selection-clamping `effect()` in the constructor to
be mode-aware:

```ts
    effect(() => {
      const count = this.isSearchModeActive() ? (this.searchResults()?.length ?? 0) : this.flatMatches().length;
      if (this.selectedIndex() >= count) {
        this.selectedIndex.set(Math.max(0, count - 1));
      }
    });
```

- [ ] **Step 4: Split execution and update keyboard handling**

Rename the existing `runSelected(command: ResolvedCommand)` method to
`runSelectedCommand`, and add a new `runSearchResult`:

```ts
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
```

Update the `case 'Enter':` branch in `onKeydown()` to branch on
`isSearchModeActive()`:

```ts
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
```

Replace the private `moveSelection` method to use the mode-appropriate
count:

```ts
  private moveSelection(delta: number): void {
    const count = this.isSearchModeActive() ? (this.searchResults()?.length ?? 0) : this.flatMatches().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
```

- [ ] **Step 5: Update the template's results list**

In `projects/ngx-cmdk/src/lib/cmdk-palette.html`, replace the `.cmdk-list`
`<div>` and its contents:

```html
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
                <span class="cmdk-item-label">{{ result.label }}</span>
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
                  <span class="cmdk-item-label">{{ resolveLabel(match.item) }}</span>
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
```

(Note the inner `@for`'s `(click)` handler is renamed from
`runSelected(match.item)` to `runSelectedCommand(match.item)`, matching
Step 4's rename.)

- [ ] **Step 6: Add styles for the search-result subtitle**

Append to `projects/ngx-cmdk/src/lib/cmdk-palette.css`:

```css
.cmdk-item-subtitle {
  font-size: 12px;
  color: var(--cmdk-muted, #888);
}
```

- [ ] **Step 7: Build the library, then run the tests**

```bash
npx ng build ngx-cmdk
npx ng test ngx-cmdk --no-watch
```

Expected: all tests pass, including the 9 new ones in this task and the
backward-compatibility regression test.

- [ ] **Step 8: Commit**

```bash
git add projects/ngx-cmdk/src/lib/cmdk-palette.ts \
        projects/ngx-cmdk/src/lib/cmdk-palette.html \
        projects/ngx-cmdk/src/lib/cmdk-palette.css \
        projects/ngx-cmdk/src/lib/cmdk-palette.spec.ts
git commit -m "Add debounced search, staleness handling, and search-result rendering/execution"
```

---

### Task 7: Demo search provider

**Files:**
- Create: `projects/demo/src/app/demo-search.ts`
- Create: `projects/demo/src/app/demo-search.html`
- Test: `projects/demo/src/app/demo-search.spec.ts`
- Modify: `projects/demo/src/app/app.ts`
- Modify: `projects/demo/src/app/app.html`

**Interfaces:**
- Consumes: `SearchRegistryService` (Task 3), the demo's existing
  `DemoActivityLog` (unchanged).
- Produces: `DemoSearch`, a standalone component (selector
  `app-demo-search`) registering one search provider on creation and
  unregistering it on destroy — the same pattern `DemoActions`/`DemoNav`
  already establish for `CommandRegistryService`. Nothing later depends on
  it.

This plan wires a demo search provider into the same app that already
serves as ngx-cmdk's deployed docs page (per
`docs/superpowers/plans/2026-08-13-ngx-cmdk-docs-site.md`), so the new
pluggable-search feature is provable end to end on the live site, matching
how every other public API surface is already exercised there — not left
as a follow-up.

- [ ] **Step 1: Write the failing tests**

Create `projects/demo/src/app/demo-search.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { SearchRegistryService } from 'ngx-cmdk';
import { DemoSearch } from './demo-search';

describe('DemoSearch', () => {
  it('registers the fruits search provider on creation', () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    expect(registry.providers().map((p) => p.key)).toEqual(expect.arrayContaining(['fruits']));
  });

  it('unregisters the provider when destroyed', () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    fixture.destroy();
    expect(registry.providers().map((p) => p.key)).not.toEqual(expect.arrayContaining(['fruits']));
  });

  it('returns matching fruits for a query, case-insensitively', async () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    const results = await registry.search('APP');
    expect(results.map((r) => r.label)).toEqual(['Apple']);
  });

  it('returns no results for a query matching nothing', async () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    const results = await registry.search('zzz');
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx ng build ngx-cmdk
npx ng test demo --no-watch
```

Expected: FAIL — `Cannot find module './demo-search'`.

- [ ] **Step 3: Write the component**

Create `projects/demo/src/app/demo-search.ts`:

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
          execute: () => this.log.log(`Selected "${fruit}" from search`),
        }));
      },
    });

    this.destroyRef.onDestroy(unregister);
  }
}
```

Create `projects/demo/src/app/demo-search.html`:

```html
<section class="demo-panel">
  <h3>Search panel</h3>
  <p>
    Registers a "fruits" search provider (with a simulated 150ms delay, to
    show the loading state honestly). Type a query in the palette, or
    scope to it first by clicking the "fruits" chip or typing
    <code>fruits:</code>.
  </p>
</section>
```

(No new stylesheet — this reuses the global `.demo-panel` class from
`projects/demo/src/styles.css`, the same way `demo-actions.html`/
`demo-nav.html` already do.)

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx ng test demo --no-watch
```

Expected: all 4 new tests pass.

- [ ] **Step 5: Wire it into the app**

In `projects/demo/src/app/app.ts`, add the import and register it in
`imports`:

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

In `projects/demo/src/app/app.html`, add `<app-demo-search />` inside the
"Live demo" section, after `<app-demo-nav />` and before the "Activity
log" panel, and mention it in the section's intro paragraph:

```html
  <section class="demo-section">
    <h2>Live demo</h2>
    <p>
      These panels register real commands and a real search provider from
      independent components, exactly as a consuming app would. Open the
      palette and try "Go to Section A", "Show Alert", "Cause Error", or
      type a fruit name to search.
    </p>
    <app-demo-actions />
    <app-demo-nav />
    <app-demo-search />

    <section class="demo-panel">
      <h3>Activity log</h3>
      <ul>
        @for (entry of log.recent(); track $index) {
          <li>{{ entry }}</li>
        } @empty {
          <li>Nothing yet — try a command.</li>
        }
      </ul>
    </section>
  </section>
```

- [ ] **Step 6: Build the library, then run and build the demo app**

```bash
npx ng build ngx-cmdk
npx ng test demo --no-watch
npx ng build demo
```

Expected: all demo tests pass, and `ng build demo` completes with no
errors about `app-demo-search` being an unknown element.

- [ ] **Step 7: Commit**

```bash
git add projects/demo/src/app/demo-search.ts \
        projects/demo/src/app/demo-search.html \
        projects/demo/src/app/demo-search.spec.ts \
        projects/demo/src/app/app.ts \
        projects/demo/src/app/app.html
git commit -m "Wire a demo search provider into the demo/docs app"
```

---

### Task 8: Document the new API surface on the docs page

**Files:**
- Modify: `projects/demo/src/app/api-reference.ts`
- Modify: `projects/demo/src/app/api-reference.html`

**Interfaces:**
- Consumes: nothing new — pure documentation content, no code dependency
  on other tasks (though it describes the API Tasks 1-6 introduce).
- Produces: no new exports.

- [ ] **Step 1: Add new snippet constants**

In `projects/demo/src/app/api-reference.ts`, add three new fields after
the existing `provideCmdkSnippet`, and update `provideCmdkSnippet` itself
to reflect the new `searchTimeoutMs` config field:

```ts
  protected readonly provideCmdkSnippet = `function provideCmdk(config?: { shortcut: string; searchTimeoutMs?: number }): EnvironmentProviders;

// defaults: shortcut "mod+k", searchTimeoutMs 5000
providers: [provideCmdk({ shortcut: 'mod+k', searchTimeoutMs: 5000 })]`;

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

(Only the *value* of `provideCmdkSnippet` changes; its declaration line
and position in the file are otherwise unchanged.)

- [ ] **Step 2: Add new documentation sections**

In `projects/demo/src/app/api-reference.html`, insert three new
`<article>` elements immediately after the existing `provideCmdk()`
article and before the existing `Shortcut rules` article:

```html
  <article>
    <h3>Search providers</h3>
    <p>
      A second registration surface, alongside commands. Call
      <code>SearchRegistryService.register()</code> from anywhere to
      attach an async data source to the palette — typing fans the query
      out to every registered provider and merges the results into a
      single flat list. With zero providers registered, typing behaves
      exactly as it always has: Commands keep fuzzy-matching.
    </p>
    <pre class="doc-code"><code>{{ searchProviderSnippet }}</code></pre>
    <pre class="doc-code"><code>{{ searchRegistrySnippet }}</code></pre>
    <p>
      A provider that's still running when <code>searchTimeoutMs</code>
      (default 5000ms, configurable via <code>provideCmdk()</code>)
      elapses contributes no results for that query — it doesn't block
      the others.
    </p>
  </article>

  <article>
    <h3>Scoping a search</h3>
    <p>
      With one or more providers registered, typing a provider's
      <code>key</code> followed by <code>:</code> (e.g.
      <code>"fruits:"</code>) converts it into a scope token — only that
      provider is queried until the token is removed with Backspace. The
      same scoping is also available by clicking a category chip below
      the search input.
    </p>
  </article>

  <article>
    <h3>CmdkIssueService</h3>
    <p>
      Every error this library catches on your behalf — a failing
      command, a failing or slow search provider, a failing search result
      — is logged via <code>console.error</code>/<code>console.warn</code>
      and also reported through this service, so you can build your own
      UI on top instead of the library imposing one.
    </p>
    <pre class="doc-code"><code>{{ cmdkIssueSnippet }}</code></pre>
  </article>
```

- [ ] **Step 3: Build the library, then run and build the demo app**

```bash
npx ng build ngx-cmdk
npx ng test demo --no-watch
npx ng build demo
```

Expected: all demo tests still pass; `ng build demo` succeeds.

- [ ] **Step 4: Commit**

```bash
git add projects/demo/src/app/api-reference.ts projects/demo/src/app/api-reference.html
git commit -m "Document pluggable search on the docs page"
```

---

### Task 9: Final verification

**Files:** none — this task only runs commands and inspects the result.

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: nothing — a final checkpoint before this branch is reviewed
  and merged.

- [ ] **Step 1: Run the full test suites**

```bash
npx ng build ngx-cmdk
npx ng test ngx-cmdk --no-watch
npx ng test demo --no-watch
```

Expected: both suites pass in full, with no warnings/noise in the output.

- [ ] **Step 2: Build both projects**

```bash
npx ng build ngx-cmdk
npx ng build demo
```

Expected: both complete with no errors.

- [ ] **Step 3: Manual browser smoke test**

```bash
npx ng serve demo &
```

Navigate a browser to the served URL (e.g. via the Playwright MCP tools
used earlier in this project) and verify:

- The chip row appears below the search input, showing a "fruits" chip,
  when the palette is opened and nothing is typed.
- Clicking the "fruits" chip converts it into a scope token and the chip
  row disappears.
- Typing a fruit name (e.g. "app") shows a brief "Searching…" state, then
  "Apple" with subtitle `/fruits/apple`.
- Selecting "Apple" adds "Selected "Apple" from search" to the Activity
  log and closes the palette.
- Backspace with an empty query removes the scope token and restores the
  chip row.
- Typing `fruits:app` directly (without clicking the chip) produces the
  same scoped result.
- The pre-existing "Go to Section A", "Show Alert", and "Cause Error"
  commands still work exactly as before search was added.

- [ ] **Step 4: Stop the server**

```bash
kill %1
```

- [ ] **Step 5: No commit** — this task only verifies work already
  committed in Tasks 1-8. If anything failed above, fix it in the
  relevant task's files and re-run this task's steps before moving on.
