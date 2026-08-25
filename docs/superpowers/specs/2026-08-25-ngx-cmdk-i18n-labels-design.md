# ngx-cmdk: Translatable UI Labels — Design

**Date:** 2026-08-25
**Status:** Approved, pending implementation plan

## Summary

Every user-facing string in the library — footer hints, group headers,
empty/loading states, button text, aria-labels, input placeholders — is
currently hardcoded English, scattered across `cmdk-palette.html`/`.ts` and
`cmdk-settings-panel.html`/`.ts`. This adds a `labels` field to the existing
`CmdkConfig`/`provideCmdk()` surface, letting a host app override some or all
of those strings, with **live, runtime updates** if the host app's own
locale state changes — no re-bootstrap required.

This is a mechanism, not a translation product: the library ships English
defaults and a way to override them, exactly the same "bring your own"
philosophy `provideCmdk()` already uses for `navigate`, storage keys, and
icons. It does not ship bundled translation packs for other languages, and
it does not use `@angular/localize` — that tool compiles translations in at
build time per output bundle, which doesn't fit a library consumed by apps
that switch locale at runtime.

## Data model & config

```ts
interface CmdkConfig {
  shortcut: string;
  searchTimeoutMs: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;
  navigate?: (path: string) => void | Promise<void>;
  labels?: () => Partial<CmdkLabels>;                         // NEW
}

interface CmdkLabels {
  dialogLabel: string;                 // aria-label on the palette dialog — "Command palette"
  searchPlaceholderDefault: string;    // input aria-label, browse mode — "Search commands"
  searchPlaceholderActive: string;     // input aria-label, search mode — "Search"
  noResults: string;                   // "No results"
  searching: string;                   // "Searching…"
  noMatchingCommands: string;          // "No matching commands"
  recentSearchesGroup: string;         // "Recent searches" — palette group header AND settings section label
  favouritesGroup: string;             // "Favourites" — palette group header AND settings section label
  footerNavigate: string;              // "Navigate"
  footerSelect: string;                // "Select"
  footerClose: string;                 // "Close"
  footerSettings: string;              // "Settings"
  moveUp: string;                      // aria-label "Move up"
  moveDown: string;                    // aria-label "Move down"
  removeFavourite: string;             // aria-label "Remove favourite"
  addFavourite: string;                // aria-label "Add favourite"
  labelPlaceholder: string;            // input placeholder "Label"
  pathPlaceholder: string;             // input placeholder "Path"
  favouritesLimitReached: string;      // "Maximum of %max% favourites reached — remove one to add another."
  clearRecentSearches: string;         // button text
  recentSearchesCleared: string;       // confirmation message
  noRecentSearchesFound: string;       // empty message
  closeSettings: string;               // "CLOSE SETTINGS"
}
```

- `labels` is a plain callback, stored as-is by `provideCmdk()` — unlike
  `shortcut`/`searchTimeoutMs`, its *contents* aren't merged with defaults at
  provide-time. The merge happens on every read, in `CmdkLabelsService` (see
  below), which is what makes runtime switching work.
- **Partial overrides fall back to English.** A host app overriding one key
  (`labels: () => ({ closeSettings: 'FERMER' })`) gets English defaults for
  every other key — no requirement to supply the full set.
- `recentSearchesGroup` and `favouritesGroup` are shared between the
  palette's browse-view group headers and the Settings panel's section
  labels — same English text today, same concept, so translating once keeps
  both places consistent rather than risking two different translations of
  "Favourites" in the same UI.
- `favouritesLimitReached` is the one string with a number embedded in its
  English prose. Rather than making it the sole function-typed label in an
  otherwise all-strings interface, it uses a `%max%` placeholder token — a
  plain string, substituted via a simple `.replace('%max%', ...)` at the one
  call site. No generic interpolation engine, since this is the only string
  that needs a parameter.

## `CmdkLabelsService`

```ts
// projects/ngx-cmdk/src/lib/config/cmdk-labels.ts
export const DEFAULT_CMDK_LABELS: CmdkLabels = { dialogLabel: 'Command palette', /* ...all 23 keys... */ };

@Injectable({ providedIn: 'root' })
export class CmdkLabelsService {
  private readonly config = inject(CMDK_CONFIG);
  readonly labels = computed(() => ({ ...DEFAULT_CMDK_LABELS, ...this.config.labels?.() }));
}
```

