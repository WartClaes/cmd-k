import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CmdkPaletteComponent } from './cmdk-palette';
import { CommandRegistryService } from './command-registry';
import { provideCmdk } from './cmdk-config';
import { SearchRegistryService } from './search-registry';

describe('CmdkPaletteComponent', () => {
  let fixture: ComponentFixture<CmdkPaletteComponent>;
  let registry: CommandRegistryService;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
    TestBed.configureTestingModule({
      imports: [CmdkPaletteComponent],
      providers: [provideCmdk({ shortcut: 'mod+k' })],
    });
    fixture = TestBed.createComponent(CmdkPaletteComponent);
    document.body.appendChild(fixture.nativeElement);
    registry = TestBed.inject(CommandRegistryService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.nativeElement.remove();
  });

  function pressOpenShortcut(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, bubbles: true }));
    fixture.detectChanges();
  }

  it('is closed by default', () => {
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('opens when the configured shortcut is pressed', () => {
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).not.toBeNull();
  });

  it('moves focus to the search input when opened', () => {
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    expect(document.activeElement).toBe(input);
  });

  it('lists registered commands grouped by their group name', () => {
    registry.register({ id: 'a', label: 'Show Alert', execute: () => {}, group: 'Actions' });
    registry.register({ id: 'b', label: 'Go Home', execute: () => {}, group: 'Navigation' });
    pressOpenShortcut();
    const groupLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.cmdk-group-label') as NodeListOf<Element>,
    ).map((el) => el.textContent);
    expect(groupLabels).toEqual(['Actions', 'Navigation']);
  });

  it('filters the list as the query changes', () => {
    registry.register({ id: 'a', label: 'Show Alert', execute: () => {} });
    registry.register({ id: 'b', label: 'Go Home', execute: () => {} });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'alert';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.cmdk-item') as NodeListOf<Element>,
    ).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Show Alert']);
  });

  it('closes and restores focus when the backdrop is clicked', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    pressOpenShortcut();
    const overlay: HTMLElement = fixture.nativeElement.querySelector('.cmdk-overlay');
    overlay.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });

  it('selects the first result by default and highlights it', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const selected = fixture.nativeElement.querySelector('.cmdk-item--selected');
    expect(selected?.textContent).toContain('Alpha');
  });

  it('moves the selection down and up with arrow keys', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-item--selected')?.textContent).toContain('Beta');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-item--selected')?.textContent).toContain('Alpha');
  });

  it('executes the selected command and closes on Enter', () => {
    const execute = vi.fn();
    registry.register({ id: 'a', label: 'Alpha', execute });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('closes without executing on Escape', () => {
    const execute = vi.fn();
    registry.register({ id: 'a', label: 'Alpha', execute });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(execute).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('executes a command when it is clicked', () => {
    const execute = vi.fn();
    registry.register({ id: 'a', label: 'Alpha', execute });
    pressOpenShortcut();
    const item: HTMLElement = fixture.nativeElement.querySelector('.cmdk-item');
    item.click();
    fixture.detectChanges();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when no commands match the query', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-empty')).not.toBeNull();
  });

  it('renders a command shortcut hint using the platform symbol', () => {
    registry.register({ id: 'save', label: 'Save', shortcut: 'mod+s', execute: () => {} });
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-shortcut')?.textContent).toBe('⌘S');
  });

  it('executes a registered command shortcut and closes while the overlay is open', () => {
    const execute = vi.fn();
    registry.register({ id: 'save', label: 'Save', shortcut: 'mod+s', execute });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
  });

  it('does not execute a registered command shortcut while the overlay is closed', () => {
    const execute = vi.fn();
    registry.register({ id: 'save', label: 'Save', shortcut: 'mod+s', execute });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', metaKey: true, bubbles: true }));
    fixture.detectChanges();
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps focus on the search input when Tab is pressed, trapping focus in the panel', () => {
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(input);
  });

  it('clamps the selection when a registered command disappears while the overlay is open', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    const unregisterB = registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-item--selected')?.textContent).toContain('Beta');

    unregisterB();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.cmdk-item--selected')?.textContent).toContain('Alpha');
  });

  it('removes the open-shortcut listener when the component is destroyed', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    fixture.destroy();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('does not show a chip row when no search providers are registered', () => {
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).toBeNull();
  });

  it('shows a chip row with a button per registered search provider', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    searchRegistry.register({ key: 'colors', label: 'colors', search: async () => [] });
    pressOpenShortcut();
    const chipLabels = Array.from(
      fixture.nativeElement.querySelectorAll('.cmdk-chip') as NodeListOf<Element>,
    ).map((el) => el.textContent?.trim());
    expect(chipLabels).toEqual(['fruits', 'colors']);
  });

  it('clicking a chip converts it into a scope token and hides the chip row', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')?.textContent).toContain('fruits');
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).toBeNull();
  });

  it('typing "key:" converts the matching provider into a scope token', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'fruits:app';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')?.textContent).toContain('fruits');
    expect(input.value).toBe('app');
  });

  it('does not convert a prefix that matches no registered provider', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'nope:app';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).toBeNull();
  });

  it('Backspace with an empty query and an active token removes the token and restores the chip row', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).not.toBeNull();
  });

  it('Backspace does not remove the token when the query is non-empty', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'app';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).not.toBeNull();
  });

  it('resets scope on reopen', () => {
    const searchRegistry = TestBed.inject(SearchRegistryService);
    searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
    pressOpenShortcut();
    const chip: HTMLElement = fixture.nativeElement.querySelector('.cmdk-chip');
    chip.click();
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-scope-token')).toBeNull();
    expect(fixture.nativeElement.querySelector('.cmdk-chip-row')).not.toBeNull();
  });

  it('backward compatibility: with zero search providers, typing still fuzzy-matches Commands', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    registry.register({ id: 'b', label: 'Beta', execute: () => {} });
    pressOpenShortcut();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const items = Array.from(
      fixture.nativeElement.querySelectorAll('.cmdk-item') as NodeListOf<Element>,
    ).map((el) => el.textContent?.trim());
    expect(items).toEqual(['Alpha']);
  });

  it('shows a loading placeholder, then results, for a query with providers registered', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async (q) => [{ label: `Apple (${q})`, subtitle: '/fruits/apple', execute: () => {} }],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cmdk-empty')?.textContent).toContain('Searching');

      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const items = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-item-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(items).toEqual(['Apple (app)']);
      expect(fixture.nativeElement.querySelector('.cmdk-item-subtitle')?.textContent).toBe('/fruits/apple');
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces rapid keystrokes into a single search() call', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const search = vi.fn(async () => []);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      for (const value of ['a', 'ap', 'app']) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(200);
      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith('app');
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a stale response when a newer query has already resolved', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const search = vi.fn(async (q: string) => {
        if (q === 'slow') {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return [{ label: 'Slow result', execute: () => {} }];
        }
        return [{ label: 'Fast result', execute: () => {} }];
      });
      searchRegistry.register({ key: 'fruits', label: 'fruits', search });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');

      input.value = 'slow';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200); // debounce fires, "slow" search begins

      input.value = 'fast';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200); // debounce fires, "fast" search begins and resolves quickly

      await vi.advanceTimersByTimeAsync(500); // "slow" search's internal delay now elapses too
      fixture.detectChanges();

      const items = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-item-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(items).toEqual(['Fast result']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a generic empty state when a search resolves with no results', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search: async () => [] });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'zzz';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.cmdk-empty')?.textContent).toContain('No results');
    } finally {
      vi.useRealTimers();
    }
  });

  it('executes a selected search result and closes the palette', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const execute = vi.fn();
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [{ label: 'Apple', execute }],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a throwing search result does not crash and still closes the palette', async () => {
    vi.useFakeTimers();
    try {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [
          {
            label: 'Apple',
            execute: () => {
              throw new Error('boom');
            },
          },
        ],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.cmdk-panel');
      expect(() =>
        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
      ).not.toThrow();
      fixture.detectChanges();

      expect(consoleError).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.cmdk-overlay')).toBeNull();
      consoleError.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('scoping to one provider via a chip only queries that provider', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const fruitsSearch = vi.fn(async () => []);
      const colorsSearch = vi.fn(async () => []);
      searchRegistry.register({ key: 'fruits', label: 'fruits', search: fruitsSearch });
      searchRegistry.register({ key: 'colors', label: 'colors', search: colorsSearch });
      pressOpenShortcut();
      const chips = fixture.nativeElement.querySelectorAll('.cmdk-chip') as NodeListOf<HTMLElement>;
      chips[0].click(); // "fruits"
      fixture.detectChanges();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);

      expect(fruitsSearch).toHaveBeenCalledWith('app');
      expect(colorsSearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aria-activedescendant resolves to an existing element in both Commands mode and search mode', async () => {
    vi.useFakeTimers();
    try {
      registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
      pressOpenShortcut();
      let input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      let activeId = input.getAttribute('aria-activedescendant');
      expect(activeId).toBeTruthy();
      expect(fixture.nativeElement.querySelector(`#${activeId}`)).not.toBeNull();

      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [{ label: 'Apple', execute: () => {} }],
      });
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      input = fixture.nativeElement.querySelector('.cmdk-input');
      activeId = input.getAttribute('aria-activedescendant');
      expect(activeId).toBeTruthy();
      expect(fixture.nativeElement.querySelector(`#${activeId}`)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a stale in-flight response when a newer keystroke arrives before the old debounce timer fires', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      const search = vi.fn(async (q: string) => {
        if (q === 'app') {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return [{ label: 'Stale: app', execute: () => {} }];
        }
        return [{ label: 'Fresh: appl', execute: () => {} }];
      });
      searchRegistry.register({ key: 'fruits', label: 'fruits', search });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');

      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200); // debounce fires, "app" search begins (150ms internal delay)

      input.value = 'appl';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // At this point the "app" search is still in flight (resolves at the 150ms mark from when it started).
      // Advance past when "app" would resolve, but before "appl"'s own 200ms debounce fires.
      await vi.advanceTimersByTimeAsync(150);
      fixture.detectChanges();

      // The stale "app" result must NOT have been painted.
      let items = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-item-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(items).not.toContain('Stale: app');

      await vi.advanceTimersByTimeAsync(50); // let "appl"'s debounce fire and its search resolve
      fixture.detectChanges();

      items = Array.from(
        fixture.nativeElement.querySelectorAll('.cmdk-item-label') as NodeListOf<Element>,
      ).map((el) => el.textContent);
      expect(items).toEqual(['Fresh: appl']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders a command icon as a CSS class on an icon span', () => {
    registry.register({ id: 'a', label: 'Alpha', icon: 'icon-star', execute: () => {} });
    pressOpenShortcut();
    const iconEl: HTMLElement = fixture.nativeElement.querySelector('.cmdk-item .cmdk-item-icon');
    expect(iconEl).not.toBeNull();
    expect(iconEl.classList.contains('icon-star')).toBe(true);
    expect(iconEl.textContent).toBe('');
  });

  it('does not render an icon span for a command without an icon', () => {
    registry.register({ id: 'a', label: 'Alpha', execute: () => {} });
    pressOpenShortcut();
    expect(fixture.nativeElement.querySelector('.cmdk-item-icon')).toBeNull();
  });

  it('renders a search result icon as a CSS class on an icon span', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [{ label: 'Apple', icon: 'icon-apple', execute: () => {} }],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      const iconEl: HTMLElement = fixture.nativeElement.querySelector('.cmdk-item .cmdk-item-icon');
      expect(iconEl).not.toBeNull();
      expect(iconEl.classList.contains('icon-apple')).toBe(true);
      expect(iconEl.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not render an icon span for a search result without an icon', async () => {
    vi.useFakeTimers();
    try {
      const searchRegistry = TestBed.inject(SearchRegistryService);
      searchRegistry.register({
        key: 'fruits',
        label: 'fruits',
        search: async () => [{ label: 'Apple', execute: () => {} }],
      });
      pressOpenShortcut();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('.cmdk-input');
      input.value = 'app';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.cmdk-item-icon')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
