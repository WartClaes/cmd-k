import { TestBed } from '@angular/core/testing';
import { SearchRegistryService } from './search-registry';
import { CmdkIssueService } from './cmdk-issue';
import { provideCmdk } from './cmdk-config';
import type { SearchProvider } from './search.model';

function makeProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return { key: 'test', label: 'Test', search: async () => [], ...overrides };
}

describe('SearchRegistryService', () => {
  let service: SearchRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SearchRegistryService);
  });

  it('starts with no providers', () => {
    expect(service.hasProviders()).toBe(false);
    expect(service.providers()).toEqual([]);
  });

  it('registers a provider and exposes it via providers()/hasProviders()', () => {
    service.register(makeProvider({ key: 'assets', label: 'assets' }));
    expect(service.hasProviders()).toBe(true);
    expect(service.providers().map((p) => p.key)).toEqual(['assets']);
  });

  it('throws when registering a duplicate key', () => {
    service.register(makeProvider({ key: 'assets' }));
    expect(() => service.register(makeProvider({ key: 'assets' }))).toThrow(
      'Search provider with key "assets" is already registered',
    );
  });

  it('removes the provider when the returned unregister function is called', () => {
    const unregister = service.register(makeProvider());
    unregister();
    expect(service.hasProviders()).toBe(false);
  });

  it('excludes an unregistered provider from subsequent searches', async () => {
    const search = vi.fn(async () => [{ label: 'Result', execute: () => {} }]);
    const unregister = service.register(makeProvider({ key: 'a', search }));
    unregister();
    const results = await service.search('query');
    expect(results).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('is a no-op when unregister is called more than once', () => {
    const unregister = service.register(makeProvider());
    unregister();
    expect(() => unregister()).not.toThrow();
  });

  it('merges results from multiple providers in registration order', async () => {
    service.register(
      makeProvider({ key: 'a', search: async () => [{ label: 'A result', execute: () => {} }] }),
    );
    service.register(
      makeProvider({ key: 'b', search: async () => [{ label: 'B result', execute: () => {} }] }),
    );
    const results = await service.search('query');
    expect(results.map((r) => r.label)).toEqual(['A result', 'B result']);
  });

  it('queries only the scoped provider when scopeKey is given', async () => {
    const aSearch = vi.fn(async () => [{ label: 'A result', execute: () => {} }]);
    const bSearch = vi.fn(async () => [{ label: 'B result', execute: () => {} }]);
    service.register(makeProvider({ key: 'a', search: aSearch }));
    service.register(makeProvider({ key: 'b', search: bSearch }));
    const results = await service.search('query', 'b');
    expect(results.map((r) => r.label)).toEqual(['B result']);
    expect(bSearch).toHaveBeenCalledWith('query');
    expect(aSearch).not.toHaveBeenCalled();
  });

  it('tracks which provider produced each result, recoverable via providerKeyFor', async () => {
    const fruitsProvider = makeProvider({
      key: 'fruits',
      search: async () => [{ label: 'Apple', resultId: 'apple', execute: () => {} }],
    });
    const veggiesProvider = makeProvider({
      key: 'veggies',
      search: async () => [{ label: 'Carrot', resultId: 'carrot', execute: () => {} }],
    });
    service.register(fruitsProvider);
    service.register(veggiesProvider);

    const results = await service.search('a');

    const apple = results.find((r) => r.label === 'Apple')!;
    const carrot = results.find((r) => r.label === 'Carrot')!;
    expect(service.providerKeyFor(apple)).toBe('fruits');
    expect(service.providerKeyFor(carrot)).toBe('veggies');
  });

  it('providerKeyFor returns undefined for a result that never went through search()', () => {
    const foreignResult = { label: 'Untracked', execute: () => {} };
    expect(service.providerKeyFor(foreignResult)).toBeUndefined();
  });
});

describe('SearchRegistryService timeout/error handling', () => {
  let service: SearchRegistryService;
  let issues: CmdkIssueService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideCmdk({ searchTimeoutMs: 100 })] });
    service = TestBed.inject(SearchRegistryService);
    issues = TestBed.inject(CmdkIssueService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('contributes no results and reports a timeout issue for a provider that never resolves', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onIssue = vi.fn();
    issues.onIssue(onIssue);
    service.register(makeProvider({ key: 'slow', search: () => new Promise(() => {}) }));

    const resultsPromise = service.search('query');
    await vi.advanceTimersByTimeAsync(100);
    const results = await resultsPromise;

    expect(results).toEqual([]);
    expect(consoleWarn).toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith({
      source: 'search-provider',
      key: 'slow',
      query: 'query',
      reason: 'timeout',
    });
    consoleWarn.mockRestore();
  });

  it('contributes no results and reports an error issue for a provider that rejects', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onIssue = vi.fn();
    issues.onIssue(onIssue);
    const error = new Error('boom');
    service.register(
      makeProvider({
        key: 'broken',
        search: async () => {
          throw error;
        },
      }),
    );

    const results = await service.search('query');

    expect(results).toEqual([]);
    expect(consoleWarn).toHaveBeenCalled();
    expect(onIssue).toHaveBeenCalledWith({
      source: 'search-provider',
      key: 'broken',
      query: 'query',
      reason: 'error',
      error,
    });
    consoleWarn.mockRestore();
  });

  it('still includes results from a fast provider alongside a timed-out one', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.register(
      makeProvider({ key: 'fast', search: async () => [{ label: 'Fast result', execute: () => {} }] }),
    );
    service.register(makeProvider({ key: 'slow', search: () => new Promise(() => {}) }));

    const resultsPromise = service.search('query');
    await vi.advanceTimersByTimeAsync(100);
    const results = await resultsPromise;

    expect(results.map((r) => r.label)).toEqual(['Fast result']);
    consoleWarn.mockRestore();
  });
});
