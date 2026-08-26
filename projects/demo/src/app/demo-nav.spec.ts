import { TestBed } from '@angular/core/testing';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoNav } from './demo-nav';

describe('DemoNav', () => {
  it('registers navigation commands and updates activeSection when executed', () => {
    TestBed.configureTestingModule({ imports: [DemoNav] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoNav);
    fixture.detectChanges();
    const commandA = registry.commands().find((c) => c.id === 'demo-go-section-a');
    commandA?.execute();
    expect(fixture.componentInstance['activeSection']()).toBe('A');
  });

  it('unregisters its commands when destroyed', () => {
    TestBed.configureTestingModule({ imports: [DemoNav] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoNav);
    fixture.detectChanges();
    fixture.destroy();
    const ids = registry.commands().map((c) => c.id);
    expect(ids).not.toEqual(expect.arrayContaining(['demo-go-section-a', 'demo-go-section-b']));
  });
});
