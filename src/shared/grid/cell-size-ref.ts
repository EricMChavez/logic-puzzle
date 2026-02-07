/**
 * Module-level getter/setter for cellSize.
 * Follows the same singleton pattern as theme-manager.ts.
 * Allows overlay components to compute node pixel positions
 * without accessing GameboardCanvas's React ref.
 */

let cellSize = 0;

export function getCellSize(): number {
  return cellSize;
}

export function setCellSize(size: number): void {
  cellSize = size;
}
