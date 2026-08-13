# ngx-cmdk: Angular Command Palette Library — Design

**Date:** 2026-07-23
**Status:** Approved, pending implementation plan

## Summary

An Angular library providing a Cmd/Ctrl+K style command palette (like Linear,
Vercel, Superhuman, Raycast). Any component, directive, guard, or service
anywhere in the consuming app can register commands via dependency injection —
registration is not confined to a single root location. The library ships a
ready-to-use overlay UI, a signal-based registry, fuzzy search, grouping, and
real keyboard-shortcut bindings per command.

## Project setup

- Angular CLI workspace (`ng new`) containing:
  - `projects/ngx-cmdk` — the publishable library, built with `ng-packagr`.
  - `projects/demo` — a standalone demo app that imports the library, used to
    manually verify behavior during and after implementation.
- Library is **standalone-only** (no NgModules), targets the latest stable
  Angular release, and uses **signals** throughout for internal and public
  reactive state (no RxJS in the public API).
- Public entry point (`public-api.ts`) exports: `CommandRegistryService`,
  `CmdkPaletteComponent`, the `Command` type, and a `provideCmdk(config?)`
  function for app-level configuration, used once in `app.config.ts`:

  ```ts
  providers: [provideCmdk({ shortcut: 'mod+k' })]
  ```

- No dependency on Angular Material or any UI kit. Layout-only CSS using CSS
  custom properties (`--cmdk-*`) for colors/spacing/fonts/radius, so the
  palette can be restyled to fit any host app's design system without
  fighting an opinionated component library.

## Command model

```ts
interface Command {
  id?: string;                          // auto-generated (crypto.randomUUID()) if omitted
  label: string | (() => string);       // static or dynamic label
  execute: () => void | Promise<void>;
  icon?: string;                        // consumer-defined token (class name, icon key, etc.)
  keywords?: string[];                  // extra terms matched by search but not displayed
  group?: string;                       // section header text, e.g. "Navigation", "Actions"
  shortcut?: string;                    // real keybinding, e.g. "mod+s", "mod+shift+p"
  priority?: number;                    // higher sorts first within its group when query is empty
}
```

Decisions:

- **IDs auto-generate if omitted.** If a consumer supplies an `id` that
  collides with an already-registered command, `register()` throws
  immediately (fail-fast on what's almost certainly a bug) rather than
  silently overwriting.
- **No nested/drill-down commands.** Commands support `group` for section
  headers, but there is no Raycast-style "select this to open a child list"
  functionality. Flat list of commands per group.

## Shortcut binding

`shortcut` is a real keybinding, not just a display hint, but its live
window is scoped to the palette overlay:

- **`mod` is a platform alias** (⌘ on Mac, Ctrl on Windows/Linux), so
  consumers don't need to branch on platform. Combos are expressed as
  `"mod+s"`, `"mod+shift+p"`, etc. A shortcut must have exactly one
  non-modifier key — `"mod"` alone or `"mod+k+j"` both throw at registration
  time rather than silently producing a shortcut that can never match a
  keystroke.
- **Matching is by physical key (`KeyboardEvent.code`), not the composed
  character (`KeyboardEvent.key`)**, for letter and digit keys. This is what
  makes `alt`-based letter shortcuts work on Mac (Option+C composes `"ç"` as
  `event.key`, but `event.code` stays `"KeyC"`) and shifted-digit shortcuts
  work on any layout (Shift+1 composes `"!"`, `event.code` stays `"Digit1"`).
- **A command's `shortcut` only fires while the palette overlay is open.**
  The palette's own document-level `keydown` listener (used for
  ArrowUp/ArrowDown/Enter/Escape) also checks
  `CommandRegistryService.matchShortcut(event)`; on a match it executes the
  command and closes the overlay, the same as selecting it and pressing
  Enter. Pressing the combo while the overlay is closed does nothing — it
  still renders as hint text next to the command in palette search results.
- **The only shortcut that is ever live regardless of overlay state is the
  configured open-shortcut** (default `mod+k`, set via
  `provideCmdk({ shortcut: ... })`). It is bound once via a document-level
  listener owned by `CmdkPaletteComponent`, removed on the component's
  destruction via `DestroyRef`.
