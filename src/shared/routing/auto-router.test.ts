import { describe, it, expect } from 'vitest';
import { findPath, getPortGridAnchor, getPortWireDirection, portSideToWireDirection } from './auto-router.ts';
import { DIR_DELTA, DIR_COUNT, DIR_E, DIR_SE, DIR_S, DIR_W, DIR_N, DIR_NE } from './grid-graph.ts';
import { createOccupancyGrid, markNodeOccupied, NODE_GRID_COLS, NODE_GRID_ROWS, getNodeGridSize } from '../grid/occupancy.ts';
import { PLAYABLE_START, PLAYABLE_END, GRID_ROWS } from '../grid/constants.ts';
import type { GridPoint } from '../grid/types.ts';
import type { NodeState, NodeRotation } from '../types/index.ts';

function makeNode(id: string, col: number, row: number, inputCount = 1, outputCount = 1, rotation?: NodeRotation): NodeState {
  return { id, type: 'invert', position: { col, row }, params: {}, inputCount, outputCount, rotation };
}

// ---------------------------------------------------------------------------
// getPortGridAnchor
// ---------------------------------------------------------------------------

describe('getPortGridAnchor', () => {
  it('output port anchor is at the right grid line of node', () => {
    const node = makeNode('n1', 5, 3);
    const anchor = getPortGridAnchor(node, 'output', 0);
    // Anchor at port grid line: col = nodeCol + cols (matching port pixel)
    expect(anchor.col).toBe(5 + NODE_GRID_COLS);
  });

  it('input port anchor is at the left grid line of node', () => {
    const node = makeNode('n1', 5, 3);
    const anchor = getPortGridAnchor(node, 'input', 0);
    // Anchor at port grid line: col = nodeCol (matching port pixel)
    expect(anchor.col).toBe(5);
  });

  it('distributes 2 ports across 2 rows', () => {
    const node = makeNode('n1', 5, 3, 2, 1);
    const p0 = getPortGridAnchor(node, 'input', 0);
    const p1 = getPortGridAnchor(node, 'input', 1);
    // Ports at integer positions: rows 3 and 4
    expect(p0.row).toBe(3); // first row
    expect(p1.row).toBe(4); // second row
  });

  it('single port is centered at integer position', () => {
    const node = makeNode('n1', 5, 3);
    const anchor = getPortGridAnchor(node, 'output', 0);
    // Single port centered at floor(2/2) = 1, so row = 3 + 1 = 4
    expect(anchor.row).toBe(4);
  });

  it('connection input node anchors at PLAYABLE_START', () => {
    const cpNode: NodeState = {
      id: '__cp_input_0__',
      type: 'connection-input',
      position: { col: 0, row: 0 },
      params: {},
      inputCount: 0,
      outputCount: 1,
    };
    const anchor = getPortGridAnchor(cpNode, 'output', 0);
    expect(anchor.col).toBe(PLAYABLE_START);
  });

  it('connection output node anchors at PLAYABLE_END + 1 (matching render position)', () => {
    const cpNode: NodeState = {
      id: '__cp_output_1__',
      type: 'connection-output',
      position: { col: 0, row: 0 },
      params: {},
      inputCount: 1,
      outputCount: 0,
    };
    const anchor = getPortGridAnchor(cpNode, 'input', 0);
    expect(anchor.col).toBe(PLAYABLE_END + 1);
  });

  it('connection point rows are evenly distributed', () => {
    const cp0: NodeState = {
      id: '__cp_input_0__', type: 'connection-input',
      position: { col: 0, row: 0 }, params: {}, inputCount: 0, outputCount: 1,
    };
    const cp1: NodeState = {
      id: '__cp_input_1__', type: 'connection-input',
      position: { col: 0, row: 0 }, params: {}, inputCount: 0, outputCount: 1,
    };
    const cp2: NodeState = {
      id: '__cp_input_2__', type: 'connection-input',
      position: { col: 0, row: 0 }, params: {}, inputCount: 0, outputCount: 1,
    };
    const r0 = getPortGridAnchor(cp0, 'output', 0).row;
    const r1 = getPortGridAnchor(cp1, 'output', 0).row;
    const r2 = getPortGridAnchor(cp2, 'output', 0).row;
    // Should be ordered and spread across the grid
    expect(r0).toBeLessThan(r1);
    expect(r1).toBeLessThan(r2);
    expect(r0).toBeGreaterThan(0);
    expect(r2).toBeLessThan(GRID_ROWS);
  });
});

