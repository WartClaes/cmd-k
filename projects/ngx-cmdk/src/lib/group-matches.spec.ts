import { groupMatches } from './group-matches';
import type { Command } from './command.model';
import type { FuzzyMatch } from './fuzzy-match';

function match(overrides: Partial<Command> = {}): FuzzyMatch<Command> {
  return { item: { label: 'Cmd', execute: () => {}, ...overrides }, score: 0 };
}

describe('groupMatches', () => {
  it('buckets matches under their declared group, preserving first-seen order', () => {
    const groups = groupMatches([
      match({ group: 'Actions', label: 'A' }),
      match({ group: 'Navigation', label: 'B' }),
      match({ group: 'Actions', label: 'C' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Actions', 'Navigation']);
    expect(groups[0].matches.map((m) => m.item.label)).toEqual(['A', 'C']);
  });

  it('buckets ungrouped matches under "Other"', () => {
    const groups = groupMatches([match({ label: 'A' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Other');
    expect(groups[0].matches[0].item.label).toBe('A');
  });

  it('returns an empty array for no matches', () => {
    expect(groupMatches([])).toEqual([]);
  });
});
