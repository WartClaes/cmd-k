# ngx-cmdk Docs Site & GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `projects/demo` into ngx-cmdk's public docs/landing page (overview,
install/quick-start, live demo, hand-written API reference, footer), deploy it to
GitHub Pages via GitHub Actions, and rewrite both README files to link to it.

**Architecture:** No new Angular project — `projects/demo`'s existing `App`
component is restructured in place into five page sections, with the API
reference split into its own new standalone component (`ApiReference`) since
that content is substantial enough to deserve its own file. A new GitHub
Actions workflow builds the library, builds the demo app with a
Pages-specific base href, and deploys the result with GitHub's official
Pages actions.

**Tech Stack:** Angular 22 (standalone components, same as the rest of the
workspace), GitHub Actions (`actions/setup-node`, `actions/upload-pages-artifact`,
`actions/deploy-pages`).

**Spec:** [docs/superpowers/specs/2026-08-13-ngx-cmdk-docs-site-design.md](../specs/2026-08-13-ngx-cmdk-docs-site-design.md)

## Global Constraints

- **Node version: 24.18.0**, pinned via the repo's existing `.nvmrc`. Every
  task's shell commands assume `nvm use` has been run first in that shell.
- **The library must be built before the demo app.** `projects/demo`'s
  `tsconfig` path-maps `ngx-cmdk` imports to `dist/ngx-cmdk`. Run
  `npx ng build ngx-cmdk` before any `ng build demo`, `ng serve demo`, or
  `ng test demo` if `dist/ngx-cmdk` doesn't already exist or is stale.
- **The demo app's build output directory is `dist/demo/browser`** (confirmed
  for this Angular version's application builder) — this is the exact path
  the GitHub Actions workflow uploads as the Pages artifact.
- **`--base-href /cmd-k/` is passed only in the CI build, never baked into
  `angular.json`.** This repo deploys to a GitHub Pages *project* page
  (`wartclaes.github.io/cmd-k/`), not a user/org root page, so the deployed
  build needs a non-`/` base href. Local `ng serve demo` / `ng build demo`
  without the flag must keep working exactly as before.
- **No new automated tests.** This plan is markup, CSS, and CI configuration
  — not library logic. Verification is manual: local build + browser check,
  then watching the first real GitHub Actions deploy. The existing
  `app.spec.ts` still runs and must still pass; update its one assertion
  where the task below says to.
- **Code samples shown on the page must never be live Angular markup.**
  Angular's template compiler parses every element in a component's
  template file, including inside a `<pre>` — writing the literal text
  `<ngx-cmdk-palette />` a second time directly in `app.html` would compile
  it as a second real, mounted palette instance, not inert example text.
  Every code sample is stored as a plain TypeScript string constant on the
  component class and rendered via `{{ }}` text interpolation, which
  HTML-escapes it automatically. Never use `[innerHTML]` for these samples.
- **Repo Settings → Pages → Source is already set to "GitHub Actions"** (done
  by the repo owner before this plan was written). No task needs to touch
  that setting.

---

### Task 1: Rewrite both README files

**Files:**
- Modify: `README.md` (root)
- Modify: `projects/ngx-cmdk/README.md`

**Interfaces:**
- Consumes: nothing from other tasks — this task is fully independent and
  can be done first, last, or in parallel with the others.
- Produces: nothing later tasks depend on.

Both files currently contain the default Angular-CLI-generated boilerplate
("This project was generated using Angular CLI..."). Both get replaced with
the same concise content.

- [ ] **Step 1: Replace the root README**

Replace the entire contents of `README.md` with:

```markdown
# ngx-cmdk

A Cmd/Ctrl+K style command palette for Angular. Any component, directive,
guard, or service anywhere in your app can register commands via dependency
injection — no single root location required.

**[Live docs & demo →](https://wartclaes.github.io/cmd-k/)**

## Install

```bash
npm install ngx-cmdk
```

## Quick start

```ts
// app.config.ts
providers: [provideCmdk()]
```

```html
<!-- app.html, mounted once -->
<ngx-cmdk-palette />
```

```ts
// anywhere in your app
constructor() {
  const registry = inject(CommandRegistryService);
  registry.register({
    label: 'Go to Settings',
    shortcut: 'mod+s',
    execute: () => this.router.navigate(['/settings']),
  });
}
```

See the [live docs](https://wartclaes.github.io/cmd-k/) for the full guide
and API reference.

## Development

This is an Angular CLI workspace with two projects: `projects/ngx-cmdk` (the
library) and `projects/demo` (a demo app that also serves as the docs site).

```bash
npx ng build ngx-cmdk   # build the library first — the demo app needs it
npx ng serve demo       # then serve the demo/docs app locally
npx ng test ngx-cmdk    # run the library's unit tests
```

## License

MIT
```

