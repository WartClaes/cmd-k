import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CMDK_CONFIG } from '../config/cmdk-config';
import { CmdkLabelsService } from '../config/cmdk-labels';
import { FavouritesService, MAX_FAVOURITE_ENTRIES } from '../favourites/favourites';
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
  protected readonly labels = inject(CmdkLabelsService).labels;
  protected readonly maxFavourites = MAX_FAVOURITE_ENTRIES;

  readonly close = output<void>();

  protected readonly labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');
  protected readonly settingsRoot = viewChild<ElementRef<HTMLElement>>('settingsRoot');
  protected readonly newLabel = signal('');
  protected readonly newPath = signal('');
  protected readonly justClearedRecentSearches = signal(false);

  protected readonly showFavouritesSection = computed(() => this.config.favouritesStorageKey?.() != null);
  protected readonly showRecentSearchesSection = computed(() => this.config.recentSearchesStorageKey?.() != null);
  protected readonly canSubmit = computed(() => this.newLabel().trim().length > 0 && this.newPath().trim().length > 0);
  protected readonly favouritesLimitMessage = computed(() =>
    this.labels().favouritesLimitReached.replace('%max%', String(MAX_FAVOURITE_ENTRIES)),
  );

  constructor() {
    effect(() => {
      this.labelInput()?.nativeElement.focus();
    });

    // Any favourite mutation (remove / moveUp / moveDown / add), or clicking "Clear recent
    // searches" (which removes that button once the section swaps to a confirmation message),
    // can destroy whichever element currently holds focus. When the browser detaches a focused
    // node, it reverts `document.activeElement` to `document.body` — from which neither this
    // panel's nor the parent palette's (keydown) handler can ever receive another keystroke.
    // This must be `afterRenderEffect` rather than a plain `effect()`: a plain effect is flushed
    // as soon as the signal changes, which happens *before* the template's own structural update
    // (the row/add-row/button removal) has actually been applied to the DOM — so checking
    // `document.activeElement` there would still see the about-to-be-removed element and wrongly
    // conclude focus is fine. `afterRenderEffect` runs after the DOM has actually been patched,
    // so if focus was kicked out to `document.body` by that removal, this reliably observes it
    // and falls back to focusing the panel root (a valid, always-present keyboard target) instead
    // of leaving keyboard interaction permanently dead.
    afterRenderEffect(() => {
      this.favouritesService.favourites();
      this.justClearedRecentSearches();
      this.refocusPanelIfFocusWasLost();
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
    this.justClearedRecentSearches.set(true);
  }

  /**
   * If the currently focused element was just removed from the DOM (browser reverts focus to
   * `document.body` in that case), fall back to focusing the panel root so Escape/"," keep
   * working.
   */
  private refocusPanelIfFocusWasLost(): void {
    const root = this.settingsRoot()?.nativeElement;
    if (!root) {
      return;
    }
    if (!root.contains(document.activeElement)) {
      root.focus();
    }
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
