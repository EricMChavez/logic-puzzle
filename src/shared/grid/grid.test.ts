import { describe, it, expect } from 'vitest';
import { gridToPixel, pixelToGrid, gridRectToPixels } from './conversions';
import { computeCellSize, computeGameboardRect, computeCenterOffset } from './viewport';
import { GRID_COLS, GRID_ROWS, MIN_CELL_SIZE, PLAYABLE_START, PLAYABLE_END, METER_LEFT_START, METER_LEFT_END, METER_RIGHT_START, METER_RIGHT_END } from './constants';

describe('grid constants', () => {
  it('grid dimensions produce consistent aspect ratio', () => {
    // 66/36 = 11/6 ≈ 1.833 (slightly wider than 16:9)
    expect(GRID_COLS / GRID_ROWS).toBeCloseTo(66 / 36, 2);
  });

  it('zone columns cover all 66 columns without gaps or overlaps', () => {
    const meterLeftCols = METER_LEFT_END - METER_LEFT_START + 1;
    const playableCols = PLAYABLE_END - PLAYABLE_START + 1;
    const meterRightCols = METER_RIGHT_END - METER_RIGHT_START + 1;
    expect(meterLeftCols).toBe(10);
    expect(playableCols).toBe(46);
    expect(meterRightCols).toBe(10);
    expect(meterLeftCols + playableCols + meterRightCols).toBe(GRID_COLS);
  });

  it('zones are contiguous', () => {
    expect(METER_LEFT_END + 1).toBe(PLAYABLE_START);
    expect(PLAYABLE_END + 1).toBe(METER_RIGHT_START);
  });
});

describe('gridToPixel', () => {
  it('converts origin cell to origin pixel', () => {
    const p = gridToPixel(0, 0, 50);
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('converts cell to top-left pixel', () => {
    const p = gridToPixel(3, 5, 40);
    expect(p).toEqual({ x: 120, y: 200 });
  });

  it('works with different cell sizes', () => {
    expect(gridToPixel(1, 1, 32)).toEqual({ x: 32, y: 32 });
    expect(gridToPixel(1, 1, 60)).toEqual({ x: 60, y: 60 });
    expect(gridToPixel(1, 1, 80)).toEqual({ x: 80, y: 80 });
  });
});

describe('pixelToGrid', () => {
  it('converts origin pixel to origin cell', () => {
    const g = pixelToGrid(0, 0, 50);
    expect(g).toEqual({ col: 0, row: 0 });
  });

  it('floors to the containing cell', () => {
    const g = pixelToGrid(75, 125, 50);
    expect(g).toEqual({ col: 1, row: 2 });
  });

  it('pixel at cell boundary maps to that cell', () => {
    const g = pixelToGrid(100, 200, 50);
    expect(g).toEqual({ col: 2, row: 4 });
  });

  it('pixel just before next cell stays in current cell', () => {
    const g = pixelToGrid(99, 199, 50);
    expect(g).toEqual({ col: 1, row: 3 });
  });
});

describe('gridToPixel / pixelToGrid round-trip', () => {
  it('round-trips correctly for various cells', () => {
    const cellSize = 50;
    const testCases = [
      { col: 0, row: 0 },
      { col: 5, row: 10 },
      { col: 65, row: 35 },
      { col: 33, row: 18 },
    ];

    for (const { col, row } of testCases) {
      const pixel = gridToPixel(col, row, cellSize);
      const grid = pixelToGrid(pixel.x, pixel.y, cellSize);
      expect(grid).toEqual({ col, row });
    }
  });

  it('round-trips for all cells at various cell sizes', () => {
    for (const cellSize of [32, 40, 60, 80]) {
      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          const pixel = gridToPixel(col, row, cellSize);
          const grid = pixelToGrid(pixel.x, pixel.y, cellSize);
          expect(grid).toEqual({ col, row });
        }
      }
    }
  });
});

describe('gridRectToPixels', () => {
  it('converts a grid rect to pixel rect', () => {
    const pixelRect = gridRectToPixels({ col: 3, row: 2, cols: 4, rows: 3 }, 50);
    expect(pixelRect).toEqual({ x: 150, y: 100, width: 200, height: 150 });
  });

  it('converts full grid to gameboard pixel rect', () => {
    const pixelRect = gridRectToPixels({ col: 0, row: 0, cols: GRID_COLS, rows: GRID_ROWS }, 30);
    expect(pixelRect).toEqual({ x: 0, y: 0, width: 1980, height: 1080 });
  });
});

