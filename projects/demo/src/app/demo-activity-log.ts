import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DemoActivityLog {
  private readonly entries = signal<string[]>([]);

  readonly recent = this.entries;

  log(message: string): void {
    this.entries.update((entries) => [message, ...entries].slice(0, 10));
  }
}
