# ngx-cmdk dialog design refresh — report

## What changed, per file

### `projects/ngx-cmdk/src/lib/palette/cmdk-palette.css`
- Updated the fallback values of all existing `--cmdk-*` custom properties to the new
  light-mode `oklch()` palette (see full list below).
- Added `backdrop-filter: blur(6px)` to `.cmdk-overlay`.
- Added a `border` to `.cmdk-panel` (it had none before) using `var(--cmdk-border, ...)`.
- Added `@keyframes cmdk-overlay-in` (opacity fade) and `@keyframes cmdk-panel-in`
  (opacity + translateY + scale), applied as `animation` on `.cmdk-overlay` /
  `.cmdk-panel`, plus a `@media (prefers-reduced-motion: reduce)` block that shortens
  both animations to near-zero duration.
- Restyled `.cmdk-group-label` (11px/600/0.06em, per the section-label spec).
- Added `.cmdk-item-avatar` (22x22px, 7px radius, tinted background, solid accent text,
  Space Mono 11px) plus a `.cmdk-item-avatar::before { content: attr(data-initial) }`
  rule — the visible initial is rendered via a CSS-generated pseudo-element rather than
  a real text node, specifically so it can never appear in `.cmdk-item`'s `textContent`
  (see "Self-review findings" — this was required to keep two existing spec assertions
  passing unchanged).
- Added `.cmdk-input-icon` (muted-colored wrapper for the new search-icon SVG).
- Added `.cmdk-input-esc-hint` (key-badge styling: 6px radius, 3px 7px padding, 11px
  Space Mono, tinted background).
- Restyled `.cmdk-chip` border and `.cmdk-chip:hover` (now sets `border-color` and
  `color` to the new solid `--cmdk-accent-color`, in addition to the existing tinted
  `background`).
- Restyled `.cmdk-footer-key` to match the "key badge" spec (6px radius, 3px 7px
  padding, Space Mono, its own `color`).
- Every other existing rule (`.cmdk-item--selected`, `.cmdk-scope-token`,
  `.cmdk-item-subtitle`, `.cmdk-shortcut`, `.cmdk-empty`, `.cmdk-input-row`,
  `.cmdk-chip-row`, `.cmdk-footer`) kept its class name/selector and only had its
  `var(--cmdk-*, <fallback>)` fallback value updated.

### `projects/ngx-cmdk/src/lib/palette/cmdk-palette.html`
- Added a `<span class="cmdk-input-icon" aria-hidden="true">` containing the exact
  magnifying-glass SVG from the spec, prepended inside `.cmdk-input-row` before the
  scope token / `<input>`.
- Added `<span class="cmdk-input-esc-hint">esc</span>` after the `<input>`, inside
  `.cmdk-input-row`.
- Added a `.cmdk-item-avatar` span (with `[attr.data-initial]="firstInitial(...)"` and
  `aria-hidden="true"`) as the `@else` branch of every existing `@if (X.icon)` block
  (search results, recents, commands), so the avatar renders exactly when the
  consumer-supplied icon does not, never alongside it.
