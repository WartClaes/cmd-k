import { highlightCode } from './code-highlight';

describe('highlightCode', () => {
  it('wraps a TypeScript keyword in an hljs-keyword span', () => {
    const html = highlightCode('const x = 1;', 'typescript');
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  it('wraps a string literal in an hljs-string span', () => {
    const html = highlightCode(`const x = 'hello';`, 'typescript');
    expect(html).toContain('hljs-string');
    expect(html).toContain('hello');
  });

  it('wraps a line comment in an hljs-comment span', () => {
    const html = highlightCode('const x = 1; // hello', 'typescript');
    expect(html).toContain('<span class="hljs-comment">// hello</span>');
  });

  it('highlights bash without misdetecting the language', () => {
    const html = highlightCode('npm install ngx-cmdk', 'bash');
    expect(html).toContain('npm install ngx-cmdk');
  });

  it('highlights an XML/HTML tag in xml mode', () => {
    const html = highlightCode('<ngx-cmdk-palette />', 'xml');
    expect(html).toContain('hljs-tag');
    expect(html).toContain('ngx-cmdk-palette');
  });

  it('HTML-escapes special characters so the markup stays well-formed', () => {
    const html = highlightCode('const x: Array<string> = [];', 'typescript');
    expect(html).not.toMatch(/<string>/);
  });
});
