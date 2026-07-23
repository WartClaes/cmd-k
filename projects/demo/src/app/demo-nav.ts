import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

@Component({
  selector: 'app-demo-nav',
  imports: [],
  templateUrl: './demo-nav.html',
  styleUrl: './demo-nav.css',
})
export class DemoNav {
  private readonly registry = inject(CommandRegistryService);
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeSection = signal('none');

  constructor() {
    const unregisterA = this.registry.register({
      id: 'demo-go-section-a',
      label: 'Go to Section A',
      group: 'Navigation',
      priority: 1,
      execute: () => {
        this.activeSection.set('A');
        this.log.log('Navigated to Section A');
      },
    });

    const unregisterB = this.registry.register({
      id: 'demo-go-section-b',
      label: 'Go to Section B',
      group: 'Navigation',
      execute: () => {
        this.activeSection.set('B');
        this.log.log('Navigated to Section B');
      },
    });

    this.destroyRef.onDestroy(() => {
      unregisterA();
      unregisterB();
    });
  }
}
