# ngx-cmdk: Pluggable Search — Design

**Date:** 2026-08-14
**Status:** Approved, pending implementation plan

## Summary

A second registration surface, alongside `CommandRegistryService`: modules
register a **search provider** — a named, async data source — with the
palette. Typing a query fans it out to every registered provider with the
same text; results merge into a single flat list. Selecting a category (by
clicking a chip, or typing its key as a `key:` prefix) scopes subsequent
typing to just that one provider. This is entirely additive — a consuming
app that registers no search providers sees no behavior change at all.

Explicitly out of scope for this spec: recent-searches history, a
"Favourites" concept, and any settings/tuning UI beyond a single app-wide
timeout value. These are separate future features, not part of this
design.

## New types

```ts
interface SearchResult {
  label: string;
  subtitle?: string;                      // e.g. "/assets/22JDE"
  icon?: string;
  execute: () => void | Promise<void>;
}

interface SearchProvider {
  key: string;                            // e.g. "assets" — chip + "key:" prefix
  label: string;                          // chip display text
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
}

type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown };
```

`SearchResult` is deliberately a separate, simpler type from `Command` —
`Command`'s `shortcut`/`priority`/`group` fields don't apply to a live
search hit, and a search result always carries a `subtitle` (the path/
context line shown in the reference UI) that `Command` has no use for.

## `CmdkIssueService`

A small, dedicated service — a generalized escape hatch for errors the
library already catches and logs on the consumer's behalf, requested
explicitly so consumers can build their own UI on top rather than the
library imposing one:

```ts
@Injectable({ providedIn: 'root' })
class CmdkIssueService {
  report(issue: CmdkIssue): void;                             // internal use by CommandRegistryService, SearchRegistryService, and CmdkPaletteComponent
  onIssue(callback: (issue: CmdkIssue) => void): () => void;   // public — returns an unregister function
}
```

- `report()` invokes every registered callback, each wrapped in its own
  try/catch — a consumer's broken error handler can't prevent other
  listeners from running or crash the reporting call itself.
- This is purely additive to existing behavior: `CommandRegistryService.
  execute()`'s existing `console.error` on a thrown/rejected command stays
  exactly as it is today; it now *also* calls `CmdkIssueService.report()`
  alongside it. No existing test or behavior changes as a result.
- Search-provider issues (timeout/error) and search-result execution
  failures report through the same service, with `console.warn` (provider
  issues) or `console.error` (search-result execution failures, matching
  command-execution severity) alongside the `report()` call, same as
  today's pattern for commands.

## `SearchRegistryService`

```ts
@Injectable({ providedIn: 'root' })
class SearchRegistryService {
  register(provider: SearchProvider): () => void;   // throws on duplicate key, same as Command id/shortcut collisions
  readonly hasProviders: Signal<boolean>;
  search(query: string, scopeKey?: string): Promise<SearchResult[]>;
}
```

- `register()` fail-fasts synchronously on a duplicate `key`, matching the
  existing duplicate-`id`/duplicate-`shortcut` behavior in
  `CommandRegistryService` — the same design language throughout this
  library: a collision is almost certainly a bug, so it throws immediately
  rather than silently overriding.
- `search(query, scopeKey?)`: if `scopeKey` is given, only that provider is
  queried (selecting a category chip means *only that provider's* `search()`
  is called going forward — other providers aren't invoked at all, saving
  unnecessary backend calls). Otherwise every registered provider is
  queried in parallel.
- Every provider call is wrapped with a timeout (configured via
  `provideCmdk({ searchTimeoutMs })`, default 5000ms):

  ```ts
  async function searchWithTimeout(provider, query, timeoutMs, issues) {
    const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
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
  ```

  `search()` runs these wrapped calls with `Promise.all` (never rejects,
  since the wrapper itself never rejects) and flattens the results. The
  overall call is therefore bounded by `searchTimeoutMs`, not by the
  slowest provider — a hung provider can't stall every result forever, it
  just contributes nothing once its timeout fires. A provider that
  resolves late (after its own timeout already fired) has its result
  silently discarded; we've already committed to the palette's rendered
  state for that query.
