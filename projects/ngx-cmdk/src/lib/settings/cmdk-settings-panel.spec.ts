import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CmdkSettingsPanelComponent } from './cmdk-settings-panel';
import { provideCmdk } from '../config/cmdk-config';
import { FavouritesService } from '../favourites/favourites';
import { RecentSearchesService } from '../search/recent-searches';

describe('CmdkSettingsPanelComponent', () => {
  let fixture: ComponentFixture<CmdkSettingsPanelComponent>;
  let favouritesService: FavouritesService;
  let recentSearches: RecentSearchesService;

  function setup(config: Parameters<typeof provideCmdk>[0]): void {
    TestBed.configureTestingModule({
      imports: [CmdkSettingsPanelComponent],
      providers: [provideCmdk(config)],
    });
    fixture = TestBed.createComponent(CmdkSettingsPanelComponent);
    document.body.appendChild(fixture.nativeElement);
    favouritesService = TestBed.inject(FavouritesService);
    recentSearches = TestBed.inject(RecentSearchesService);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.nativeElement.remove();
    localStorage.clear();
  });

  it('renders neither section with no storage keys configured', () => {
    setup({});
    expect(fixture.nativeElement.textContent).not.toContain('Favourites');
    expect(fixture.nativeElement.textContent).not.toContain('Recent searches');
  });

  it('renders only the Favourites section when favouritesStorageKey is configured', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    expect(fixture.nativeElement.textContent).toContain('Favourites');
    expect(fixture.nativeElement.textContent).not.toContain('Recent searches');
  });

  it('renders only the Recent searches section when recentSearchesStorageKey is configured', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    expect(fixture.nativeElement.textContent).not.toContain('Favourites');
    expect(fixture.nativeElement.textContent).toContain('Recent searches');
  });

  it('renders both sections when both keys are configured', () => {
    setup({ favouritesStorageKey: () => 'favs', recentSearchesStorageKey: () => 'recents' });
    expect(fixture.nativeElement.textContent).toContain('Favourites');
    expect(fixture.nativeElement.textContent).toContain('Recent searches');
  });

  it('focuses the Label input on creation', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const labelInput = fixture.nativeElement.querySelector('input[placeholder="Label"]');
    expect(document.activeElement).toBe(labelInput);
  });

  it('renders existing favourites as read-only rows', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('Production orders', '/production-orders');
    fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('.cmdk-settings-row .cmdk-settings-input');
    expect(inputs[0].value).toBe('Production orders');
    expect(inputs[1].value).toBe('/production-orders');
    expect(inputs[0].readOnly).toBe(true);
  });

  it('the add button is disabled until both Label and Path are filled in', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-add-button');
    expect(addButton.disabled).toBe(true);

    labelInput.value = 'New favourite';
    labelInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(addButton.disabled).toBe(true);

    pathInput.value = '/new';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(addButton.disabled).toBe(false);
  });

  it('submitting the add form adds a favourite and clears the inputs', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    labelInput.value = 'New favourite';
    labelInput.dispatchEvent(new Event('input'));
    pathInput.value = '/new';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cmdk-settings-add-button').click();
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['New favourite']);
    const [labelAfter, pathAfter] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    expect(labelAfter.value).toBe('');
    expect(pathAfter.value).toBe('');
  });

  it('pressing Enter in the Path input submits the add form', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    labelInput.value = 'New favourite';
    labelInput.dispatchEvent(new Event('input'));
    pathInput.value = '/new';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    pathInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['New favourite']);
  });

  it('replaces the add row with a limit message once 9 favourites exist', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    for (let i = 0; i < 9; i++) {
      favouritesService.add(`Item ${i}`, `/item-${i}`);
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-settings-add-row')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Maximum of 9 favourites reached');
  });

  it('clicking a remove button removes that favourite', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    favouritesService.add('Second', '/second');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cmdk-settings-remove-button').click();
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['Second']);
  });

  it('the move-up and move-down buttons carry distinct, correctly-assigned aria-labels', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    fixture.detectChanges();

    // Row order is [move-up, move-down] (see the "clicking move-up/move-down reorders
    // favourites" test below). Assert aria-label by *functional* position — clicking the
    // "Move up" button actually moves up — rather than merely that both label strings exist
    // somewhere in the DOM, which would not catch the two aria-label bindings being swapped.
    const moveButtons = fixture.nativeElement.querySelectorAll('.cmdk-settings-move-button');
    expect(moveButtons[0].getAttribute('aria-label')).toBe('Move up');
    expect(moveButtons[1].getAttribute('aria-label')).toBe('Move down');

    const byLabel = fixture.nativeElement.querySelector('[aria-label="Move up"]');
    const byLabelDown = fixture.nativeElement.querySelector('[aria-label="Move down"]');
    expect(byLabel).toBe(moveButtons[0]);
    expect(byLabelDown).toBe(moveButtons[1]);
  });

  it('the remove button has aria-label "Remove favourite"', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    fixture.detectChanges();

    const removeButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-remove-button');
    expect(removeButton.getAttribute('aria-label')).toBe('Remove favourite');
  });

  it('the add button has aria-label "Add favourite"', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const addButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-add-button');
    expect(addButton.getAttribute('aria-label')).toBe('Add favourite');
  });

  it('the Path input has placeholder "Path"', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const pathInput: HTMLInputElement = fixture.nativeElement.querySelector('input[placeholder="Path"]');
    expect(pathInput).not.toBeNull();
  });

  it('clicking move-up/move-down reorders favourites', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    favouritesService.add('Second', '/second');
    fixture.detectChanges();

    const moveButtons = fixture.nativeElement.querySelectorAll('.cmdk-settings-move-button');
    // Row order is [row1-up, row1-down, row2-up, row2-down]; index 2 is Second's move-up.
    moveButtons[2].click();
    fixture.detectChanges();

    expect(favouritesService.favourites().map((f) => f.label)).toEqual(['Second', 'First']);
  });

  it('clicking "Clear recent searches" clears RecentSearchesService', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    fixture.detectChanges();
    expect(recentSearches.recent()).toHaveLength(1);

    const clearButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-clear-button');
    expect(clearButton.textContent).toContain('Clear recent searches');
    clearButton.click();

    expect(recentSearches.recent()).toEqual([]);
  });

  it('shows "No recent searches found." when there are none, instead of an empty section', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    expect(fixture.nativeElement.querySelector('.cmdk-settings-clear-button')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No recent searches found.');
  });

  it('hides the "No recent searches found." message once there is something to clear', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('No recent searches found.');
    expect(fixture.nativeElement.querySelector('.cmdk-settings-clear-button')).not.toBeNull();
  });

  it('shows a confirmation and hides the button after clicking "Clear recent searches"', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cmdk-settings-clear-button').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.cmdk-settings-clear-button')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Recent searches cleared.');
    expect(fixture.nativeElement.textContent).not.toContain('No recent searches found.');
  });

  it('pressing Escape emits close', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    fixture.nativeElement.querySelector('.cmdk-settings').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(closeSpy).toHaveBeenCalled();
  });

  it('pressing "," outside a text input emits close', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    const closeButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-close-button');
    expect(closeButton.textContent).toContain('CLOSE SETTINGS');
    closeButton.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));

    expect(closeSpy).toHaveBeenCalled();
  });

  it('pressing "," while focused in the Label input types a comma instead of closing', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    const labelInput = fixture.nativeElement.querySelector('input[placeholder="Label"]');
    labelInput.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true }));

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('remains keyboard-reachable after removing a favourite below the 9-cap (focus is not stranded on document.body)', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    favouritesService.add('First', '/first');
    favouritesService.add('Second', '/second');
    fixture.detectChanges();

    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    const removeButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-remove-button');
    removeButton.focus();
    expect(document.activeElement).toBe(removeButton);

    removeButton.click();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement.querySelector('.cmdk-settings');
    // The clicked remove button's row (and the button itself) is now destroyed. Assert focus
    // landed somewhere *inside the panel root* — not merely "somewhere" — proving it wasn't
    // stranded on document.body.
    expect(document.activeElement).not.toBe(document.body);
    expect(root.contains(document.activeElement)).toBe(true);

    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  it('remains keyboard-reachable after adding the 9th favourite destroys the add-row (and its focused Label input)', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    for (let i = 0; i < 8; i++) {
      favouritesService.add(`Item ${i}`, `/item-${i}`);
    }
    fixture.detectChanges();

    const [labelInput, pathInput] = fixture.nativeElement.querySelectorAll('.cmdk-settings-add-row .cmdk-settings-input');
    labelInput.value = 'Ninth';
    labelInput.dispatchEvent(new Event('input'));
    pathInput.value = '/ninth';
    pathInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.cmdk-settings-add-button').click();
    fixture.detectChanges();

    expect(favouritesService.favourites()).toHaveLength(9);
    expect(fixture.nativeElement.querySelector('.cmdk-settings-add-row')).toBeNull();

    const root: HTMLElement = fixture.nativeElement.querySelector('.cmdk-settings');
    expect(document.activeElement).not.toBe(document.body);
    expect(root.contains(document.activeElement)).toBe(true);

    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  it('remains keyboard-reachable after clicking "Clear recent searches" destroys the focused button', () => {
    setup({ recentSearchesStorageKey: () => 'recents' });
    recentSearches.record('fruits', { label: 'Apple', resultId: 'apple', execute: () => {} });
    fixture.detectChanges();

    const closeSpy = vi.fn();
    fixture.componentInstance.close.subscribe(closeSpy);

    const clearButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cmdk-settings-clear-button');
    clearButton.focus();
    expect(document.activeElement).toBe(clearButton);

    clearButton.click();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement.querySelector('.cmdk-settings');
    expect(document.activeElement).not.toBe(document.body);
    expect(root.contains(document.activeElement)).toBe(true);

    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  it('a keydown inside the panel does not bubble to ancestors outside it', () => {
    setup({ favouritesStorageKey: () => 'favs' });
    const outerHandler = vi.fn();
    document.body.addEventListener('keydown', outerHandler);
    try {
      fixture.nativeElement.querySelector('.cmdk-settings').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      expect(outerHandler).not.toHaveBeenCalled();
    } finally {
      document.body.removeEventListener('keydown', outerHandler);
    }
  });

  describe('labels', () => {
    it('renders an overridden label in place of its English default', () => {
      setup({ favouritesStorageKey: () => 'favs', labels: () => ({ closeSettings: 'FERMER' }) });

      expect(fixture.nativeElement.textContent).toContain('FERMER');
      expect(fixture.nativeElement.textContent).not.toContain('CLOSE SETTINGS');
    });

    it('substitutes %max% in an overridden favourites-limit message with the actual cap', () => {
      setup({
        favouritesStorageKey: () => 'favs',
        labels: () => ({ favouritesLimitReached: 'Cap of %max% hit.' }),
      });
      for (let i = 0; i < 9; i++) {
        favouritesService.add(`Item ${i}`, `/item-${i}`);
      }
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Cap of 9 hit.');
      expect(fixture.nativeElement.textContent).not.toContain('%max%');
    });
  });
});
