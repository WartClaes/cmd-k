import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RecentSearchesService } from './recent-searches';
import { provideCmdk } from './cmdk-config';
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

  it('clear() resyncs to a key changed before the effect flushes, so the later flush does not resurrect stale data', () => {
    const key = signal('recents-a');
    const service = setup(() => key());
    service.record('fruits', makeResult({ resultId: 'apple' }));
    expect(service.recent()).toHaveLength(1);

    key.set('recents-b');
    service.clear();
    TestBed.tick();

    expect(service.recent()).toEqual([]);
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
});