- `CmdkConfig` gains one new optional field: `searchTimeoutMs?: number`
  (default `5000`), configured once in `provideCmdk()` alongside `shortcut`
  — the same "app-wide, set once at bootstrap" precedent already
  established there.

## Palette integration

New state on `CmdkPaletteComponent`, alongside the existing signals:

```ts
protected readonly scopedProviderKey = signal<string | null>(null);
protected readonly searchResults = signal<SearchResult[] | null>(null);

protected readonly isSearchModeActive = computed(
  () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
);
```

`isSearchModeActive` is the backward-compatibility gate: with zero
providers registered it's always `false`, so a consuming app that hasn't
adopted search providers sees typing fuzzy-match Commands exactly as it
does today — no behavior change at all. Once at least one provider is
registered, a non-empty query switches the palette to search-results-only
mode, hiding Commands, per the simpler "typing = search" mental model.

- **`searchResults` doubles as the loading flag.** It's reset to `null`
  synchronously on every keystroke, before the debounce timer starts, so
  the UI enters a loading state immediately rather than waiting out the
  debounce window first.
- **Prefix parsing**: on every input event, if `scopedProviderKey()` is
  `null`, check whether the text up to the first `:` matches a registered
  provider's `key` (case-insensitive). If so, that becomes
  `scopedProviderKey`, and everything after the `:` becomes the new
  `query`. The token is never part of the `<input>`'s own text — it
  renders as a small chip *before* a plain `<input>` that only ever
  contains the post-token text, which is far simpler than a rich
  contenteditable box and matches the reference UI exactly (`[⚣ assets]
  Roa│`).
- **Removing the token**: in `onKeydown`, `Backspace` with
  `scopedProviderKey() !== null && query() === ''` clears the token.
  Otherwise Backspace edits the input's text normally.