**Why this achieves runtime switching with no new reactivity primitive.**
Angular's `computed()` transparently tracks any signal read *inside* it, no
matter how deep the call chain. If a host app writes
`labels: () => TRANSLATIONS[this.activeLocale()]`, then calling
`this.config.labels?.()` inside `CmdkLabelsService.labels`'s `computed()`
reads their `activeLocale` signal as part of that computation — so this
`labels` computed automatically re-fires whenever their locale signal
changes. This is the exact mechanism that already lets
`favouritesStorageKey`/`recentSearchesStorageKey` scope reactively per
signed-in user; nothing new is being invented here, just reused.

A host app with no need for runtime switching (a single static translation
object, or no `labels` at all) works identically — `labels: () => FR_LABELS`
is a valid, trivially-static callback.

## Component wiring

`CmdkPaletteComponent` and `CmdkSettingsPanelComponent` each inject the
service once:

```ts
protected readonly labels = inject(CmdkLabelsService).labels;
```

and templates read `labels().someKey` at every spot currently hardcoding a
string. This is a purely internal wiring change — neither component gains a
new `@Input`/`@Output`, and `provideCmdk()` remains the library's single
configuration entry point.

Two spots need a small computed rather than a direct template binding,
since they already branch on state:

- `cmdk-palette.ts`'s existing `searchInputLabel` computed becomes
  `computed(() => this.isSearchModeActive() ? this.labels().searchPlaceholderActive : this.labels().searchPlaceholderDefault())`.
- `cmdk-settings-panel.ts` gains
  `favouritesLimitMessage = computed(() => this.labels().favouritesLimitReached.replace('%max%', String(MAX_FAVOURITE_ENTRIES)))`,
  and the template's `@else` branch (favourites at cap) renders
  `{{ favouritesLimitMessage() }}`.

Everything else — footer hints, group labels, empty/loading states, button
text, aria-labels, placeholders — is a direct 1:1 swap from a literal to
`labels().matchingKey`.

**While-we're-here fix.** `favourites.ts` already has a private
`MAX_FAVOURITE_ENTRIES = 9` constant, but the settings panel independently
hardcodes `9` twice more (`favourites().length < 9` in the template, and the
old literal limit message). Since this feature is specifically about not
hardcoding that number in prose, `MAX_FAVOURITE_ENTRIES` is exported from
`favourites.ts` and both the cap-check and the `%max%` substitution read
from it — removing the last two hardcoded `9`s as a natural side effect
rather than leaving them inconsistent with the new label.

## Error handling

None beyond what already exists. If a host app's `labels()` callback
throws, that propagates the same way an error in any other computed would —
consistent with `favouritesStorageKey`/`navigate` not being defensively
wrapped either. Not worth guarding against a bug in a callback the host app
wrote itself.

## Testing strategy

- **Zero behavior change by default**: `DEFAULT_CMDK_LABELS` keeps the exact
  English text hardcoded today, so every existing spec assertion
  (`expect(...).toContain('Navigate')`, etc.) continues to pass unchanged —
  verified explicitly rather than assumed, since it's the property that
  makes this refactor safe.
- **`CmdkLabelsService`** (new `cmdk-labels.spec.ts`): merges a partial
  override over the defaults, leaving unset keys at their English default;
  re-computes when the config's `labels()` callback reads a signal that
  later changes, proving live switching rather than a one-time merge.
- **`CmdkPaletteComponent`** / **`CmdkSettingsPanelComponent`**: at least one
  assertion each that an overridden label actually renders in the template —
  proving the wiring, not just the service logic in isolation.
- **`favouritesLimitMessage`**: `%max%` is substituted with
  `MAX_FAVOURITE_ENTRIES`'s actual value; the cap-check and the message
  agree because both read the same exported constant.

## Out of scope (for this spec)

- Bundled translation packs for any language other than the English
  defaults — a host app supplies its own translations via `labels`.
- Pluralization/ICU-style message formatting — `%max%` is a single literal
  substitution for the one string that needs a parameter; no other string
  in the current interface takes one.
- Translating consumer-supplied content: registered `Command.label`,
  `SearchProvider.label`/`SearchResult.label`, and favourite
  labels/paths are host-app data the library already renders as-is — they
  were translatable by the host app before this feature and remain so,
  untouched by it.
- A CLI or build-time tool to extract/manage translation catalogs — this
  spec is the runtime mechanism only.