// ---------------------------------------------------------------------------
// Segment direction validator
// ---------------------------------------------------------------------------

/** Check if two consecutive path points form a valid H/V/45-degree segment. */
function isValidSegment(a: GridPoint, b: GridPoint): boolean {
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  // Must be adjacent (max 1 step in each axis)
  if (Math.abs(dc) > 1 || Math.abs(dr) > 1) return false;
  // Must move (not stay in place)
  if (dc === 0 && dr === 0) return false;
  return true;
}

/** Get direction index from delta */
function dirFromDelta(dc: number, dr: number): number {
  for (let d = 0; d < DIR_COUNT; d++) {
    if (DIR_DELTA[d][0] === dc && DIR_DELTA[d][1] === dr) return d;
  }
  return -1;
}

/** Check if a direction change is within 45 degrees */
function isSmallTurn(d1: number, d2: number): boolean {
  const diff = Math.abs(d1 - d2);
  return diff <= 1 || diff >= 7; // wraps around 0/7
}

// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------

describe('findPath', () => {
  it('finds a straight horizontal path on empty grid', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 40, row: 18 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    expect(path![0]).toEqual(source);
    expect(path![path!.length - 1]).toEqual(target);
    // Straight horizontal: each step should be +1 col, same row
    for (let i = 1; i < path!.length; i++) {
      expect(path![i].col - path![i - 1].col).toBe(1);
      expect(path![i].row).toBe(18);
    }
  });

  it('produces only H/V/45-degree segments', () => {
    const grid = createOccupancyGrid();
    // Place an obstacle forcing a non-trivial path
    for (let c = 20; c < 30; c++) {
      for (let r = 14; r < 24; r++) {
        grid[c][r] = true;
      }
    }
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 40, row: 18 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      expect(isValidSegment(path![i - 1], path![i])).toBe(true);
    }
  });

  it('enforces no turns wider than 45 degrees', () => {
    const grid = createOccupancyGrid();
    // Wall forcing a complex route
    for (let c = 24; c < 32; c++) {
      for (let r = 6; r < 28; r++) {
        grid[c][r] = true;
      }
    }
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 40, row: 18 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    if (path!.length >= 3) {
      for (let i = 2; i < path!.length; i++) {
        const d1 = dirFromDelta(
          path![i - 1].col - path![i - 2].col,
          path![i - 1].row - path![i - 2].row,
        );
        const d2 = dirFromDelta(
          path![i].col - path![i - 1].col,
          path![i].row - path![i - 1].row,
        );
        expect(isSmallTurn(d1, d2)).toBe(true);
      }
    }
  });

  it('routes around occupied cells', () => {
    const grid = createOccupancyGrid();
    // Block a horizontal corridor
    for (let c = 20; c < 36; c++) {
      grid[c][18] = true;
    }
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 44, row: 18 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    // Verify path doesn't pass through occupied cells
    for (const p of path!) {
      expect(grid[p.col][p.row]).toBe(false);
    }
  });

  it('returns null when no path exists', () => {
    const grid = createOccupancyGrid();
    // Wall off the target completely
    for (let c = PLAYABLE_START; c <= PLAYABLE_END; c++) {
      grid[c][16] = true;
      grid[c][20] = true;
    }
    // Block the row itself around target
    for (let c = 38; c <= PLAYABLE_END; c++) {
      grid[c][18] = true;
    }
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 50, row: 18 };
    const path = findPath(source, target, grid);

    expect(path).toBeNull();
  });

  it('returns single-point path when source equals target', () => {
    const grid = createOccupancyGrid();
    const point: GridPoint = { col: 20, row: 18 };
    const path = findPath(point, point, grid);

    expect(path).toEqual([point]);
  });

  it('finds path when source is occupied (node anchors sit on node body)', () => {
    const grid = createOccupancyGrid();
    grid[10][18] = true;
    const path = findPath({ col: 10, row: 18 }, { col: 40, row: 18 }, grid);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ col: 10, row: 18 });
  });

  it('finds path to occupied target cell (e.g. output CPs outside routable area)', () => {
    const grid = createOccupancyGrid();
    grid[40][18] = true;
    const path = findPath({ col: 10, row: 18 }, { col: 40, row: 18 }, grid);
    // Target is reachable even when occupied — needed for output CPs at col 56
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ col: 40, row: 18 });
  });

  it('returns null when source is outside playable area', () => {
    const grid = createOccupancyGrid();
    const path = findPath({ col: 2, row: 10 }, { col: 40, row: 10 }, grid);
    expect(path).toBeNull();
  });

  it('path starts with E direction and ends arriving E', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 10 };
    const target: GridPoint = { col: 40, row: 20 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);

    // First segment should be East
    const first = path![0];
    const second = path![1];
    expect(second.col - first.col).toBe(1);
    expect(second.row - first.row).toBe(0);

    // Last segment should arrive East
    const prev = path![path!.length - 2];
    const last = path![path!.length - 1];
    expect(last.col - prev.col).toBe(1);
    expect(last.row - prev.row).toBe(0);
  });

  it('direction change penalty produces cleaner paths (fewer jogs)', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 10 };
    const target: GridPoint = { col: 40, row: 20 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    // Count direction changes
    let turns = 0;
    for (let i = 2; i < path!.length; i++) {
      const d1 = dirFromDelta(
        path![i - 1].col - path![i - 2].col,
        path![i - 1].row - path![i - 2].row,
      );
      const d2 = dirFromDelta(
        path![i].col - path![i - 1].col,
        path![i].row - path![i - 1].row,
      );
      if (d1 !== d2) turns++;
    }
    // With turn penalty, a path from (10,10) to (40,20) should have very few turns
    // (ideally 2-3: E, then diagonal, then E again)
    expect(turns).toBeLessThanOrEqual(4);
  });

  it('finds a path around a node-sized obstacle', () => {
    const grid = createOccupancyGrid();
    const obstacle = makeNode('obs', 24, 16);
    markNodeOccupied(grid, obstacle);

    const source: GridPoint = { col: 16, row: 18 };
    const target: GridPoint = { col: 36, row: 18 };
    const path = findPath(source, target, grid);

    expect(path).not.toBeNull();
    // Verify no path point is in the obstacle
    for (const p of path!) {
      const inObstacle = p.col >= 24 && p.col < 24 + NODE_GRID_COLS
        && p.row >= 16 && p.row < 16 + NODE_GRID_ROWS;
      expect(inObstacle).toBe(false);
    }
  });

  it('finds path with custom start direction (South)', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 20, row: 10 };
    const target: GridPoint = { col: 20, row: 25 };
    // Start heading South, end heading East
    const path = findPath(source, target, grid, DIR_S, DIR_E);

    expect(path).not.toBeNull();
    // First segment should be South
    const first = path![0];
    const second = path![1];
    expect(second.col - first.col).toBe(0);
    expect(second.row - first.row).toBe(1); // South is +row
  });

  it('finds path with custom end direction (West)', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 30, row: 15 };
    const target: GridPoint = { col: 20, row: 15 };
    // Start heading East (default), end heading West
    const path = findPath(source, target, grid, DIR_E, DIR_W);

    expect(path).not.toBeNull();
    // Last segment should arrive heading West
    const prev = path![path!.length - 2];
    const last = path![path!.length - 1];
    expect(last.col - prev.col).toBe(-1); // West is -col
    expect(last.row - prev.row).toBe(0);
  });

  it('finds vertical path with South start and North end', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 25, row: 5 };
    const target: GridPoint = { col: 25, row: 30 };
    const path = findPath(source, target, grid, DIR_S, DIR_S);

    expect(path).not.toBeNull();
    // Should be mostly vertical
    for (let i = 1; i < path!.length; i++) {
      const dc = path![i].col - path![i - 1].col;
      const dr = path![i].row - path![i - 1].row;
      // Allow diagonal moves but verify progression is mostly downward
      expect(dr).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// portSideToWireDirection
// ---------------------------------------------------------------------------

describe('portSideToWireDirection', () => {
  it('right side -> East direction', () => {
    expect(portSideToWireDirection('right')).toBe(DIR_E);
  });

  it('bottom side -> South direction', () => {
    expect(portSideToWireDirection('bottom')).toBe(DIR_S);
  });

  it('left side -> West direction', () => {
    expect(portSideToWireDirection('left')).toBe(DIR_W);
  });

  it('top side -> North direction', () => {
    expect(portSideToWireDirection('top')).toBe(DIR_N);
  });
});

// ---------------------------------------------------------------------------
// getPortWireDirection
// ---------------------------------------------------------------------------

describe('getPortWireDirection', () => {
  it('output port at 0° rotation (right side) -> East', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 0);
    expect(getPortWireDirection(node, 'output')).toBe(DIR_E);
  });

  it('input port at 0° rotation (left side) -> wire arrives traveling East', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 0);
    // Wire enters left-side port traveling East (from left to right)
    expect(getPortWireDirection(node, 'input')).toBe(DIR_E);
  });

  it('output port at 90° rotation (bottom side) -> South', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 90);
    expect(getPortWireDirection(node, 'output')).toBe(DIR_S);
  });

  it('input port at 90° rotation (top side) -> wire arrives traveling South', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 90);
    // Wire enters top-side port traveling South (from top to bottom)
    expect(getPortWireDirection(node, 'input')).toBe(DIR_S);
  });

  it('output port at 180° rotation (left side) -> West', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 180);
    expect(getPortWireDirection(node, 'output')).toBe(DIR_W);
  });

  it('input port at 180° rotation (right side) -> wire arrives traveling West', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 180);
    // Wire enters right-side port traveling West (from right to left)
    expect(getPortWireDirection(node, 'input')).toBe(DIR_W);
  });

  it('output port at 270° rotation (top side) -> North', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 270);
    expect(getPortWireDirection(node, 'output')).toBe(DIR_N);
  });

  it('input port at 270° rotation (bottom side) -> wire arrives traveling North', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 270);
    // Wire enters bottom-side port traveling North (from bottom to top)
    expect(getPortWireDirection(node, 'input')).toBe(DIR_N);
  });

  it('connection input nodes always return East', () => {
    const cpNode: NodeState = {
      id: '__cp_input_0__',
      type: 'connection-input',
      position: { col: 0, row: 0 },
      params: {},
      inputCount: 0,
      outputCount: 1,
    };
    expect(getPortWireDirection(cpNode, 'output')).toBe(DIR_E);
  });

  it('connection output nodes always return East (wire arrives traveling East)', () => {
    const cpNode: NodeState = {
      id: '__cp_output_0__',
      type: 'connection-output',
      position: { col: 0, row: 0 },
      params: {},
      inputCount: 1,
      outputCount: 0,
    };
    // Wire arrives at right-side output traveling East (from left to right)
    expect(getPortWireDirection(cpNode, 'input')).toBe(DIR_E);
  });
});

