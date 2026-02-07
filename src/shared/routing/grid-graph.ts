import { GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from '../grid/constants.ts';

/** Number of compass directions */
export const DIR_COUNT = 8;

/** Direction indices (clockwise from East in screen coordinates) */
export const DIR_E = 0;
export const DIR_SE = 1;
export const DIR_S = 2;
export const DIR_SW = 3;
export const DIR_W = 4;
export const DIR_NW = 5;
export const DIR_N = 6;
export const DIR_NE = 7;

/** Delta [dc, dr] for each of the 8 directions */
export const DIR_DELTA: ReadonlyArray<readonly [number, number]> = [
  [1, 0],   // E
  [1, 1],   // SE
  [0, 1],   // S
  [-1, 1],  // SW
  [-1, 0],  // W
  [-1, -1], // NW
  [0, -1],  // N
  [1, -1],  // NE
];

/**
 * Get allowed next directions from a given direction.
 * Only straight (0 degrees) and +/-45 degree turns are allowed.
 * No 90-degree or wider turns.
 */
export function getAllowedDirections(dir: number): [number, number, number] {
  return [
    dir,
    (dir + 7) % 8,  // 45 degrees counter-clockwise
    (dir + 1) % 8,  // 45 degrees clockwise
  ];
}

/** Check if a cell is within the routable playable area. */
export function isRoutable(col: number, row: number): boolean {
  return col >= PLAYABLE_START && col <= PLAYABLE_END
    && row >= 0 && row < GRID_ROWS;
}

/** Check if a cell is passable (within bounds and not occupied). */
export function isPassable(
  col: number,
  row: number,
  occupancy: readonly boolean[][],
): boolean {
  return isRoutable(col, row) && !occupancy[col][row];
}

/**
 * Encode (col, row, dir) into a unique integer key.
 * Used for A* visited sets and parent tracking.
 */
export function stateKey(col: number, row: number, dir: number): number {
  return (col * GRID_ROWS + row) * DIR_COUNT + dir;
}

/** Chebyshev distance -- correct admissible heuristic for 8-directional movement. */
export function chebyshevDistance(
  c1: number, r1: number,
  c2: number, r2: number,
): number {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}
