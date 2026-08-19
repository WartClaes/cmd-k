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
    expect(recentSearches.recent()).toHaveLength(1);

    fixture.nativeElement.querySelector('.cmdk-settings-clear-button').click();

    expect(recentSearches.recent()).toEqual([]);
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

    fixture.nativeElement.querySelector('.cmdk-settings-close-button').dispatchEvent(
      new KeyboardEvent('keydown', { key: ',', bubbles: true }),
    );

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
});
