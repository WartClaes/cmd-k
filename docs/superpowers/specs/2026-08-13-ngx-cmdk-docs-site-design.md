# ngx-cmdk: Docs Site & GitHub Pages Deployment — Design

**Date:** 2026-08-13
**Status:** Approved, pending implementation plan

## Summary

Turn `projects/demo` into the project's public-facing docs/landing page —
written documentation plus the actual, live `<ngx-cmdk-palette />` mounted
on the same page — and deploy it to GitHub Pages via a GitHub Actions
workflow. Rewrite both README files (root and `projects/ngx-cmdk/README.md`)
to a concise summary that links out to the deployed page for the full guide
and API reference, instead of duplicating that content in Markdown.

No new Angular project, no docs-generation tooling (e.g. TypeDoc), no
`gh-pages` branch — the existing demo app is extended in place, and
deployment uses GitHub's official Pages actions.

## Page content structure

`projects/demo/src/app/app.html`/`app.css` are restructured into five
sections, in order:

1. **Hero/overview** — project name, one-line pitch, and a "Live demo —
   press ⌘/Ctrl+K" callout pointing at the palette that is genuinely
   mounted on this page (not a screenshot or embed).
2. **Install & quick start** — `npm install ngx-cmdk`, then the
   `provideCmdk()` + `<ngx-cmdk-palette />` snippet. This mirrors the
   README's quick-start exactly, so the two stay easy to keep in sync.
3. **Live demo** — the existing `DemoActions`/`DemoNav`/activity-log
   content, relabeled as "try it" rather than left as bare, unexplained
   sample panels. No functional change to this section — it already
   exercises decentralized registration, shortcuts, grouping, and error
   handling.
4. **API reference** — hand-written sections for `Command`,
   `CommandRegistryService`, `CmdkPaletteComponent`, `provideCmdk`/
   `CmdkConfig`, and the shortcut-binding rules (modifier requirement,
   OS-specific symbol rendering, open-overlay scoping). Content is sourced
   from `docs/superpowers/specs/2026-07-23-ngx-cmdk-design.md`, adapted for
   a public audience — not auto-generated. The API surface is small enough
   that introducing a doc-generation tool would be more machinery than the
   content needs.
5. **Footer** — links to the GitHub repo and license.

If the API reference section grows unwieldy inside `app.html`, it can be
split into its own presentational component (e.g. `ApiReference`), but the
default is to keep it inline unless that becomes a real problem.

## Deployment pipeline

A new GitHub Actions workflow, `.github/workflows/deploy-pages.yml`, using
GitHub's official Pages actions — no `gh-pages` branch, no third-party
action:

- **Trigger:** `push` to `main`, plus `workflow_dispatch` for manual
  re-runs.
- **Permissions:** `pages: write`, `id-token: write` (required by
  `deploy-pages`).
- **Concurrency:** a `pages` concurrency group with `cancel-in-progress:
  true`, so a rapid sequence of pushes doesn't run overlapping deploys.
- **Build job:**
  1. Checkout.
  2. `actions/setup-node`, with `node-version-file: .nvmrc` (24.18.0).
  3. `npm ci`.
  4. `npx ng build ngx-cmdk` — the library must be built before the demo
     app, since the demo's `tsconfig` path-maps `ngx-cmdk` imports to
     `dist/ngx-cmdk` (see the implementation plan's Global Constraints).
  5. `npx ng build demo --base-href /cmd-k/` — the `/cmd-k/` base href is
     required because this deploys to a project page
     (`wartclaes.github.io/cmd-k/`), not a user/org root page. Local
     development (`ng serve demo`) is unaffected, since `--base-href` is
     passed only in this CI build, not baked into `angular.json`.
  6. `actions/upload-pages-artifact@v3`, `path: dist/demo/browser` (the
     confirmed build output directory for this Angular version's
     application builder).
- **Deploy job:** depends on the build job; runs `actions/deploy-pages@v4`.

**Prerequisite (already done):** repo Settings → Pages → Source set to
"GitHub Actions". Every push to `main` after this workflow lands will
redeploy automatically.

## README changes

Both `README.md` (root) and `projects/ngx-cmdk/README.md` (what npm shows
on the package page, once published) are rewritten to the same concise
shape, replacing the current Angular-CLI boilerplate:

- Project name and one-line pitch.
- Install command (`npm install ngx-cmdk`).
- Minimal quick-start snippet (`provideCmdk()` + `<ngx-cmdk-palette />`),
  identical to the one on the deployed page.
- A prominent link to the deployed page
  (`https://wartclaes.github.io/cmd-k/`) for the full guide and API
  reference.

No API reference or detailed usage docs are duplicated into the READMEs —
the deployed page is the single source of truth for that content, so it
only needs to be kept correct in one place.

## Testing / verification

- No new automated tests — this work is markup, CSS, and CI configuration,
  not library logic. The existing `cmdk-palette.spec.ts` and friends
  already cover the palette behavior this page depends on.
- Before pushing, verify locally: `ng build ngx-cmdk && ng build demo
  --base-href /cmd-k/`, then serve `dist/demo/browser` with a static file
  server and check it in a real browser (e.g. via Playwright, as done
  earlier in this project) — confirming the palette still opens and
  executes commands correctly under the `/cmd-k/` base href, and that the
  new docs sections render correctly.
- After the first push to `main`, watch the Actions run to completion and
  confirm the deployed URL (`https://wartclaes.github.io/cmd-k/`) actually
  serves the page correctly end to end — the first real deploy is the true
  test of the pipeline, since a local build can't fully verify GitHub
  Pages' serving behavior.

## Out of scope (for this spec)

- Auto-generated API docs (TypeDoc or similar) — hand-written content is
  sufficient for this API's size.
- A separate/dedicated docs Angular project — `projects/demo` is extended
  in place instead.
- Versioned docs (e.g. per-release doc snapshots) — the deployed page
  always reflects `main`.
- Publishing `ngx-cmdk` to npm — this spec only covers the docs site and
  its deployment; the README's install instructions describe the intended
  end state, not a claim that the package is published yet.
