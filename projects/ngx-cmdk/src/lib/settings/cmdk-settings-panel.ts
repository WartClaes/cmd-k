import { Component, ElementRef, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { FavouritesService } from '../favourites/favourites';
import { RecentSearchesService } from '../search/recent-searches';

@Component({
  selector: 'ngx-cmdk-settings-panel',
  imports: [],
  templateUrl: './cmdk-settings-panel.html',
  styleUrl: './cmdk-settings-panel.css',
})
export class CmdkSettingsPanelComponent {
  private readonly config = inject(CMDK_CONFIG);
  protected readonly favouritesService = inject(FavouritesService);
  protected readonly recentSearches = inject(RecentSearchesService);

  readonly close = output<void>();

  protected readonly labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');
  protected readonly newLabel = signal('');
  protected readonly newPath = signal('');

  protected readonly showFavouritesSection = computed(() => this.config.favouritesStorageKey?.() != null);
  protected readonly showRecentSearchesSection = computed(() => this.config.recentSearchesStorageKey?.() != null);
  protected readonly canSubmit = computed(() => this.newLabel().trim().length > 0 && this.newPath().trim().length > 0);

  constructor() {
    effect(() => {
      this.labelInput()?.nativeElement.focus();
    });
  }

  protected submitAdd(): void {
    if (!this.canSubmit()) {
      return;
    }
    this.favouritesService.add(this.newLabel(), this.newPath());
    this.newLabel.set('');
    this.newPath.set('');
    this.labelInput()?.nativeElement.focus();
  }

  protected clearRecentSearches(): void {
    this.recentSearches.clear();
  }

  protected onKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close.emit();
      return;
    }
    const isTextInput = (event.target as HTMLElement).tagName === 'INPUT';
    if (event.key === ',' && !isTextInput) {
      event.preventDefault();
      this.close.emit();
    }
  }
}