- [ ] **Step 2: Replace the library's README**

Replace the entire contents of `projects/ngx-cmdk/README.md` with the same
content as `README.md` from Step 1 (byte-for-byte identical). This is what
npm shows on the package page once `ngx-cmdk` is published, so it needs to
stand on its own without assuming the reader is looking at the GitHub repo.

- [ ] **Step 3: Commit**

```bash
git add README.md projects/ngx-cmdk/README.md
git commit -m "Rewrite READMEs with install/quick-start and a link to the docs site"
```

---

### Task 2: Restructure the demo app into hero, install, and live-demo sections

**Files:**
- Modify: `projects/demo/src/index.html`
- Modify: `projects/demo/src/app/app.ts`
- Modify: `projects/demo/src/app/app.html`
- Modify: `projects/demo/src/app/app.css`
- Modify: `projects/demo/src/app/app.spec.ts`
- Modify: `projects/demo/src/app/demo-actions.html`
- Modify: `projects/demo/src/app/demo-nav.html`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the page skeleton (hero, install & quick start, live demo,
  footer) that Task 3 inserts the API reference section into, between the
  live-demo section and the footer. Task 3 needs the exact footer text/markup
  produced here to insert before it.

- [ ] **Step 1: Update the page title**

In `projects/demo/src/index.html`, change:

```html
    <title>Demo</title>
```

to:

```html
    <title>ngx-cmdk — Command palette for Angular</title>
```

- [ ] **Step 2: Add code-sample string constants to the component class**

Replace the entire contents of `projects/demo/src/app/app.ts` with:

```ts
import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);

  protected readonly installSnippet = 'npm install ngx-cmdk';

  protected readonly providerSnippet = `providers: [provideCmdk()]`;

  protected readonly templateSnippet = '<ngx-cmdk-palette />';
}
```

(This only adds the three snippet fields — `log` and the existing imports
are unchanged from the current file.)

- [ ] **Step 3: Rewrite the template's structure**

Replace the entire contents of `projects/demo/src/app/app.html` with:

```html
<main class="demo-app">
  <header class="demo-hero">
    <h1>ngx-cmdk</h1>
    <p class="demo-tagline">
      A Cmd/Ctrl+K style command palette for Angular. Any component,
      directive, guard, or service anywhere in your app can register
      commands via dependency injection.
    </p>
    <p class="demo-callout">
      Press <kbd>⌘/Ctrl</kbd> + <kbd>K</kbd> to try it right now — the
      palette below is the real, live component, not a screenshot.
    </p>
  </header>

  <section class="demo-section">
    <h2>Install &amp; quick start</h2>
    <pre class="demo-code"><code>{{ installSnippet }}</code></pre>
    <pre class="demo-code"><code>{{ providerSnippet }}</code></pre>
    <pre class="demo-code"><code>{{ templateSnippet }}</code></pre>
  </section>

  <section class="demo-section">
    <h2>Live demo</h2>
    <p>
      These panels register real commands from independent components,
      exactly as a consuming app would. Open the palette and try "Go to
      Section A", "Show Alert", or "Cause Error".
    </p>
    <app-demo-actions />
    <app-demo-nav />

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

  <footer class="demo-footer">
    <a href="https://github.com/WartClaes/cmd-k">GitHub</a>
    ·
    <span>MIT License</span>
  </footer>

  <ngx-cmdk-palette />
</main>
```

- [ ] **Step 4: Style the new sections**

Replace the entire contents of `projects/demo/src/app/app.css` with:

