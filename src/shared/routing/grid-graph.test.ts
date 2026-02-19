import { describe, it, expect } from 'vitest';
import {
  DIR_E, DIR_SE, DIR_S, DIR_W, DIR_N, DIR_NE,
  DIR_COUNT, DIR_DELTA,
  getAllowedDirections,
  isRoutable,
  isPassable,
  stateKey,
  chebyshevDistance,
} from './grid-graph.ts';
import { GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from '../grid/constants.ts';
import { createOccupancyGrid } from '../grid/occupancy.ts';

describe('DIR_DELTA', () => {
  it('has 8 entries', () => {
    expect(DIR_DELTA.length).toBe(DIR_COUNT);
  });

  it('E moves right', () => {
    expect(DIR_DELTA[DIR_E]).toEqual([1, 0]);
  });

  it('SE moves right and down', () => {
    expect(DIR_DELTA[DIR_SE]).toEqual([1, 1]);
  });

  it('W moves left', () => {
    expect(DIR_DELTA[DIR_W]).toEqual([-1, 0]);
  });

  it('N moves up', () => {
    expect(DIR_DELTA[DIR_N]).toEqual([0, -1]);
  });
});

describe('getAllowedDirections', () => {
  it('returns current + two 45-degree neighbors', () => {
    const dirs = getAllowedDirections(DIR_E);
    expect(dirs).toContain(DIR_E);
    expect(dirs).toContain(DIR_NE);
    expect(dirs).toContain(DIR_SE);
    expect(dirs.length).toBe(3);
  });

  it('disallows 90-degree turns from E', () => {
    const dirs = getAllowedDirections(DIR_E);
    expect(dirs).not.toContain(DIR_N);
    expect(dirs).not.toContain(DIR_S);
  });

  it('wraps around from NE to E and N', () => {
    const dirs = getAllowedDirections(DIR_NE);
    expect(dirs).toContain(DIR_NE);
    expect(dirs).toContain(DIR_E);  // DIR_NE - 1 = DIR_E (wraps: (7+7)%8 = 6 = DIR_N)
    expect(dirs).toContain(DIR_N);
  });

  it('wraps around from E to NE and SE', () => {
    const dirs = getAllowedDirections(DIR_E);
    // (0+7)%8 = 7 = DIR_NE, (0+1)%8 = 1 = DIR_SE
    expect(dirs).toContain(DIR_NE);
    expect(dirs).toContain(DIR_SE);
  });
});

describe('isRoutable', () => {
  it('allows cells in playable area', () => {
    expect(isRoutable(PLAYABLE_START, 0)).toBe(true);
    expect(isRoutable(PLAYABLE_END, GRID_ROWS - 1)).toBe(true);
    expect(isRoutable(30, 18)).toBe(true);
  });

  it('rejects cells in meter zones', () => {
    // Left meter zone: 0-5
    expect(isRoutable(0, 0)).toBe(false);
    expect(isRoutable(5, 18)).toBe(false);
    // Right meter zone: 60-65
    expect(isRoutable(60, 10)).toBe(false);
    expect(isRoutable(65, 0)).toBe(false);
  });

  it('rejects cells outside grid bounds', () => {
    expect(isRoutable(30, -1)).toBe(false);
    expect(isRoutable(30, GRID_ROWS)).toBe(false);
  });
});

describe('isPassable', () => {
  it('returns true for unoccupied routable cell', () => {
    const grid = createOccupancyGrid();
    expect(isPassable(10, 5, grid)).toBe(true);
  });

  it('returns false for occupied cell', () => {
    const grid = createOccupancyGrid();
    grid[10][5] = true;
    expect(isPassable(10, 5, grid)).toBe(false);
  });

  it('returns false for non-routable cell', () => {
    const grid = createOccupancyGrid();
    expect(isPassable(0, 0, grid)).toBe(false);
  });
});

describe('stateKey', () => {
  it('produces unique keys for different states', () => {
    const keys = new Set<number>();
    // Sample a range of states and verify uniqueness
    for (let col = PLAYABLE_START; col <= PLAYABLE_END; col += 5) {
      for (let row = 0; row < GRID_ROWS; row += 5) {
        for (let dir = 0; dir < DIR_COUNT; dir++) {
          keys.add(stateKey(col, row, dir));
        }
      }
    }
    // If all unique, set size matches iteration count
    const expectedCount = Math.ceil((PLAYABLE_END - PLAYABLE_START + 1) / 5)
      * Math.ceil(GRID_ROWS / 5) * DIR_COUNT;
    expect(keys.size).toBe(expectedCount);
  });

  it('differentiates direction at same position', () => {
    expect(stateKey(10, 5, DIR_E)).not.toBe(stateKey(10, 5, DIR_W));
  });
});

describe('chebyshevDistance', () => {
  it('returns 0 for same point', () => {
    expect(chebyshevDistance(5, 5, 5, 5)).toBe(0);
  });

  it('returns horizontal distance for horizontal path', () => {
    expect(chebyshevDistance(3, 5, 10, 5)).toBe(7);
  });

  it('returns max of deltas for diagonal path', () => {
    expect(chebyshevDistance(3, 3, 8, 6)).toBe(5); // max(5, 3)
  });
});
