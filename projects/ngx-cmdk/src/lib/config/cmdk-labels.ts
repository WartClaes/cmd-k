import { Injectable, computed, inject } from '@angular/core';
import { CMDK_CONFIG } from './cmdk-config';

export interface CmdkLabels {
  dialogLabel: string;                 // aria-label on the palette dialog — "Command palette"
  searchPlaceholderDefault: string;    // input aria-label, browse mode — "Search commands"
  searchPlaceholderActive: string;     // input aria-label, search mode — "Search"
  noResults: string;                   // "No results"
  searching: string;                   // "Searching…"
  noMatchingCommands: string;          // "No matching commands"
  recentSearchesGroup: string;         // "Recent searches" (palette group + settings section)
  favouritesGroup: string;             // "Favourites" (palette group + settings section)
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
  favouritesLimitReached: string;      // must contain a "%max%" token, substituted with the actual favourites cap — "Maximum of %max% favourites reached — remove one to add another."
  clearRecentSearches: string;         // button text
  recentSearchesCleared: string;       // confirmation message
  noRecentSearchesFound: string;       // empty message
  closeSettings: string;               // "CLOSE SETTINGS"
}

export const DEFAULT_CMDK_LABELS: CmdkLabels = {
  dialogLabel: 'Command palette',
  searchPlaceholderDefault: 'Search commands',
  searchPlaceholderActive: 'Search',
  noResults: 'No results',
  searching: 'Searching…',
  noMatchingCommands: 'No matching commands',
  recentSearchesGroup: 'Recent searches',
  favouritesGroup: 'Favourites',
  footerNavigate: 'Navigate',
  footerSelect: 'Select',
  footerClose: 'Close',
  footerSettings: 'Settings',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeFavourite: 'Remove favourite',
  addFavourite: 'Add favourite',
  labelPlaceholder: 'Label',
  pathPlaceholder: 'Path',
  favouritesLimitReached: 'Maximum of %max% favourites reached — remove one to add another.',
  clearRecentSearches: 'Clear recent searches',
  recentSearchesCleared: 'Recent searches cleared.',
  noRecentSearchesFound: 'No recent searches found.',
  closeSettings: 'CLOSE SETTINGS',
};

@Injectable({ providedIn: 'root' })
export class CmdkLabelsService {
  private readonly config = inject(CMDK_CONFIG);

  readonly labels = computed(() => {
    const override = this.config.labels?.() ?? {};
    const defined = Object.fromEntries(
      Object.entries(override).filter(([, value]) => value !== undefined),
    );
    return { ...DEFAULT_CMDK_LABELS, ...defined };
  });
}
