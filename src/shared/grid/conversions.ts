import type { GridPoint, GridRect, PixelPoint, PixelRect } from './types';

/** Convert a grid cell (col, row) to the top-left pixel position */
export function gridToPixel(col: number, row: number, cellSize: number): PixelPoint {
  return { x: col * cellSize, y: row * cellSize };
}

/** Convert a pixel position to the grid cell it falls within (floor) */
export function pixelToGrid(x: number, y: number, cellSize: number): GridPoint {
  return {
    col: Math.floor(x / cellSize),
    row: Math.floor(y / cellSize),
  };
}

/** Convert a grid rectangle to a pixel rectangle */
export function gridRectToPixels(rect: GridRect, cellSize: number): PixelRect {
  return {
    x: rect.col * cellSize,
    y: rect.row * cellSize,
    width: rect.cols * cellSize,
    height: rect.rows * cellSize,
  };
}
