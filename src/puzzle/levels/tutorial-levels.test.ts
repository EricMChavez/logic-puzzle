import { describe, it, expect } from 'vitest';
import { PUZZLE_LEVELS } from './index';

describe('Puzzle levels', () => {
  it('exports puzzle levels with unique IDs', () => {
    const ids = PUZZLE_LEVELS.map(p => p.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
