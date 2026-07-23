import { TestBed } from '@angular/core/testing';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoActions } from './demo-actions';

describe('DemoActions', () => {
  it('registers the demo action commands on creation', () => {
    TestBed.configureTestingModule({ imports: [DemoActions] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoActions);
    fixture.detectChanges();
    const ids = registry.commands().map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['demo-show-alert', 'demo-cause-error']));
  });

  it('unregisters its commands when destroyed', () => {
    TestBed.configureTestingModule({ imports: [DemoActions] });
    const registry = TestBed.inject(CommandRegistryService);
    const fixture = TestBed.createComponent(DemoActions);
    fixture.detectChanges();
    fixture.destroy();
    const ids = registry.commands().map((c) => c.id);
    expect(ids).not.toEqual(expect.arrayContaining(['demo-show-alert', 'demo-cause-error']));
  });
});
