import { Injectable, computed, inject } from '@angular/core';
import { CMDK_CONFIG } from './cmdk-config';

export interface CmdkLabels {
  dialogLabel: string;
  searchPlaceholderDefault: string;
  searchPlaceholderActive: string;
  noResults: string;
  searching: string;
  noMatchingCommands: string;
  recentSearchesGroup: string;
  favouritesGroup: string;
  footerNavigate: string;
  footerSelect: string;
  footerClose: string;
  footerSettings: string;
  moveUp: string;
  moveDown: string;
  removeFavourite: string;
  addFavourite: string;
  labelPlaceholder: string;
  pathPlaceholder: string;
  favouritesLimitReached: string;
  clearRecentSearches: string;
  recentSearchesCleared: string;
  noRecentSearchesFound: string;
  closeSettings: string;
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

  readonly labels = computed(() => ({ ...DEFAULT_CMDK_LABELS, ...this.config.labels?.() }));
}
