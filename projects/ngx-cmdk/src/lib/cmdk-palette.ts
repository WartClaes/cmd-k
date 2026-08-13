import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel, type ResolvedCommand } from './command.model';
import { CMDK_CONFIG } from './cmdk-config';
import { CommandRegistryService } from './command-registry';
import { fuzzySearch } from './fuzzy-match';
import { groupMatches } from './group-matches';
import { matchesShortcut, parseShortcut } from './shortcut';

@Component({
  selector: 'ngx-cmdk-palette',
  imports: [],
  templateUrl: './cmdk-palette.html',
  styleUrl: './cmdk-palette.css',
})
export class CmdkPaletteComponent {
  private readonly registry = inject(CommandRegistryService);
  private readonly config = inject(CMDK_CONFIG);
  private readonly document = inject(DOCUMENT);
  private readonly isMac = /mac/i.test(this.document.defaultView?.navigator.platform ?? '');
  private readonly openShortcut = parseShortcut(this.config.shortcut, this.isMac);
  private previouslyFocused: HTMLElement | null = null;

  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly selectedIndex = signal(0);

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
  protected readonly flatMatches = computed(() => this.groups().flatMap((g) => g.matches));
  protected readonly selectedCommand = computed(() => this.flatMatches()[this.selectedIndex()]?.item);
  protected readonly resolveLabel = resolveLabel;

  constructor() {
    this.document.addEventListener('keydown', (event) => {
      if (matchesShortcut(event, this.openShortcut)) {
        event.preventDefault();
        this.open();
      }
    });

    effect(() => {
      if (this.isOpen()) {
        this.searchInput()?.nativeElement.focus();
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
    this.isOpen.set(true);
  }

  protected close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.isOpen.set(false);
    this.previouslyFocused?.focus();
  }

  protected onQueryChange(value: string): void {
    this.query.set(value);
    this.selectedIndex.set(0);
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
