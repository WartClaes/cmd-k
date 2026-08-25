import { Component, computed, input, signal } from '@angular/core';
import { highlightCode } from './code-highlight';

@Component({
  selector: 'app-doc-code-block',
  imports: [],
  templateUrl: './doc-code-block.html',
  styleUrl: './doc-code-block.css',
})
export class DocCodeBlock {
  readonly label = input<string>('');
  readonly code = input.required<string>();

  protected readonly copied = signal(false);

  protected readonly tokens = computed(() => highlightCode(this.code()));

  protected copy(): void {
    navigator.clipboard?.writeText(this.code());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
