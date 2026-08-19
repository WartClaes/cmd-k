import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';
import type { SearchResult } from './search.model';

export interface RecentSearchEntry {
  providerKey: string;
  resultId: string;
  label: string;
  subtitle?: string;
  icon?: string;
  selectedAt: number;
}

const MAX_RECENT_ENTRIES = 10;

@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  private readonly config = inject(CMDK_CONFIG);
  private readonly localStorageRef = (() => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage;
    } catch {
      return undefined;
    }
  })();
  private readonly entriesSignal = signal<RecentSearchEntry[]>([]);
  private syncedKey: string | null = null;

  readonly recent = this.entriesSignal.asReadonly();

  constructor() {
    this.ensureSyncedToCurrentKey();

    effect(() => {
      this.config.recentSearchesStorageKey?.();
      this.ensureSyncedToCurrentKey();
    });
  }

  record(providerKey: string, result: SearchResult): void {
    if (!result.resultId) {
      return;
    }
    const key = this.currentKey();
    if (!key) {
      return;
    }
    this.ensureSyncedToCurrentKey();

    const entry: RecentSearchEntry = {
      providerKey,
      resultId: result.resultId,
      label: result.label,
      subtitle: result.subtitle,
      icon: result.icon,
      selectedAt: Date.now(),
    };
    const withoutDuplicate = this.entriesSignal().filter(
      (existing) => !(existing.providerKey === providerKey && existing.resultId === result.resultId),
    );
    const next = [entry, ...withoutDuplicate].slice(0, MAX_RECENT_ENTRIES);
    this.entriesSignal.set(next);
    this.writeToStorage(key, next);
  }

  removeEntry(providerKey: string, resultId: string): void {
    this.ensureSyncedToCurrentKey();
    const next = this.entriesSignal().filter(
      (entry) => !(entry.providerKey === providerKey && entry.resultId === resultId),
    );
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
    return this.config.recentSearchesStorageKey?.() ?? null;
  }

  private ensureSyncedToCurrentKey(): void {
    const key = this.currentKey();
    if (key === this.syncedKey) {
      return;
    }
    this.syncedKey = key;
    this.entriesSignal.set(key ? this.readFromStorage(key) : []);
  }

  private readFromStorage(key: string): RecentSearchEntry[] {
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
          (entry): entry is RecentSearchEntry =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as RecentSearchEntry).providerKey === 'string' &&
            typeof (entry as RecentSearchEntry).resultId === 'string' &&
            typeof (entry as RecentSearchEntry).label === 'string' &&
            typeof (entry as RecentSearchEntry).selectedAt === 'number',
        )
        .slice(0, MAX_RECENT_ENTRIES);
    } catch (error) {
      console.warn(`Failed to parse recent searches from localStorage key "${key}":`, error);
      return [];
    }
  }

  private writeToStorage(key: string, entries: RecentSearchEntry[]): void {
    try {
      this.localStorageRef?.setItem(key, JSON.stringify(entries));
    } catch (error) {
      console.warn(`Failed to write recent searches to localStorage key "${key}":`, error);
    }
  }
}
