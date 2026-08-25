import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { type CodeLanguage, highlightCode } from './code-highlight';

@Component({
  selector: 'app-doc-code-block',
  imports: [],
  templateUrl: './doc-code-block.html',
  styleUrl: './doc-code-block.css',
})
export class DocCodeBlock {
  private readonly sanitizer = inject(DomSanitizer);

  readonly label = input<string>('');
  readonly code = input.required<string>();
  readonly language = input<CodeLanguage>('typescript');

  protected readonly copied = signal(false);

  protected readonly highlightedHtml = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(highlightCode(this.code(), this.language())),
  );

  protected copy(): void {
    navigator.clipboard?.writeText(this.code());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }
}
