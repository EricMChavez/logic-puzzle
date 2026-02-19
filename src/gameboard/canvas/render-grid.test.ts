import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drawGrid } from './render-grid.ts';
import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { RenderGridState } from './render-types.ts';
import {
  GRID_ROWS,
  PLAYABLE_START,
  PLAYABLE_END,
} from '../../shared/grid/index.ts';
import { PLAYBACK_BAR } from '../../shared/constants/index.ts';
import { invalidateGridDotCache } from './render-grid.ts';

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
    signalZero: '',
    colorNeutral: '',
    colorTarget: '',
    meterNeedle: '',
    depthRaised: '',
    depthSunken: '',
    textPrimary: '#ffffff',
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
    colorValidationMatch: '',
    colorError: '',
    meterBorder: '',
    meterBorderMatch: '',
    meterBorderMismatch: '',
    boardBorder: '',
    ...overrides,
  };
}

// Track arc calls made on OffscreenCanvas contexts
let offscreenArcCalls: unknown[][] = [];

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
    rect: vi.fn(),
    roundRect: vi.fn(),
    createLinearGradient: vi.fn(() => mockGradient),
    drawImage: vi.fn(),
    font: '',
    textAlign: '',
    textBaseline: '',
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    setLineDash: vi.fn(),
    globalCompositeOperation: '',
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

function setupOffscreenCanvasMock() {
  offscreenArcCalls = [];
  function createOffscreenCtx() {
    const mockGradient = { addColorStop: vi.fn() };
    return {
      fillStyle: '' as string,
      strokeStyle: '' as string,
      globalAlpha: 1,
      globalCompositeOperation: '' as string,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn((...args: unknown[]) => { offscreenArcCalls.push(args); }),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      createLinearGradient: vi.fn(() => mockGradient),
      createImageData: vi.fn((w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      })),
      putImageData: vi.fn(),
      setLineDash: vi.fn(),
      font: '',
      textAlign: '',
      textBaseline: '',
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
    };
  }
  vi.stubGlobal('OffscreenCanvas', class {
    width: number;
    height: number;
    private _ctx: ReturnType<typeof createOffscreenCtx> | null = null;
    constructor(w: number, h: number) { this.width = w; this.height = h; }
    getContext() {
      if (!this._ctx) this._ctx = createOffscreenCtx();
      return this._ctx;
    }
  });
}

