import { Component, inject, signal } from '@angular/core';
import { CmdkPaletteComponent } from 'ngx-cmdk';
import { ApiReference } from './api-reference';
import { demoNavigateTarget } from './app.config';
import { DemoActivityLog } from './demo-activity-log';
import { DemoActions } from './demo-actions';
import { DemoNav } from './demo-nav';
import { DemoSearch } from './demo-search';
import { DocCodeBlock } from './doc-code-block';

@Component({
  selector: 'app-root',
  imports: [CmdkPaletteComponent, DemoActions, DemoNav, DemoSearch, ApiReference, DocCodeBlock],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly log = inject(DemoActivityLog);

  protected readonly darkMode = signal(false);

  protected toggleDarkMode(): void {
    this.darkMode.update((dark) => !dark);
  }

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

  constructor() {
    demoNavigateTarget.current = (path) => this.log.log(`Navigated to "${path}"`);
  }
}