- **A command's `shortcut` cannot collide with the configured open-shortcut.**
  `register()` throws if a command's parsed shortcut matches the
  open-shortcut from `CMDK_CONFIG` — otherwise a command sharing that combo
  would immediately reopen the palette the instant it executed and closed
  it, since both the panel's keydown handler and the open-shortcut listener
  see the same bubbling event.
- **Every shortcut must include a real modifier** — `mod`, `ctrl`, `alt`, or
  `cmd`/`meta`. A bare key (`"s"`) or a shift-only combo (`"shift+p"`) is
  rejected: `register()` throws for a command shortcut, and `provideCmdk()`
  throws for the open-shortcut. Shift alone doesn't count, since holding
  Shift is how users type capital letters — a shift-only binding would
  collide with ordinary typing. This makes bare/shift-only shortcuts
  impossible to register in the first place, rather than silently inert.
- **Conflict handling matches the ID rule.** Two shortcuts collide if they
  parse to the same key + modifier combination, regardless of token order
  (`"mod+shift+p"` and `"shift+mod+p"` are the same shortcut). If a second
  command registers a colliding `shortcut`, `register()` throws immediately
  rather than silently overriding the earlier binding.
- **`preventDefault()` is called on match**, so bindings don't collide with
  browser defaults (e.g. `mod+s` triggering the browser's save-page dialog).
- **`CommandRegistryService` owns shortcut *matching* (`matchShortcut()`),
  not listening.** It no longer attaches any `keydown` listener itself —
  matching is invoked by whichever caller currently wants to check the
  current keydown against registered shortcuts (today, only the open
  palette). This keeps the registry as the single source of truth for what
  a given keystroke resolves to, without deciding on its own when that
  check should run.

## Registry service — `CommandRegistryService`

```ts
@Injectable({ providedIn: 'root' })
class CommandRegistryService {
  register(command: Command): () => void;        // returns an unregister function
  readonly commands: Signal<readonly Command[]>;  // all currently registered, read-only
}
```

- Internally backed by a `signal` holding a `Map<string, Command>`;
  `commands` is a `computed` that exposes the values as an array, sorted by
  `priority` (descending) then insertion order.
- **`id` generation** prefers `crypto.randomUUID()` but falls back to a
  `Date.now()`/`Math.random()`-based id if it's unavailable or throws (e.g.
  an insecure browsing context, where `randomUUID()` is spec-restricted) —
  `register()` should never fail just because the caller omitted `id`.
- `register(command)`:
  1. Resolves or generates the `id`.
  2. Throws if the `shortcut` lacks a real modifier, doesn't have exactly
     one key, collides with the configured open-shortcut, or collides with
     the `id`/`shortcut` of an already-registered command.
  3. Inserts into the map; parses the `shortcut` (if any) so
     `matchShortcut()` can find it.
  4. Returns an `unregister` closure that removes the entry and its shortcut
     binding. Consumers call this from `ngOnDestroy`, or pass it to
     `DestroyRef.onDestroy(fn)` for automatic cleanup tied to the
     component/service's lifetime.
  5. Calling the returned `unregister` more than once is a safe no-op.
- `matchShortcut(event: KeyboardEvent): ResolvedCommand | undefined` — looks
  up which registered command (if any) a keydown event matches. Does not
  execute the command or call `preventDefault()`; the caller decides what
  to do with the result.
- The service is the single source of truth. The palette component reads
  both `commands()` and `matchShortcut()` from it; there is no duplicated
  state.

## Palette UI — `CmdkPaletteComponent`

Usage: mounted once, typically in the root `AppComponent` template —
`<ngx-cmdk-palette />`.

- **Open/close state**: a signal, toggled by the configured open shortcut
  (default `mod+k`, overridable via `provideCmdk({ shortcut: ... })`).
- **Search input**: bound to a `query` signal. A `computed` combines `query`
  with `CommandRegistryService.commands()` through the fuzzy matcher to
  produce a filtered, scored result list.
- **Grouping**: filtered results are bucketed by `group` (ungrouped commands
  fall into a default "Other" bucket) and rendered as sections with headers.
- **Keyboard navigation**: `ArrowUp`/`ArrowDown` move a `selectedIndex`
  signal; `Enter` calls `execute()` on the selected command and closes the
  palette; `Escape` closes without executing; `Tab` is captured and refocuses
  the search input rather than leaving the panel — since the search input is
  the panel's only focusable element, this is what "trapping" focus means
  here. Any other keydown on the panel is checked against
  `CommandRegistryService.matchShortcut()`; a match executes that command and
  closes the palette, the same as Enter.
