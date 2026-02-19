import { describe, it, expect } from 'vitest';
import {
  createOccupancyGrid,
  markNodeOccupied,
  clearNodeOccupied,
  recomputeOccupancy,
  canPlaceNode,
  getNodeGridSize,
  NODE_GRID_COLS,
  NODE_GRID_ROWS,
  FUNDAMENTAL_GRID_COLS,
  FUNDAMENTAL_GRID_ROWS,
  UTILITY_GRID_COLS,
  UTILITY_GRID_ROWS,
  PUZZLE_GRID_COLS,
  PUZZLE_MIN_GRID_ROWS,
} from './occupancy.ts';
import { GRID_COLS, GRID_ROWS } from './constants.ts';
import type { ChipState } from '../types/index.ts';

function makeNode(id: string, col: number, row: number, type = 'invert', inputs = 1, outputs = 1): ChipState {
  return { id, type, position: { col, row }, params: {}, socketCount: inputs, plugCount: outputs };
}

describe('createOccupancyGrid', () => {
  it('creates a 66x36 grid of false', () => {
    const grid = createOccupancyGrid();
    expect(grid.length).toBe(GRID_COLS);
    for (let c = 0; c < GRID_COLS; c++) {
      expect(grid[c].length).toBe(GRID_ROWS);
      expect(grid[c].every((v) => v === false)).toBe(true);
    }
  });
});

describe('markNodeOccupied', () => {
  it('marks node bounding box as occupied', () => {
    const grid = createOccupancyGrid();
    const node = makeNode('n1', 5, 3);
    markNodeOccupied(grid, node);

    for (let c = 5; c < 5 + NODE_GRID_COLS; c++) {
      for (let r = 3; r < 3 + NODE_GRID_ROWS; r++) {
        expect(grid[c][r]).toBe(true);
      }
    }
    // Adjacent cells remain unoccupied
    expect(grid[4][3]).toBe(false);
    expect(grid[5 + NODE_GRID_COLS][3]).toBe(false);
  });

  it('clamps to grid bounds at edges', () => {
    const grid = createOccupancyGrid();
    const node = makeNode('n1', GRID_COLS - 1, GRID_ROWS - 1);
    // Should not throw even though node extends past grid
    markNodeOccupied(grid, node);
    expect(grid[GRID_COLS - 1][GRID_ROWS - 1]).toBe(true);
  });

  it('ignores connection point virtual nodes', () => {
    const grid = createOccupancyGrid();
    const cpNode: ChipState = {
      id: '__cp_input_0__',
      type: 'connection-input',
      position: { col: 0, row: 0 },
      params: {},
      socketCount: 0,
      plugCount: 1,
    };
    markNodeOccupied(grid, cpNode);
    expect(grid[0][0]).toBe(false);
  });
});

describe('clearNodeOccupied', () => {
  it('clears previously occupied cells', () => {
    const grid = createOccupancyGrid();
    const node = makeNode('n1', 5, 3);
    markNodeOccupied(grid, node);
    expect(grid[5][3]).toBe(true);

    clearNodeOccupied(grid, node);
    for (let c = 5; c < 5 + NODE_GRID_COLS; c++) {
      for (let r = 3; r < 3 + NODE_GRID_ROWS; r++) {
        expect(grid[c][r]).toBe(false);
      }
    }
  });
});

describe('recomputeOccupancy', () => {
  it('recomputes from a set of nodes', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('n1', makeNode('n1', 5, 3));
    nodes.set('n2', makeNode('n2', 10, 8));

    const grid = recomputeOccupancy(nodes);

    // Node 1 occupied
    expect(grid[5][3]).toBe(true);
    expect(grid[6][4]).toBe(true);

    // Node 2 occupied
    expect(grid[10][8]).toBe(true);
    expect(grid[11][9]).toBe(true);

    // Empty area
    expect(grid[0][0]).toBe(false);
    expect(grid[15][15]).toBe(false);
  });

  it('matches result of incremental mark operations', () => {
    const nodes = new Map<string, ChipState>();
    nodes.set('a', makeNode('a', 3, 2));
    nodes.set('b', makeNode('b', 12, 7));
    nodes.set('c', makeNode('c', 20, 14));

    const fromRecompute = recomputeOccupancy(nodes);

    const fromIncremental = createOccupancyGrid();
    for (const node of nodes.values()) {
      markNodeOccupied(fromIncremental, node);
    }

    expect(fromRecompute).toEqual(fromIncremental);
  });
});