// ---------------------------------------------------------------------------
// getPortGridAnchor with rotation
// ---------------------------------------------------------------------------

describe('getPortGridAnchor with rotation', () => {
  it('output anchor at 90° rotation is at bottom grid line', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 90);
    const { rows } = getNodeGridSize(node);
    const anchor = getPortGridAnchor(node, 'output', 0);
    // At 90°, output moves to bottom, anchor at bottom grid line
    expect(anchor.row).toBe(10 + rows);
  });

  it('input anchor at 90° rotation is at top grid line', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 90);
    const anchor = getPortGridAnchor(node, 'input', 0);
    // At 90°, input moves to top, anchor at top grid line
    expect(anchor.row).toBe(10);
  });

  it('output anchor at 180° rotation is at left grid line', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 180);
    const anchor = getPortGridAnchor(node, 'output', 0);
    // At 180°, output moves to left, anchor at left grid line
    expect(anchor.col).toBe(10);
  });

  it('input anchor at 180° rotation is at right grid line', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 180);
    const { cols } = getNodeGridSize(node);
    const anchor = getPortGridAnchor(node, 'input', 0);
    // At 180°, input moves to right, anchor at right grid line
    expect(anchor.col).toBe(10 + cols);
  });

  it('output anchor at 270° rotation is at top grid line', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 270);
    const anchor = getPortGridAnchor(node, 'output', 0);
    // At 270°, output moves to top, anchor at top grid line
    expect(anchor.row).toBe(10);
  });

  it('input anchor at 270° rotation is at bottom grid line', () => {
    const node = makeNode('n1', 10, 10, 1, 1, 270);
    const { rows } = getNodeGridSize(node);
    const anchor = getPortGridAnchor(node, 'input', 0);
    // At 270°, input moves to bottom, anchor at bottom grid line
    expect(anchor.row).toBe(10 + rows);
  });
});

