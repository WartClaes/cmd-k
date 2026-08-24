import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

// `providers` below is evaluated with no active Angular injection context, so the `navigate`
// closure passed to provideCmdk() can't `inject()` a service (e.g. DemoActivityLog) directly.
// This indirection lets `App`'s constructor (which DOES have injection context) swap in the
// real behavior once the app bootstraps — the recommended pattern for host apps that need
// e.g. Router inside their own `navigate` callback.
export const demoNavigateTarget = {
  current: (path: string) => console.log('[ngx-cmdk demo] navigate:', path),
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCmdk({
      shortcut: 'mod+k',
      recentSearchesStorageKey: () => 'ngx-cmdk-demo-recents',
      favouritesStorageKey: () => 'ngx-cmdk-demo-favourites',
      navigate: (path) => demoNavigateTarget.current(path),
    }),
  ],
};