```css
.demo-app {
  max-width: 640px;
  margin: 40px auto;
  padding: 0 16px;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.demo-hero h1 {
  margin-bottom: 8px;
}

.demo-tagline {
  color: #444;
}

.demo-callout {
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
}

.demo-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.demo-code {
  margin: 0;
  padding: 12px 16px;
  background: #1e1e1e;
  color: #e0e0e0;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.9em;
}

.demo-footer {
  padding-top: 16px;
  border-top: 1px solid #ddd;
  color: #666;
  font-size: 0.9em;
}

.demo-footer a {
  color: inherit;
}
```

(The `.demo-panel` rule that `demo-actions.html`/`demo-nav.html`/the
Activity log section rely on stays as-is in `projects/demo/src/styles.css`
— this task doesn't touch that file.)

- [ ] **Step 5: Step down the nested panel headings**

The "Activity log" heading in Step 3 above is `<h3>`, since it now nests
inside the "Live demo" `<h2>`. `demo-actions.html` and `demo-nav.html` still
use `<h2>` for their own panel headings, which would leave them one level
higher than their sibling "Activity log" `<h3>` inside the same section —
fix that inconsistency here.

In `projects/demo/src/app/demo-actions.html`, change:

```html
  <h2>Actions panel</h2>
```

to:

```html
  <h3>Actions panel</h3>
```

In `projects/demo/src/app/demo-nav.html`, change:

```html
  <h2>Navigation panel</h2>
```

to:

```html
  <h3>Navigation panel</h3>
```

- [ ] **Step 6: Update the app spec's heading assertion**

In `projects/demo/src/app/app.spec.ts`, the existing test checks for the old
`<h1>ngx-cmdk demo</h1>` text. Replace:

```ts
  it('renders the demo heading', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('ngx-cmdk demo');
  });
```

with:

```ts
  it('renders the demo heading', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('ngx-cmdk');
  });
```

- [ ] **Step 7: Build the library, then run the demo's tests**

```bash
npx ng build ngx-cmdk
npx ng test demo --no-watch
```

Expected: both tests in `app.spec.ts` pass (`Tests 2 passed (2)` among the
suite's total), confirming the new heading and structure render without
errors.

- [ ] **Step 8: Commit**

```bash
git add projects/demo/src/index.html \
        projects/demo/src/app/app.ts \
        projects/demo/src/app/app.html \
        projects/demo/src/app/app.css \
        projects/demo/src/app/app.spec.ts \
        projects/demo/src/app/demo-actions.html \
        projects/demo/src/app/demo-nav.html
git commit -m "Restructure demo app into hero, install, and live-demo sections"
```

---

### Task 3: Add the API reference section as its own component

**Files:**
- Create: `projects/demo/src/app/api-reference.ts`
- Create: `projects/demo/src/app/api-reference.html`
- Create: `projects/demo/src/app/api-reference.css`
- Modify: `projects/demo/src/app/app.ts`
- Modify: `projects/demo/src/app/app.html`

**Interfaces:**
- Consumes: the page skeleton from Task 2 — specifically, the footer markup
  in `app.html` that this task inserts a new section immediately before.
- Produces: `ApiReference`, a standalone component with selector
  `app-api-reference` and no inputs/outputs. Nothing later depends on it.

- [ ] **Step 1: Create the component class**

Create `projects/demo/src/app/api-reference.ts`:

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-api-reference',
  imports: [],
  templateUrl: './api-reference.html',
  styleUrl: './api-reference.css',
})
export class ApiReference {
  protected readonly commandSnippet = `interface Command {
  id?: string;                    // auto-generated if omitted
  label: string | (() => string); // static or dynamic label
  execute: () => void | Promise<void>;
  icon?: string;                  // consumer-defined token
  keywords?: string[];            // extra search terms, not displayed
  group?: string;                 // section header, e.g. "Navigation"
  shortcut?: string;              // e.g. "mod+s", "mod+shift+p"
  priority?: number;               // higher sorts first within its group
}`;

  protected readonly registrySnippet = `class CommandRegistryService {
  register(command: Command): () => void;       // returns an unregister fn
  readonly commands: Signal<readonly Command[]>; // all registered, read-only
}`;

