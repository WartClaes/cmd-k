/*
 * Public API Surface of ngx-cmdk
 */

export type { Command, ResolvedCommand } from './lib/command/command.model';
export { CommandRegistryService } from './lib/command/command-registry';
export { provideCmdk } from './lib/config/cmdk-config';
export type { CmdkConfig } from './lib/config/cmdk-config';
export { CmdkPaletteComponent } from './lib/palette/cmdk-palette';
export { CmdkIssueService } from './lib/issue/cmdk-issue';
export type { CmdkIssue } from './lib/issue/cmdk-issue';
export type { SearchProvider, SearchResult } from './lib/search/search.model';
export { SearchRegistryService } from './lib/search/search-registry';
export { RecentSearchesService } from './lib/search/recent-searches';
export type { RecentSearchEntry } from './lib/search/recent-searches';
