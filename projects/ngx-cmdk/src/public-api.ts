/*
 * Public API Surface of ngx-cmdk
 */

export type { Command, ResolvedCommand } from './lib/command.model';
export { CommandRegistryService } from './lib/command-registry';
export { provideCmdk } from './lib/cmdk-config';
export type { CmdkConfig } from './lib/cmdk-config';
export { CmdkPaletteComponent } from './lib/cmdk-palette';
export { CmdkIssueService } from './lib/cmdk-issue';
export type { CmdkIssue } from './lib/cmdk-issue';
