import { Component, inject } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { ApiReference } from './api-reference';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav, ApiReference],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);

  protected readonly installSnippet = 'npm install ngx-cmdk';

  protected readonly providerSnippet = `providers: [provideCmdk()]`;

  protected readonly templateSnippet = '<ngx-cmdk-palette />';

  protected readonly registerSnippet = `constructor() {
  const registry = inject(CommandRegistryService);
  registry.register({
    label: 'Go to Settings',
    shortcut: 'mod+s',
    execute: () => { this.router.navigate(['/settings']); },
  });
}`;
}
