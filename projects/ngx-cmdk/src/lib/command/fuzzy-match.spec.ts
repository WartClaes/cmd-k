import { fuzzyScore, fuzzySearch } from './fuzzy-match';
import type { Command } from './command.model';

describe('fuzzyScore', () => {
  it('returns 0 for an empty query', () => {
    expect(fuzzyScore('', 'Go to Settings')).toBe(0);
  });

  it('matches characters in order regardless of contiguity', () => {
    expect(fuzzyScore('gts', 'Go to Settings')).not.toBeNull();
  });

  it('returns null when a query character is missing from the text', () => {
    expect(fuzzyScore('xyz', 'Go to Settings')).toBeNull();
  });

  it('scores a contiguous match higher than a scattered match', () => {
    const contiguous = fuzzyScore('settings', 'Go to Settings')!;
    const scattered = fuzzyScore('gtins', 'Go to Settings')!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('SETTINGS', 'Go to Settings')).toBe(fuzzyScore('settings', 'Go to Settings'));
  });
});

describe('fuzzySearch', () => {
  const commands: Command[] = [
    { label: 'Go to Settings', execute: () => {}, keywords: ['preferences'] },
    { label: 'Create Project', execute: () => {} },
    { label: () => 'Dynamic Label', execute: () => {}, keywords: ['dynamic'] },
  ];

  it('returns all items in original order with score 0 when the query is empty', () => {
    const results = fuzzySearch('', commands);
    expect(results.map((r) => r.item)).toEqual(commands);
    expect(results.every((r) => r.score === 0)).toBe(true);
  });

  it('matches against keywords even when the label does not match', () => {
    const results = fuzzySearch('preferences', commands);
    expect(results).toHaveLength(1);
    expect(results[0].item.label).toBe('Go to Settings');
  });

  it('resolves function labels before matching', () => {
    const results = fuzzySearch('dynamic', commands);
    expect(results).toHaveLength(1);
  });

  it('excludes items that do not match and sorts by score descending', () => {
    const results = fuzzySearch('create', commands);
    expect(results).toHaveLength(1);
    expect(results[0].item.label).toBe('Create Project');
  });
});
