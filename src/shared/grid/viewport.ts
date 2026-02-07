import { GRID_COLS, GRID_ROWS } from './constants';
import type { PixelPoint, PixelRect } from './types';

/** Margin around the gameboard (in pixels) for recessed look */
export const GAMEBOARD_MARGIN = 4;

/** Compute the cell size that fits a 32x18 grid into the given viewport with margin */
export function computeCellSize(viewportWidth: number, viewportHeight: number): number {
  const availableWidth = viewportWidth - GAMEBOARD_MARGIN * 2;
  const availableHeight = viewportHeight - GAMEBOARD_MARGIN * 2;
  return Math.floor(Math.min(availableWidth / GRID_COLS, availableHeight / GRID_ROWS));
}

/** Compute the gameboard pixel rectangle (positioned at origin) */
export function computeGameboardRect(cellSize: number): PixelRect {
  return {
    x: 0,
    y: 0,
    width: GRID_COLS * cellSize,
    height: GRID_ROWS * cellSize,
  };
}

/** Compute the offset to center the gameboard in the viewport */
export function computeCenterOffset(
  viewportWidth: number,
  viewportHeight: number,
  cellSize: number,
): PixelPoint {
  const gbWidth = GRID_COLS * cellSize;
  const gbHeight = GRID_ROWS * cellSize;
  return {
    x: Math.floor((viewportWidth - gbWidth) / 2),
    y: Math.floor((viewportHeight - gbHeight) / 2),
  };
}
