import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CmdkIssueService } from './cmdk-issue';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { SearchRegistryService } from './search-registry';
import type { SearchResult } from './search.model';
import { formatShortcut, isMacPlatform, matchesShortcut, parseShortcut } from './shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  private readonly searchRegistry = inject(SearchRegistryService);
  private readonly issues = inject(CmdkIssueService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = isMacPlatform(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;
  private searchDebounceTimer?: ReturnType<typeof setTimeout>;
  private searchGeneration = 0;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);
  protected readonly scopedProviderKey = signal<string | null>(null);
  protected readonly searchProviders = computed(() => this.searchRegistry.providers());

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
  protected readonly flatMatches = computed(() => this.groups().flatMap((g) => g.matches));
  protected readonly selectedCommand = computed(() => this.flatMatches()[this.selectedIndex()]?.item);
  protected readonly resolveLabel = resolveLabel;
  protected readonly formatShortcut = (shortcut: string) => formatShortcut(shortcut, this.isMac);

  protected readonly searchResults = signal<SearchResult[] | null>(null);

  protected readonly isSearchModeActive = computed(
    () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
  );

  protected readonly selectedSearchResult = computed(() => this.searchResults()?.[this.selectedIndex()]);

  protected readonly activeDescendantId = computed(() => {
    if (this.isSearchModeActive()) {
      return this.selectedSearchResult() ? `cmdk-item-search-${this.selectedIndex()}` : null;
    }
    return this.selectedCommand() ? `cmdk-item-${this.selectedCommand()!.id}` : null;
  });

  protected readonly searchInputLabel = computed(() =>
    this.isSearchModeActive() ? 'Search' : 'Search commands',
  );

  constructor() {
    const onOpenShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    };
    this.document.addEventListener('keydown', onOpenShortcut);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('keydown', onOpenShortcut));
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchDebounceTimer));

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });

    effect(() => {
      const count = this.isSearchModeActive() ? (this.searchResults()?.length ?? 0) : this.flatMatches().length;
      if (this.selectedIndex() >= count) {
        this.selectedIndex.set(Math.max(0, count - 1));
      }
    });
  }

  protected open(): void {
    if (this.isOpen()) {
      return;
    }
    this.previouslyFocused = this.document.activeElement as HTMLElement | null;
    this.query.set('');
    this.selectedIndex.set(0);
    this.scopedProviderKey.set(null);
    this.searchResults.set(null);
    this.isOpen.set(true);
  }

  protected close(): void {
    clearTimeout(this.searchDebounceTimer);
    this.searchGeneration++;
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }

  protected onQueryChange(rawValue: string): void {
    let value = rawValue;
    if (this.scopedProviderKey() === null) {
      const colonIndex = value.indexOf(':');
      if (colonIndex !== -1) {
        const candidateKey = value.slice(0, colonIndex).trim().toLowerCase();
        const matchedProvider = this.searchProviders().find((p) => p.key.toLowerCase() === candidateKey);
        if (matchedProvider) {
          this.scopedProviderKey.set(matchedProvider.key);
          value = value.slice(colonIndex + 1).trimStart();
        }
      }
    }
    this.query.set(value);
    this.selectedIndex.set(0);
    this.searchResults.set(null);
    this.scheduleSearch(value, this.scopedProviderKey());
  }

  protected selectProviderScope(key: string): void {
    this.scopedProviderKey.set(key);
    this.searchResults.set(null);
    this.scheduleSearch(this.query(), key);
    this.searchInput()?.nativeElement.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter': {
        event.preventDefault();
        if (this.isSearchModeActive()) {
          const result = this.selectedSearchResult();
          if (result) {
            this.runSearchResult(result);
          }
        } else {
          const command = this.selectedCommand();
          if (command) {
            this.runSelectedCommand(command);
          }
        }
        break;
      }
      case 'Backspace':
        if (this.scopedProviderKey() !== null && this.query() === '') {
          event.preventDefault();
          this.scopedProviderKey.set(null);
        }
        break;
      case 'Tab':
        // Chip-row buttons exist but are intentionally mouse-only (keyboard scoping goes
        // through the typed "key:" prefix instead), so trapping focus back to the search
        // input is still correct — it's the only element meant to hold keyboard focus here.
        event.preventDefault();
        this.searchInput()?.nativeElement.focus();
        break;
      default: {
        const command = this.registry.matchShortcut(event);
        if (command) {
          event.preventDefault();
          this.runSelectedCommand(command);
        }
      }
    }
  }

  protected runSelectedCommand(command: ResolvedCommand): void {
    this.registry.execute(command);
    this.close();
  }

  protected runSearchResult(result: SearchResult): void {
    try {
      const outcome = result.execute();
      if (outcome instanceof Promise) {
        outcome.catch((error) => {
          console.error(`Search result "${result.label}" failed:`, error);
          this.issues.report({ source: 'search-result', label: result.label, error });
        });
      }
    } catch (error) {
      console.error(`Search result "${result.label}" failed:`, error);
      this.issues.report({ source: 'search-result', label: result.label, error });
    }
    this.close();
  }

  private scheduleSearch(query: string, scopeKey: string | null): void {
    clearTimeout(this.searchDebounceTimer);
    if (!query.trim() || !this.searchRegistry.hasProviders()) {
      return;
    }
    const myGeneration = ++this.searchGeneration;
    this.searchDebounceTimer = setTimeout(() => {
      this.searchRegistry.search(query, scopeKey ?? undefined).then((results) => {
        if (myGeneration === this.searchGeneration) {
          this.searchResults.set(results);
        }
      });
    }, 200);
  }

  private moveSelection(delta: number): void {
    const count = this.isSearchModeActive() ? (this.searchResults()?.length ?? 0) : this.flatMatches().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
}
