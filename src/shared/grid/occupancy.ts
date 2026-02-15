import { GRID_COLS, GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from './constants.ts';
import { PLAYBACK_BAR } from '../constants/index.ts';
import type { NodeState, NodeRotation } from '../types/index.ts';
import type { PuzzleNodeEntry, UtilityNodeEntry } from '../../store/slices/palette-slice.ts';
import { isConnectionPointNode } from '../../puzzle/connection-point-nodes.ts';
import { getRotatedSize } from './rotation.ts';
import { getNodeDefinition } from '../../engine/nodes/registry.ts';

// --- Per-category grid sizing constants ---

/** Fundamental node footprint (e.g. multiply, invert, threshold). */
export const FUNDAMENTAL_GRID_COLS = 3;
export const FUNDAMENTAL_GRID_ROWS = 2;

/** Utility node footprint — wider to accommodate labels + ports. */
export const UTILITY_GRID_COLS = 6;
export const UTILITY_GRID_ROWS = 3;

/** Puzzle node footprint — wider than fundamental, grows vertically. */
export const PUZZLE_GRID_COLS = 4;
export const PUZZLE_MIN_GRID_ROWS = 2;

/** @deprecated Use FUNDAMENTAL_GRID_COLS instead. */
export const NODE_GRID_COLS = FUNDAMENTAL_GRID_COLS;
/** @deprecated Use FUNDAMENTAL_GRID_ROWS instead. */
export const NODE_GRID_ROWS = FUNDAMENTAL_GRID_ROWS;

/**
 * Compute the grid footprint for a node based on its type category.
 * Applies rotation to swap dimensions when node is rotated 90° or 270°.
 *
 * - Fundamental types (multiply, invert, etc.): 3x2
 * - Puzzle nodes (puzzle:*): 3 cols, max(2, max(inputs,outputs)+1) rows
 * - Utility nodes (utility:*): 5x3
 */
export function getNodeGridSize(node: NodeState): { cols: number; rows: number } {
  let cols: number;
  let rows: number;

  if (node.type.startsWith('utility:') || node.type === 'custom-blank' || node.type.startsWith('menu:')) {
    cols = UTILITY_GRID_COLS;
    rows = UTILITY_GRID_ROWS;
  } else if (node.type.startsWith('puzzle:')) {
    const maxPorts = Math.max(node.inputCount, node.outputCount);
    cols = PUZZLE_GRID_COLS;
    rows = Math.max(PUZZLE_MIN_GRID_ROWS, maxPorts + 1);
  } else {
    // Look up definition for per-node size (e.g. mixer is 3x3, not 3x2)
    const def = getNodeDefinition(node.type);
    if (def) {
      cols = def.size.width;
      rows = def.size.height;
    } else {
      cols = FUNDAMENTAL_GRID_COLS;
      rows = FUNDAMENTAL_GRID_ROWS;
    }
  }

  // Apply rotation
  const rotation = node.rotation ?? 0;
  return getRotatedSize(cols, rows, rotation);
}

/**
 * Compute the grid footprint for a node type without needing a full NodeState.
 * Used by placement ghost and validation before the node exists.
 *
 * @param nodeType - Node type string
 * @param puzzleNodes - Map of puzzle node entries
 * @param _utilityNodes - Map of utility node entries
 * @param rotation - Optional rotation (default 0)
 */
export function getNodeGridSizeFromType(
  nodeType: string,
  puzzleNodes: ReadonlyMap<string, PuzzleNodeEntry>,
  _utilityNodes: ReadonlyMap<string, UtilityNodeEntry>,
  rotation: NodeRotation = 0,
): { cols: number; rows: number } {
  let cols: number;
  let rows: number;

  if (nodeType.startsWith('utility:') || nodeType === 'custom-blank' || nodeType.startsWith('menu:')) {
    cols = UTILITY_GRID_COLS;
    rows = UTILITY_GRID_ROWS;
  } else if (nodeType.startsWith('puzzle:')) {
    const puzzleId = nodeType.slice('puzzle:'.length);
    const entry = puzzleNodes.get(puzzleId);
    if (entry) {
      const maxPorts = Math.max(entry.inputCount, entry.outputCount);
      cols = PUZZLE_GRID_COLS;
      rows = Math.max(PUZZLE_MIN_GRID_ROWS, maxPorts + 1);
    } else {
      cols = PUZZLE_GRID_COLS;
      rows = PUZZLE_MIN_GRID_ROWS;
    }
  } else {
    const def = getNodeDefinition(nodeType);
    if (def) {
      cols = def.size.width;
      rows = def.size.height;
    } else {
      cols = FUNDAMENTAL_GRID_COLS;
      rows = FUNDAMENTAL_GRID_ROWS;
    }
  }

  return getRotatedSize(cols, rows, rotation);
}

/** Create an empty occupancy grid (66x36 = GRID_COLS x GRID_ROWS), all false. */
export function createOccupancyGrid(): boolean[][] {
  const grid: boolean[][] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    grid[col] = new Array(GRID_ROWS).fill(false);
  }
  return grid;
}

/**
 * Mark cells occupied by a node's bounding box.
 * Connection point nodes are virtual and don't occupy grid space.
 */