- Added an unconditional `.cmdk-item-avatar` span to the Favourites row (favourites
  have no `icon` field/branch at all today, so there's nothing to guard against).

### `projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts`
- Added one new field, in the same style as the existing `formatShortcut` field:
  ```ts
  // Pure presentational helper for the row "initial" avatar shown when a row has no consumer-supplied icon.
  protected readonly firstInitial = (label: string) => label.charAt(0).toUpperCase();
  ```
  This is the one narrow exception to "CSS/template only" called out in the brief —
  see "Self-review findings" for why it was necessary and why it stays minimal (pure,
  one-line, stateless string transform, no new dependencies, no behavior change).

### `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.css`
- Updated every `var(--cmdk-border, ...)`, `var(--cmdk-muted, ...)`,
  `var(--cmdk-accent, ...)` fallback to match the same new token values used in
  `cmdk-palette.css` (same variable names, same fallback-value conventions, including
  the per-site differentiated `--cmdk-border` fallbacks explained below).
  - `.cmdk-settings-add-button`: `border-radius: 4px` → `9px`.
  - `.cmdk-settings-input`: `border-radius: 4px` → `9px`.
  - `.cmdk-settings-clear-button`: `border-radius: 4px` → `9px`.
  - `.cmdk-settings-close-button`: `border-radius: 4px` → `10px`.
  - `.cmdk-settings-close-hint`: restyled to match the shared "key badge" look (6px
    radius, 3px 7px padding, Space Mono, its own muted color), consistent with
    `.cmdk-footer-key` / `.cmdk-input-esc-hint` in the palette.

### `projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.html`
- No changes. Nothing in the design brief required a structural change here — the
  Settings view already renders inside the shared `.cmdk-panel` from
  `cmdk-palette.html`, so it inherits the new panel background/border/radius/shadow/
  animation/font automatically once those fallbacks were updated.

## `--cmdk-*` custom properties now in use

Pre-existing (fallback values updated, names/usages unchanged so any host override
keeps working identically):

| Variable | Old fallback (representative) | New fallback |
|---|---|---|
| `--cmdk-bg` | `#fff` | `oklch(0.995 0.003 50)` |
| `--cmdk-fg` | `#111` | `oklch(0.24 0.01 50)` |
| `--cmdk-radius` | `8px` | `22px` |
| `--cmdk-shadow` | `0 16px 48px rgba(0,0,0,0.24)` | `0 20px 60px oklch(0.15 0.01 40 / 0.25)` |
| `--cmdk-border` | `rgba(0,0,0,0.1)` (one value everywhere) | **Per-site fallback** (same variable, different default at each call site — see note below): `oklch(0.92 0.008 50)` for section dividers (input-row/chip-row bottom border, footer top border, settings section/footer borders), `oklch(0.9 0.01 50)` for the panel border and chip border, `oklch(0.95 0.008 50)` for key-badge backgrounds (`.cmdk-footer-key`, `.cmdk-input-esc-hint`, `.cmdk-settings-close-hint`) |
| `--cmdk-muted` | `#888` | `oklch(0.55 0.01 50)` for body/label text; `oklch(0.45 0.01 50)` at the key-badge text sites (same variable, different per-site fallback, same technique as `--cmdk-border` above) |
| `--cmdk-accent` | `#eef2ff` (used directly as a solid-ish tint) | `color-mix(in srgb, var(--cmdk-accent-color, #8b5cf6) 12%, transparent)` — now an explicit tint derived from the new solid accent |
| `--cmdk-backdrop` | `rgba(0,0,0,0.5)` | `oklch(0.15 0.01 40 / 0.35)` |
| `--cmdk-font` | `inherit` | `'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| `--cmdk-z-index` | `1000` | unchanged (not part of the visual redesign) |

New:

| Variable | Fallback | Purpose |
|---|---|---|
| `--cmdk-accent-color` | `#8b5cf6` | The raw/solid accent color (chip hover border+text, avatar background text color, and the source `color-mix()` derives the `--cmdk-accent` tint from when `--cmdk-accent` itself isn't overridden). |

**Important note on the "per-site fallback" technique**: `--cmdk-border` and
`--cmdk-muted` are each still a single variable (not renamed, not split into new
variables) — but different `var(--cmdk-border, <fallback>)` call sites now specify a
different literal fallback value tailored to that element (dividers vs. panel/chip
border vs. key-badge background; label/body text vs. key-badge text). This is standard
CSS: the fallback is per-declaration. If a host app overrides `--cmdk-border` or
`--cmdk-muted` today, **every** site still resolves to that same overridden value
(identical behavior to before this change) — only the *unset* default differs by
location, matching the mockup's use of visually-distinct-but-related tokens without
introducing new variable names.

## Test results

- Before: not independently re-run (per instructions, baseline is stated as 243 tests).
- After: `npx ng test ngx-cmdk --watch=false` → **12 test files passed, 243 tests
  passed**, 0 failures, 0 skipped. No `.spec.ts` file was modified.
- Build: `npx ng build ngx-cmdk` → **succeeded** (partial compilation mode, FESM/DTS
  bundles generated, package manifest written). This also validates the one `.ts`
  change compiles cleanly.

## Files changed

- `/Users/wart/git/personal/cmd-k/.worktrees/ngx-cmdk-design-refresh/projects/ngx-cmdk/src/lib/palette/cmdk-palette.css`
- `/Users/wart/git/personal/cmd-k/.worktrees/ngx-cmdk-design-refresh/projects/ngx-cmdk/src/lib/palette/cmdk-palette.html`
- `/Users/wart/git/personal/cmd-k/.worktrees/ngx-cmdk-design-refresh/projects/ngx-cmdk/src/lib/palette/cmdk-palette.ts`
- `/Users/wart/git/personal/cmd-k/.worktrees/ngx-cmdk-design-refresh/projects/ngx-cmdk/src/lib/settings/cmdk-settings-panel.css`

(`cmdk-settings-panel.html` was read in full but not modified — no structural change
was needed there.)

## Self-review findings

1. **Avatar-vs-textContent conflict (the main finding).** Two existing spec
   assertions in `cmdk-palette.spec.ts` query the whole `.cmdk-item` row (not just
   `.cmdk-item-label`) and assert its trimmed `textContent` equals exactly the
   command's label — e.g. `'filters the list as the query changes'` expects
   `['Show Alert']` and `'backward compatibility: ...'` expects `['Alpha']`, for
   commands registered with no `icon`. Rendering the avatar's initial as a normal DOM
   text node (e.g. `{{ firstInitial(label) }}` inside the avatar span) would have
   concatenated onto that textContent (e.g. `'SShow Alert'`) and broken both tests —
   a direct conflict between the design spec's literal wording ("a small pure helper
   function... `firstInitial`") and the "every existing test must keep passing
   unchanged" constraint.
   Resolution: the avatar's visible character is rendered as CSS generated content
   (`.cmdk-item-avatar::before { content: attr(data-initial) }`) driven by a
   `[attr.data-initial]` binding, rather than as an interpolated text node.
   CSS-generated content is never part of an element's DOM `textContent` (in any
   browser or in jsdom/happy-dom), so the row visually shows the initial while the
   existing textContent-equality assertions are completely unaffected. I verified by
   running the full suite — all 243 tests pass, including both of the above.
   `firstInitial` itself is still a genuine pure helper on the component class, per
   the brief's allowed exception; it's just consumed via an attribute binding instead
   of interpolation.