  protected readonly provideCmdkSnippet = `function provideCmdk(config?: { shortcut: string }): EnvironmentProviders;

// default shortcut is "mod+k"
providers: [provideCmdk({ shortcut: 'mod+k' })]`;
}
```

- [ ] **Step 2: Create the template**

Create `projects/demo/src/app/api-reference.html`:

```html
<section class="api-section">
  <h2>API reference</h2>

  <article>
    <h3>Command</h3>
    <p>
      The shape every registered command has. Only <code>label</code> and
      <code>execute</code> are required.
    </p>
    <pre class="api-code"><code>{{ commandSnippet }}</code></pre>
  </article>

  <article>
    <h3>CommandRegistryService</h3>
    <p>
      Injectable anywhere (<code>providedIn: 'root'</code>). Call
      <code>register()</code> from any component, directive, guard, or
      service — registration isn't confined to a single root location. It
      returns an unregister function; pass it to
      <code>DestroyRef.onDestroy()</code> for automatic cleanup.
      Registering a duplicate <code>id</code> or a colliding
      <code>shortcut</code> throws immediately, rather than silently
      overriding the earlier registration.
    </p>
    <pre class="api-code"><code>{{ registrySnippet }}</code></pre>
  </article>

  <article>
    <h3>CmdkPaletteComponent</h3>
    <p>
      Selector <code>ngx-cmdk-palette</code>. Mount it once, typically in
      your root component's template. It reads live from
      <code>CommandRegistryService</code>, so it reflects whatever is
      currently registered with no extra wiring.
    </p>
  </article>

  <article>
    <h3>provideCmdk()</h3>
    <p>
      Configures the palette's open shortcut app-wide. Call it once in
      <code>app.config.ts</code>.
    </p>
    <pre class="api-code"><code>{{ provideCmdkSnippet }}</code></pre>
  </article>

  <article>
    <h3>Shortcut rules</h3>
    <ul>
      <li>
        <code>mod</code> is a platform alias — ⌘ on Mac, Ctrl on
        Windows/Linux — so you don't need to branch on platform.
      </li>
      <li>
        Every shortcut needs a real modifier (<code>mod</code>,
        <code>ctrl</code>, <code>alt</code>, or <code>cmd</code>/
        <code>meta</code>) plus exactly one key, e.g.
        <code>"mod+s"</code> or <code>"mod+shift+p"</code>. A bare key or a
        shift-only combo is rejected at registration time.
      </li>
      <li>
        A command's shortcut only fires while the palette is open — press
        it, and that command runs immediately, the same as selecting it and
        pressing Enter. The one shortcut that's always live, even when the
        palette is closed, is the configured open-shortcut itself.
      </li>
      <li>
        Shortcut hints render with the correct symbol for your OS — ⌘ on
        Mac, Ctrl elsewhere — automatically.
      </li>
    </ul>
  </article>
</section>
```

- [ ] **Step 3: Create the stylesheet**

Create `projects/demo/src/app/api-reference.css`:

```css
.api-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.api-section article {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.api-section h3 {
  margin: 0;
}

.api-code {
  margin: 0;
  padding: 12px 16px;
  background: #1e1e1e;
  color: #e0e0e0;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.9em;
}
```

- [ ] **Step 4: Wire it into the app**

In `projects/demo/src/app/app.ts`, add the import and register it in
`imports`:

```ts
import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { ApiReference } from './api-reference';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav, ApiReference],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);

  protected readonly installSnippet = 'npm install ngx-cmdk';

  protected readonly providerSnippet = `providers: [provideCmdk()]`;

  protected readonly templateSnippet = '<ngx-cmdk-palette />';
}
```

In `projects/demo/src/app/app.html`, insert `<app-api-reference />`
immediately before the `<footer class="demo-footer">` element (i.e., right
after the closing `</section>` of the "Live demo" section from Task 2):

```html
  <app-api-reference />

  <footer class="demo-footer">
```

- [ ] **Step 5: Build the library, then run and build the demo app**

```bash
npx ng build ngx-cmdk
npx ng test demo --no-watch
npx ng build demo
```

Expected: `app.spec.ts`'s tests still pass, and `ng build demo` completes
with `Application bundle generation complete.` and no errors about
`app-api-reference` being an unknown element.

- [ ] **Step 6: Commit**

```bash
git add projects/demo/src/app/api-reference.ts \
        projects/demo/src/app/api-reference.html \
        projects/demo/src/app/api-reference.css \
        projects/demo/src/app/app.ts \
        projects/demo/src/app/app.html