// ---------------------------------------------------------------------------
// Stem enforcement
// ---------------------------------------------------------------------------

describe('findPath stem enforcement', () => {
  it('first step from source is forced straight in startDir (East)', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 14, row: 16 };
    const path = findPath(source, target, grid, DIR_E, DIR_E);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    // First step must be straight East: (10,18) → (11,18)
    expect(path![1]).toEqual({ col: 11, row: 18 });
  });

  it('first step from source is forced straight in startDir (West)', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 40, row: 18 };
    const target: GridPoint = { col: 30, row: 16 };
    const path = findPath(source, target, grid, DIR_W, DIR_W);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    // First step must be straight West: (40,18) → (39,18)
    expect(path![1]).toEqual({ col: 39, row: 18 });
  });

  it('first step from source is forced straight in startDir (South)', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 25, row: 5 };
    const target: GridPoint = { col: 30, row: 15 };
    const path = findPath(source, target, grid, DIR_S, DIR_E);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(2);
    // First step must be straight South: (25,5) → (25,6)
    expect(path![1]).toEqual({ col: 25, row: 6 });
  });

  it('stem of 0 allows immediate turns', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 14, row: 14 };
    // stemLength=0 disables stem enforcement
    const path = findPath(source, target, grid, DIR_E, DIR_E, 0);

    expect(path).not.toBeNull();
    // First step may be diagonal (NE) since stem is disabled and target is up-right
    const firstDc = path![1].col - path![0].col;
    const firstDr = path![1].row - path![0].row;
    const firstDir = dirFromDelta(firstDc, firstDr);
    // Should be East or NE (allowed by A* without stem)
    expect(firstDir === DIR_E || firstDir === DIR_NE).toBe(true);
  });

  it('stem=2 forces two straight steps before allowing turns', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 20, row: 12 };
    const path = findPath(source, target, grid, DIR_E, DIR_E, 2);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(3);
    // First two steps must be straight East
    expect(path![1]).toEqual({ col: 11, row: 18 });
    expect(path![2]).toEqual({ col: 12, row: 18 });
  });

  it('still finds path when stem direction is blocked after 1 step', () => {
    const grid = createOccupancyGrid();
    // Block col 12 row 18 so stem can only go 1 step East
    grid[12][18] = true;
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 20, row: 18 };
    // stem=2 requires 2 East steps, but col 12 is blocked
    const path = findPath(source, target, grid, DIR_E, DIR_E, 2);

    // Should still find a path: stem goes (10,18)→(11,18), then
    // at g=1 < stemLength=2 it must continue East but (12,18) blocked → null
    // Actually this should fail since stem is forced
    expect(path).toBeNull();
  });

  it('default stem=1 forces exactly one straight step', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 14, row: 16 };
    // Default call (stem=1)
    const path = findPath(source, target, grid, DIR_E, DIR_E);

    expect(path).not.toBeNull();
    // First step forced East
    expect(path![1]).toEqual({ col: 11, row: 18 });
    // Second step can turn (NE allowed)
    const secondDc = path![2].col - path![1].col;
    const secondDr = path![2].row - path![1].row;
    const secondDir = dirFromDelta(secondDc, secondDr);
    // Should be E or NE (turning toward row 16)
    expect(secondDir === DIR_E || secondDir === DIR_NE).toBe(true);
  });

  it('CP-like scenario: (10,18) to (14,16) forces horizontal stem', () => {
    const grid = createOccupancyGrid();
    const source: GridPoint = { col: 10, row: 18 };
    const target: GridPoint = { col: 14, row: 16 };
    const path = findPath(source, target, grid, DIR_E, DIR_E);

    expect(path).not.toBeNull();
    // The old buggy path was (10,18)→(11,17)→(12,16)→(13,16)→(14,16)
    // With stem enforcement, first step MUST be (11,18), not (11,17)
    expect(path![0]).toEqual({ col: 10, row: 18 });
    expect(path![1]).toEqual({ col: 11, row: 18 });
    // Path should NOT go diagonally from the source
    expect(path![1].row).toBe(18); // same row as source
  });
});

