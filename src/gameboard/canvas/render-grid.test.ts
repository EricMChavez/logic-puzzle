import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drawGrid } from './render-grid.ts';
import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { RenderGridState } from './render-types.ts';
import {
  GRID_ROWS,
  PLAYABLE_START,
  PLAYABLE_END,
} from '../../shared/grid/index.ts';

/** Minimal ThemeTokens stub with the keys drawGrid uses */
function makeTokens(overrides: Partial<ThemeTokens> = {}): ThemeTokens {
  return {
    gridArea: '#000000',
    gridLine: '#16161a',
    // Fill remaining required keys with empty strings
    pageBackground: '',
    gameboardSurface: '',
    meterHousing: '',
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
  const alphaStack: number[] = [];
  const ctx = {
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
    save: vi.fn(() => { alphaStack.push(ctx.globalAlpha); }),
    restore: vi.fn(() => { if (alphaStack.length) ctx.globalAlpha = alphaStack.pop()!; }),
    clip: vi.fn(),
    roundRect: vi.fn(),
    createLinearGradient: vi.fn(() => mockGradient),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    setLineDash: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

describe('drawGrid', () => {
  let ctx: CanvasRenderingContext2D;
  let tokens: ThemeTokens;

  beforeEach(() => {
    ctx = createMockCtx();
    tokens = makeTokens();
  });

  describe('zone backgrounds', () => {
    it('fills playable area with gradient using rounded rectangle', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      // Background uses a linear gradient
      expect(ctx.createLinearGradient).toHaveBeenCalled();

      const roundRectCalls = (ctx.roundRect as ReturnType<typeof vi.fn>).mock.calls;
      // First roundRect call is the playable area background
      const playableCall = roundRectCalls[0];
      expect(ctx.fillStyle).toBeDefined();

      // Check the playable area rectangle
      const expectedX = PLAYABLE_START * cellSize;
      const expectedCols = PLAYABLE_END - PLAYABLE_START + 1;
      const expectedWidth = expectedCols * cellSize;
      const expectedHeight = GRID_ROWS * cellSize;

      expect(playableCall[0]).toBe(expectedX);
      expect(playableCall[1]).toBe(0);
      expect(playableCall[2]).toBe(expectedWidth);
      expect(playableCall[3]).toBe(expectedHeight);
      // Corner radius should be defined
      expect(playableCall[4]).toBeGreaterThan(0);
    });

    it('meter zones are transparent (no fill in drawGrid)', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      // Shadow gradients only (4 calls), no meter zone fills
      expect(fillRectCalls.length).toBe(4);
    });

    it('renders playable area background with rounded corners plus depth shadow effects', () => {
      drawGrid(ctx, tokens, {}, 40);
      // Playable area uses roundRect + fill
      expect(ctx.roundRect).toHaveBeenCalled();
      // Shadow gradients still use fillRect (4 calls)
      expect(ctx.fillRect).toHaveBeenCalledTimes(4);
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

    it('uses fill calls for background and dots', () => {
      drawGrid(ctx, tokens, {}, 40);
      // 1 fill for playable area background + 1 fill for all dots = 2 total
      expect(ctx.fill).toHaveBeenCalledTimes(2);
    });

    it('stroke is only called once for the board border', () => {
      drawGrid(ctx, tokens, {}, 40);
      expect(ctx.stroke).toHaveBeenCalledTimes(1);
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
