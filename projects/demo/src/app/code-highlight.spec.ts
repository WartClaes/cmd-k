import { highlightCode } from './code-highlight';

describe('highlightCode', () => {
  it('tokenizes a keyword as tok-keyword', () => {
    const tokens = highlightCode('const x = 1;');
    expect(tokens.find((t) => t.text === 'const')?.className).toBe('tok-keyword');
  });

  it('tokenizes a line comment as tok-comment', () => {
    const tokens = highlightCode('// hello world\nconst x = 1;');
    expect(tokens[0]).toEqual({ text: '// hello world', className: 'tok-comment' });
  });

  it('tokenizes a string literal as tok-string', () => {
    const tokens = highlightCode(`const x = 'hello';`);
    expect(tokens.find((t) => t.text === "'hello'")?.className).toBe('tok-string');
  });

  it('tokenizes a capitalized identifier as tok-type', () => {
    const tokens = highlightCode('const x: Signal<Command>;');
    expect(tokens.find((t) => t.text === 'Signal')?.className).toBe('tok-type');
    expect(tokens.find((t) => t.text === 'Command')?.className).toBe('tok-type');
  });

  it('tokenizes a number as tok-string', () => {
    const tokens = highlightCode('const x = 5000;');
    expect(tokens.find((t) => t.text === '5000')?.className).toBe('tok-string');
  });

  it('tokenizes unmatched text as tok-base', () => {
    const tokens = highlightCode('foo.bar()');
    expect(tokens.every((t) => t.className === 'tok-base')).toBe(true);
  });

  it('reconstructs the original code when all token text is concatenated', () => {
    const code = `interface Command {\n  label: string; // static\n}`;
    const tokens = highlightCode(code);
    expect(tokens.map((t) => t.text).join('')).toBe(code);
  });
});