describe('canPlaceNode', () => {
  it('returns true for valid position within playable area', () => {
    const grid = createOccupancyGrid();
    // col 20, row 10 is well within the padded playable area
    expect(canPlaceNode(grid, 20, 10)).toBe(true);
  });

  it('returns false when overlapping occupied cell', () => {
    const grid = createOccupancyGrid();
    markNodeOccupied(grid, makeNode('n1', 20, 10));
    // Overlapping placement
    expect(canPlaceNode(grid, 20, 10)).toBe(false);
    // Adjacent but overlapping
    expect(canPlaceNode(grid, 19, 10)).toBe(false);
  });

  it('returns true when adjacent but not overlapping', () => {
    const grid = createOccupancyGrid();
    markNodeOccupied(grid, makeNode('n1', 20, 10));
    // Directly to the right, no overlap
    expect(canPlaceNode(grid, 20 + NODE_GRID_COLS, 10)).toBe(true);
    // Directly below, no overlap
    expect(canPlaceNode(grid, 20, 10 + NODE_GRID_ROWS)).toBe(true);
  });

  it('returns false when placement extends past grid bounds', () => {
    const grid = createOccupancyGrid();
    expect(canPlaceNode(grid, GRID_COLS - 1, 5)).toBe(false);
    expect(canPlaceNode(grid, 20, GRID_ROWS - 1)).toBe(false);
    expect(canPlaceNode(grid, -1, 5)).toBe(false);
  });

  it('returns false at playable area edges (no 1-cell padding)', () => {
    const grid = createOccupancyGrid();
    // PLAYABLE_START (10) should fail — need PLAYABLE_START + 1 (11) minimum
    expect(canPlaceNode(grid, 10, 5)).toBe(false);
    expect(canPlaceNode(grid, 11, 5)).toBe(true);
    // Row 0 should fail — need row 1 minimum
    expect(canPlaceNode(grid, 20, 0)).toBe(false);
    expect(canPlaceNode(grid, 20, 1)).toBe(true);
  });

  it('accepts explicit cols/rows params', () => {
    const grid = createOccupancyGrid();
    // 5x3 utility node at valid position
    expect(canPlaceNode(grid, 20, 5, 5, 3)).toBe(true);
    // 5x3 at far right should not fit
    expect(canPlaceNode(grid, GRID_COLS - 2, 5, 5, 3)).toBe(false);
  });
});

describe('getNodeGridSize', () => {
  it('returns 3x2 for fundamental types', () => {
    const node = makeNode('n1', 5, 3, 'invert');
    const size = getNodeGridSize(node);
    expect(size.cols).toBe(FUNDAMENTAL_GRID_COLS);
    expect(size.rows).toBe(FUNDAMENTAL_GRID_ROWS);
  });

  it('returns 3x2 for fundamental types like multiply', () => {
    const node = makeNode('n1', 5, 3, 'multiply');
    const size = getNodeGridSize(node);
    expect(size.cols).toBe(3);
    expect(size.rows).toBe(2);
  });

  it('returns 5x3 for utility types', () => {
    const node = makeNode('u1', 3, 2, 'utility:scope');
    const size = getNodeGridSize(node);
    expect(size.cols).toBe(UTILITY_GRID_COLS);
    expect(size.rows).toBe(UTILITY_GRID_ROWS);
  });

  it('returns 3x(ports+1) for puzzle types with many ports', () => {
    // 4 inputs → max(2, 4+1) = 5 rows
    const node = makeNode('p1', 3, 1, 'puzzle:abc', 4, 1);
    const size = getNodeGridSize(node);
    expect(size.cols).toBe(PUZZLE_GRID_COLS);
    expect(size.rows).toBe(5);
  });

  it('returns min 2 rows for puzzle types with few ports', () => {
    const node = makeNode('p1', 3, 1, 'puzzle:abc', 1, 1);
    const size = getNodeGridSize(node);
    expect(size.cols).toBe(PUZZLE_GRID_COLS);
    expect(size.rows).toBe(PUZZLE_MIN_GRID_ROWS);
  });

  it('uses output count when outputs exceed inputs', () => {
    // 2 inputs, 5 outputs → max(2, 5+1) = 6 rows
    const node = makeNode('p1', 3, 1, 'puzzle:abc', 2, 5);
    const size = getNodeGridSize(node);
    expect(size.rows).toBe(6);
  });
});

describe('markNodeOccupied with variable sizes', () => {
  it('utility node marks 5x3 area', () => {
    const grid = createOccupancyGrid();
    const node = makeNode('u1', 5, 3, 'utility:scope');
    markNodeOccupied(grid, node);

    for (let c = 5; c < 5 + UTILITY_GRID_COLS; c++) {
      for (let r = 3; r < 3 + UTILITY_GRID_ROWS; r++) {
        expect(grid[c][r]).toBe(true);
      }
    }
    // Cell just outside should be clear
    expect(grid[5 + UTILITY_GRID_COLS][3]).toBe(false);
    expect(grid[5][3 + UTILITY_GRID_ROWS]).toBe(false);
  });

  it('puzzle node with 4 inputs marks 3x5 area', () => {
    const grid = createOccupancyGrid();
    const node = makeNode('p1', 5, 3, 'puzzle:abc', 4, 1);
    markNodeOccupied(grid, node);

    for (let c = 5; c < 5 + 3; c++) {
      for (let r = 3; r < 3 + 5; r++) {
        expect(grid[c][r]).toBe(true);
      }
    }
    expect(grid[5][8]).toBe(false);
  });
});
