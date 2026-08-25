export type CodeToken = {
  text: string;
  className: 'tok-comment' | 'tok-string' | 'tok-keyword' | 'tok-type' | 'tok-base';
};

const PATTERN =
  /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b(?:interface|class|function|const|let|var|readonly|extends|implements|import|export|from|return|void|null|undefined|true|false|new|typeof|type|enum|public|private|protected|static|async|await|this)\b)|(\b[A-Z][A-Za-z0-9_]*\b)|(\b\d+(?:\.\d+)?\b)/g;

/**
 * Tokenizes a code snippet for basic syntax highlighting. Pure function — no DOM, no styling
 * decisions beyond picking a CSS class name per token. Ported from the design mockup's regex,
 * with its inline-style color choices translated into CSS class names instead (this codebase
 * uses CSS classes/custom properties for anything class-name-worthy, not JS style objects).
 */
export function highlightCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(PATTERN)) {
    const index = match.index;
    if (index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, index), className: 'tok-base' });
    }

    const [full, comment, string, keyword, type, number] = match;
    if (comment !== undefined) {
      tokens.push({ text: full, className: 'tok-comment' });
    } else if (string !== undefined) {
      tokens.push({ text: full, className: 'tok-string' });
    } else if (keyword !== undefined) {
      tokens.push({ text: full, className: 'tok-keyword' });
    } else if (type !== undefined) {
      tokens.push({ text: full, className: 'tok-type' });
    } else if (number !== undefined) {
      // Numbers reuse the string color, matching the mockup's own choice.
      tokens.push({ text: full, className: 'tok-string' });
    }

    lastIndex = index + full.length;
  }

  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), className: 'tok-base' });
  }

  return tokens;
}