describe('computeCellSize', () => {
  // Note: computeCellSize accounts for GAMEBOARD_MARGIN (4px on each side)
  // Formula: floor(min((width - 8) / 66, (height - 8) / 36))

  it('computes correct cell size for exact 16:9 viewports (minus margin)', () => {
    // 1280x720: available 1272x712, min(19.27, 19.77) = 19
    expect(computeCellSize(1280, 720)).toBe(19);
    // 1920x1080: available 1912x1072, min(28.96, 29.77) = 28
    expect(computeCellSize(1920, 1080)).toBe(28);
    // 2560x1440: available 2552x1432, min(38.66, 39.77) = 38
    expect(computeCellSize(2560, 1440)).toBe(38);
  });

  it('computes cell size constrained by width', () => {
    // 1024x768: available 1016x760, min(15.39, 21.11) -> constrained by width = 15
    expect(computeCellSize(1024, 768)).toBe(15);
  });

  it('computes cell size constrained by height', () => {
    // 2560x900: available 2552x892, min(38.66, 24.77) -> constrained by height = 24
    expect(computeCellSize(2560, 900)).toBe(24);
  });

  it('floors the cell size', () => {
    // 1366x768: available 1358x760, min(20.57, 21.11) -> floor(20) = 20
    expect(computeCellSize(1366, 768)).toBe(20);
  });

  it('returns value below MIN_CELL_SIZE for very small viewports', () => {
    // 640x360: available 632x352, min(9.57, 9.77) = 9
    const cellSize = computeCellSize(640, 360);
    expect(cellSize).toBe(9);
    expect(cellSize).toBeLessThan(MIN_CELL_SIZE);
  });
});

describe('computeGameboardRect', () => {
  it('computes gameboard dimensions from cell size', () => {
    const rect = computeGameboardRect(30);
    expect(rect).toEqual({ x: 0, y: 0, width: 1980, height: 1080 });
  });

  it('gameboard maintains consistent aspect ratio', () => {
    // With 66x36 grid, aspect ratio is 66/36 = 11/6 ≈ 1.833
    for (const cellSize of [16, 20, 25, 30, 40]) {
      const rect = computeGameboardRect(cellSize);
      expect(rect.width / rect.height).toBeCloseTo(66 / 36, 2);
    }
  });
});

describe('computeCenterOffset', () => {
  it('returns offset for typical viewport', () => {
    // With margin, exact-fit doesn't exist, but test with a pre-computed cellSize
    const offset = computeCenterOffset(1920, 1080, 28);
    // gameboard = 66*28=1848, 36*28=1008
    // x = (1920-1848)/2 = 36, y = (1080-1008)/2 = 36
    expect(offset).toEqual({ x: 36, y: 36 });
  });

  it('returns horizontal offset for width-constrained viewport', () => {
    // 1920x1200 with margin: available 1888x1168
    // cellSize = floor(min(1888/66, 1168/36)) = floor(min(28.6, 32.4)) = 28
    // gameboard = 66*28=1848, 36*28=1008
    // x = (1920-1848)/2 = 36, y = (1200-1008)/2 = 96
    const cellSize = computeCellSize(1920, 1200);
    expect(cellSize).toBe(28);
    const offset = computeCenterOffset(1920, 1200, cellSize);
    expect(offset.x).toBe(36);
    expect(offset.y).toBe(96);
  });

  it('returns vertical offset for height-constrained viewport', () => {
    // 2000x1080 with margin: available 1968x1048
    // cellSize = floor(min(1968/66, 1048/36)) = floor(min(29.8, 29.1)) = 29
    // gameboard = 66*29=1914, 36*29=1044
    // x = (2000-1914)/2 = 43, y = (1080-1044)/2 = 18
    const cellSize = computeCellSize(2000, 1080);
    expect(cellSize).toBe(29);
    const offset = computeCenterOffset(2000, 1080, cellSize);
    expect(offset.x).toBe(43);
    expect(offset.y).toBe(18);
  });

  it('produces symmetric letterbox offsets', () => {
    const cellSize = computeCellSize(1366, 768);
    const offset = computeCenterOffset(1366, 768, cellSize);
    const gbWidth = GRID_COLS * cellSize;
    const gbHeight = GRID_ROWS * cellSize;
    // Remaining space should be evenly distributed (within 1px for odd remainders)
    const remainX = 1366 - gbWidth;
    const remainY = 768 - gbHeight;
    expect(offset.x).toBe(Math.floor(remainX / 2));
    expect(offset.y).toBe(Math.floor(remainY / 2));
  });
});
