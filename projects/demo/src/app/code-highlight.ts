import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

export type CodeLanguage = 'typescript' | 'bash' | 'xml';

/**
 * Syntax-highlights a code snippet, returning an HTML string with highlight.js's `hljs-*`
 * class names (styled in doc-code-block.css against this app's own design tokens, not
 * highlight.js's bundled themes). Uses `highlight.js/lib/core` with only the three languages
 * this demo actually needs registered, rather than the full ~190-language bundle. Explicit
 * `language` rather than `highlightAuto()` — auto-detection is unreliable on snippets this
 * short (e.g. "npm install ngx-cmdk" gets misdetected as CMake).
 */
export function highlightCode(code: string, language: CodeLanguage): string {
  return hljs.highlight(code, { language }).value;
}
