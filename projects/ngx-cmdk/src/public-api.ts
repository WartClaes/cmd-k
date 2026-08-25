/*
 * Public API Surface of ngx-cmdk
 */

export type { Command, ResolvedCommand } from './lib/command/command.model';
export { CommandRegistryService } from './lib/command/command-registry';
export { provideCmdk } from './lib/config/cmdk-config';
export type { CmdkConfig } from './lib/config/cmdk-config';
export { CmdkLabelsService, DEFAULT_CMDK_LABELS } from './lib/config/cmdk-labels';
export type { CmdkLabels } from './lib/config/cmdk-labels';
export { CmdkPaletteComponent } from './lib/palette/cmdk-palette';
export { CmdkIssueService } from './lib/issue/cmdk-issue';
export type { CmdkIssue } from './lib/issue/cmdk-issue';
export type { SearchProvider, SearchResult } from './lib/search/search.model';
export { SearchRegistryService } from './lib/search/search-registry';
export { RecentSearchesService } from './lib/search/recent-searches';
export type { RecentSearchEntry } from './lib/search/recent-searches';
export { FavouritesService } from './lib/favourites/favourites';
export type { FavouriteEntry } from './lib/favourites/favourites';
