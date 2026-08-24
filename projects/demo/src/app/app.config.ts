import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

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
