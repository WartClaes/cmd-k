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
});
