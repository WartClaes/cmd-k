import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCmdk } from 'ngx-cmdk';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCmdk({ shortcut: 'mod+k', recentSearchesStorageKey: () => 'ngx-cmdk-demo-recents' }),
  ],
};
