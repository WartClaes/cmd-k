import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FavouritesService } from './favourites';
import { provideCmdk } from '../config/cmdk-config';

function setup(storageKey: () => string | null): FavouritesService {
  TestBed.configureTestingModule({
    providers: [provideCmdk({ favouritesStorageKey: storageKey })],
  });
  return TestBed.inject(FavouritesService);
}

describe('FavouritesService', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('favourites() is empty with no storage key configured', () => {
    const service = setup(() => null);
    expect(service.favourites()).toEqual([]);
  });

  it('add() is a no-op when there is no storage key', () => {
    const service = setup(() => null);
    service.add('Production orders', '/production-orders');
    expect(service.favourites()).toEqual([]);
    expect(localStorage.getItem('favs')).toBeNull();
  });

  it('add() is a no-op when the label is empty or whitespace-only', () => {
    const service = setup(() => 'favs');
    service.add('   ', '/path');
    expect(service.favourites()).toEqual([]);
  });

  it('add() is a no-op when the path is empty or whitespace-only', () => {
    const service = setup(() => 'favs');
    service.add('Label', '   ');
    expect(service.favourites()).toEqual([]);
  });

  it('adds a favourite with a trimmed label/path and round-trips through localStorage', () => {
    const service = setup(() => 'favs');
    service.add('  Production orders  ', '  /production-orders  ');

    expect(service.favourites()).toEqual([
      { id: expect.any(String), label: 'Production orders', path: '/production-orders' },
    ]);
    const stored = JSON.parse(localStorage.getItem('favs')!);
    expect(stored).toEqual(service.favourites());
  });

  it('appends new favourites after existing ones, preserving order', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    expect(service.favourites().map((f) => f.label)).toEqual(['First', 'Second']);
  });

  it('refuses a 10th favourite once 9 are already present', () => {
    const service = setup(() => 'favs');
    for (let i = 0; i < 9; i++) {
      service.add(`Item ${i}`, `/item-${i}`);
    }
    expect(service.favourites()).toHaveLength(9);

    service.add('Tenth', '/tenth');

    expect(service.favourites()).toHaveLength(9);
    expect(service.favourites().map((f) => f.label)).not.toContain('Tenth');
  });

  it('remove() removes the matching entry by id and persists the change', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const idToRemove = service.favourites()[0].id;

    service.remove(idToRemove);

    expect(service.favourites().map((f) => f.label)).toEqual(['Second']);
    const stored = JSON.parse(localStorage.getItem('favs')!);
    expect(stored.map((f: { label: string }) => f.label)).toEqual(['Second']);
  });

  it('moveUp() swaps an entry with its predecessor', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const secondId = service.favourites()[1].id;

    service.moveUp(secondId);

    expect(service.favourites().map((f) => f.label)).toEqual(['Second', 'First']);
  });

  it('moveUp() on the first entry is a no-op', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const firstId = service.favourites()[0].id;

    service.moveUp(firstId);

    expect(service.favourites().map((f) => f.label)).toEqual(['First', 'Second']);
  });

  it('moveDown() swaps an entry with its successor', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const firstId = service.favourites()[0].id;

    service.moveDown(firstId);

    expect(service.favourites().map((f) => f.label)).toEqual(['Second', 'First']);
  });

  it('moveDown() on the last entry is a no-op', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');
    service.add('Second', '/second');
    const secondId = service.favourites()[1].id;

    service.moveDown(secondId);

    expect(service.favourites().map((f) => f.label)).toEqual(['First', 'Second']);
  });

  it('reactively collapses to [] when the storage key becomes unavailable, and restores it when available again', () => {
    const key = signal<string | null>('favs');
    const service = setup(() => key());
    service.add('First', '/first');
    expect(service.favourites()).toHaveLength(1);

    key.set(null);
    TestBed.tick();
    expect(service.favourites()).toEqual([]);

    key.set('favs');
    TestBed.tick();
    expect(service.favourites()).toHaveLength(1);
  });

  it('a different key reads/writes independently of the previous key', () => {
    const key = signal('favs-a');
    const service = setup(() => key());
    service.add('A-item', '/a');

    key.set('favs-b');
    TestBed.tick();
    expect(service.favourites()).toEqual([]);
    service.add('B-item', '/b');
    expect(service.favourites().map((f) => f.label)).toEqual(['B-item']);

    key.set('favs-a');
    TestBed.tick();
    expect(service.favourites().map((f) => f.label)).toEqual(['A-item']);
  });

  it('clear() resyncs to the current key before acting, so a later key switch back does not resurrect stale state', () => {
    const key = signal('favs-a');
    const service = setup(() => key());
    service.add('First', '/first');

    key.set('favs-b');
    service.clear();

    key.set('favs-a');
    TestBed.tick();

    expect(service.favourites()).toHaveLength(1);
  });

  it('treats malformed JSON at the configured key as no persisted favourites', () => {
    localStorage.setItem('favs', 'not valid json{{{');
    const service = setup(() => 'favs');
    expect(service.favourites()).toEqual([]);
  });

  it('filters out malformed elements in an otherwise-valid persisted array', () => {
    localStorage.setItem(
      'favs',
      JSON.stringify([null, { id: 'a', label: 'Valid', path: '/valid' }, { missingFields: true }]),
    );
    const service = setup(() => 'favs');
    expect(service.favourites()).toEqual([{ id: 'a', label: 'Valid', path: '/valid' }]);
  });

  it('caps a persisted array at 9 entries on read', () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ id: `id-${i}`, label: `Item ${i}`, path: `/item-${i}` }));
    localStorage.setItem('favs', JSON.stringify(entries));
    const service = setup(() => 'favs');
    expect(service.favourites()).toHaveLength(9);
  });

  it('degrades gracefully when localStorage access throws', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      const service = setup(() => 'favs');
      expect(service.favourites()).toEqual([]);
      expect(() => service.add('Label', '/path')).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', originalDescriptor);
    }
  });

  it('clear() empties the in-memory list and the current key storage', () => {
    const service = setup(() => 'favs');
    service.add('First', '/first');

    service.clear();

    expect(service.favourites()).toEqual([]);
    expect(localStorage.getItem('favs')).toBeNull();
  });
});
