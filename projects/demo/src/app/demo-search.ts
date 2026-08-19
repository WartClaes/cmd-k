import { Component, DestroyRef, inject } from '@angular/core';
import { RecentSearchesService, SearchRegistryService, type SearchResult } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape', 'Honeydew'];

@Component({
  selector: 'app-demo-search',
  imports: [],
  templateUrl: './demo-search.html',
})
export class DemoSearch {
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly recentSearches = inject(RecentSearchesService);

  protected clearRecents(): void {
    this.recentSearches.clear();
    this.log.log('Cleared recent searches');
  }

  constructor() {
    const registry = inject(SearchRegistryService);
    const unregister = registry.register({
      key: 'fruits',
      label: 'fruits',
      search: async (query) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const lower = query.toLowerCase();
        return FRUITS.filter((fruit) => fruit.toLowerCase().includes(lower)).map((fruit) => this.toResult(fruit));
      },
      resolve: async (resultId) => {
        const fruit = FRUITS.find((candidate) => candidate.toLowerCase() === resultId);
        return fruit ? this.toResult(fruit) : null;
      },
    });

    this.destroyRef.onDestroy(unregister);
  }

  private toResult(fruit: string): SearchResult {
    return {
      label: fruit,
      subtitle: `/fruits/${fruit.toLowerCase()}`,
      icon: 'demo-icon-fruit',
      resultId: fruit.toLowerCase(),
      execute: () => this.log.log(`Selected "${fruit}" from search`),
    };
  }
}
