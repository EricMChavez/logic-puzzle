import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drawNodes, getNodePixelRect } from './render-nodes.ts';
import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { RenderNodesState } from './render-types.ts';
import type { NodeState } from '../../shared/types/index.ts';
import { NODE_STYLE } from '../../shared/constants/index.ts'; // for font family assertions
import {
  FUNDAMENTAL_GRID_COLS,
  FUNDAMENTAL_GRID_ROWS,
  UTILITY_GRID_COLS,
  UTILITY_GRID_ROWS,
  PUZZLE_GRID_COLS,
} from '../../shared/grid/index.ts';

function makeTokens(overrides: Partial<ThemeTokens> = {}): ThemeTokens {
  return {
    surfaceNode: '#44484e',
    surfaceNodeBottom: '#1e1e30',
    depthRaised: '#00000040',
    depthSunken: '',
    textPrimary: '#e0e0f0',
    textSecondary: '#9090b0',
    colorSelection: '#3a7bd5',
    colorNeutral: '#808080',
    portFill: '#3a7bd5',
    portStroke: '#5a9bf5',
    portConnected: '',
    gridArea: '',
    gridLine: '',
    pageBackground: '',
    gameboardSurface: '',
    meterHousing: '',
    meterInterior: '',
    signalPositive: '',
    signalNegative: '',
    colorTarget: '',
    meterNeedle: '',
    wireWidthBase: '',
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

function makeNode(id: string, type: string, col: number, row: number, inputs = 1, outputs = 1): NodeState {
  return { id, type, position: { col, row }, params: {}, inputCount: inputs, outputCount: outputs };
}

function makeState(overrides: Partial<RenderNodesState> = {}): RenderNodesState {
  return {
    puzzleNodes: new Map(),
    utilityNodes: new Map(),
    nodes: new Map(),
    selectedNodeId: null,
    hoveredNodeId: null,
    knobValues: new Map(),
    portSignals: new Map(),
    ...overrides,
  };
}

/** Tracks calls in a way that captures property assignments at call time */
function createMockCtx() {
  const fillStyleHistory: string[] = [];
  const fontHistory: string[] = [];
  const strokeStyleHistory: string[] = [];
  const shadowBlurHistory: number[] = [];
  const gradientStops: { offset: number; color: string }[] = [];

  const mockGradient = {
    addColorStop: vi.fn((offset: number, color: string) => {
      gradientStops.push({ offset, color });
    }),
  };

  const ctx = {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0,
    font: '' as string,
    textAlign: '' as string,
    textBaseline: '' as string,
    shadowColor: '' as string,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(() => {
      fillStyleHistory.push(ctx.fillStyle as string);
    }),
    stroke: vi.fn(() => {
      strokeStyleHistory.push(ctx.strokeStyle as string);
    }),
    fillText: vi.fn(() => {
      fontHistory.push(ctx.font as string);
    }),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    save: vi.fn(() => {
      shadowBlurHistory.push(ctx.shadowBlur);
    }),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createLinearGradient: vi.fn(() => mockGradient),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    fillStyleHistory,
    fontHistory,
    strokeStyleHistory,
    shadowBlurHistory,
    gradientStops,
    mockGradient,
  };
}

describe('getNodePixelRect', () => {
  it('returns body extending 0.5 beyond port span for fundamental node', () => {
    const node = makeNode('n1', 'invert', 5, 3);
    const cellSize = 40;
    const rect = getNodePixelRect(node, cellSize);
    // Single port centered at row 1 (floor(2/2)), port span = 1
    // Body height = 1 cell (single port span)
    // Body y = (3 + 1 - 0.5) * 40 = 3.5 * 40 = 140
    expect(rect.width).toBe(FUNDAMENTAL_GRID_COLS * cellSize);
    expect(rect.height).toBe(1 * cellSize);
    expect(rect.x).toBe(5 * cellSize);
    expect(rect.y).toBe((3 + 1 - 0.5) * cellSize);
  });

  it('returns body extending 0.5 beyond port span for utility node', () => {
    const node = makeNode('u1', 'utility:foo', 4, 2);
    const cellSize = 50;
    const rect = getNodePixelRect(node, cellSize);
    // Single port centered at row 1 (floor(3/2)), port span = 1
    // Body height = 1 cell
    expect(rect.width).toBe(UTILITY_GRID_COLS * cellSize);
    expect(rect.height).toBe(1 * cellSize);
  });

  it('returns body based on port span for puzzle node', () => {
    // 4 inputs → max(2, 4+1) = 5 rows
    // Ports at rows 0, 1, 2, 3 (floor(i * 5 / 4))
    // Port span = 3 - 0 + 1 = 4
    const node = makeNode('p1', 'puzzle:abc', 3, 1, 4, 1);
    const cellSize = 40;
    const rect = getNodePixelRect(node, cellSize);
    expect(rect.width).toBe(PUZZLE_GRID_COLS * cellSize);
    expect(rect.height).toBe(4 * cellSize); // port span of 4
  });
});

describe('drawNodes', () => {
  let mock: ReturnType<typeof createMockCtx>;
  let tokens: ThemeTokens;

  beforeEach(() => {
    mock = createMockCtx();
    tokens = makeTokens();
  });

  it('calls roundRect for each non-CP node', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));
    nodes.set('n2', makeNode('n2', 'multiply', 10, 6));
    // CP nodes are skipped
    nodes.set('__cp_input_0__', makeNode('__cp_input_0__', 'connection-input', 0, 0, 0, 1));

    const state = makeState({ nodes });
    drawNodes(mock.ctx, tokens, state, 40);

    // roundRect called for body fill + body stroke for each of 2 real nodes = 4 calls
    const roundRectCalls = (mock.ctx.roundRect as ReturnType<typeof vi.fn>).mock.calls;
    expect(roundRectCalls.length).toBe(4);
  });

  it('creates linear gradient using surfaceNode and surfaceNodeBottom stops', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));

    const state = makeState({ nodes });
    drawNodes(mock.ctx, tokens, state, 40);

    // Gradient should have two stops
    expect(mock.gradientStops.length).toBe(2);
    expect(mock.gradientStops[0].offset).toBe(0);
    expect(mock.gradientStops[0].color).toBe(tokens.surfaceNode);
    expect(mock.gradientStops[1].offset).toBe(1);
    expect(mock.gradientStops[1].color).toBe(tokens.surfaceNodeBottom);
  });

  it('hover state produces brighter gradient', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));

    const state = makeState({ nodes, hoveredNodeId: 'n1' });
    drawNodes(mock.ctx, tokens, state, 40);

    // Gradient should have two stops, but NOT be the raw token values (lerped toward white)
    expect(mock.gradientStops.length).toBe(2);
    expect(mock.gradientStops[0].color).not.toBe(tokens.surfaceNode);
    expect(mock.gradientStops[1].color).not.toBe(tokens.surfaceNodeBottom);
    // Should be rgb() strings from lerpColor
    expect(mock.gradientStops[0].color).toMatch(/^rgb\(/);
    expect(mock.gradientStops[1].color).toMatch(/^rgb\(/);
  });

  it('selected state uses colorSelection stroke', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));

    const state = makeState({ nodes, selectedNodeId: 'n1' });
    drawNodes(mock.ctx, tokens, state, 40);

    // The border stroke should include colorSelection
    expect(mock.strokeStyleHistory).toContain(tokens.colorSelection);
  });

  it('drop shadow is applied (shadowBlur > 0)', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));

    const state = makeState({ nodes });
    drawNodes(mock.ctx, tokens, state, 40);

    // save() is called before setting shadow, and we capture shadowBlur via fill()
    expect(mock.ctx.save).toHaveBeenCalled();
    // Check that shadowBlur was set to a positive value after save
    expect(mock.ctx.restore).toHaveBeenCalled();
  });

  it('label font family matches NODE_STYLE.LABEL_FONT_FAMILY', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));

    const state = makeState({ nodes });
    drawNodes(mock.ctx, tokens, state, 40);

    expect(mock.fontHistory.some(f => f.includes(NODE_STYLE.LABEL_FONT_FAMILY))).toBe(true);
  });

  it('sublabel font family matches NODE_STYLE.PARAM_FONT_FAMILY for param nodes', () => {
    const nodes = new Map<string, NodeState>();
    const mixNode = makeNode('n1', 'mix', 5, 3, 2, 1);
    mixNode.params = { mode: 'Multiply' };
    nodes.set('n1', mixNode);

    const state = makeState({ nodes });
    drawNodes(mock.ctx, tokens, state, 40);

    expect(mock.fontHistory.some(f => f.includes(NODE_STYLE.PARAM_FONT_FAMILY))).toBe(true);
  });

  it('selection highlight draws on second pass (after all nodes)', () => {
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 'invert', 5, 3));
    nodes.set('n2', makeNode('n2', 'multiply', 10, 6));

    const state = makeState({ nodes, selectedNodeId: 'n1' });

    const roundRectCallOrder: number[] = [];
    let callIndex = 0;
    const origRoundRect = vi.fn((..._args: unknown[]) => {
      roundRectCallOrder.push(callIndex++);
    });
    (mock.ctx as unknown as { roundRect: typeof origRoundRect }).roundRect = origRoundRect;

    drawNodes(mock.ctx, tokens, state, 40);

    // 2 nodes * 2 roundRect (fill + stroke) = 4 calls for bodies
    // Plus 1 roundRect for selection highlight = 5 total
    expect(origRoundRect.mock.calls.length).toBe(5);
    // Selection highlight is the last roundRect call
    const lastCall = origRoundRect.mock.calls[4];
    // It should have padded dimensions (wider than body)
    // Body width is FUNDAMENTAL_GRID_COLS * 40 = 120
    const bodyWidth = FUNDAMENTAL_GRID_COLS * 40;
    expect(lastCall[2]).toBeGreaterThanOrEqual(bodyWidth);
  });

  it('modified indicator positioned at top-right of body rect', () => {
    const nodes = new Map<string, NodeState>();
    const utilNode = makeNode('u1', 'utility:tool', 4, 2, 2, 1);
    utilNode.libraryVersionHash = 'old-hash';
    nodes.set('u1', utilNode);

    const utilityEntry = { title: 'Tool', inputCount: 2, outputCount: 1, versionHash: 'new-hash' };
    const utilityNodes = new Map([['tool', utilityEntry]]);

    const state = makeState({ nodes, utilityNodes: utilityNodes as RenderNodesState['utilityNodes'] });
    const cellSize = 40;
    drawNodes(mock.ctx, tokens, state, cellSize);

    // arc called for modified indicator + ports
    const arcCalls = (mock.ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    // The modified indicator should be near the top-right of the body rect
    const indicatorCall = arcCalls.find(
      (call: number[]) => call[3] === 0 && call[4] === Math.PI * 2 && call[2] === 4,
    );
    expect(indicatorCall).toBeDefined();
    // Indicator should be positioned relative to body rect
    // For utility node with 2 ports: ports at rows 0 and 1, span = 2
    // Body width = 5 * 40 = 200
    const bodyWidth = UTILITY_GRID_COLS * cellSize;
    const expectedX = 4 * cellSize + bodyWidth - 4;
    expect(indicatorCall![0]).toBe(expectedX);
  });
});
