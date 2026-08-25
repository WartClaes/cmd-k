import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RecentSearchesService } from './recent-searches';
import { provideCmdk } from '../config/cmdk-config';
import { CmdkIssueService } from '../issue/cmdk-issue';
import type { SearchResult } from './search.model';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return { label: 'Result', resultId: 'r1', execute: () => {}, ...overrides };
}

function setup(storageKey: () => string | null): RecentSearchesService {
  TestBed.configureTestingModule({
    providers: [provideCmdk({ recentSearchesStorageKey: storageKey })],
  });
  return TestBed.inject(RecentSearchesService);
}

describe('RecentSearchesService', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('recent() is empty with no storage key configured', () => {
    const service = setup(() => null);
    expect(service.recent()).toEqual([]);
  });

  it('recording is a no-op when there is no storage key', () => {
    const service = setup(() => null);
    service.record('fruits', makeResult());
    expect(service.recent()).toEqual([]);
    expect(localStorage.getItem('recents')).toBeNull();
  });

  it('recording is a no-op when the result has no resultId', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ resultId: undefined }));
    expect(service.recent()).toEqual([]);
  });

  it('records a result with a resultId and round-trips through localStorage', () => {
    const service = setup(() => 'recents');
    service.record(
      'fruits',
      makeResult({ label: 'Apple', subtitle: '/fruits/apple', icon: 'demo-icon-fruit', resultId: 'apple' }),
    );

    expect(service.recent()).toEqual([
      {
        providerKey: 'fruits',
        resultId: 'apple',
        label: 'Apple',
        subtitle: '/fruits/apple',
        icon: 'demo-icon-fruit',
        selectedAt: expect.any(Number),
      },
    ]);
    const stored = JSON.parse(localStorage.getItem('recents')!);
    expect(stored).toEqual(service.recent());
  });

  it('re-recording the same providerKey/resultId pair replaces rather than duplicates', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ label: 'Apple', resultId: 'apple' }));
    service.record('fruits', makeResult({ label: 'Banana', resultId: 'banana' }));
    service.record('fruits', makeResult({ label: 'Apple (renamed)', resultId: 'apple' }));

    expect(service.recent().map((e) => e.label)).toEqual(['Apple (renamed)', 'Banana']);
  });

  it('caps the list at 10 entries, evicting the oldest', () => {
    const service = setup(() => 'recents');
    for (let i = 0; i < 12; i++) {
      service.record('fruits', makeResult({ label: `Item ${i}`, resultId: `id-${i}` }));
    }

    expect(service.recent()).toHaveLength(10);
    expect(service.recent()[0].resultId).toBe('id-11');
    expect(service.recent().at(-1)!.resultId).toBe('id-2');
  });

  it('reactively collapses to [] when the storage key becomes unavailable, and restores it when available again', () => {
    const key = signal<string | null>('recents');
    const service = setup(() => key());
    service.record('fruits', makeResult({ resultId: 'apple' }));
    expect(service.recent()).toHaveLength(1);

    key.set(null);
    TestBed.tick();
    expect(service.recent()).toEqual([]);

    key.set('recents');
    TestBed.tick();
    expect(service.recent()).toHaveLength(1);
  });

  it('a different key reads/writes independently of the previous key', () => {
    const key = signal('recents-a');
    const service = setup(() => key());
    service.record('fruits', makeResult({ label: 'A-item', resultId: 'a1' }));

    key.set('recents-b');
    TestBed.tick();
    expect(service.recent()).toEqual([]);
    service.record('fruits', makeResult({ label: 'B-item', resultId: 'b1' }));
    expect(service.recent().map((e) => e.label)).toEqual(['B-item']);

    key.set('recents-a');
    TestBed.tick();
    expect(service.recent().map((e) => e.label)).toEqual(['A-item']);
  });

  it('removeEntry removes a single entry and persists the change', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ resultId: 'apple' }));
    service.record('fruits', makeResult({ resultId: 'banana', label: 'Banana' }));

    service.removeEntry('fruits', 'apple');

    expect(service.recent().map((e) => e.resultId)).toEqual(['banana']);
    const stored = JSON.parse(localStorage.getItem('recents')!);
    expect(stored.map((e: { resultId: string }) => e.resultId)).toEqual(['banana']);
  });

  it('clear() empties the in-memory list and the current key storage', () => {
    const service = setup(() => 'recents');
    service.record('fruits', makeResult({ resultId: 'apple' }));

    service.clear();

    expect(service.recent()).toEqual([]);
    expect(localStorage.getItem('recents')).toBeNull();
  });

  it('clear() resyncs to a key changed before the effect flushes, so switching back to the original key later still sees its untouched data', () => {
    const key = signal('recents-a');
    const service = setup(() => key());
    service.record('fruits', makeResult({ resultId: 'apple' }));
    expect(service.recent()).toHaveLength(1);

    // Change the key but don't flush the constructor effect yet: internally,
    // `syncedKey` is still 'recents-a' at this instant.
    key.set('recents-b');
    // `clear()` must resync to 'recents-b' *before* acting, otherwise `syncedKey`
    // is left stale at 'recents-a' even though we've moved on to 'recents-b'.
    service.clear();

    // Switch back to the original key, whose storage was never touched by
    // either `clear()` call (both only ever removeItem the *current* key,
    // which was 'recents-b' at the time).
    key.set('recents-a');
    TestBed.tick();

    // With the fix: syncedKey was correctly resynced to 'recents-b' inside
    // clear(), so this tick sees currentKey() ('recents-a') !== syncedKey
    // ('recents-b') and correctly reloads 'recents-a' storage -> [apple].
    // Without the fix: syncedKey was left stale at 'recents-a', so this tick
    // sees currentKey() ('recents-a') === stale syncedKey ('recents-a') and
    // incorrectly skips the resync, leaving recent() stuck at [].
    expect(service.recent()).toEqual([
      expect.objectContaining({ providerKey: 'fruits', resultId: 'apple' }),
    ]);
  });

  it('reads pre-existing valid JSON from storage on construction', () => {
    localStorage.setItem(
      'recents',
      JSON.stringify([{ providerKey: 'fruits', resultId: 'apple', label: 'Apple', selectedAt: 123 }]),
    );

    const service = setup(() => 'recents');

    expect(service.recent()).toEqual([{ providerKey: 'fruits', resultId: 'apple', label: 'Apple', selectedAt: 123 }]);
  });

  it('treats malformed JSON at the configured key as no persisted recents', () => {
    localStorage.setItem('recents', 'not valid json{{{');

    const service = setup(() => 'recents');

    expect(service.recent()).toEqual([]);
  });

  it('filters out malformed elements from a persisted array, keeping only well-shaped entries', () => {
    localStorage.setItem(
      'recents',
      JSON.stringify([
        null,
        { providerKey: 'fruits', resultId: 'apple', label: 'Apple', selectedAt: 100 },
        { missingFields: true },
        { providerKey: 'fruits', resultId: 42, label: 'Bad resultId type', selectedAt: 200 },
        'not-an-object',
      ]),
    );

    const service = setup(() => 'recents');

    expect(service.recent()).toEqual([
      { providerKey: 'fruits', resultId: 'apple', label: 'Apple', selectedAt: 100 },
    ]);
  });

  it('caps a persisted array of more than 10 well-shaped entries to 10 on read', () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      providerKey: 'fruits',
      resultId: `id-${i}`,
      label: `Item ${i}`,
      selectedAt: i,
    }));
    localStorage.setItem('recents', JSON.stringify(entries));

    const service = setup(() => 'recents');

    expect(service.recent()).toHaveLength(10);
    expect(service.recent()[0].resultId).toBe('id-0');
    expect(service.recent().at(-1)!.resultId).toBe('id-9');
  });

  it('degrades to no persisted storage (without throwing) when accessing localStorage throws, e.g. a SecurityError in a storage-blocked context', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get(): Storage {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });

    try {
      let service!: RecentSearchesService;
      expect(() => {
        service = setup(() => 'recents');
      }).not.toThrow();
      expect(service.recent()).toEqual([]);

      // In-memory recording still works (graceful degradation); only persistence is unavailable.
      expect(() => service.record('fruits', makeResult({ resultId: 'apple' }))).not.toThrow();
      expect(service.recent()).toEqual([
        expect.objectContaining({ providerKey: 'fruits', resultId: 'apple' }),
      ]);
    } finally {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  });

  it('degrades to no persisted storage (without throwing) when localStorage.getItem/removeItem throw, even though the localStorage reference itself was obtained successfully', () => {
    const originalGetItem = Storage.prototype.getItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Storage.prototype.removeItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };

    try {
      let service!: RecentSearchesService;
      expect(() => {
        service = setup(() => 'recents');
      }).not.toThrow();
      expect(service.recent()).toEqual([]);

      expect(() => service.record('fruits', makeResult({ resultId: 'apple' }))).not.toThrow();
      expect(service.recent()).toEqual([
        expect.objectContaining({ providerKey: 'fruits', resultId: 'apple' }),
      ]);

      expect(() => service.clear()).not.toThrow();
      expect(service.recent()).toEqual([]);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.removeItem = originalRemoveItem;
    }
  });

  it('reports a recent-searches-storage issue through CmdkIssueService when a storage read fails', () => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };

    try {
      TestBed.configureTestingModule({
        providers: [provideCmdk({ recentSearchesStorageKey: () => 'recents' })],
      });
      // Register the listener before injecting the service: the service's constructor
      // synchronously attempts a storage read (and should already report the failure), so
      // injecting it first would let that first report slip past an as-yet-unregistered listener.
      const issues = TestBed.inject(CmdkIssueService);
      const received: unknown[] = [];
      issues.onIssue((issue) => received.push(issue));
      TestBed.inject(RecentSearchesService);

      expect(received).toEqual([
        { source: 'recent-searches-storage', key: 'recents', error: expect.any(DOMException) },
      ]);
    } finally {
      Storage.prototype.getItem = originalGetItem;
    }
  });

  it('reports a recent-searches-storage issue through CmdkIssueService when a storage write fails', () => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    };

    try {
      TestBed.configureTestingModule({
        providers: [provideCmdk({ recentSearchesStorageKey: () => 'recents' })],
      });
      const service = TestBed.inject(RecentSearchesService);
      const issues = TestBed.inject(CmdkIssueService);
      const received: unknown[] = [];
      issues.onIssue((issue) => received.push(issue));

      service.record('fruits', makeResult({ resultId: 'apple' }));

      expect(received).toEqual([
        { source: 'recent-searches-storage', key: 'recents', error: expect.any(DOMException) },
      ]);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
