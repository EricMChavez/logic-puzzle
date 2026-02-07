import { describe, it, expect, vi } from 'vitest';
import { renderPlacementGhost } from './render-placement-ghost.ts';
import type { RenderPlacementGhostState } from './render-placement-ghost.ts';
import type { ThemeTokens } from '../../shared/tokens/token-types.ts';
import { GRID_COLS, GRID_ROWS, PLAYABLE_START, PLAYABLE_END } from '../../shared/grid/index.ts';

// Minimal mock tokens
const tokens = {
  surfaceNode: '#2d2d44',
  textPrimary: '#e0e0f0',
  textSecondary: '#9090b0',
} as ThemeTokens;

const cellSize = 40;

function makeCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    roundRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    set globalAlpha(v: number) { /* noop */ },
    get globalAlpha() { return 1; },
    set fillStyle(v: string) { /* noop */ },
    get fillStyle() { return ''; },
    set font(v: string) { /* noop */ },
    get font() { return ''; },
    set textAlign(v: string) { /* noop */ },
    get textAlign() { return 'start'; },
    set textBaseline(v: string) { /* noop */ },
    get textBaseline() { return 'alphabetic'; },
  } as unknown as CanvasRenderingContext2D;
}

function makeState(overrides: Partial<RenderPlacementGhostState> = {}): RenderPlacementGhostState {
  // Create empty occupancy grid
  const occupancy: boolean[][] = [];
  for (let c = 0; c < GRID_COLS; c++) {
    occupancy[c] = new Array(GRID_ROWS).fill(false);
  }

  return {
    interactionMode: { type: 'placing-node', nodeType: 'multiply', rotation: 0 },
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

  it('draws ghost rect when placing node', () => {
    const ctx = makeCtx();
    const state = makeState();
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.roundRect).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('snaps position to grid with port-span-based body', () => {
    const ctx = makeCtx();
    // Mouse at pixel (480, 365) → grid (12, 9) at cellSize 40
    // col 12 is within padded bounds [11, 52] for 3-wide
    const state = makeState({ mousePosition: { x: 480, y: 365 } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    // multiply node: 1 input, 1 output, 3 cols x 2 rows
    // Port centered at row 1 (floor(2/2)), port span = 1
    // Body x = col * cellSize = 12 * 40 = 480
    // Body y = (row + portRow - 0.5) * cellSize = (9 + 1 - 0.5) * 40 = 380
    // Body width = 3 * 40 = 120, height = 1 * 40 = 40
    expect(ctx.roundRect).toHaveBeenCalledWith(
      480, 380, 120, 40, expect.any(Number),
    );
  });

  it('clamps to playable area left boundary with 1-cell padding', () => {
    const ctx = makeCtx();
    // Mouse at col 2 (inside meter zone) → should clamp to PLAYABLE_START + 1 (11)
    const state = makeState({ mousePosition: { x: 2 * cellSize + 5, y: 400 } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    // Should snap to col PLAYABLE_START + 1 → pixel x = (PLAYABLE_START + 1) * cellSize
    // multiply: 3 cols x 2 rows, single port at row 1, port span = 1
    // Body width = 3 * cellSize = 120, height = 1 * cellSize = 40
    expect(ctx.roundRect).toHaveBeenCalledWith(
      (PLAYABLE_START + 1) * cellSize, expect.any(Number), 120, 40, expect.any(Number),
    );
  });

  it('clamps to playable area right boundary with 1-cell padding', () => {
    const ctx = makeCtx();
    // Mouse at col 60 → 3-wide node clamps to (PLAYABLE_END - 3) = 52
    const state = makeState({ mousePosition: { x: 60 * cellSize + 5, y: 400 } });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    const maxStartCol = PLAYABLE_END - 3; // 55 - 3 = 52
    // multiply: 3 cols x 2 rows, single port at row 1, port span = 1
    // Body width = 3 * cellSize = 120, height = 1 * cellSize = 40
    expect(ctx.roundRect).toHaveBeenCalledWith(
      maxStartCol * cellSize, expect.any(Number), 120, 40, expect.any(Number),
    );
  });

  it('draws label centered in ghost rect', () => {
    const ctx = makeCtx();
    const state = makeState();
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.fillText).toHaveBeenCalledWith('Multiply', expect.any(Number), expect.any(Number));
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
        bakeMetadata: { delays: [], evaluationOrder: [], nodeDelays: new Map() },
        versionHash: 'v1',
      }],
    ]);
    const state = makeState({
      interactionMode: { type: 'placing-node', nodeType: 'puzzle:p1', rotation: 0 },
      puzzleNodes,
    });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.fillText).toHaveBeenCalledWith('Half Wave', expect.any(Number), expect.any(Number));
  });

  it('uses utility node title for utility type', () => {
    const ctx = makeCtx();
    const utilityNodes = new Map([
      ['u1', {
        utilityId: 'u1',
        title: 'My Filter',
        inputCount: 1,
        outputCount: 1,
        bakeMetadata: { delays: [], evaluationOrder: [], nodeDelays: new Map() },
        board: { id: 'u1', nodes: new Map(), wires: [] },
        versionHash: 'v1',
      }],
    ]);
    const state = makeState({
      interactionMode: { type: 'placing-node', nodeType: 'utility:u1', rotation: 0 },
      utilityNodes,
    });
    renderPlacementGhost(ctx, tokens, state, cellSize);
    expect(ctx.fillText).toHaveBeenCalledWith('My Filter', expect.any(Number), expect.any(Number));
  });
});