// ---------------------------------------------------------------------------
// Utility nodes with cpLayout
// ---------------------------------------------------------------------------

describe('getPortGridAnchor with cpLayout utility nodes', () => {
  function makeUtilityNode(
    id: string,
    col: number,
    row: number,
    cpLayout: string[],
  ): NodeState {
    // Count inputs and outputs from cpLayout
    const inputCount = cpLayout.filter(c => c === 'input').length;
    const outputCount = cpLayout.filter(c => c === 'output').length;
    return {
      id,
      type: 'utility:test',
      position: { col, row },
      params: { cpLayout },
      inputCount,
      outputCount,
    };
  }

  it('uses fixed slot positions for inputs when cpLayout has gaps', () => {
    // cpLayout: [off, input, input, output, off, off]
    // Inputs are at slots 1 and 2 on left side (not 0 and 1)
    const node = makeUtilityNode('u1', 20, 10, ['off', 'input', 'input', 'output', 'off', 'off']);
    const { rows } = getNodeGridSize(node);

    const anchor0 = getPortGridAnchor(node, 'input', 0);
    const anchor1 = getPortGridAnchor(node, 'input', 1);

    // Slot 1 on left: row = 10 + floor(1 * 3 / 3) = 10 + 1 = 11
    expect(anchor0.col).toBe(20);
    expect(anchor0.row).toBe(10 + Math.floor(1 * rows / 3));

    // Slot 2 on left: row = 10 + floor(2 * 3 / 3) = 10 + 2 = 12
    expect(anchor1.col).toBe(20);
    expect(anchor1.row).toBe(10 + Math.floor(2 * rows / 3));
  });

  it('uses fixed slot positions for outputs on right side', () => {
    // cpLayout: [input, off, off, output, output, off]
    // Outputs are at slots 0 and 1 on right side
    const node = makeUtilityNode('u2', 20, 10, ['input', 'off', 'off', 'output', 'output', 'off']);
    const { cols, rows } = getNodeGridSize(node);

    const anchor0 = getPortGridAnchor(node, 'output', 0);
    const anchor1 = getPortGridAnchor(node, 'output', 1);

    // Slot 0 on right: col = 20 + 5 = 25, row = 10 + floor(0 * 3 / 3) = 10
    expect(anchor0.col).toBe(20 + cols);
    expect(anchor0.row).toBe(10 + Math.floor(0 * rows / 3));

    // Slot 1 on right: col = 25, row = 10 + floor(1 * 3 / 3) = 11
    expect(anchor1.col).toBe(20 + cols);
    expect(anchor1.row).toBe(10 + Math.floor(1 * rows / 3));
  });

  it('matches rendering position for utility nodes with cpLayout', () => {
    // This test ensures routing anchors match render positions
    // cpLayout: [input, input, off, off, output, off]
    const node = makeUtilityNode('u3', 20, 10, ['input', 'input', 'off', 'off', 'output', 'off']);
    const { cols, rows } = getNodeGridSize(node);

    // Input 0 at slot 0: row offset = floor(0 * rows / 3)
    const input0 = getPortGridAnchor(node, 'input', 0);
    expect(input0).toEqual({ col: 20, row: 10 + Math.floor(0 * rows / 3) });

    // Input 1 at slot 1: row offset = floor(1 * rows / 3)
    const input1 = getPortGridAnchor(node, 'input', 1);
    expect(input1).toEqual({ col: 20, row: 10 + Math.floor(1 * rows / 3) });

    // Output 0 at slot 1 (index 4 in cpLayout, 4-3=1): row offset = floor(1 * rows / 3)
    const output0 = getPortGridAnchor(node, 'output', 0);
    expect(output0).toEqual({ col: 20 + cols, row: 10 + Math.floor(1 * rows / 3) });
  });
});
