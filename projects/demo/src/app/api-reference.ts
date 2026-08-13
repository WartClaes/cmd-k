import { Component } from '@angular/core';

@Component({
  selector: 'app-api-reference',
  imports: [],
  templateUrl: './api-reference.html',
  styleUrl: './api-reference.css',
})
export class ApiReference {
  protected readonly commandSnippet = `interface Command {
  id?: string;                    // auto-generated if omitted
  label: string | (() => string); // static or dynamic label
  execute: () => void | Promise<void>;
  icon?: string;                  // consumer-defined token
  keywords?: string[];            // extra search terms, not displayed
  group?: string;                 // section header, e.g. "Navigation"
  shortcut?: string;              // e.g. "mod+s", "mod+shift+p"
  priority?: number;               // higher sorts first within its group
}`;

  protected readonly registrySnippet = `class CommandRegistryService {
  register(command: Command): () => void;       // returns an unregister fn
  readonly commands: Signal<readonly Command[]>; // all registered, read-only
}`;

  protected readonly provideCmdkSnippet = `function provideCmdk(config?: { shortcut: string }): EnvironmentProviders;

// default shortcut is "mod+k"
providers: [provideCmdk({ shortcut: 'mod+k' })]`;
}
