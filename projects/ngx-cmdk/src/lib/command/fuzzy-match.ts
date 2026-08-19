import { resolveLabel, type Command } from './command.model';

export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) {
    return 0;
  }

  let score = 0;
  let textIndex = 0;
  let consecutive = 0;

  for (const char of q) {
    const foundAt = t.indexOf(char, textIndex);
    if (foundAt === -1) {
      return null;
    }
    consecutive = foundAt === textIndex ? consecutive + 1 : 1;
    score += 1 + consecutive;
    if (foundAt === 0 || t[foundAt - 1] === ' ') {
      score += 2;
    }
    textIndex = foundAt + 1;
  }

  score += Math.max(0, 10 - (t.length - q.length));
  return score;
}

export function fuzzySearch<T extends Pick<Command, 'label' | 'keywords'>>(
  query: string,
  items: readonly T[],
): FuzzyMatch<T>[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return items.map((item) => ({ item, score: 0 }));
  }

  const matches: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const label = resolveLabel(item);
    const scores = [fuzzyScore(trimmed, label), ...(item.keywords ?? []).map((k) => fuzzyScore(trimmed, k))].filter(
      (s): s is number => s !== null,
    );
    if (scores.length > 0) {
      matches.push({ item, score: Math.max(...scores) });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