- **Debounce + staleness**, plain `setTimeout` (no RxJS, per this
  library's existing constraint), with a generation counter so a slow,
  now-superseded response is discarded rather than clobbering a newer
  one:

  ```ts
  private searchDebounceTimer?: ReturnType<typeof setTimeout>;
  private searchGeneration = 0;

  private scheduleSearch(query: string, scopeKey: string | null): void {
    clearTimeout(this.searchDebounceTimer);
    if (!query.trim()) { return; }
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

  Cleared on destroy via `DestroyRef`, same pattern already used for the
  open-shortcut listener.

## Rendering

- **Chip row**: real `<button>` elements below the search input, visible
  whenever `scopedProviderKey()` is `null` and at least one provider is
  registered — regardless of query content, so a user can narrow after
  seeing broad results, not only before typing. These buttons are **not**
  reachable via Tab, since Tab is already hijacked to always refocus the
  search input (the panel's focus-trap from earlier work). That's a
  deliberate consequence of the decision that keyboard scoping goes
  through the typed `key:` prefix, not chip navigation — chips are a
  mouse-only convenience by design.
- **Scope token**: replaces the chip row entirely once set.
- **Results list**, driven by `isSearchModeActive()`:
  - `false` → today's behavior, completely unchanged: Command groups from
    `groups()`.
  - `true`, `searchResults()` is `null` → a `Searching…` placeholder (plain
    text, no spinner machinery, matching this library's minimal-CSS
    style).
  - `true`, `searchResults()` is `[]` → the existing `.cmdk-empty` state,
    reworded to something generic ("No results") since "No matching
    commands" doesn't fit a data-search context.
  - `true`, `searchResults()` has items → flat list (no per-provider
    grouping — provenance is carried by each result's own `icon`), each
    row showing `icon` + `label` + `subtitle` (right-aligned, matching the
    reference UI's path styling).
- **Selection unification** — one derived list backs `selectedIndex`/
  `moveSelection` regardless of mode:

  ```ts
  protected readonly selectableItems = computed<Array<SearchResult | ResolvedCommand>>(() =>
    this.isSearchModeActive() ? (this.searchResults() ?? []) : this.flatMatches().map((m) => m.item),
  );
  ```

  `runSelected()` branches once, at execute time, on `isSearchModeActive()`
  — no runtime type-guessing on the item itself, since the mode already
  determines which kind of thing is selected. The search-result branch
  wraps `result.execute()` in the same try/catch shape as
  `CommandRegistryService.execute()`, reporting through `CmdkIssueService`
  and `console.error` on failure, and — like today's command execution —
  never rethrows, so the palette still closes afterward even if the
  result's action failed.
- **No special-casing needed for shortcuts**: `registry.matchShortcut(event)`
  in `onKeydown`'s default case already runs unconditionally, independent
  of what's currently rendered. A command's keyboard shortcut (e.g.
  `mod+s`) still fires even while the palette is in search mode — this
  falls out of the existing architecture (shortcuts are a property of
  what's *registered*, never of what's on screen) with no changes required.

## Error handling (consolidated)

- `SearchRegistryService.register()` throws synchronously on a duplicate
  `key`.
- A provider that times out or throws inside `search()`: `console.warn` +
  `CmdkIssueService.report(...)`. `search()` itself never rejects.
- Executing a selected `SearchResult` that throws/rejects: `console.error`
  + `CmdkIssueService.report(...)`, same severity and non-rethrowing
  behavior as command execution failures today.
- `CommandRegistryService.execute()` (existing) now also reports through
  `CmdkIssueService`, purely additively.
- Every `onIssue` callback is individually wrapped in try/catch.

## Testing strategy

- **`SearchRegistryService`**: register/unregister, duplicate-key throws,
  `search()` merges results across multiple providers, `search()` with a
  `scopeKey` calls only that provider, a provider that never resolves
  contributes `[]` after the configured timeout (fake timers) with
  `console.warn` and an `onIssue` call tagged `reason: 'timeout'`, a
  throwing/rejecting provider is caught the same way tagged
  `reason: 'error'`, unregistering a provider excludes it from subsequent
  searches.
- **`CmdkIssueService`**: `report()` invokes all registered callbacks,
  multiple listeners all fire, unregister stops future calls, a throwing
  callback doesn't prevent others from running or crash `report()`, zero
  listeners is a safe no-op.
- **`CommandRegistryService`**: extend the existing `execute()` error tests
  to also assert `CmdkIssueService.report()` was called alongside the
  existing `console.error` assertion.
- **`CmdkPaletteComponent`**: typing `"assets:query"` converts to a scoped
  token + `query` = `"query"`; Backspace with an empty query and an active
  token clears it; debounce — several keystrokes within the window fire
  only one `search()` call (fake timers); a stale, slow-resolving search is
  discarded when a newer one has already resolved first; **zero providers
  registered → typing still fuzzy-matches Commands** (the core
  backward-compatibility regression test); loading placeholder shown while
  `searchResults()` is `null` in search mode; empty-results state shown for
  a resolved-but-empty batch; selecting and executing a search result calls
  its `execute()` and closes the palette; a throwing search result's
  `execute()` doesn't crash and still closes the palette.

## Out of scope (for this spec)

- Recent searches and Favourites — separate future features.
- Progressive/incremental rendering of provider results as they resolve —
  rejected in favor of wait-for-all(-or-timeout).
- Per-provider grouped section headers in the results list — rejected in
  favor of a flat merged list.
- Keyboard navigation into the chip row (arrows/Tab) — the typed `key:`
  prefix is the keyboard mechanism; chips are mouse-only by design.
- Any UI for tuning the search timeout beyond the single app-wide
  `searchTimeoutMs` config value.
- Caching/memoizing search results across queries or palette sessions.
