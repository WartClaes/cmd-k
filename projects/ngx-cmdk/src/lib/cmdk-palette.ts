import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { resolveLabel } from './command.model';
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

  protected readonly results = computed(() => fuzzySearch(this.query(), this.registry.commands()));
  protected readonly groups = computed(() => groupMatches(this.results()));
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
  }
}
