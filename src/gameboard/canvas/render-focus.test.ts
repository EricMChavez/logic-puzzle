import { describe, it, expect, vi } from 'vitest';
import type { ThemeTokens } from '../../shared/tokens/index.ts';
import type { NodeState, Wire } from '../../shared/types/index.ts';
import type { KeyboardFocusTarget } from '../interaction/keyboard-focus.ts';
import { drawKeyboardFocus } from './render-focus.ts';

function makeTokens(): ThemeTokens {
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
  } as ThemeTokens;
}

function makeNode(id: string, col: number, row: number, inputs = 1, outputs = 1): NodeState {
  return { id, type: 'invert', position: { col, row }, params: {}, inputCount: inputs, outputCount: outputs };
}

function makeMockCtx() {
  const calls: string[] = [];
  return {
    ctx: {
      save: vi.fn(() => calls.push('save')),
      restore: vi.fn(() => calls.push('restore')),
      strokeStyle: '',
      lineWidth: 0,
      globalAlpha: 1,
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(() => calls.push('roundRect')),
      arc: vi.fn(() => calls.push('arc')),
      stroke: vi.fn(() => calls.push('stroke')),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      lineJoin: '',
      lineCap: '',
      bezierCurveTo: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D,
    calls,
  };
}

describe('drawKeyboardFocus', () => {
  it('does nothing when focusVisible is false', () => {
    const { ctx, calls } = makeMockCtx();
    const target: KeyboardFocusTarget = { type: 'node', nodeId: 'n1' };
    drawKeyboardFocus(ctx, makeTokens(), target, false, new Map(), [], 1280, 720, 40, null);
    // Only save/restore should not be called since early return
    expect(calls).toHaveLength(0);
  });

  it('does nothing when focusTarget is null', () => {
    const { ctx, calls } = makeMockCtx();
    drawKeyboardFocus(ctx, makeTokens(), null, true, new Map(), [], 1280, 720, 40, null);
    expect(calls).toHaveLength(0);
  });

  it('draws roundRect for node focus', () => {
    const { ctx, calls } = makeMockCtx();
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 5, 3));
    const target: KeyboardFocusTarget = { type: 'node', nodeId: 'n1' };

    drawKeyboardFocus(ctx, makeTokens(), target, true, nodes, [], 1280, 720, 40, null);

    expect(calls).toContain('roundRect');
    expect(calls).toContain('stroke');
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
  });

  it('draws arc for port focus', () => {
    const { ctx, calls } = makeMockCtx();
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 5, 3));
    const target: KeyboardFocusTarget = {
      type: 'port',
      portRef: { nodeId: 'n1', portIndex: 0, side: 'input' },
    };

    drawKeyboardFocus(ctx, makeTokens(), target, true, nodes, [], 1280, 720, 40, null);

    expect(calls).toContain('arc');
    expect(calls).toContain('stroke');
  });

  it('draws arc for connection-point focus', () => {
    const { ctx, calls } = makeMockCtx();
    const target: KeyboardFocusTarget = { type: 'connection-point', side: 'input', index: 0 };

    drawKeyboardFocus(ctx, makeTokens(), target, true, new Map(), [], 1280, 720, 40, null);

    expect(calls).toContain('arc');
    expect(calls).toContain('stroke');
  });

  it('draws wire path for wire focus', () => {
    const { ctx, calls } = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'n1', portIndex: 0, side: 'output' },
      target: { nodeId: 'n2', portIndex: 0, side: 'input' },
      path: [{ col: 5, row: 3 }, { col: 10, row: 3 }, { col: 10, row: 6 }],
      signalBuffer: new Array(16).fill(0),
      writeHead: 0,
    };
    const target: KeyboardFocusTarget = { type: 'wire', wireId: 'w1' };

    drawKeyboardFocus(ctx, makeTokens(), target, true, new Map(), [wire], 1280, 720, 40, null);

    expect(calls).toContain('stroke');
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('skips wire focus if wire has empty path', () => {
    const { ctx } = makeMockCtx();
    const wire: Wire = {
      id: 'w1',
      source: { nodeId: 'n1', portIndex: 0, side: 'output' },
      target: { nodeId: 'n2', portIndex: 0, side: 'input' },
      path: [],
      signalBuffer: new Array(16).fill(0),
      writeHead: 0,
    };
    const target: KeyboardFocusTarget = { type: 'wire', wireId: 'w1' };

    drawKeyboardFocus(ctx, makeTokens(), target, true, new Map(), [wire], 1280, 720, 40, null);
    // moveTo/lineTo should not be called for the wire path
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });

  it('draws wiring target highlights when wiringState provided', () => {
    const { ctx } = makeMockCtx();
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 5, 3));
    nodes.set('n2', makeNode('n2', 10, 5));

    const target: KeyboardFocusTarget = { type: 'port', portRef: { nodeId: 'n1', portIndex: 0, side: 'output' } };
    const wiringState = {
      fromPort: { nodeId: 'n1', portIndex: 0, side: 'output' as const },
      validTargets: [{ nodeId: 'n2', portIndex: 0, side: 'input' as const }],
      targetIndex: 0,
    };

    drawKeyboardFocus(ctx, makeTokens(), target, true, nodes, [], 1280, 720, 40, wiringState);

    // arc should be called for port focus + target highlight
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('renders multiple targets with different alpha', () => {
    const { ctx } = makeMockCtx();
    const nodes = new Map<string, NodeState>();
    nodes.set('n1', makeNode('n1', 5, 3));
    nodes.set('n2', makeNode('n2', 10, 5, 2, 1));

    const target: KeyboardFocusTarget = { type: 'port', portRef: { nodeId: 'n1', portIndex: 0, side: 'output' } };
    const wiringState = {
      fromPort: { nodeId: 'n1', portIndex: 0, side: 'output' as const },
      validTargets: [
        { nodeId: 'n2', portIndex: 0, side: 'input' as const },
        { nodeId: 'n2', portIndex: 1, side: 'input' as const },
      ],
      targetIndex: 0,
    };

    drawKeyboardFocus(ctx, makeTokens(), target, true, nodes, [], 1280, 720, 40, wiringState);

    // Multiple arc calls for target highlights
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    expect(arcCalls.length).toBeGreaterThanOrEqual(3); // 1 for port focus + 2 for targets
  });
});
