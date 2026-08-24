# ngx-cmdk: Recent Searches — Design

**Date:** 2026-08-18
**Status:** Approved, pending implementation plan

## Summary

Track which search results a user has recently selected, and show them in
a new "Recent searches" section when the palette opens with an empty,
unscoped query — above the existing Command groups, matching the ordering
in the original reference screenshot (category chips → Recent searches →
Actions).

This feature is **opt-in and hard-gated**: with no `recentSearchesStorageKey`
configured, `RecentSearchesService` does nothing at all — no tracking, no
section ever renders, zero behavior change for any app that doesn't ask for
it. This mirrors the same pattern already established for search providers
themselves ("zero providers registered → palette behaves identically to
before").

Only search-provider results are tracked — Commands are never recorded as
"recent," matching the reference screenshot's visual distinction between
the "Recent searches" section (path-style subtitles, i.e. search results)
and the separate, always-visible "Actions" section (Commands).

**Favourites** (also shown in the reference screenshot) is explicitly out
of scope for this spec — a separate future feature.

## The persistence problem, and why it drives this design

A `SearchResult.execute` is a live function closure captured at the moment
a provider's `search()` ran. It cannot survive being serialized to
`localStorage` and read back after a page reload. Two new, optional fields
solve this:

```ts
interface SearchResult {
  label: string;
  subtitle?: string;
  icon?: string;
  resultId?: string;               // NEW — required for this result to survive a reload
  execute: () => void | Promise<void>;
}

interface SearchProvider {
  key: string;
  label: string;
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
  resolve?: (resultId: string) => Promise<SearchResult | null>;   // NEW
}
```

`resolve(resultId)` reconstructs a fresh, live `SearchResult` — including a
working `execute()` — from just the id, and is called lazily, only when a
user picks a *persisted* recent from a previous session. It is never called
just to list/render recents (see `RecentSearchEntry` below, which caches
what's needed for display). A provider that never sets `resultId`/`resolve`
works exactly as it does today; its results simply never produce a
persistable recent entry.

Example, a real API-backed provider:

```ts
@Component({ /* ... */ })
export class AssetsSearchProvider {
  private readonly api = inject(AssetsApiService);
  private readonly router = inject(Router);

  constructor() {
    const registry = inject(SearchRegistryService);
    const unregister = registry.register({
      key: 'assets',
      label: 'assets',

      search: async (query) => {
        const assets = await this.api.searchAssets(query);
        return assets.map((asset) => this.toResult(asset));
      },

      // Only called when a user picks an already-persisted recent from a
      // *previous* session — never called just to list/render recents.
      resolve: async (resultId) => {
        const asset = await this.api.getAsset(resultId).catch(() => null);
        if (!asset) return null; // deleted/renamed/no longer accessible →
                                  // palette drops the stale recent entry
        return this.toResult(asset);
      },
    });

    inject(DestroyRef).onDestroy(unregister);
  }

  // search() and resolve() both produce identical SearchResult objects —
  // exactly one place knows how to turn an "asset" into a palette entry.
  private toResult(asset: Asset): SearchResult {
    return {
      label: asset.name,
      subtitle: `/assets/${asset.id}`,
      resultId: asset.id,
      execute: () => this.router.navigate(['/assets', asset.id]),
    };
  }
}
```

## `RecentSearchEntry` and `RecentSearchesService`

```ts
interface RecentSearchEntry {
  providerKey: string;
  resultId: string;
  label: string;                   // cached for display — no resolve() needed just to list recents
  subtitle?: string;
  icon?: string;
  selectedAt: number;
}

@Injectable({ providedIn: 'root' })
class RecentSearchesService {
  readonly recent: Signal<readonly RecentSearchEntry[]>;   // most-recent-first, capped at 10
  clear(): void;                                            // for the host app to call on logout
}
```

- **No public `record()`.** This is bookkeeping the palette does for you.
  `CmdkPaletteComponent`'s existing `runSearchResult()` calls it internally,
  right alongside the existing execute/error-handling logic — the same way
  `CommandRegistryService.execute()`'s issue reporting is automatic, not
  something a consumer wires up themselves.
- **Hard-gated, reactively, on `recentSearchesStorageKey`.** `recent` is a
  `computed()` that checks the *current* value of
  `CMDK_CONFIG.recentSearchesStorageKey?.()` on every read — not just at
  construction or at the last write:

  ```ts
  readonly recent = computed(() => {
    const key = this.config.recentSearchesStorageKey?.();
    return key ? this.entries() : [];
  });
  ```

  `entries` is the internal signal actually holding loaded/tracked data.
  `recent` collapses to `[]` the instant the key becomes unavailable,
  regardless of what's still sitting in `entries` or in `localStorage` —
  this matters because without this reactive gate, a list loaded while a
  key *was* configured would otherwise keep showing after the feature is
  disabled. If the host app's `recentSearchesStorageKey` callback itself
  reads a signal internally (e.g.
  `() => authService.userId() ? 'recents-' + authService.userId() : null`),
  Angular's reactivity tracks that read through the callback automatically,
  so `recent()` goes empty the moment that signal changes (e.g. on logout)
  with no manual wiring needed.
- **Disabling the feature never proactively wipes storage.** Toggling to a
  temporarily-unavailable key (e.g. auth hasn't resolved yet on boot)
  should not silently destroy a returning user's real history. Only an
  explicit `clear()` call (e.g. triggered by the host app on logout) wipes
  data.
- A result without `resultId`, or a moment when no key is configured at
  all: recording is a silent no-op. No entry, no error, no in-memory
  fallback — this feature only exists to be persisted, so an unrecordable
  result simply doesn't produce a recent.
- On success: cap at 10 entries, most-recent-first; persist the whole array
  as JSON to the *current* key.
- On construction, if a key is currently available, read and parse that
  key's existing JSON into `entries` immediately — this is what makes
  recents show up right after a reload, using only cached display fields.
- If the key callback returns a **different** key later (an account switch
  mid-session), the next read/write naturally targets that new key's
  data — no explicit re-keying logic needed, since every operation re-reads
  the callback fresh.

## `provideCmdk()` config addition

```ts
interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;   // NEW
}
```

A plain callback, not a `Signal` — consistent with `SearchProvider.search`
also being a plain function, and simpler for a host app to supply (it can
close over its own auth signals/services however it likes without needing
to construct an actual Angular `Signal`). The *value returned* is the
literal `localStorage` key — the library imposes no prefix or naming
convention, so the host app has full control (e.g.
`() => authService.userId() ? 'myapp-recents-' + authService.userId() : null`).
Unset (or returning `null`/`undefined`) means the feature is off, per the
hard-gate above.

## Selecting a recent entry

A recent can only be selected (clicked, or reached via Enter) if it's
currently visible — and visibility already requires its provider to be
registered (see "Visibility filtering: hide vs. delete" below). So by the
time a selection actually happens, "provider not registered" can no longer
occur; the two live ways picking a recent can fail, both handled
identically, are: the provider is registered but has no `resolve`, or
`resolve(resultId)` rejects or returns `null`.

- On either of those: `console.error` + report through `CmdkIssueService` as a
  new `CmdkIssue` variant — `{ source: 'recent-resolve', providerKey,
  resultId, error? }` — remove that entry from the underlying `recent()`
  data (the record is confirmed gone), and no-op. The palette stays open;
  nothing executes.
- On success: the freshly resolved `SearchResult`'s `execute()` runs
  through the exact same try/catch + `CmdkIssueService` path as a live
  search result today. The palette closes, and — since it was just
  genuinely re-selected — it's recorded again via the normal
  `runSearchResult` flow. Recording an entry that already exists for that
  `providerKey`/`resultId` pair **replaces** the existing entry rather than
  adding a duplicate — it moves to the top with refreshed cached display
  fields (in case the label changed since it was last seen) and a new
  `selectedAt`. This applies uniformly to every search-result execution,
  whether the result came from a live search or a resolved recent — there
  is only one recording path.

## Visibility filtering: hide vs. delete

A recent entry whose provider **isn't currently registered** is a
different situation from one whose provider rejects it at resolve time,
and the two get different treatment:

- **Provider not currently registered** — hide the entry from the rendered
  list only; leave it untouched in `recent()`/storage. The provider may
  simply not be loaded yet in this view (e.g. a lazy-loaded feature module
  that only registers its search provider once its route is visited) —
  transient, not a reason to forget the entry. It reappears the moment
  that provider registers again.
- **Provider registered, but `resolve()` fails or returns `null`**
  (previous section) — the underlying data is confirmed gone, so the entry
  is actually removed.

This filtering lives in the palette, not inside `RecentSearchesService` —
the service stays focused purely on tracking/persistence and has no
dependency on `SearchRegistryService`. The palette already coordinates
both:

```ts
protected readonly visibleRecents = computed(() => {
  const registeredKeys = new Set(this.searchRegistry.providers().map((p) => p.key));
  return this.recentSearches.recent().filter((entry) => registeredKeys.has(entry.providerKey));
});
```

`visibleRecents` is a pure display filter; nothing about it mutates what's
stored.

## UI & keyboard integration

- A new "Recent searches" section appears only when: the query is empty,
  nothing is scoped (no active `key:` token), and
  `visibleRecents().length > 0` — positioned above the existing Command
  groups.
- Rows reuse the existing `.cmdk-item`/`.cmdk-item-icon`/`.cmdk-item-label`/
  `.cmdk-item-subtitle` classes — visually identical to a live search-result
  row.
- Recents fold into the same unified `selectedIndex`/keyboard-nav mechanism
  Commands and search-results already share, rather than a separate,
  parallel selection concept — they're prepended to the selectable list in
  the empty-query state. Enter/click on one goes through the resolve-then-
  execute path above instead of `runSelectedCommand`.

## Error handling (consolidated)

- `CmdkIssue` gains a fourth variant:
  `{ source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown }`.
- Every other error path introduced by this feature funnels through
  existing, unchanged mechanisms: a resolved recent's `execute()` failure
  uses the same path as any live search result's failure.
- No new user-facing error UI — consistent with this library's existing
  philosophy that the consumer decides what "failed" should look like,
  via `CmdkIssueService.onIssue()`.

## Testing strategy

- **`RecentSearchesService`**: `recent()` is `[]` with no storage key
  configured (nothing recorded, nothing read); recording is a no-op when
  the executed result has no `resultId`; a recorded result with a
  `resultId` appears in `recent()` and round-trips through a fake
  `recentSearchesStorageKey` + jsdom's real `localStorage`; the list caps
  at 10, evicting the oldest; `recent()` reactively collapses to `[]` when
  the storage-key callback later returns `null`, even though `entries` /
  storage still hold data (the disabled-after-enabled regression this spec
  exists to prevent); a different key returned by the callback reads/writes
  that key's own data, independent of the previous key's; `clear()` empties
  both the in-memory list and the *current* key's storage.
- **`CmdkPaletteComponent`**: the "Recent searches" section renders only
  when unscoped + empty query + at least one visible recent; a recent entry
  whose provider isn't currently registered is hidden from the list but
  still present if that provider registers later in the same session
  (registered again mid-test); selecting a recent calls `resolve()` and
  executes the reconstructed result, bumping it to the top; a `resolve()`
  that returns `null` or rejects removes that entry from `recent()`,
  reports via `CmdkIssueService` with the `recent-resolve` shape, and
  doesn't crash or close in a broken state; recents are keyboard-navigable
  alongside Commands via the existing `selectedIndex` mechanism.

## Out of scope (for this spec)

- **Favourites** — a separate future feature (also shown in the original
  reference screenshot).
- Any UI for managing/curating recents beyond the automatic
  most-recent-10 list (e.g. manually removing a single entry, pinning one).
- Recording Commands as "recent" — only search-provider results are
  tracked.
- Any settings/tuning UI beyond the single `recentSearchesStorageKey`
  config value.
- Auto-wiping storage when the key transiently becomes unavailable —
  `clear()` remains the only wipe mechanism.
