import { TestBed } from '@angular/core/testing';
import { RecentSearchesService, SearchRegistryService, provideCmdk } from 'ngx-cmdk';
import { DemoSearch } from './demo-search';

describe('DemoSearch', () => {
  it('registers the fruits search provider on creation', () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    expect(registry.providers().map((p) => p.key)).toEqual(expect.arrayContaining(['fruits']));
  });

  it('unregisters the provider when destroyed', () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    fixture.destroy();
    expect(registry.providers().map((p) => p.key)).not.toEqual(expect.arrayContaining(['fruits']));
  });

  it('returns matching fruits for a query, case-insensitively', async () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    const results = await registry.search('APP');
    expect(results.map((r) => r.label)).toEqual(['Apple']);
  });

  it('returns no results for a query matching nothing', async () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    const results = await registry.search('zzz');
    expect(results).toEqual([]);
  });

  it('registers a resolve() that reconstructs a fruit result by id', async () => {
    TestBed.configureTestingModule({ imports: [DemoSearch] });
    const registry = TestBed.inject(SearchRegistryService);
    TestBed.createComponent(DemoSearch).detectChanges();

    const provider = registry.providers().find((p) => p.key === 'fruits')!;
    const resolved = await provider.resolve!('apple');

    expect(resolved).toEqual(
      expect.objectContaining({ label: 'Apple', subtitle: '/fruits/apple', resultId: 'apple' }),
    );

    const missing = await provider.resolve!('not-a-fruit');
    expect(missing).toBeNull();
  });

  it('clearRecents() clears the underlying RecentSearchesService', () => {
    TestBed.configureTestingModule({
      imports: [DemoSearch],
      providers: [provideCmdk({ recentSearchesStorageKey: () => 'demo-search-test-recents' })],
    });
    const recentSearches = TestBed.inject(RecentSearchesService);
    const fixture = TestBed.createComponent(DemoSearch);
    fixture.detectChanges();
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    expect(recentSearches.recent()).toHaveLength(1);

    (fixture.componentInstance as unknown as { clearRecents(): void }).clearRecents();

    expect(recentSearches.recent()).toEqual([]);
  });
});
