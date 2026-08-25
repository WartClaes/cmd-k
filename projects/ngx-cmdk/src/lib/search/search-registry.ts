import { Injectable, computed, inject, signal } from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { CmdkIssueService } from '../issue/cmdk-issue';
import type { SearchProvider, SearchResult } from './search.model';

async function searchWithTimeout(
  provider: SearchProvider,
  query: string,
  timeoutMs: number,
  issues: CmdkIssueService,
): Promise<SearchResult[]> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const outcome = await Promise.race([provider.search(query), timeout]);
    if (outcome === 'timeout') {
      console.warn(`Search provider "${provider.key}" timed out after ${timeoutMs}ms`);
      issues.report({ source: 'search-provider', key: provider.key, query, reason: 'timeout' });
      return [];
    }
    return outcome;
  } catch (error) {
    console.warn(`Search provider "${provider.key}" failed:`, error);
    issues.report({ source: 'search-provider', key: provider.key, query, reason: 'error', error });
    return [];
  } finally {
    clearTimeout(timeoutId!);
  }
}

@Injectable({ providedIn: 'root' })
export class SearchRegistryService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly issues = inject(CmdkIssueService);
  private readonly providersMap = signal<Map<string, SearchProvider>>(new Map());
  private readonly resultProviderKeys = new WeakMap<SearchResult, string>();

  readonly providers = computed<readonly SearchProvider[]>(() => Array.from(this.providersMap().values()));
  readonly hasProviders = computed(() => this.providers().length > 0);

  register(provider: SearchProvider): () => void {
    if (this.providersMap().has(provider.key)) {
      throw new Error(`Search provider with key "${provider.key}" is already registered`);
    }
    this.providersMap.update((map) => new Map(map).set(provider.key, provider));

    let unregistered = false;
    return () => {
      if (unregistered) {
        return;
      }
      unregistered = true;
      this.providersMap.update((map) => {
        const next = new Map(map);
        next.delete(provider.key);
        return next;
      });
    };
  }

  async search(query: string, scopeKey?: string): Promise<SearchResult[]> {
    const all = this.providers();
    const targets = scopeKey ? all.filter((provider) => provider.key === scopeKey) : all;
    if (scopeKey && targets.length === 0) {
      console.warn(`Search scope "${scopeKey}" matches no registered provider`);
      this.issues.report({ source: 'search-scope', scopeKey, query });
      return [];
    }
    const resultsPerProvider = await Promise.all(
      targets.map(async (provider) => {
        const results = await searchWithTimeout(provider, query, this.config.searchTimeoutMs, this.issues);
        for (const result of results) {
          this.resultProviderKeys.set(result, provider.key);
        }
        return results;
      }),
    );
    return resultsPerProvider.flat();
  }

  providerKeyFor(result: SearchResult): string | undefined {
    return this.resultProviderKeys.get(result);
  }
}