export function markNodeOccupied(
  grid: boolean[][],
  node: NodeState,
): void {
  if (isConnectionPointNode(node.id)) return;

  const { cols, rows } = getNodeGridSize(node);
  const startCol = node.position.col;
  const startRow = node.position.row;
  const endCol = Math.min(startCol + cols, GRID_COLS);
  const endRow = Math.min(startRow + rows, GRID_ROWS);

  for (let c = Math.max(0, startCol); c < endCol; c++) {
    for (let r = Math.max(0, startRow); r < endRow; r++) {
      grid[c][r] = true;
    }
  }
}

/**
 * Clear cells previously occupied by a node's bounding box.
 */
export function clearNodeOccupied(
  grid: boolean[][],
  node: NodeState,
): void {
  if (isConnectionPointNode(node.id)) return;

  const { cols, rows } = getNodeGridSize(node);
  const startCol = node.position.col;
  const startRow = node.position.row;
  const endCol = Math.min(startCol + cols, GRID_COLS);
  const endRow = Math.min(startRow + rows, GRID_ROWS);

  for (let c = Math.max(0, startCol); c < endCol; c++) {
    for (let r = Math.max(0, startRow); r < endRow; r++) {
      grid[c][r] = false;
    }
  }
}

/**
 * Recompute the entire occupancy grid from a set of nodes.
 * Used on deserialization and board load (occupancy is derived state).
 */
export function recomputeOccupancy(
  nodes: ReadonlyMap<string, NodeState>,
): boolean[][] {
  const grid = createOccupancyGrid();
  for (const node of nodes.values()) {
    markNodeOccupied(grid, node);
  }
  return grid;
}

/**
 * Check if a node can be placed at a given position without overlapping existing occupied cells.
 * Enforces placement within the playable area with 1-cell padding so port anchors
 * (1 cell outside the node bounding box) always fall within the routable grid.
 *
 * @param cols - grid columns the node occupies (defaults to FUNDAMENTAL_GRID_COLS)
 * @param rows - grid rows the node occupies (defaults to FUNDAMENTAL_GRID_ROWS)
 */
export function canPlaceNode(
  grid: readonly boolean[][],
  col: number,
  row: number,
  cols: number = FUNDAMENTAL_GRID_COLS,
  rows: number = FUNDAMENTAL_GRID_ROWS,
): boolean {
  const endCol = col + cols;
  const endRow = row + rows;

  // 1-cell padding inside playable area so port anchors stay routable
  const minCol = PLAYABLE_START + 1;
  const maxCol = PLAYABLE_END; // endCol must be <= PLAYABLE_END (node right edge)
  const minRow = 1;
  const maxRow = GRID_ROWS - 1; // endRow must be <= GRID_ROWS - 1

  if (col < minCol || row < minRow || endCol > maxCol || endRow > maxRow) {
    return false;
  }

  // Block placement overlapping the playback bar region
  if (
    col <= PLAYBACK_BAR.COL_END &&
    endCol - 1 >= PLAYBACK_BAR.COL_START &&
    row <= PLAYBACK_BAR.ROW_END &&
    endRow - 1 >= PLAYBACK_BAR.ROW_START
  ) {
    return false;
  }

  for (let c = col; c < endCol; c++) {
    for (let r = row; r < endRow; r++) {
      if (grid[c][r]) return false;
    }
  }
  return true;
}

/**
 * Merge two occupancy grids with OR logic.
 * Returns a new grid where a cell is occupied if it's occupied in either grid.
 */
export function mergeOccupancy(a: readonly boolean[][], b: readonly boolean[][]): boolean[][] {
  const result: boolean[][] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    result[col] = new Array(GRID_ROWS);
    for (let row = 0; row < GRID_ROWS; row++) {
      result[col][row] = a[col][row] || b[col][row];
    }
  }
  return result;
}

/**
 * Check if a node can be moved to a new position.
 * Temporarily removes the node from the occupancy grid to check the new position.
 *
 * @param grid - Current occupancy grid
 * @param node - Node being moved
 * @param newCol - Target column
 * @param newRow - Target row
 * @param newRotation - Optional new rotation (uses node's current rotation if not specified)
 */
export function canMoveNode(
  grid: readonly boolean[][],
  node: NodeState,
  newCol: number,
  newRow: number,
  newRotation?: NodeRotation,
): boolean {
  if (isConnectionPointNode(node.id)) return false;

  // Create a mutable copy of the grid
  const tempGrid = grid.map((col) => [...col]);

  // Clear the node's current position
  clearNodeOccupied(tempGrid, node);

  // Get the size with the new rotation
  const rotation = newRotation ?? node.rotation ?? 0;
  let baseCols: number;
  let baseRows: number;
  if (node.type.startsWith('utility:') || node.type === 'custom-blank' || node.type.startsWith('menu:')) {
    baseCols = UTILITY_GRID_COLS;
    baseRows = UTILITY_GRID_ROWS;
  } else if (node.type.startsWith('puzzle:')) {
    baseCols = PUZZLE_GRID_COLS;
    baseRows = Math.max(PUZZLE_MIN_GRID_ROWS, Math.max(node.inputCount, node.outputCount) + 1);
  } else {
    const def = getNodeDefinition(node.type);
    if (def) {
      baseCols = def.size.width;
      baseRows = def.size.height;
    } else {
      baseCols = FUNDAMENTAL_GRID_COLS;
      baseRows = FUNDAMENTAL_GRID_ROWS;
    }
  }
  const { cols, rows } = getRotatedSize(baseCols, baseRows, rotation);

  // Check if the new position is valid
  return canPlaceNode(tempGrid, newCol, newRow, cols, rows);
}
