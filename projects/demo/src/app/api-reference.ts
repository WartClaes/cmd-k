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
  priority?: number;    // higher sorts first, but only when the search query is empty
}`;

  protected readonly registrySnippet = `class CommandRegistryService {
  register(command: Command): () => void;       // returns an unregister fn
  readonly commands: Signal<readonly ResolvedCommand[]>; // all registered, read-only
}`;

  protected readonly provideCmdkSnippet = `function provideCmdk(config?: { shortcut: string; searchTimeoutMs?: number }): EnvironmentProviders;

// defaults: shortcut "mod+k", searchTimeoutMs 5000
providers: [provideCmdk({ shortcut: 'mod+k', searchTimeoutMs: 5000 })]`;

  protected readonly searchProviderSnippet = `interface SearchResult {
  label: string;
  subtitle?: string;      // e.g. "/fruits/apple"
  icon?: string;
  resultId?: string;      // set this to make the result persistable as a "recent"
  execute: () => void | Promise<void>;
}

interface SearchProvider {
  key: string;             // e.g. "fruits" — also the "key:" prefix in the input
  label: string;           // chip display text
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
  resolve?: (resultId: string) => Promise<SearchResult | null>;  // reconstructs a persisted recent
}`;

  protected readonly searchRegistrySnippet = `class SearchRegistryService {
  register(provider: SearchProvider): () => void;   // throws on duplicate key
  readonly providers: Signal<readonly SearchProvider[]>;
  search(query: string, scopeKey?: string): Promise<SearchResult[]>;
}`;

  protected readonly recentSearchesSnippet = `function provideCmdk(config?: {
  shortcut?: string;
  searchTimeoutMs?: number;
  recentSearchesStorageKey?: () => string | null;   // unset = feature is fully off
}): EnvironmentProviders;

interface RecentSearchEntry {
  providerKey: string;
  resultId: string;
  label: string;
  subtitle?: string;
  icon?: string;
  selectedAt: number;
}

class RecentSearchesService {
  readonly recent: Signal<readonly RecentSearchEntry[]>;   // most-recent-first, capped at 10
  clear(): void;                                            // e.g. call this on logout
}`;

  protected readonly cmdkIssueSnippet = `type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown };

class CmdkIssueService {
  onIssue(callback: (issue: CmdkIssue) => void): () => void;
}`;
}
