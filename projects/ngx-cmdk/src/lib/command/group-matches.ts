import type { Command } from './command.model';
import type { FuzzyMatch } from './fuzzy-match';

export interface CommandGroup<T> {
  name: string;
  matches: FuzzyMatch<T>[];
}

export function groupMatches<T extends Pick<Command, 'group' | 'label'>>(
  matches: readonly FuzzyMatch<T>[],
  ungroupedLabel: string,
): CommandGroup<T>[] {
  const groups = new Map<string, FuzzyMatch<T>[]>();
  for (const match of matches) {
    const name = match.item.group ?? ungroupedLabel;
    const bucket = groups.get(name);
    if (bucket) {
      bucket.push(match);
    } else {
      groups.set(name, [match]);
    }
  }
  return Array.from(groups.entries()).map(([name, groupedMatches]) => ({ name, matches: groupedMatches }));
}
