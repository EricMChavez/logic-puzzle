/** A position in grid coordinates (col, row) */
export interface GridPoint {
  col: number;
  row: number;
}

/** A rectangle in grid coordinates */
export interface GridRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** A position in pixel coordinates */
export interface PixelPoint {
  x: number;
  y: number;
}

/** A rectangle in pixel coordinates */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
