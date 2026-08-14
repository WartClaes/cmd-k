import { Component, DestroyRef, inject } from '@angular/core';
import { CommandRegistryService } from 'ngx-cmdk';
import { DemoActivityLog } from './demo-activity-log';

@Component({
  selector: 'app-demo-actions',
  imports: [],
  templateUrl: './demo-actions.html',
})
export class DemoActions {
  private readonly registry = inject(CommandRegistryService);
  private readonly log = inject(DemoActivityLog);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const unregisterAlert = this.registry.register({
      id: 'demo-show-alert',
      label: 'Show Alert',
      group: 'Actions',
      icon: 'demo-icon-alert',
      shortcut: 'mod+j',
      execute: () => {
        this.log.log('Show Alert executed');
        window.alert('Hello from the command palette!');
      },
    });

    const unregisterError = this.registry.register({
      id: 'demo-cause-error',
      label: 'Cause Error',
      group: 'Actions',
      execute: () => {
        throw new Error('Intentional demo error');
      },
    });

    this.destroyRef.onDestroy(() => {
      unregisterAlert();
      unregisterError();
    });
  }
}
