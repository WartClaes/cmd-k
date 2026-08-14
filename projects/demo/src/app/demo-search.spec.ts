import { TestBed } from '@angular/core/testing';
import { SearchRegistryService } from 'ngx-cmdk';
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
});
