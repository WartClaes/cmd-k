import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { SearchRegistryService } from './search-registry';
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
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = isMacPlatform(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;

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

  constructor() {
    const onOpenShortcut = (event: KeyboardEvent) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    };
    this.document.addEventListener('keydown', onOpenShortcut);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('keydown', onOpenShortcut));

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });

    effect(() => {
      const count = this.flatMatches().length;
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
    this.isOpen.set(true);
  }

  protected close(): void {
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
  }

  protected selectProviderScope(key: string): void {
    this.scopedProviderKey.set(key);
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
        const command = this.selectedCommand();
        if (command) {
          this.runSelected(command);
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
        // The search input is the panel's only focusable element, so trapping focus
        // just means keeping it there — there's nowhere else inside the panel to move to.
        event.preventDefault();
        this.searchInput()?.nativeElement.focus();
        break;
      default: {
        const command = this.registry.matchShortcut(event);
        if (command) {
          event.preventDefault();
          this.runSelected(command);
        }
      }
    }
  }

  protected runSelected(command: ResolvedCommand): void {
    this.registry.execute(command);
    this.close();
  }

  private moveSelection(delta: number): void {
    const count = this.flatMatches().length;
    if (count === 0) {
      return;
    }
    const next = (this.selectedIndex() + delta + count) % count;
    this.selectedIndex.set(next);
  }
}