git commit -m "Add API reference section to the demo/docs page"
```

---

### Task 4: Add the GitHub Actions deploy-to-Pages workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: nothing from other tasks — this workflow builds whatever is on
  `main` at the time it runs, so it works correctly regardless of task
  execution order, as long as Tasks 1–3 have already landed on `main` by the
  time you actually want the deployed page to show the new content.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build ngx-cmdk library
        run: npx ng build ngx-cmdk

      - name: Build demo app for GitHub Pages
        run: npx ng build demo --base-href /cmd-k/

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/demo/browser

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the YAML syntax locally**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy-pages.yml')); print('valid YAML')"
```

Expected: `valid YAML`. (This only checks the file parses as YAML — GitHub's
own schema validation happens when the workflow actually runs, in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "Add GitHub Actions workflow to deploy the demo/docs app to Pages"
```

---

### Task 5: Verify the Pages build locally before pushing

**Files:** none — this task only runs commands and inspects the result.

**Interfaces:**
- Consumes: the built output from Tasks 2–4 (the full page with hero,
  install, live demo, API reference, and the correct base href).
- Produces: nothing — this is a verification checkpoint.

- [ ] **Step 1: Build exactly as the CI workflow will, and check the base href**

```bash
npx ng build ngx-cmdk
npx ng build demo --base-href /cmd-k/
grep '<base href' dist/demo/browser/index.html
```

Expected: both builds complete successfully, and the grep prints
`<base href="/cmd-k/">`.

This build's output is **not** what you serve locally in Step 2 below — a
`/cmd-k/` base href tells the browser to resolve every relative asset URL
against `/cmd-k/...`, which doesn't exist when the same files are served at
the root of a local static server. Serving this exact build locally would
404 every JS/CSS/icon request and isn't a meaningful test of anything this
task needs to check. This step only confirms the CI command produces the
right `<base>` tag; the actual page content and behavior are checked in
Step 2 against a normal, root-relative build.

- [ ] **Step 2: Serve a normal build and open it in a browser**

```bash
npx ng serve demo &
```

Then navigate a browser (e.g. via the Playwright MCP tools used earlier in
this project) to `http://localhost:4200/`. Confirm:

- The hero, install/quick-start, live-demo, API reference, and footer
  sections all render.
- Pressing Cmd/Ctrl+K opens the real palette (not a screenshot).
- The three code samples in "Install & quick start" render as plain text —
  specifically, confirm there is exactly **one** `<ngx-cmdk-palette>` element
  in the DOM (`document.querySelectorAll('ngx-cmdk-palette').length === 1`),
  proving the `<ngx-cmdk-palette />` shown as an example snippet did not
  compile into a second live component instance.
- "Go to Section A", "Show Alert", and "Cause Error" still work from the
  live-demo section.

- [ ] **Step 3: Stop the server**

```bash
kill %1
```

- [ ] **Step 4: No commit** — this task only verifies work already committed
  in Tasks 2–4. If anything failed above, fix it in the relevant task's
  files and re-run this task's steps before moving on.

---

### Task 6: Push, watch the deploy, and verify the live site

**Files:** none.

**Interfaces:**
- Consumes: all commits from Tasks 1–4.
- Produces: nothing — this is the final, real-world verification that the
  whole pipeline works end to end, which Task 5's local check cannot fully
  substitute for (it doesn't exercise GitHub Pages' actual serving behavior).

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Watch the workflow run**

```bash
gh run watch --exit-status
```

If no run has started yet (race with the push), first list runs to get the
ID: `gh run list --workflow=deploy-pages.yml --limit 1`, then
`gh run watch <run-id> --exit-status`.

Expected: both the `build` and `deploy` jobs complete with a green check.

- [ ] **Step 3: Verify the live URL**

Navigate a browser to `https://wartclaes.github.io/cmd-k/` and repeat the
checks from Task 5, Step 2, against the live site. Pay particular attention
to anything that only shows up in production: check the browser console for
404s on any asset (a wrong base href would show up as broken CSS/JS/icon
requests here, which Task 5's local server run wouldn't catch since it
doesn't use the same absolute-path resolution as a real subdirectory
deployment).

- [ ] **Step 4: No commit** — this task only verifies already-pushed work.
  If the live site doesn't match Task 5's local verification, that's a real
  bug (most likely a base-href or asset-path issue) — fix it, push a new
  commit, and re-run this task.
