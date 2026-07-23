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

`shortcut` is a real, live keybinding, not just a display hint:

- **`mod` is a platform alias** (⌘ on Mac, Ctrl on Windows/Linux), so
  consumers don't need to branch on platform. Combos are expressed as
  `"mod+s"`, `"mod+shift+p"`, etc.
- **Pressing the combo executes the command directly**, whether or not the
  palette is open. It also renders as hint text next to the command in
  palette search results.
- **Conflict handling matches the ID rule.** If a second command registers a
  `shortcut` string that's already active, `register()` throws immediately
  rather than silently overriding the earlier binding.
- **Typing safety.** While focus is in an `<input>`, `<textarea>`, or a
  `contenteditable` element, only combos that include a modifier (`mod`,
  `ctrl`, `alt`, `shift+mod`, etc.) are honored. A bare single-key shortcut
  (e.g. `"s"`) will not fire while the user is typing that character into a
  text field. Modifier combos always fire, matching common behavior in apps
  like Linear/Slack.
- **`preventDefault()` is called on match**, so bindings don't collide with
  browser defaults (e.g. `mod+s` triggering the browser's save-page dialog).
- **`CommandRegistryService` owns the global `keydown` listener** (attached
  once, lazily, via the `DOCUMENT` token) — not the palette component.
  Shortcuts work even if the palette UI is never mounted, since they're a
  property of "what commands are currently registered," not of the overlay.

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
- `register(command)`:
  1. Resolves or generates the `id`.
  2. Throws if the `id` or `shortcut` collides with an existing entry.
  3. Inserts into the map; wires the `shortcut` (if any) into the shared
     keydown listener.
  4. Returns an `unregister` closure that removes the entry and its shortcut
     binding. Consumers call this from `ngOnDestroy`, or pass it to
     `DestroyRef.onDestroy(fn)` for automatic cleanup tied to the
     component/service's lifetime.
  5. Calling the returned `unregister` more than once is a safe no-op.
- The service is the single source of truth. The palette component and the
  shortcut listener both read from it; there is no duplicated state.

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
  palette; `Escape` closes without executing.
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
  selection or shortcut listener), logged via `console.error` including the
  command's `id`/`label`, and the interaction still completes (palette
  closes / shortcut handling finishes). The library does not surface a
  toast or error UI — user-facing error handling is the command's own
  responsibility, since only the consumer knows what "failed" should look
  like for their action.
- **Duplicate `id` or `shortcut` at `register()` time**: throws synchronously
  with a descriptive `Error` (e.g. `Command with id "save" is already
  registered`). Fail-fast, since this is a programming mistake.
- **Double-unregister**: calling the teardown function twice is a safe
  no-op, since `ngOnDestroy` and manual cleanup paths could plausibly race
  or double-call.
- **Typing-safety guard** on the shortcut listener (see above) is itself an
  error-prevention measure — bare-key shortcuts are filtered out before
  matching while an editable element is focused, so no separate error path
  is needed there.

## Testing strategy

- **`CommandRegistryService`**: register/unregister, duplicate `id` throws,
  duplicate `shortcut` throws, double-unregister is a no-op, `commands()`
  reflects priority/insertion ordering.
- **Fuzzy matcher**: pure function, table-driven cases (exact match, partial
  match, keyword-only match, no match, relative scoring/ordering).
- **Shortcut listener**: simulated `keydown` events — modifier combo fires
  while an input is focused, bare key does not fire while an input is
  focused, `mod` resolves correctly per platform, matched shortcut calls
  `preventDefault()`.
- **`CmdkPaletteComponent`**: `TestBed` component tests — opening via
  shortcut, filtering as `query` changes, arrow-key navigation moves
  selection, `Enter` executes and closes, `Escape` closes without
  executing, grouped rendering order.
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
