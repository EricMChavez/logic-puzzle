import { describe, it, expect, vi } from 'vitest';
import { renderPlacementGhost } from './render-placement-ghost.ts';
import type { RenderPlacementGhostState } from './render-placement-ghost.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { GRID_COLS, GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from '../../shared/grid/index.ts';

// Mock tokens covering all properties used by drawNodeBody/drawNodePorts
const tokens = {
  surfaceNode: '#44484e',
  surfaceNodeBottom: '#33363b',
  textPrimary: '#e0e0f0',
  textSecondary: '#9090b0',
  depthRaised: 'rgba(0,0,0,0.3)',
  colorError: '#ff4444',
  colorSelection: '#4488ff',
  colorNeutral: '#888888',
  signalPositive: '#F5AF28',
  signalNegative: '#1ED2C3',
  signalZero: '#d0d0d8',
  meterNeedle: '#E03838',
} as ThemeTokens;

const cellSize = 40;

function makeCtx() {
  const gradientStub = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createLinearGradient: vi.fn(() => gradientStub),
    set globalAlpha(_v: number) { /* noop */ },
    get globalAlpha() { return 1; },
    set fillStyle(_v: string) { /* noop */ },
    get fillStyle() { return ''; },
    set strokeStyle(_v: string) { /* noop */ },
    get strokeStyle() { return ''; },
    set font(_v: string) { /* noop */ },
    get font() { return ''; },
    set textAlign(_v: string) { /* noop */ },
    get textAlign() { return 'start'; },
    set textBaseline(_v: string) { /* noop */ },
    get textBaseline() { return 'alphabetic'; },
    set lineWidth(_v: number) { /* noop */ },
    get lineWidth() { return 1; },
    set lineCap(_v: string) { /* noop */ },
    get lineCap() { return 'butt'; },
    set shadowColor(_v: string) { /* noop */ },
    get shadowColor() { return ''; },
    set shadowBlur(_v: number) { /* noop */ },
    get shadowBlur() { return 0; },
    set shadowOffsetX(_v: number) { /* noop */ },
    get shadowOffsetX() { return 0; },
    set shadowOffsetY(_v: number) { /* noop */ },
    get shadowOffsetY() { return 0; },
  } as unknown as CanvasRenderingContext2D;
}

function makeState(overrides: Partial<RenderPlacementGhostState> = {}): RenderPlacementGhostState {
  // Create empty occupancy grid
  const occupancy: boolean[][] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    occupancy[c] = new Array(GRID_ROWS).fill(false);
  }

  return {
    interactionMode: { type: 'placing-node', nodeType: 'memory', rotation: 0 },
    mousePosition: { x: 400, y: 400 },
    occupancy,
    puzzleNodes: new Map(),
    utilityNodes: new Map(),
    keyboardGhostPosition: null,
    ...overrides,
  };
}

describe('renderPlacementGhost', () => {
  it('early returns if not in placing-node mode', () => {
    const ctx = makeCtx();
    const state = makeState({ interactionMode: { type: 'idle' } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('early returns if no mousePosition', () => {
    const ctx = makeCtx();
    const state = makeState({ mousePosition: null });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('draws ghost using real node renderer when placing node', () => {
    const ctx = makeCtx();
    const state = makeState();
    renderPlacementGhost(ctx, tokens, state, cellSize);
    // Real renderer uses save/restore, gradient fill, roundRect, fillText, arc (ports)
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.createLinearGradient).toHaveBeenCalled();
    expect(ctx.roundRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled(); // ports
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('snaps position to grid and renders centered on cursor', () => {
    const ctx = makeCtx();
    // Mouse at pixel (480, 365) → grid (12, 9) at cellSize 40
    // memory node: 3 cols x 1 row → centering offset: col - floor(3/2) = 12-1 = 11
    // getNodeBodyPixelRect: x = 11*40 = 440, bodyTop=-0.5 → y=(9-0.5)*40=340, h=40
    const state = makeState({ mousePosition: { x: 480, y: 365 } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.roundRect).toHaveBeenCalledWith(
      440, 340, 120, 40, expect.any(Number),
    );
  });

  it('clamps to playable area left boundary with 1-cell padding', () => {
    const ctx = makeCtx();
    // Mouse at col 2 (inside meter zone) → should clamp to PLAYABLE_START + 1 (11)
    const state = makeState({ mousePosition: { x: 2 * cellSize + 5, y: 400 } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    // Node at col 11: body x = 11 * 40 = 440, height = 40 (1-row memory node)
    expect(ctx.roundRect).toHaveBeenCalledWith(
      (PLAYABLE_START + 1) * cellSize, expect.any(Number), 120, 40, expect.any(Number),
    );
  });

  it('clamps to playable area right boundary with 1-cell padding', () => {
    const ctx = makeCtx();
    // Mouse at col 60 → 3-wide node clamps to (PLAYABLE_END - 3) = 52
    const state = makeState({ mousePosition: { x: 60 * cellSize + 5, y: 400 } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    const maxStartCol = PLAYABLE_END - 3;
    expect(ctx.roundRect).toHaveBeenCalledWith(
      maxStartCol * cellSize, expect.any(Number), 120, 40, expect.any(Number),
    );
  });

  it('draws label centered in ghost', () => {
    const ctx = makeCtx();
    const state = makeState();
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.fillText).toHaveBeenCalledWith('MEMORY', expect.any(Number), expect.any(Number));
  });

  it('uses puzzle node title for puzzle type', () => {
    const ctx = makeCtx();
    const puzzleNodes = new Map([
      ['p1', {
        puzzleId: 'p1',
        title: 'Half Wave',
        description: '',
        inputCount: 1,
        outputCount: 1,
        bakeMetadata: { topoOrder: [], nodeConfigs: [], edges: [], inputCount: 1, outputCount: 1 },
        versionHash: 'v1',
      }],
    ]);
    const state = makeState({
      interactionMode: { type: 'placing-node', nodeType: 'puzzle:p1', rotation: 0 },
      puzzleNodes,
    });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.fillText).toHaveBeenCalledWith('HALF WAVE', expect.any(Number), expect.any(Number));
  });

  it('uses utility node title for utility type', () => {
    const ctx = makeCtx();
    const utilityNodes = new Map([
      ['u1', {
        utilityId: 'u1',
        title: 'My Filter',
        inputCount: 1,
        outputCount: 1,
        bakeMetadata: { topoOrder: [], nodeConfigs: [], edges: [], inputCount: 1, outputCount: 1 },
        board: { id: 'u1', chips: new Map(), wires: [] },
        versionHash: 'v1',
      }],
    ]);
    const state = makeState({
      interactionMode: { type: 'placing-node', nodeType: 'utility:u1', rotation: 0 },
      utilityNodes,
    });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.fillText).toHaveBeenCalledWith('MY FILTER', expect.any(Number), expect.any(Number));
  });
});