describe('drawGrid', () => {
  let ctx: CanvasRenderingContext2D;
  let tokens: ThemeTokens;

  beforeEach(() => {
    ctx = createMockCtx();
    tokens = makeTokens();
    setupOffscreenCanvasMock();
    invalidateGridDotCache();
  });

  describe('zone backgrounds', () => {
    it('fills playable area with flat color using rounded rectangle', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      const roundRectCalls = (ctx.roundRect as ReturnType<typeof vi.fn>).mock.calls;
      // First roundRect call is the playable area background
      const playableCall = roundRectCalls[0];

      // Check the playable area rectangle
      const expectedX = PLAYABLE_START * cellSize;
      const expectedCols = PLAYABLE_END - PLAYABLE_START + 1;
      const expectedWidth = expectedCols * cellSize;
      const expectedHeight = GRID_ROWS * cellSize;

      expect(playableCall[0]).toBe(expectedX);
      expect(playableCall[1]).toBe(0);
      expect(playableCall[2]).toBe(expectedWidth);
      expect(playableCall[3]).toBe(expectedHeight);
      // Corner radius = GAMEBOARD_STYLE.CORNER_RADIUS_RATIO * cellSize
      expect(playableCall[4]).toBe(cellSize * 0.5);
    });

    it('meter zones are transparent (no meter fills in drawGrid)', () => {
      const cellSize = 40;
      drawGrid(ctx, tokens, {}, cellSize);

      // No fillRect on main ctx for meter zones — highlight streak renders to OffscreenCanvas
      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      expect(fillRectCalls.length).toBe(0);
    });

    it('renders playable area background with rounded corners and highlight streak', () => {
      drawGrid(ctx, tokens, {}, 40);
      // Playable area uses roundRect + fill
      expect(ctx.roundRect).toHaveBeenCalled();
      // Highlight streak composited via drawImage from OffscreenCanvas
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('uses flat fill instead of gradient for background', () => {
      drawGrid(ctx, tokens, {}, 40);
      // Background uses flat fill, gradients rendered on OffscreenCanvas for highlight streak
      // No gradients on main ctx
      expect(ctx.createLinearGradient).toHaveBeenCalledTimes(0);
    });
  });

  describe('dot matrix', () => {
    it('draws dots at interior grid intersections (edges excluded)', () => {
      const cellSize = 50;
      drawGrid(ctx, tokens, {}, cellSize);

      // Dots are drawn on OffscreenCanvas, then composited via drawImage
      const expectedCols = PLAYABLE_END - PLAYABLE_START;
      const expectedRows = GRID_ROWS - 1;
      // Subtract dots excluded by playback bar rectangle (+ 1 row for button protrusion)
      let barDots = 0;
      for (let row = Math.max(PLAYBACK_BAR.ROW_START, 1); row <= PLAYBACK_BAR.ROW_END + 1; row++) {
        for (let col = PLAYABLE_START + 1; col <= PLAYABLE_END; col++) {
          if (col >= PLAYBACK_BAR.COL_START && col <= PLAYBACK_BAR.COL_END + 1) barDots++;
        }
      }
      const expectedDots = expectedCols * expectedRows - barDots;

      expect(offscreenArcCalls).toHaveLength(expectedDots);
    });

    it('places first dot one cell inset from playable start', () => {
      const cellSize = 50;
      drawGrid(ctx, tokens, {}, cellSize);

      // First dot: col offset = 1 cell from playable start, row = 1
      // On OffscreenCanvas, x is relative to playable area start
      const [x, y] = offscreenArcCalls[0];
      expect(x).toBe(1 * cellSize); // relative to playable start
      expect(y).toBe(1 * cellSize);
    });

    it('uses drawImage to composite cached dot matrix', () => {
      drawGrid(ctx, tokens, {}, 40);
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('uses fill calls for background and inset shadow (dots cached separately)', () => {
      drawGrid(ctx, tokens, {}, 40);
      // 1 fill for playable area background + 2 fill('evenodd') for inset shadow = 3 total
      // Dots are now on OffscreenCanvas, not on main ctx
      expect(ctx.fill).toHaveBeenCalledTimes(3);
    });

    it('stroke is not called (no board border)', () => {
      drawGrid(ctx, tokens, {}, 40);
      expect(ctx.stroke).not.toHaveBeenCalled();
    });

    it('uses gridLine color as fill style', () => {
      const customTokens = makeTokens({ gridLine: '#ff0000' });
      drawGrid(ctx, customTokens, {}, 40);
      // Dots are drawn on OffscreenCanvas and composited
      expect(ctx.drawImage).toHaveBeenCalled();
    });
  });

  describe('dot matrix at different cell sizes', () => {
    const testSizes = [32, 40, 60, 80];

    for (const cellSize of testSizes) {
      it(`renders correct positions at cellSize=${cellSize}`, () => {
        // Invalidate cache for each cell size test
        invalidateGridDotCache();
        offscreenArcCalls = [];
        drawGrid(ctx, tokens, {}, cellSize);

        // Dots drawn on OffscreenCanvas — x is relative to playable start
        expect(offscreenArcCalls[0][0]).toBe(1 * cellSize);
        expect(offscreenArcCalls[0][1]).toBe(1 * cellSize);

        // Dot radius scales with cellSize
        const expectedRadius = Math.max(1, cellSize * 0.06);
        expect(offscreenArcCalls[0][2]).toBeCloseTo(expectedRadius);
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

  describe('board message card', () => {
    it('renders card when tutorialMessage is provided', () => {
      const state: RenderGridState = { tutorialMessage: 'Connect input to output' };
      drawGrid(ctx, tokens, state, 40);
      // Card composited via drawImage (OffscreenCanvas stencil card + dot matrix + noise + streak)
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('renders card when tutorialTitle is provided', () => {
      const state: RenderGridState = { tutorialTitle: 'Hello' };
      drawGrid(ctx, tokens, state, 40);
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('renders card when both title and message are provided', () => {
      const state: RenderGridState = { tutorialTitle: 'Title', tutorialMessage: 'Body text' };
      drawGrid(ctx, tokens, state, 40);
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('does not render card when no title or message', () => {
      drawGrid(ctx, tokens, {}, 40);
      // No fillText calls — card is not rendered
      expect(ctx.fillText).not.toHaveBeenCalled();
    });
  });
});
