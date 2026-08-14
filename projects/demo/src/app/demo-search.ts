import { Component, DestroyRef, inject } from '@angular/core';
import { SearchRegistryService } from 'ngx-cmdk';
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

  constructor() {
    const registry = inject(SearchRegistryService);
    const unregister = registry.register({
      key: 'fruits',
      label: 'fruits',
      search: async (query) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const lower = query.toLowerCase();
        return FRUITS.filter((fruit) => fruit.toLowerCase().includes(lower)).map((fruit) => ({
          label: fruit,
          subtitle: `/fruits/${fruit.toLowerCase()}`,
          icon: 'demo-icon-fruit',
          execute: () => this.log.log(`Selected "${fruit}" from search`),
        }));
      },
    });

    this.destroyRef.onDestroy(unregister);
  }
}