- **Selection clamping**: an `effect` watches the filtered/grouped result
  count and clamps `selectedIndex` back into range whenever it shrinks —
  not just on a query change, but also if a command backing the current
  selection is unregistered by some other part of the app while the palette
  is still open.
- **Rendering**: plain elements + CSS custom properties for the
  overlay/backdrop, input, and list. Uses a manually-managed overlay `<div>`
  (conditionally rendered, with hand-rolled focus management and an
  Escape/backdrop-click handler) rather than the native `<dialog>` element or
  Angular CDK. This was revised during planning: jsdom (the test environment
  this Angular version's default `vitest` unit-test builder uses) does not
  implement `HTMLDialogElement.showModal()`, which would make every test
  that opens the palette throw. The manual overlay produces the same
  observable behavior (focus trapped in the panel, Escape closes, clicking
  the backdrop closes, focus restored to the previously-focused element) but
  is verifiable in the automated test suite.
- **Accessibility**: `role="dialog"` + `aria-modal="true"` on the panel,
  `role="listbox"`/`role="option"` on the results, `aria-activedescendant`
  tracking the selected command, `aria-label` on the search input, focus
  moved to the search input on open and returned to the previously-focused
  element on close.

## Search matching

A lightweight, built-in fuzzy matcher with zero external dependencies:

- Matches against `label` and `keywords`.
- Produces a relevance score used to rank results (better/earlier matches
  rank higher); implemented as a pure, independently-testable function.

## Error handling

- **`execute()` throws or rejects**: caught by the invoker (palette
  selection or shortcut match), logged via `console.error` including the
  command's `id`/`label`, and the interaction still completes (palette
  closes). The library does not surface a toast or error UI — user-facing
  error handling is the command's own responsibility, since only the
  consumer knows what "failed" should look like for their action.
- **Duplicate `id` or `shortcut` at `register()` time**: throws synchronously
  with a descriptive `Error` (e.g. `Command with id "save" is already
  registered`). Fail-fast, since this is a programming mistake.
- **Malformed shortcut at `register()`/`provideCmdk()` time** (missing
  modifier, missing key, more than one key, or colliding with the
  open-shortcut): throws synchronously (see Shortcut binding above) rather
  than registering a shortcut that could never safely fire or would fight
  the palette's own open-shortcut.
- **Double-unregister**: calling the teardown function twice is a safe
  no-op, since `ngOnDestroy` and manual cleanup paths could plausibly race
  or double-call.

## Testing strategy

- **`CommandRegistryService`**: register/unregister, duplicate `id` throws,
  duplicate `shortcut` throws (including equivalent combos in a different
  token order), shortcut without a modifier/without exactly one key throws,
  shortcut colliding with the open-shortcut throws, id generation falls back
  when `crypto.randomUUID()` is unavailable, double-unregister is a no-op,
  `commands()` reflects priority/insertion ordering, `matchShortcut()`
  returns the right command or `undefined` (including alt/shift combos
  matched by physical key code rather than composed character).
- **Fuzzy matcher**: pure function, table-driven cases (exact match, partial
  match, keyword-only match, no match, relative scoring/ordering).
- **`provideCmdk()`**: default/override config, throws when given a shortcut
  without a modifier or without exactly one key.
- **`CmdkPaletteComponent`**: `TestBed` component tests — opening via the
  configured open-shortcut, filtering as `query` changes, arrow-key
  navigation moves selection, `Enter` executes and closes, `Escape` closes
  without executing, `Tab` keeps focus on the search input, selection clamps
  when a command disappears mid-session, a registered command's shortcut
  executes and closes while open, that same shortcut does nothing while
  closed, the open-shortcut listener is removed on destroy, grouped
  rendering order.
- **Demo app**: manual sanity-check surface during development — sample
  commands (some grouped, some with shortcuts, one that throws) to click
  through in the browser. Not part of the automated test suite.

## Out of scope (for this spec)

- Nested/drill-down command pages (Raycast-style sub-lists).
- Pluggable/swappable search strategy (Fuse.js, etc.) — the built-in fuzzy
  matcher is not designed as a replaceable interface in this iteration.
- NgModule compatibility / support for older Angular versions.
- A structural directive as an alternative registration API — the injectable
  service is the only registration surface.
