import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';

export interface FavouriteEntry {
  id: string;
  label: string;
  path: string;
}

const MAX_FAVOURITE_ENTRIES = 9;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // crypto.randomUUID() is restricted to secure contexts; fall back below.
    }
  }
  return `cmdk-fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class FavouritesService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly localStorageRef = (() => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage;
    } catch {
      return undefined;
    }
  })();
  private readonly entriesSignal = signal<FavouriteEntry[]>([]);
  private syncedKey: string | null = null;

  readonly favourites = this.entriesSignal.asReadonly();

  constructor() {
    this.ensureSyncedToCurrentKey();

    effect(() => {
      this.config.favouritesStorageKey?.();
      this.ensureSyncedToCurrentKey();
    });
  }

  add(label: string, path: string): void {
    const trimmedLabel = label.trim();
    const trimmedPath = path.trim();
    if (!trimmedLabel || !trimmedPath) {
      return;
    }
    const key = this.currentKey();
    if (!key) {
      return;
    }
    this.ensureSyncedToCurrentKey();
    if (this.entriesSignal().length >= MAX_FAVOURITE_ENTRIES) {
      return;
    }

    const next = [...this.entriesSignal(), { id: generateId(), label: trimmedLabel, path: trimmedPath }];
    this.entriesSignal.set(next);
    this.writeToStorage(key, next);
  }

  remove(id: string): void {
    this.ensureSyncedToCurrentKey();
    const next = this.entriesSignal().filter((entry) => entry.id !== id);
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  moveUp(id: string): void {
    this.ensureSyncedToCurrentKey();
    const entries = this.entriesSignal();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index <= 0) {
      return;
    }
    const next = [...entries];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  moveDown(id: string): void {
    this.ensureSyncedToCurrentKey();
    const entries = this.entriesSignal();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index === -1 || index >= entries.length - 1) {
      return;
    }
    const next = [...entries];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    this.entriesSignal.set(next);
    const key = this.currentKey();
    if (key) {
      this.writeToStorage(key, next);
    }
  }

  clear(): void {
    this.ensureSyncedToCurrentKey();
    this.entriesSignal.set([]);
    const key = this.currentKey();
    if (key) {
      this.localStorageRef?.removeItem(key);
    }
  }

  private currentKey(): string | null {
    return this.config.favouritesStorageKey?.() ?? null;
  }

  private ensureSyncedToCurrentKey(): void {
    const key = this.currentKey();
    if (key === this.syncedKey) {
      return;
    }
    this.syncedKey = key;
    this.entriesSignal.set(key ? this.readFromStorage(key) : []);
  }

  private readFromStorage(key: string): FavouriteEntry[] {
    const raw = this.localStorageRef?.getItem(key);
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter(
          (entry): entry is FavouriteEntry =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as FavouriteEntry).id === 'string' &&
            typeof (entry as FavouriteEntry).label === 'string' &&
            typeof (entry as FavouriteEntry).path === 'string',
        )
        .slice(0, MAX_FAVOURITE_ENTRIES);
    } catch (error) {
      console.warn(`Failed to parse favourites from localStorage key "${key}":`, error);
      return [];
    }
  }

  private writeToStorage(key: string, entries: FavouriteEntry[]): void {
    try {
      this.localStorageRef?.setItem(key, JSON.stringify(entries));
    } catch (error) {
      console.warn(`Failed to write favourites to localStorage key "${key}":`, error);
    }
  }
}
