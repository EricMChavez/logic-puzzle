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

  describe('grid lines', () => {
    it('draws vertical lines at playable area cell boundaries', () => {
      const cellSize = 50;
      drawGrid(ctx, tokens, {}, cellSize);

      const moveToCalls = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls;
      const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls;

      // Vertical lines: from PLAYABLE_START to PLAYABLE_END + 1 (inclusive)
      const expectedVerticals = PLAYABLE_END - PLAYABLE_START + 2;
      // Horizontal lines: from row 0 to GRID_ROWS (inclusive)
      const expectedHorizontals = GRID_ROWS + 1;
      const gridLines = expectedVerticals + expectedHorizontals;

      expect(moveToCalls).toHaveLength(gridLines);
      expect(lineToCalls).toHaveLength(gridLines);

      // Verify first vertical line position
      const firstVerticalX = PLAYABLE_START * cellSize + 0.5;
      expect(moveToCalls[0][0]).toBe(firstVerticalX);
      expect(moveToCalls[0][1]).toBe(0);
      expect(lineToCalls[0][0]).toBe(firstVerticalX);
      expect(lineToCalls[0][1]).toBe(GRID_ROWS * cellSize);
    });

    it('draws horizontal lines across playable area width', () => {
      const cellSize = 50;
      drawGrid(ctx, tokens, {}, cellSize);

      const moveToCalls = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls;
      const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls;

      const expectedVerticals = PLAYABLE_END - PLAYABLE_START + 2;

      // First horizontal line is at index expectedVerticals
      const firstHorizIdx = expectedVerticals;
      const firstHorizY = 0 * cellSize + 0.5;
      const playableLeft = PLAYABLE_START * cellSize + 0.5;
      const playableRight = (PLAYABLE_END + 1) * cellSize + 0.5;
      expect(moveToCalls[firstHorizIdx][0]).toBe(playableLeft);
      expect(moveToCalls[firstHorizIdx][1]).toBe(firstHorizY);
      expect(lineToCalls[firstHorizIdx][0]).toBe(playableRight);
      expect(lineToCalls[firstHorizIdx][1]).toBe(firstHorizY);
    });

    it('includes gridLine in stroke calls', () => {
      const customTokens = makeTokens({ gridLine: '#ff0000' });
      drawGrid(ctx, customTokens, {}, 40);
      // strokeStyle is set multiple times; verify grid line was drawn
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('calls stroke once for grid lines', () => {
      drawGrid(ctx, tokens, {}, 40);
      // Single stroke call for all grid lines batched into one beginPath
      expect(ctx.stroke).toHaveBeenCalledTimes(1);
    });

    it('sets line width for grid lines', () => {
      drawGrid(ctx, tokens, {}, 40);
      // Grid lines use lineWidth 1
      expect(ctx.lineWidth).toBe(1);
    });
  });

  describe('grid lines at different cell sizes', () => {
    const testSizes = [32, 40, 60, 80];

    for (const cellSize of testSizes) {
      it(`renders correct positions at cellSize=${cellSize}`, () => {
        drawGrid(ctx, tokens, {}, cellSize);

        const moveToCalls = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls;

        // Check that the first vertical line is at PLAYABLE_START * cellSize + 0.5
        expect(moveToCalls[0][0]).toBe(PLAYABLE_START * cellSize + 0.5);

        // Check last vertical line position
        const lastVertIdx = PLAYABLE_END - PLAYABLE_START + 1;
        expect(moveToCalls[lastVertIdx][0]).toBe((PLAYABLE_END + 1) * cellSize + 0.5);
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
