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
    execute: () => { this.router.navigate(['/settings']); },
  });
}
```

Search providers are a second registration surface — attach an async data
source and typing fans the query out to every registered provider, merging
the results into the palette:

```ts
constructor() {
  const search = inject(SearchRegistryService);
  search.register({
    key: 'fruits',
    label: 'fruits',
    search: async (query) => fetchResults(query),
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
