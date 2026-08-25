import { DOCUMENT } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { resolveLabel, type ResolvedCommand } from '../command/command.model';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { CmdkLabelsService } from '../config/cmdk-labels';
import { CmdkIssueService } from '../issue/cmdk-issue';
import { CommandRegistryService } from '../command/command-registry';
import { FavouritesService, type FavouriteEntry } from '../favourites/favourites';
import { fuzzySearch } from '../command/fuzzy-match';
import { groupMatches } from '../command/group-matches';
import { RecentSearchesService, type RecentSearchEntry } from '../search/recent-searches';
import { SearchRegistryService } from '../search/search-registry';
import type { SearchResult } from '../search/search.model';
import { CmdkSettingsPanelComponent } from '../settings/cmdk-settings-panel';
import {
  formatShortcut,
  isMacPlatform,
  matchesShortcut,
  parseShortcut,
} from '../shortcut/shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [CmdkSettingsPanelComponent],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  protected readonly searchRegistry = inject(SearchRegistryService);
  private readonly recentSearches = inject(RecentSearchesService);
  private readonly favourites = inject(FavouritesService);
  private readonly issues = inject(CmdkIssueService);
  private readonly config = inject(CMDK_CONFIG);
  protected readonly labels = inject(CmdkLabelsService).labels;
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
  protected readonly settingsOpen = signal(false);
  protected readonly searchProviders = computed(() => this.searchRegistry.providers());

  protected readonly settingsAvailable = computed(
    () =>
      this.config.favouritesStorageKey?.() != null ||
      this.config.recentSearchesStorageKey?.() != null,
  );

  protected readonly canOpenSettings = computed(
    () => this.settingsAvailable() && this.query() === '' && this.scopedProviderKey() === null,
  );

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results(), this.labels().ungroupedGroup));
  protected readonly flatMatches = computed(() => this.groups().flatMap((g) => g.matches));
  protected readonly resolveLabel = resolveLabel;
  protected readonly formatShortcut = (shortcut: string) => formatShortcut(shortcut, this.isMac);
  // Pure presentational helper for the row "initial" avatar shown when a row has no consumer-supplied icon.
  protected readonly firstInitial = (label: string) => label.charAt(0).toUpperCase();

  protected readonly searchResults = signal<SearchResult[] | null>(null);

  protected readonly isSearchModeActive = computed(
    () => this.searchRegistry.hasProviders() && this.query().trim().length > 0,
  );

  protected readonly selectedSearchResult = computed(
    () => this.searchResults()?.[this.selectedIndex()],
  );

  // Deliberately checks query emptiness directly rather than isSearchModeActive(): that computed
  // also requires hasProviders(), so with zero search providers registered it's always false
  // regardless of what's typed — routing visibility through it would incorrectly keep
  // favourites/recents visible while the user fuzzy-searches Commands by typing, contradicting
  // the documented "only in the empty-query, unscoped browse view" contract.
  protected readonly visibleRecents = computed(() => {
    if (this.query().trim().length > 0 || this.scopedProviderKey() !== null) {
      return [] as readonly RecentSearchEntry[];
    }
    const registeredKeys = new Set(this.searchRegistry.providers().map((p) => p.key));
    return this.recentSearches.recent().filter((entry) => registeredKeys.has(entry.providerKey));
  });

  protected readonly visibleFavourites = computed(() => {
    if (this.query().trim().length > 0 || this.scopedProviderKey() !== null) {
      return [] as readonly FavouriteEntry[];
    }
    return this.favourites.favourites();
  });

  protected readonly favouriteShortcuts = computed(() =>
    this.favourites.favourites().map((favourite, index) => ({
      favourite,
      parsed: parseShortcut(`mod+${index + 1}`, this.isMac),
    })),
  );

  protected readonly selectedRecent = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const recents = this.visibleRecents();
    const index = this.selectedIndex();
    return index < recents.length ? recents[index] : undefined;
  });

  protected readonly selectedCommand = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const offset = this.visibleRecents().length;
    return this.flatMatches()[this.selectedIndex() - offset]?.item;
  });

  protected readonly selectedFavourite = computed(() => {
    if (this.isSearchModeActive()) {
      return undefined;
    }
    const offset = this.visibleRecents().length + this.flatMatches().length;
    const favourites = this.visibleFavourites();
    const index = this.selectedIndex() - offset;
    return index >= 0 && index < favourites.length ? favourites[index] : undefined;
  });

  protected readonly activeDescendantId = computed(() => {
    if (this.isSearchModeActive()) {
      return this.selectedSearchResult() ? `cmdk-item-search-${this.selectedIndex()}` : null;
    }
    const recent = this.selectedRecent();
    if (recent) {
      return `cmdk-item-recent-${recent.providerKey}-${recent.resultId}`;
    }
    const favourite = this.selectedFavourite();
    if (favourite) {
      return `cmdk-item-favourite-${favourite.id}`;
    }
    return this.selectedCommand() ? `cmdk-item-${this.selectedCommand()!.id}` : null;
  });

  protected readonly searchInputLabel = computed(() =>
    this.isSearchModeActive() ? this.labels().searchPlaceholderActive : this.labels().searchPlaceholderDefault,
  );

  constructor() {
    const onOpenShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    };
    this.document.addEventListener('keydown', onOpenShortcut);
    inject(DestroyRef).onDestroy(() =>
      this.document.removeEventListener('keydown', onOpenShortcut),
    );
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchDebounceTimer));

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });

    effect(() => {
      const count = this.isSearchModeActive()
        ? (this.searchResults()?.length ?? 0)
        : this.visibleRecents().length +
          this.flatMatches().length +
          this.visibleFavourites().length;
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
    this.settingsOpen.set(false);
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
        const matchedProvider = this.searchProviders().find(
          (p) => p.key.toLowerCase() === candidateKey,
        );
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
    this.selectedIndex.set(0);
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
            this.runSearchResult(result, this.searchRegistry.providerKeyFor(result));
          }
        } else {
          const recent = this.selectedRecent();
          if (recent) {
            this.runRecentEntry(recent);
          } else {
            const favourite = this.selectedFavourite();
            if (favourite) {
              this.runFavourite(favourite);
            } else {
              const command = this.selectedCommand();
              if (command) {
                this.runSelectedCommand(command);
              }
            }
          }
        }
        break;
      }
      case 'Backspace':
        if (this.scopedProviderKey() !== null && this.query() === '') {
          event.preventDefault();
          this.scopedProviderKey.set(null);
          this.selectedIndex.set(0);
        }
        break;
      case ',':
        if (this.canOpenSettings()) {
          event.preventDefault();
          this.settingsOpen.set(true);
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
        } else {
          const favouriteMatch = this.favouriteShortcuts().find(({ parsed }) =>
            matchesShortcut(event, parsed),
          );
          if (favouriteMatch) {
            event.preventDefault();
            this.runFavourite(favouriteMatch.favourite);
          }
        }
      }
    }
  }

  protected runSelectedCommand(command: ResolvedCommand): void {
    this.registry.execute(command);
    this.close();
  }

  protected runSearchResult(result: SearchResult, providerKey: string | undefined): void {
    if (providerKey) {
      this.recentSearches.record(providerKey, result);
    }
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

  // Unlike runSearchResult/runFavourite, this never calls close() on failure: the entry's
  // provider may no longer be registered, or the entry may point at content that no longer
  // resolves, and forcing the palette shut would hide that from a user who can otherwise just
  // try a different result.
  protected runRecentEntry(entry: RecentSearchEntry): void {
    const myGeneration = this.searchGeneration;
    const provider = this.searchRegistry.providers().find((p) => p.key === entry.providerKey);
    if (!provider?.resolve) {
      this.reportRecentResolveFailure(entry);
      return;
    }
    provider.resolve(entry.resultId).then(
      (result) => {
        if (myGeneration !== this.searchGeneration) {
          return;
        }
        if (!result) {
          this.reportRecentResolveFailure(entry);
          return;
        }
        this.runSearchResult(result, entry.providerKey);
      },
      (error) => {
        if (myGeneration !== this.searchGeneration) {
          return;
        }
        this.reportRecentResolveFailure(entry, error);
      },
    );
  }

  protected runFavourite(favourite: FavouriteEntry): void {
    const navigate = this.config.navigate;
    if (!navigate) {
      console.error(
        `Favourite "${favourite.label}" could not navigate: no "navigate" callback configured via provideCmdk()`,
      );
      this.issues.report({
        source: 'favourite-navigate',
        label: favourite.label,
        path: favourite.path,
        error: new Error('No "navigate" callback configured via provideCmdk()'),
      });
      this.close();
      return;
    }
    try {
      const outcome = navigate(favourite.path);
      if (outcome instanceof Promise) {
        outcome.catch((error) => {
          console.error(`Favourite "${favourite.label}" failed to navigate:`, error);
          this.issues.report({
            source: 'favourite-navigate',
            label: favourite.label,
            path: favourite.path,
            error,
          });
        });
      }
    } catch (error) {
      console.error(`Favourite "${favourite.label}" failed to navigate:`, error);
      this.issues.report({
        source: 'favourite-navigate',
        label: favourite.label,
        path: favourite.path,
        error,
      });
    }
    this.close();
  }

  private reportRecentResolveFailure(entry: RecentSearchEntry, error?: unknown): void {
    console.error(`Recent search "${entry.label}" could not be resolved:`, error);
    this.issues.report({
      source: 'recent-resolve',
      providerKey: entry.providerKey,
      resultId: entry.resultId,
      error,
    });
    this.recentSearches.removeEntry(entry.providerKey, entry.resultId);
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
    const count = this.isSearchModeActive()
      ? (this.searchResults()?.length ?? 0)
      : this.visibleRecents().length + this.flatMatches().length + this.visibleFavourites().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
}
