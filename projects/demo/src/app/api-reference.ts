import { Component } from '@angular/core';
import { DocCodeBlock } from './doc-code-block';

@Component({
  selector: 'app-api-reference',
  imports: [DocCodeBlock],
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
  register(command: Command): () => void;   // unregister fn — pass to DestroyRef.onDestroy()
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
  search: (query: string) => Promise<SearchResult[]>;   // must resolve within searchTimeoutMs (default 5000) or contributes nothing that round
  resolve?: (resultId: string) => Promise<SearchResult | null>;  // reconstructs a persisted recent, only when one is actually picked
}`;

  protected readonly searchRegistrySnippet = `class SearchRegistryService {
  register(provider: SearchProvider): () => void;   // throws on duplicate key
  readonly providers: Signal<readonly SearchProvider[]>;
  search(query: string, scopeKey?: string): Promise<SearchResult[]>;  // called ~200ms after typing stops
}`;

  protected readonly searchProviderExampleSnippet = `@Component({ selector: 'app-product-search' /* ... */ })
export class ProductSearch {
  private readonly api = inject(ProductApi);       // however you already fetch product data
  private readonly router = inject(Router);        // however you already navigate

  constructor() {
    const registry = inject(SearchRegistryService);

    const unregister = registry.register({
      key: 'products',      // unique across every registered provider — also the "products:" scope prefix
      label: 'Products',    // chip text shown above the search input
      search: async (query) => {
        const products = await this.api.search(query);
        return products.map((product) => this.toResult(product));
      },
      // Reconstructs a result from a persisted "recent search" entry — only needed if
      // recentSearchesStorageKey is configured. Given just the resultId you handed back
      // below, look the item up again and return the same shape, or null if it's gone.
      resolve: async (resultId) => {
        const product = await this.api.getById(resultId);
        return product ? this.toResult(product) : null;
      },
    });

    // Same DestroyRef pattern as CommandRegistryService.register() — a provider left
    // registered after its component is gone keeps searching, and its resultIds can
    // still turn up in "recent searches" pointing at nothing this component can resolve.
    inject(DestroyRef).onDestroy(unregister);
  }

  private toResult(product: Product): SearchResult {
    return {
      label: product.name,
      subtitle: \`/products/\${product.id}\`,
      resultId: product.id,   // persisted as-is to localStorage — keep it stable and cheap to look up
      execute: () => this.router.navigateByUrl(\`/products/\${product.id}\`),
    };
  }
}`;

  protected readonly recentSearchesSnippet = `function provideCmdk(config?: {
  shortcut?: string;
  searchTimeoutMs?: number;
  recentSearchesStorageKey?: () => string | null;   // unset = fully off; scope per user, e.g. () => userId() ? 'app-recents-' + userId() : null
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

  protected readonly favouritesSnippet = `function provideCmdk(config?: {
  shortcut?: string;
  searchTimeoutMs?: number;
  recentSearchesStorageKey?: () => string | null;
  favouritesStorageKey?: () => string | null;   // unset = feature is fully off
  navigate?: (path: string) => void | Promise<void>;
  labels?: () => Partial<CmdkLabels>;
}): EnvironmentProviders;

class FavouritesService {
  readonly favourites: Signal<readonly { id: string; label: string; path: string }[]>; // capped at 9 — position assigns mod+1..mod+9
  add(label: string, path: string): void;
  remove(id: string): void;
  moveUp(id: string): void;
  moveDown(id: string): void;
  clear(): void;
}`;

  protected readonly labelsSnippet = `interface CmdkLabels {
  dialogLabel: string;                 // "Command palette"
  searchPlaceholderDefault: string;    // "Search commands"
  searchPlaceholderActive: string;     // "Search"
  noResults: string;                   // "No results"
  searching: string;                   // "Searching…"
  noMatchingCommands: string;          // "No matching commands"
  ungroupedGroup: string;              // group header for a Command with no group set — "Other"
  recentSearchesGroup: string;         // "Recent searches" (palette group + settings section)
  favouritesGroup: string;             // "Favourites" (palette group + settings section)
  footerNavigate: string;              // "Navigate"
  footerSelect: string;                // "Select"
  footerClose: string;                 // "Close"
  footerSettings: string;              // "Settings"
  moveUp: string;                      // aria-label — "Move up"
  moveDown: string;                    // aria-label — "Move down"
  removeFavourite: string;             // aria-label — "Remove favourite"
  addFavourite: string;                // aria-label — "Add favourite"
  labelPlaceholder: string;            // input placeholder — "Label"
  pathPlaceholder: string;             // input placeholder — "Path"
  favouritesLimitReached: string;      // must contain a "%max%" token — "Maximum of %max% favourites reached — remove one to add another."
  clearRecentSearches: string;         // "Clear recent searches"
  recentSearchesCleared: string;       // "Recent searches cleared."
  noRecentSearchesFound: string;       // "No recent searches found."
  closeSettings: string;               // "CLOSE SETTINGS"
  keyEscape: string;                   // keycap legend — "Esc"
}

const DEFAULT_CMDK_LABELS: CmdkLabels;   // the English defaults, exported for reuse

class CmdkLabelsService {
  readonly labels: Signal<CmdkLabels>;
}`;

  protected readonly cmdkIssueSnippet = `type CmdkIssue =
  | { source: 'command'; commandId: string; error: unknown }
  | { source: 'search-provider'; key: string; query: string; reason: 'timeout' | 'error'; error?: unknown }
  | { source: 'search-result'; label: string; error: unknown }
  | { source: 'recent-resolve'; providerKey: string; resultId: string; error?: unknown }
  | { source: 'favourite-navigate'; label: string; path: string; error: unknown };

class CmdkIssueService {
  onIssue(callback: (issue: CmdkIssue) => void): () => void;
}`;
}
