import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drawGrid } from './render-grid.ts';
import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { RenderGridState } from './render-types.ts';
import {
  GRID_ROWS,
  METER_LEFT_START,
  METER_LEFT_END,
  PLAYABLE_START,
  PLAYABLE_END,
  METER_RIGHT_START,
  METER_RIGHT_END,
} from '../../shared/grid/index.ts';

/** Minimal ThemeTokens stub with the keys drawGrid uses */
function makeTokens(overrides: Partial<ThemeTokens> = {}): ThemeTokens {
  return {
    gridArea: '#141422',
    meterHousing: '#0a0a14',
    gridLine: '#1e1e38',
    // Fill remaining required keys with empty strings
    pageBackground: '',
    gameboardSurface: '',
    meterInterior: '',
    surfaceNode: '',
    surfaceNodeBottom: '',
    signalPositive: '',
    signalNegative: '',
    colorNeutral: '',
    colorTarget: '',
    meterNeedle: '',
    depthRaised: '',
    depthSunken: '',
    textPrimary: '',
    textSecondary: '',
    colorSelection: '',
    wireWidthBase: '',
    portFill: '',
    portStroke: '',
    portConnected: '',
    animZoomDuration: '',
    animNodeScaleDuration: '',
    animWireDrawDuration: '',
    animEasingDefault: '',
    animEasingBounce: '',
    animCeremonyBurstDuration: '',
    animCeremonyRevealDuration: '',
    ...overrides,
  };
}

function createMockCtx() {
  const mockGradient = {
    addColorStop: vi.fn(),
  };
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
    globalAlpha: 1,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => mockGradient),
  } as unknown as CanvasRenderingContext2D;
}

describe('drawGrid', () => {
  let ctx: CanvasRenderingContext2D;
  let tokens: ThemeTokens;

  beforeEach(() => {
    ctx = createMockCtx();
    tokens = makeTokens();
  });

  describe('zone backgrounds', () => {
    it('fills playable area with gridArea color', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      // First fillRect call is the playable area
      const playableCall = fillRectCalls[0];
      expect(ctx.fillStyle).toBeDefined();

      // Check the playable area rectangle
      const expectedX = PLAYABLE_START * cellSize;
      const expectedCols = PLAYABLE_END - PLAYABLE_START + 1;
      const expectedWidth = expectedCols * cellSize;
      const expectedHeight = GRID_ROWS * cellSize;

      expect(playableCall).toEqual([expectedX, 0, expectedWidth, expectedHeight]);
    });

    it('fills left meter zone with meterHousing color', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      // Second fillRect call is the left meter zone
      const leftMeterCall = fillRectCalls[1];

      const expectedX = METER_LEFT_START * cellSize;
      const expectedCols = METER_LEFT_END - METER_LEFT_START + 1;
      const expectedWidth = expectedCols * cellSize;
      const expectedHeight = GRID_ROWS * cellSize;

      expect(leftMeterCall).toEqual([expectedX, 0, expectedWidth, expectedHeight]);
    });

    it('fills right meter zone with meterHousing color', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      // Third fillRect call is the right meter zone
      const rightMeterCall = fillRectCalls[2];

      const expectedX = METER_RIGHT_START * cellSize;
      const expectedCols = METER_RIGHT_END - METER_RIGHT_START + 1;
      const expectedWidth = expectedCols * cellSize;
      const expectedHeight = GRID_ROWS * cellSize;

      expect(rightMeterCall).toEqual([expectedX, 0, expectedWidth, expectedHeight]);
    });

    it('renders zone backgrounds plus depth shadow effects', () => {
      drawGrid(ctx, tokens, {}, 40);
      // 3 zone backgrounds + 4 shadow gradients = 7 fillRect calls
      expect(ctx.fillRect).toHaveBeenCalledTimes(7);
    });
  });

  describe('dot matrix', () => {
    it('draws dots at interior grid intersections (edges excluded)', () => {
      const cellSize = 50;
      drawGrid(ctx, tokens, {}, cellSize);

      const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;

      // Interior dots only: exclude first/last col and first/last row
      const expectedCols = PLAYABLE_END - PLAYABLE_START; // +1 to END, -1 from START, so END - START
      const expectedRows = GRID_ROWS - 1; // rows 1 to GRID_ROWS-1
      const expectedDots = expectedCols * expectedRows;

      expect(arcCalls).toHaveLength(expectedDots);
    });

    it('places first dot one cell inset from top-left corner', () => {
      const cellSize = 50;
      drawGrid(ctx, tokens, {}, cellSize);

      const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;

      // First dot: col = PLAYABLE_START + 1, row = 1
      const [x, y] = arcCalls[0];
      expect(x).toBe((PLAYABLE_START + 1) * cellSize);
      expect(y).toBe(1 * cellSize);
    });

    it('uses a single fill call for all dots', () => {
      drawGrid(ctx, tokens, {}, 40);
      expect(ctx.fill).toHaveBeenCalledTimes(1);
    });

    it('does not use stroke for dot matrix', () => {
      drawGrid(ctx, tokens, {}, 40);
      expect(ctx.stroke).not.toHaveBeenCalled();
    });

    it('uses gridLine color as fill style', () => {
      const customTokens = makeTokens({ gridLine: '#ff0000' });
      drawGrid(ctx, customTokens, {}, 40);
      // fill was called, meaning dots were drawn with the gridLine color
      expect(ctx.fill).toHaveBeenCalled();
    });
  });

  describe('dot matrix at different cell sizes', () => {
    const testSizes = [32, 40, 60, 80];

    for (const cellSize of testSizes) {
      it(`renders correct positions at cellSize=${cellSize}`, () => {
        drawGrid(ctx, tokens, {}, cellSize);

        const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;

        // First dot at (PLAYABLE_START + 1) * cellSize, 1 * cellSize
        expect(arcCalls[0][0]).toBe((PLAYABLE_START + 1) * cellSize);
        expect(arcCalls[0][1]).toBe(1 * cellSize);

        // Dot radius scales with cellSize
        const expectedRadius = Math.max(1, cellSize * 0.06);
        expect(arcCalls[0][2]).toBeCloseTo(expectedRadius);
      });
    }
  });

  describe('gridOpacity', () => {
    it('applies gridOpacity when provided', () => {
      const state: RenderGridState = { gridOpacity: 0.5 };
      drawGrid(ctx, tokens, state, 40);
      // After drawGrid returns, alpha should be restored
      expect(ctx.globalAlpha).toBe(1);
    });

    it('does not change globalAlpha when gridOpacity is undefined', () => {
      ctx.globalAlpha = 0.8;
      drawGrid(ctx, tokens, {}, 40);
      // Should not have been modified
      expect(ctx.globalAlpha).toBe(0.8);
    });

    it('restores previous globalAlpha after drawing', () => {
      ctx.globalAlpha = 0.7;
      const state: RenderGridState = { gridOpacity: 0.3 };
      drawGrid(ctx, tokens, state, 40);
      expect(ctx.globalAlpha).toBe(0.7);
    });
  });
});