2. Deliberately consolidated some near-duplicate mockup color values (e.g. the
   mockup's distinct "panel border" `oklch(0.9 0.01 50)` vs. "section divider"
   `oklch(0.92 0.008 50)` vs. "key badge background" `oklch(0.95 0.008 50)`) onto the
   single existing `--cmdk-border` variable using per-call-site fallbacks (see table
   above), rather than inventing additional `--cmdk-*` variables, since the brief was
   explicit that only one new variable (`--cmdk-accent-color`) was needed/expected.
   Flagging this explicitly in case the "second task" that depends on the exact
   variable list expected a different variable-per-tone split — happy to add
   dedicated variables (e.g. `--cmdk-panel-border`) instead if that's preferred, but
   as implemented, an override of `--cmdk-border` affects all of those sites
   uniformly, matching pre-existing behavior (all of these sites already shared
   `--cmdk-border` before this change).
3. Confirmed the search-icon SVG, esc-hint chip, and avatars do not introduce any new
   focusable/interactive elements, so the existing focus-trap ("Tab keeps focus on the
   search input") and keyboard-handling tests are unaffected.
4. Confirmed `.cmdk-settings-panel.html` needed no template changes — it already
   inherits the redesigned shared `.cmdk-panel` chrome.

## Issues / concerns

- None blocking. The one design judgment call worth double-checking is item 2 above
  (consolidating multiple mockup border/muted tones onto the existing `--cmdk-border`
  / `--cmdk-muted` variables via per-site fallbacks, instead of adding more new
  `--cmdk-*` variables) — flagging since a downstream task depends on the exact
  variable list.
